// Dibujo del editor sobre <canvas>: compuesto final (vídeo + texto), vista de edición
// del Main (recorte/keyframes) y overlay de encuadre de texto.
//
// Estas funciones son puras respecto a React: reciben un `env` con las refs vivas del
// componente (clipsRef, tracksRef, mediaEls, outRef, …) y leen `.current` en el momento
// de la llamada, igual que hacía el componente. Así el comportamiento por frame no cambia.
import { drawReframe, kfColor, cropCornerNorms, clamp } from '../../../lib/panning'
import { drawTextClip } from '../../../lib/textstyles'
import { drawShapeClip } from '../../../lib/shapes'
import { drawAlignGuides } from '../../../lib/alignGuides'
import { clipDur, clipEnd, isVisualClip, newReframe, timelineToSource, safeMediaTime } from '../editorModel'
import { applyCanvasFx, clipFxAt } from '../../../lib/clipFx'
import { posedTransform, clipPose } from '../../../lib/clipAnim'
import { keyframesOn, normalizeItems } from '../../../lib/clipKeyframes'
import {
  cropWindow, destRectOnFrame, frameRectOf, isOverlay, mediaSize, sourceCropPx, videosAt,
} from '../../../lib/clipLayout'

// Desplaza geometría (dest / box / handles) del sistema local del recuadro Main
// a coordenadas del canvas, para hit-testing e interacción.
function offsetDest(d, ox, oy) {
  if (!d) return d
  return { ...d, dx: (d.dx ?? d.x) + ox, dy: (d.dy ?? d.y) + oy }
}
function offsetBox(box, ox, oy) {
  if (!box) return box
  if (box.dx != null) return { ...box, dx: box.dx + ox, dy: box.dy + oy }
  return { ...box, x: box.x + ox, y: box.y + oy }
}
function offsetHandles(handles, ox, oy) {
  if (!handles) return handles
  const out = {}
  for (const k of Object.keys(handles)) {
    const h = handles[k]
    out[k] = h && typeof h.x === 'number' ? { ...h, x: h.x + ox, y: h.y + oy } : h
  }
  return out
}
function offsetRender(r, ox, oy) {
  if (!r) return r
  return { ...r, box: offsetBox(r.box, ox, oy), handles: offsetHandles(r.handles, ox, oy) }
}

export function fillDestRect(cw, ch, clip, localT) {
  const pose = clipPose(clip, localT)
  const sc = pose.scale ?? 1
  const dw = cw * sc
  const dh = ch * sc
  return {
    dx: (pose.x ?? 0.5) * cw - dw / 2,
    dy: (pose.y ?? 0.5) * ch - dh / 2,
    dw,
    dh,
    rotation: pose.rotation || 0,
  }
}

export function boxToDest(box, rotation = 0) {
  if (!box) return null
  if (box.dx != null) return { dx: box.dx, dy: box.dy, dw: box.dw, dh: box.dh, rotation: box.rotation || rotation }
  return { dx: box.x, dy: box.y, dw: box.w, dh: box.h, rotation }
}

export function pointInDest(px, py, dest) {
  if (!dest) return false
  const { dx, dy, dw, dh, rotation = 0 } = dest
  const cx = dx + dw / 2
  const cy = dy + dh / 2
  let x = px - cx
  let y = py - cy
  if (rotation) {
    const rad = -rotation * Math.PI / 180
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    const nx = x * c - y * s
    const ny = x * s + y * c
    x = nx
    y = ny
  }
  return x >= -dw / 2 && x <= dw / 2 && y >= -dh / 2 && y <= dh / 2
}

export function hitFrontmost(hits, px, py) {
  if (!hits?.length) return null
  for (let i = hits.length - 1; i >= 0; i--) {
    if (pointInDest(px, py, hits[i].dest)) return hits[i]
  }
  return null
}


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

function overlayDest(ctx, media, clip, srcTime, outW, outH, localT, frame) {
  const { w: vw, h: vh } = mediaSize(media)
  const crop = cropWindow(clip, vw / vh, outW / outH, srcTime, localT)
  const px = sourceCropPx(crop, vw, vh)
  return { px, dest: destRectOnFrame(posedTransform(clip, localT), px, outW, outH, frame) }
}

