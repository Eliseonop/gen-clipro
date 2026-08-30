// Dibujo del editor sobre <canvas>: compuesto final (vídeo + texto), vista de edición
// del Main (recorte/keyframes) y overlay de encuadre de texto.
//
// Estas funciones son puras respecto a React: reciben un `env` con las refs vivas del
// componente (clipsRef, tracksRef, mediaEls, outRef, …) y leen `.current` en el momento
// de la llamada, igual que hacía el componente. Así el comportamiento por frame no cambia.
import { drawReframe, kfColor, cropCornerNorms, clamp } from '../../../lib/panning'
import { drawTextClip } from '../../../lib/textstyles'
import { drawAlignGuides } from '../../../lib/alignGuides'
import { clipDur, clipEnd, newReframe } from '../editorModel'
import { applyCanvasFx, clipFxAt } from '../../../lib/clipFx'
import {
  cropWindow, destRectOnCanvas, isOverlay, sourceCropPx, videosAt,
} from '../../../lib/clipLayout'

// Geometría (en px del canvas) del encuadre de texto a partir de fm normalizado.
export function framingRect(cw, ch, fm) {
  const boxW = (fm.w ?? 0.8) * cw
  const boxH = (fm.h ?? 0.13) * ch
  const bx = (fm.x ?? 0.5) * cw - boxW / 2
  const by = (fm.y ?? 0.5) * ch - boxH / 2
  return { bx, by, boxW, boxH }
}

// Dibuja el overlay amarillo de encuadre sobre el canvas principal.
// El rectángulo define la POSICIÓN y el TAMAÑO de los textos de la pista.
export function drawFramingOverlay(ctx, cw, ch, fm) {
  const { bx, by, boxW, boxH } = framingRect(cw, ch, fm)
  const hs = 6
  ctx.save()
  ctx.fillStyle = 'rgba(255, 215, 0, 0.14)'
  ctx.fillRect(bx, by, boxW, boxH)
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2.5
  ctx.setLineDash([9, 5])
  ctx.strokeRect(bx, by, boxW, boxH)
  ctx.setLineDash([])
  ctx.fillStyle = '#FFD700'
  ctx.fillRect(bx - hs, by + boxH / 2 - hs, hs * 2, hs * 2)              // izq (ancho)
  ctx.fillRect(bx + boxW - hs, by + boxH / 2 - hs, hs * 2, hs * 2)       // der (ancho)
  ctx.fillRect(bx + boxW / 2 - hs, by + boxH - hs, hs * 2, hs * 2)       // abajo (alto)
  ctx.fillRect(bx + boxW - hs, by + boxH - hs, hs * 2, hs * 2)           // esquina (ambos)
  ctx.font = 'bold 11px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Encuadre de texto', bx + boxW / 2, by - 4)
  ctx.restore()
}

function overlayDest(ctx, video, clip, srcTime, outW, outH) {
  const vw = video.videoWidth, vh = video.videoHeight
  const crop = cropWindow(clip, vw / vh, outW / outH, srcTime)
  const px = sourceCropPx(crop, vw, vh)
  return { px, dest: destRectOnCanvas(clip.transform, px, outW, outH, ctx.canvas.width, ctx.canvas.height) }
}

function drawOverlayLayer(ctx, video, clip, srcTime, outW, outH, fx) {
  const { px, dest } = overlayDest(ctx, video, clip, srcTime, outW, outH)
  ctx.save()
  if (fx.cssFilter && fx.cssFilter !== 'none') ctx.filter = fx.cssFilter
  ctx.globalAlpha = fx.opacity
  ctx.translate(dest.dx + dest.dw / 2 + fx.tx * dest.dw, dest.dy + dest.dh / 2 + fx.ty * dest.dh)
  ctx.rotate((dest.rotation || 0) * Math.PI / 180)
  ctx.scale(fx.scale, fx.scale)
  try { ctx.drawImage(video, px.sx, px.sy, px.sw, px.sh, -dest.dw / 2, -dest.dh / 2, dest.dw, dest.dh) } catch { /* noop */ }
  ctx.restore()
  return dest
}

function fxForClip(clip, head) {
  return clipFxAt(clip, Math.max(0, head - clip.start), clipDur(clip))
}

function drawTransformHandles(ctx, dest) {
  const { dx, dy, dw, dh } = dest
  const hs = 5
  ctx.save()
  ctx.strokeStyle = '#ff3b5c'
  ctx.lineWidth = 1.6
  ctx.strokeRect(dx, dy, dw, dh)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#ff3b5c'
  ;[[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]].forEach(([x, y]) => {
    ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2)
    ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2)
  })
  const rx = dx + dw / 2, ry = dy - 22
  ctx.beginPath()
  ctx.moveTo(dx + dw / 2, dy)
  ctx.lineTo(rx, ry)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(rx, ry, 6, 0, Math.PI * 2)
  ctx.fillStyle = '#ff3b5c'
  ctx.fill()
  ctx.restore()
}

