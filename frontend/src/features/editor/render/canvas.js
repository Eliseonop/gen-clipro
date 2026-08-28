// Dibujo del editor sobre <canvas>: compuesto final (vídeo + texto), vista de edición
// del Main (recorte/keyframes) y overlay de encuadre de texto.
//
// Estas funciones son puras respecto a React: reciben un `env` con las refs vivas del
// componente (clipsRef, tracksRef, mediaEls, outRef, …) y leen `.current` en el momento
// de la llamada, igual que hacía el componente. Así el comportamiento por frame no cambia.
import { drawReframe, geomFor, clampCenter, posAt, clamp, kfColor } from '../../../lib/panning'
import { drawTextClip } from '../../../lib/textstyles'
import { clipDur, clipEnd, newReframe } from '../editorModel'

// Centro interpolado del encuadre en el instante `t`.
function center(rf, t) {
  const p = posAt(rf.keyframes, t, rf.pan_mode)
  return [p.cx, p.cy]
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

// Dibuja el compuesto (vídeo superior + textos activos) en un canvas.
export function drawComposite(ctx, head, selTextId, env) {
  const { clipsRef, tracksRef, mediaEls, outRef, topVideoAt } = env
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  const top = topVideoAt(head)
  if (top) {
    const el = mediaEls.current.get(top.id)
    if (el && el.videoWidth) drawReframe(ctx, el, top.reframe, el.currentTime, outRef.current.w / outRef.current.h)
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch) }
  } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch) }
  let selRender = null
  for (const c of clipsRef.current) {
    if (c.kind !== 'text') continue
    const track = tracksRef.current.find((t) => t.id === c.track_id)
    if (track?.hidden) continue
    // El texto solo aparece cuando el playhead está dentro de su rango.
    const activeText = head >= c.start - 0.02 && head < c.start + clipDur(c)
    if (!activeText) continue
    const isSel = c.id === selTextId
    const r = drawTextClip(ctx, c, cw, ch, { selected: isSel })
    if (isSel) selRender = r
  }
  return selRender
}

// Dibujo del Main: siempre muestra el compuesto según la posición del cabezal.
// La selección de un clip sólo afecta al borde de resaltado, nunca a la visibilidad temporal.
export function drawMainView(head, env) {
  const {
    mainCanvasRef, clipsRef, mediaEls, outRef, selRef, selKfRef, hiddenKfRef,
    playingRef, framingModeRef, mainTextBox,
  } = env
  const canvas = mainCanvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const a = outRef.current.w / outRef.current.h
  const cw = a >= 1 ? 520 : Math.round(520 * a)
  const ch = a >= 1 ? Math.round(520 / a) : 520
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch }

  const clip = clipsRef.current.find((c) => c.id === selRef.current)

  // Si hay un clip de vídeo seleccionado, dibujar la vista de edición de encuadre
  // (vídeo original + rectángulo de recorte). No aplica para texto.
  if (clip && clip.kind === 'video') {
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
    const zoom = rf.zoom ?? 1
    const { widthFrac: wf, heightFrac: hf } = geomFor(zoom, srcAspect, outRef.current.w / outRef.current.h)
    const p = clampCenter(...center(rf, playingRef.current && active ? el.currentTime : srcTime), zoom, srcAspect, outRef.current.w / outRef.current.h)
    const bx = (p.cx - wf / 2) * cw2, by = (p.cy - hf / 2) * ch2, bw = wf * cw2, bh = hf * ch2
    ctx.fillStyle = 'rgba(3,5,12,0.58)'
    ctx.fillRect(0, 0, cw2, by)
    ctx.fillRect(0, by + bh, cw2, ch2 - (by + bh))
    ctx.fillRect(0, by, bx, bh)
    ctx.fillRect(bx + bw, by, cw2 - (bx + bw), bh)
    const kfs = [...(rf.keyframes || [])].sort((a, b) => a.t - b.t)
    kfs.forEach((k, i) => {
      if (hiddenKfRef.current.has(k.id)) return
      const kp = clampCenter(k.cx, k.cy, zoom, srcAspect, outRef.current.w / outRef.current.h)
      const kx = (kp.cx - wf / 2) * cw2, ky = (kp.cy - hf / 2) * ch2
      ctx.strokeStyle = kfColor(i)
      ctx.lineWidth = k.id === selKfRef.current ? 3 : 1.5
      ctx.strokeRect(kx, ky, bw, bh)
    })
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.strokeRect(bx, by, bw, bh)
    return
  }

  // Para texto, vacío, o sin selección: mostrar siempre el compuesto según el cabezal.
  // drawComposite ya respeta la visibilidad temporal de cada texto.
  mainTextBox.current = drawComposite(ctx, head, clip?.id ?? null, env)
  if (framingModeRef.current) drawFramingOverlay(ctx, canvas.width, canvas.height, framingModeRef.current)
}