function drawOverlayLayer(ctx, media, clip, srcTime, outW, outH, fx, localT, frame) {
  const { px, dest } = overlayDest(ctx, media, clip, srcTime, outW, outH, localT, frame)
  const pose = clipPose(clip, localT)
  ctx.save()
  if (fx.wipe != null && fx.wipe < 1) {
    ctx.beginPath()
    ctx.rect(dest.dx, dest.dy, dest.dw * Math.max(0, fx.wipe), dest.dh)
    ctx.clip()
  }
  if (fx.cssFilter && fx.cssFilter !== 'none') ctx.filter = fx.cssFilter
  ctx.globalAlpha = fx.opacity * pose.opacity
  ctx.translate(dest.dx + dest.dw / 2 + fx.tx * dest.dw, dest.dy + dest.dh / 2 + fx.ty * dest.dh)
  ctx.rotate((dest.rotation || 0) * Math.PI / 180)
  ctx.scale(fx.scale, fx.scale)
  try { ctx.drawImage(media, px.sx, px.sy, px.sw, px.sh, -dest.dw / 2, -dest.dh / 2, dest.dw, dest.dh) } catch { /* noop */ }
  ctx.restore()
  return dest
}

function reframeForDraw(clip, localT, srcTime) {
  if (!keyframesOn(clip) || clip.reframe?.dual_crop) return clip.reframe
  const p = clipPose(clip, localT, srcTime)
  return {
    ...(clip.reframe || {}),
    zoom: p.zoom,
    keyframes: [{ t: srcTime, cx: p.cx, cy: p.cy, zoom: p.zoom, pan_mode: 'smooth' }],
  }
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

function fxForClip(clip, head) {
  const localT = Math.max(0, head - (clip.start || 0))
  return clipFxAt(clip, localT, clipDur(clip))
}

// Dibuja el compuesto (todas las pistas de vídeo, fondo→frente + textos) dentro del
// recuadro Main (`frame`, en px del canvas). Lo que sobresale del recuadro se dibuja
// igualmente (contexto estilo CapCut) y el canvas lo recorta en su borde. Los dest/box/
// handles de `hits` quedan en coordenadas del canvas.
export function drawComposite(ctx, head, selClipIds, env, frame) {
  const { clipsRef, tracksRef, mediaEls, outRef } = env
  const selected = new Set(Array.isArray(selClipIds) ? selClipIds : (selClipIds ? [selClipIds] : []))
  const fr = frame || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height }
  const cw = fr.w, ch = fr.h, ox = fr.x, oy = fr.y
  const outW = outRef.current.w, outH = outRef.current.h
  // Fondo del área exportada (negro). El fondo del workspace lo pinta drawMainView.
  ctx.fillStyle = '#000'
  ctx.fillRect(ox, oy, cw, ch)

  let overlayDestSel = null
  let selRender = null
  const hits = []
  for (const clip of videosAt(head, clipsRef.current, tracksRef.current)) {
    const localT = Math.max(0, head - (clip.start || 0))
    if (clip.kind === 'shape') {
      const isSel = selected.has(clip.id)
      ctx.save(); ctx.translate(ox, oy)
      const r = drawShapeClip(ctx, clip, cw, ch, { selected: isSel, time: localT })
      ctx.restore()
      if (isSel) selRender = offsetRender(r, ox, oy)
      const dest = r?.box ? boxToDest(offsetBox(r.box, ox, oy), r.box.rotation || 0) : offsetDest(fillDestRect(cw, ch, clip, localT), ox, oy)
      hits.push({ id: clip.id, kind: 'shape', dest, handles: offsetHandles(r?.handles, ox, oy) })
      continue
    }
    const el = mediaEls.current.get(clip.id)
    const { w: mw } = mediaSize(el)
    if (!el || !mw) continue
    const srcTime = clip.kind === 'image'
      ? clamp(timelineToSource(clip, head), clip.in_point, clip.out_point)
      : el.currentTime
    const fx = fxForClip(clip, head)
    if (isOverlay(clip)) {
      const dest = drawOverlayLayer(ctx, el, clip, srcTime, outW, outH, fx, localT, fr)
      hits.push({ id: clip.id, kind: clip.kind, dest, overlay: true })
      if (selected.has(clip.id)) overlayDestSel = dest
    } else {
      const pose = clipPose(clip, localT)
      ctx.save()
      ctx.translate(ox, oy)
      applyCanvasFx(ctx, { ...fx, opacity: fx.opacity * pose.opacity }, cw, ch)
      const dx = (pose.x - 0.5) * cw
      const dy = (pose.y - 0.5) * ch
      const rot = pose.rotation || 0
      const sc = pose.scale ?? 1
      if (dx || dy || rot || Math.abs(sc - 1) > 0.001) {
        ctx.translate(cw / 2 + dx, ch / 2 + dy)
        ctx.rotate(rot * Math.PI / 180)
        ctx.scale(sc, sc)
        ctx.translate(-cw / 2, -ch / 2)
      }
      drawReframe(ctx, el, reframeForDraw(clip, localT, srcTime), srcTime, outW / outH, { clear: false, dest: { dx: 0, dy: 0, dw: cw, dh: ch } })
      ctx.restore()
      const dest = offsetDest(fillDestRect(cw, ch, clip, localT), ox, oy)
      hits.push({ id: clip.id, kind: clip.kind, dest, overlay: false })
      if (selected.has(clip.id) && !overlayDestSel) overlayDestSel = dest
    }
  }

  for (const c of clipsRef.current) {
    if (c.kind !== 'text') continue
    const track = tracksRef.current.find((t) => t.id === c.track_id)
    if (track?.hidden) continue
    const activeText = head >= c.start - 0.02 && head < c.start + clipDur(c)
    if (!activeText) continue
    const isSel = selected.has(c.id)
    ctx.save(); ctx.translate(ox, oy)
    const r = drawTextClip(ctx, c, cw, ch, { selected: isSel, time: head, trackStyle: track?.style })
    ctx.restore()
    if (isSel) selRender = offsetRender(r, ox, oy)
    if (r?.box) hits.push({ id: c.id, kind: 'text', dest: boxToDest(offsetBox(r.box, ox, oy)), handles: offsetHandles(r.handles, ox, oy) })
  }
  if (overlayDestSel) drawTransformHandles(ctx, overlayDestSel)
  if (env.hitListRef) env.hitListRef.current = hits
  return selRender
}