// Dibuja el compuesto (todas las pistas de vídeo, fondo→frente + textos) en un canvas.
export function drawComposite(ctx, head, selClipIds, env) {
  const { clipsRef, tracksRef, mediaEls, outRef } = env
  const selected = new Set(Array.isArray(selClipIds) ? selClipIds : (selClipIds ? [selClipIds] : []))
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  const outW = outRef.current.w, outH = outRef.current.h
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)

  let overlayDestSel = null
  for (const clip of videosAt(head, clipsRef.current, tracksRef.current)) {
    const el = mediaEls.current.get(clip.id)
    if (!el || !el.videoWidth) continue
    const srcTime = el.currentTime
    const fx = fxForClip(clip, head)
    if (isOverlay(clip)) {
      const dest = drawOverlayLayer(ctx, el, clip, srcTime, outW, outH, fx)
      if (selected.has(clip.id)) overlayDestSel = dest
    } else {
      ctx.save()
      applyCanvasFx(ctx, fx, cw, ch)
      drawReframe(ctx, el, clip.reframe, srcTime, outW / outH, { clear: false })
      ctx.restore()
    }
  }

  let selRender = null
  for (const c of clipsRef.current) {
    if (c.kind !== 'text') continue
    const track = tracksRef.current.find((t) => t.id === c.track_id)
    if (track?.hidden) continue
    const activeText = head >= c.start - 0.02 && head < c.start + clipDur(c)
    if (!activeText) continue
    const isSel = selected.has(c.id)
    const r = drawTextClip(ctx, c, cw, ch, { selected: isSel, time: head })
    if (isSel) selRender = r
  }
  if (overlayDestSel) drawTransformHandles(ctx, overlayDestSel)
  return selRender
}

// Dibujo del Main: siempre muestra el compuesto según la posición del cabezal.
// La selección de un clip sólo afecta al borde de resaltado, nunca a la visibilidad temporal.
export function drawMainView(head, env) {
  const {
    mainCanvasRef, clipsRef, mediaEls, outRef, selRef, selIdsRef, selKfRef, hiddenKfRef,
    playingRef, framingModeRef, mainTextBox, alignGuidesRef,
  } = env
  const canvas = mainCanvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const a = outRef.current.w / outRef.current.h
  const cw = a >= 1 ? 520 : Math.round(520 * a)
  const ch = a >= 1 ? Math.round(520 / a) : 520
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch }

  const clip = clipsRef.current.find((c) => c.id === selRef.current)
  const clipActive = clip && clip.kind === 'video' && head >= clip.start - 0.02 && head < clipEnd(clip)
  const playingThis = playingRef.current && clipActive

  // Recorte (fuente + recuadro) solo en pausa. Al reproducir ese clip, el Main
  // muestra el compuesto con aparición / salida / filtro.
  if (clip && clip.kind === 'video' && !playingThis) {
    const el = mediaEls.current.get(clip.id)
    if (!el || !el.videoWidth) {
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, cw, ch)
      return
    }
    const vw = el.videoWidth, vh = el.videoHeight
    const srcAspect = vw / vh
    const cw2 = 520, ch2 = Math.round(cw2 / srcAspect)
    if (canvas.width !== cw2 || canvas.height !== ch2) { canvas.width = cw2; canvas.height = ch2 }
    const active = head >= clip.start - 0.02 && head < clipEnd(clip)
    const clampedHead = clamp(head, clip.start, clipEnd(clip))
    const srcTime = clamp(clip.in_point + (clampedHead - clip.start), clip.in_point, clip.out_point)
    if (!(playingRef.current && active)) {
      if (Math.abs(el.currentTime - srcTime) > 0.06) { try { el.currentTime = srcTime } catch { /* noop */ } }
    }
    ctx.clearRect(0, 0, cw2, ch2)
    try { ctx.drawImage(el, 0, 0, cw2, ch2) } catch { /* noop */ }
    const rf = clip.reframe || newReframe()
    const outA = outRef.current.w / outRef.current.h
    const srcT = playingRef.current && active ? el.currentTime : srcTime
    const crop = cropWindow(clip, srcAspect, outA, srcT)
    const { cx: pcx, cy: pcy, wf, hf } = crop
    const bx = (pcx - wf / 2) * cw2, by = (pcy - hf / 2) * ch2, bw = wf * cw2, bh = hf * ch2
    ctx.fillStyle = 'rgba(3,5,12,0.58)'
    ctx.fillRect(0, 0, cw2, by)
    ctx.fillRect(0, by + bh, cw2, ch2 - (by + bh))
    ctx.fillRect(0, by, bx, bh)
    ctx.fillRect(bx + bw, by, cw2 - (bx + bw), bh)
    const kfs = [...(rf.keyframes || [])].sort((a, b) => a.t - b.t)
    kfs.forEach((k, i) => {
      if (hiddenKfRef.current.has(k.id)) return
      const g = cropWindow({ ...clip, reframe: { ...rf, keyframes: [k] } }, srcAspect, outA, k.t)
      const kx = (g.cx - g.wf / 2) * cw2, ky = (g.cy - g.hf / 2) * ch2
      ctx.strokeStyle = kfColor(i)
      ctx.lineWidth = k.id === selKfRef.current ? 3 : 1.5
      ctx.strokeRect(kx, ky, g.wf * cw2, g.hf * ch2)
    })
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.strokeRect(bx, by, bw, bh)
    const hs = 5
    ctx.fillStyle = '#ff3b5c'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    cropCornerNorms(pcx, pcy, wf, hf).forEach(([nx, ny]) => {
      const hx = nx * cw2, hy = ny * ch2
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2)
      ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2)
    })
    return
  }

  // Para texto, vacío, o sin selección: mostrar siempre el compuesto según el cabezal.
  // drawComposite ya respeta la visibilidad temporal de cada texto.
  mainTextBox.current = drawComposite(ctx, head, selIdsRef?.current?.length ? selIdsRef.current : (clip?.id ? [clip.id] : []), env)
  if (framingModeRef.current) drawFramingOverlay(ctx, canvas.width, canvas.height, framingModeRef.current)
  drawAlignGuides(ctx, canvas.width, canvas.height, alignGuidesRef?.current)
}