function drawCropRuler(ctx, bx, by, bw, bh) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 4])
  for (const f of [1 / 3, 2 / 3]) {
    ctx.beginPath()
    ctx.moveTo(bx + bw * f, by)
    ctx.lineTo(bx + bw * f, by + bh)
    ctx.moveTo(bx, by + bh * f)
    ctx.lineTo(bx + bw, by + bh * f)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(255, 213, 0, 0.92)'
  for (let i = 0; i <= 10; i++) {
    const f = i / 10
    const x = bx + bw * f
    const y = by + bh * f
    const big = i % 5 === 0
    const len = big ? 8 : 4
    ctx.beginPath()
    ctx.moveTo(x, by)
    ctx.lineTo(x, by - len)
    ctx.moveTo(bx, y)
    ctx.lineTo(bx - len, y)
    ctx.stroke()
  }
  ctx.restore()
}

// Canvas principal: el compuesto (resultado) es la vista por defecto.
// El recorte de fuente (vídeo completo + recuadro) aparece en Clip Editor
// y en Encuadre (al seleccionar un fill, o al pulsar Encuadre).
export function drawMainView(head, env) {
  const {
    mainCanvasRef, clipsRef, mediaEls, outRef, selRef, selIdsRef, selKfRef, hiddenKfRef,
    playingRef, framingModeRef, mainTextBox, alignGuidesRef, croppingRef,
    viewZoomRef, mainStageRef,
  } = env
  const canvas = mainCanvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const clip = clipsRef.current.find((c) => c.id === selRef.current)
  // Modo por-clip: si el clip seleccionado está en "Fijar vídeo" (fill), se muestra la
  // vista de recorte (fuente completa + recuadro naranja móvil, zonas fuera atenuadas).
  // Si es overlay (transformar vídeo) se usa el compuesto (marco fijo). Estable en play
  // para no parpadear al reproducir. Igual en Main y en Clip Editor.
  const cropEdit = !!(clip && isVisualClip(clip) && !isOverlay(clip) && !framingModeRef.current)

  // Recorte (fuente + recuadro): Clip Editor, o herramienta Encuadre con un visual seleccionado.
  if (cropEdit && clip && isVisualClip(clip)) {
    const el = mediaEls.current.get(clip.id)
    const { w: vw, h: vh } = mediaSize(el)
    if (!el || !vw) {
      ctx.fillStyle = '#05060a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }
    const srcAspect = vw / vh
    const cw2 = 520, ch2 = Math.round(cw2 / srcAspect)
    if (canvas.width !== cw2 || canvas.height !== ch2) { canvas.width = cw2; canvas.height = ch2 }
    const active = head >= clip.start - 0.02 && head < clipEnd(clip)
    const clampedHead = clamp(head, clip.start, clipEnd(clip))
    const srcTime = clamp(timelineToSource(clip, clampedHead), clip.in_point, clip.out_point)
    if (!(playingRef.current && active) && clip.kind !== 'image') {
      const seekT = safeMediaTime(el, srcTime, env.fpsRef?.current)
      if (Math.abs(el.currentTime - seekT) > 0.06) { try { el.currentTime = seekT } catch { /* noop */ } }
    }
    ctx.clearRect(0, 0, cw2, ch2)
    try { ctx.drawImage(el, 0, 0, cw2, ch2) } catch { /* noop */ }
    const rf = clip.reframe || newReframe()
    const outA = outRef.current.w / outRef.current.h
    const srcT = (playingRef.current && active && clip.kind !== 'image') ? el.currentTime : srcTime
    const localHead = Math.max(0, head - clip.start)
    const crop = cropWindow(clip, srcAspect, outA, srcT, localHead)
    const { cx: pcx, cy: pcy, wf, hf } = crop
    const bx = (pcx - wf / 2) * cw2, by = (pcy - hf / 2) * ch2, bw = wf * cw2, bh = hf * ch2
    ctx.fillStyle = 'rgba(3,5,12,0.58)'
    ctx.fillRect(0, 0, cw2, by)
    ctx.fillRect(0, by + bh, cw2, ch2 - (by + bh))
    ctx.fillRect(0, by, bx, bh)
    ctx.fillRect(bx + bw, by, cw2 - (bx + bw), bh)
    const kfs = keyframesOn(clip)
      ? normalizeItems(clip.keyframes.items)
      : [...(rf.keyframes || [])].sort((a, b) => a.t - b.t)
    kfs.forEach((k, i) => {
      if (hiddenKfRef.current.has(k.id)) return
      const g = keyframesOn(clip)
        ? cropWindow(clip, srcAspect, outA, srcT, k.t)
        : cropWindow({ ...clip, reframe: { ...rf, keyframes: [k] } }, srcAspect, outA, k.t)
      const kx = (g.cx - g.wf / 2) * cw2, ky = (g.cy - g.hf / 2) * ch2
      ctx.strokeStyle = kfColor(i)
      ctx.lineWidth = k.id === selKfRef.current ? 3 : 1.5
      ctx.strokeRect(kx, ky, g.wf * cw2, g.hf * ch2)
    })
    ctx.strokeStyle = '#ff8c1a'; ctx.lineWidth = 2.5
    ctx.strokeRect(bx, by, bw, bh)
    if (croppingRef?.current) drawCropRuler(ctx, bx, by, bw, bh)
    const hs = 5
    ctx.fillStyle = '#ff8c1a'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    cropCornerNorms(pcx, pcy, wf, hf).forEach(([nx, ny]) => {
      const hx = nx * cw2, hy = ny * ch2
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2)
      ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2)
    })
    return
  }

  // El canvas ocupa TODO el stage (más ancho que la salida), para ver el desborde del
  // clip fuera del cuadro naranja (p. ej. 16:9 dentro de 9:16). El cuadro va centrado.
  const sr = mainStageRef?.current?.getBoundingClientRect()
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  const cwT = Math.max(2, Math.round((sr?.width || 900) * dpr))
  const chT = Math.max(2, Math.round((sr?.height || 700) * dpr))
  if (canvas.width !== cwT || canvas.height !== chT) { canvas.width = cwT; canvas.height = chT }
  const cw = canvas.width, ch = canvas.height
  const outA = outRef.current.w / outRef.current.h
  const frame = frameRectOf(cw, ch, viewZoomRef?.current ?? 1, outA)
  // Fondo del workspace (fuera del Main).
  ctx.fillStyle = '#0b0e16'
  ctx.fillRect(0, 0, cw, ch)
  mainTextBox.current = drawComposite(
    ctx, head,
    selIdsRef?.current?.length ? selIdsRef.current : (clip?.id ? [clip.id] : []),
    env, frame,
  )
  // Atenuar el contexto que queda fuera del recuadro exportable.
  ctx.save()
  ctx.fillStyle = 'rgba(7, 9, 16, 0.62)'
  ctx.fillRect(0, 0, cw, frame.y)
  ctx.fillRect(0, frame.y + frame.h, cw, ch - (frame.y + frame.h))
  ctx.fillRect(0, frame.y, frame.x, frame.h)
  ctx.fillRect(frame.x + frame.w, frame.y, cw - (frame.x + frame.w), frame.h)
  ctx.restore()
  // Overlays de edición (encuadre de texto, guías) mapeados al recuadro Main.
  ctx.save()
  ctx.translate(frame.x, frame.y)
  if (framingModeRef.current) drawFramingOverlay(ctx, frame.w, frame.h, framingModeRef.current)
  drawAlignGuides(ctx, frame.w, frame.h, alignGuidesRef?.current)
  ctx.restore()
  // Borde naranja fijo = límite del área que se exporta.
  ctx.save()
  ctx.strokeStyle = '#ff8c1a'
  ctx.lineWidth = Math.max(2, cw * 0.004)
  const lw = ctx.lineWidth
  ctx.strokeRect(frame.x + lw / 2, frame.y + lw / 2, frame.w - lw, frame.h - lw)
  ctx.restore()
}
