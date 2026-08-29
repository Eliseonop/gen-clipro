// Manejador de puntero del canvas Main: mover/redimensionar el encuadre de texto de
// pista (overlay amarillo), mover/redimensionar un texto seleccionado, o reencuadrar
// arrastrando un clip de vídeo (crea/actualiza keyframes).
//
// Se construye por render con el contexto vivo (clip seleccionado, playhead, aspecto…),
// igual que la función inline original, para no alterar el comportamiento.
import { clamp, clampCenter, frameAt, zoomFromCorner, isNearCropCorner } from '../../lib/panning'
import {
  canvasPointer, clampCrop, cropSizeFromCorner, cropWindow, destRectOnCanvas,
  hitTransformHandle, isOverlay, newTransform, sourceCropPx,
} from '../../lib/clipLayout'
import { framingRect } from './render/canvas'

export function createMainDownHandler(ctx) {
  const {
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    selectedClip, mainTextBox, changeStyle, mediaEls, playhead, upsertKeyframe, outAspect,
    changeReframe,
  } = ctx

  return function onMainDown(e) {
    const canvas = mainCanvasRef.current
    const rect = canvas.getBoundingClientRect()

    // Encuadre de texto de pista (overlay amarillo): mover / redimensionar.
    const fm = framingModeRef.current
    if (fm) {
      if (playingRef.current) stopPlayback()
      const cw = canvas.width, ch = canvas.height
      const px = (e.clientX - rect.left) * (cw / rect.width), py = (e.clientY - rect.top) * (ch / rect.height)
      const { bx, by, boxW, boxH } = framingRect(cw, ch, fm)
      const near = (hx, hy) => Math.abs(px - hx) < 14 && Math.abs(py - hy) < 14
      let mode = 'move'
      if (near(bx + boxW, by + boxH)) mode = 'corner'
      else if (near(bx, by + boxH / 2)) mode = 'width-l'
      else if (near(bx + boxW, by + boxH / 2)) mode = 'width-r'
      else if (near(bx + boxW / 2, by + boxH)) mode = 'height'
      const s0 = { x: fm.x ?? 0.5, y: fm.y ?? 0.5, w: fm.w ?? 0.8, h: fm.h ?? 0.13, cx: e.clientX, cy: e.clientY }
      const move = (ev) => {
        const dxN = (ev.clientX - s0.cx) / rect.width, dyN = (ev.clientY - s0.cy) / rect.height
        setFramingMode((prev) => {
          if (!prev) return prev
          const n = { ...prev }
          if (mode === 'move') { n.x = clamp(s0.x + dxN, 0, 1); n.y = clamp(s0.y + dyN, 0, 1) }
          else if (mode === 'width-r') n.w = clamp(s0.w + dxN * 2, 0.05, 1)
          else if (mode === 'width-l') n.w = clamp(s0.w - dxN * 2, 0.05, 1)
          else if (mode === 'height') n.h = clamp(s0.h + dyN * 2, 0.03, 0.95)
          else if (mode === 'corner') { n.w = clamp(s0.w + dxN * 2, 0.05, 1); n.h = clamp(s0.h + dyN * 2, 0.03, 0.95) }
          return n
        })
      }
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      return
    }

    const clip = selectedClip
    if (!clip) return

    // Texto: mover / redimensionar (solo si está visible en el instante actual)
    if (clip.kind === 'text') {
      const render = mainTextBox.current
      if (!render) return                 // texto no activo bajo el playhead
      if (playingRef.current) stopPlayback()
      const st = clip.style || {}
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height
      const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy
      let mode = 'move'
      if (render.handles) {
        const near = (h) => Math.abs(px - h.x) < 12 && Math.abs(py - h.y) < 12
        if (near(render.handles.br)) mode = 'size'
        else if (near(render.handles.r)) mode = 'width-r'
        else if (near(render.handles.l)) mode = 'width-l'
      }
      const s0 = { x: st.x ?? 0.5, y: st.y ?? 0.5, w: st.w ?? 0.8, size: st.size ?? 0.07, cx: e.clientX, cy: e.clientY }
      const move = (ev) => {
        const dxN = (ev.clientX - s0.cx) / rect.width, dyN = (ev.clientY - s0.cy) / rect.height
        if (mode === 'move') changeStyle(clip.id, { x: +clamp(s0.x + dxN, 0, 1).toFixed(4), y: +clamp(s0.y + dyN, 0, 1).toFixed(4) })
        else if (mode === 'width-r') changeStyle(clip.id, { w: +clamp(s0.w + dxN * 2, 0.1, 1).toFixed(4) })
        else if (mode === 'width-l') changeStyle(clip.id, { w: +clamp(s0.w - dxN * 2, 0.1, 1).toFixed(4) })
        else if (mode === 'size') changeStyle(clip.id, { size: +clamp(s0.size + dyN * 0.3, 0.02, 0.3).toFixed(4) })
      }
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      return
    }

    if (clip.kind !== 'video') return
    const el = mediaEls.current.get(clip.id)
    if (!el || !el.videoWidth) return
    // Al reproducir, Main enseña el compuesto: el clic solo pausa, no recorta.
    if (playingRef.current) { stopPlayback(); return }
    const srcAspect = el.videoWidth / el.videoHeight
    const localT = clamp(clip.in_point + (playhead - clip.start), clip.in_point, clip.out_point)
    const crop = cropWindow(clip, srcAspect, outAspect, localT)
    const toNorm = (ev) => [clamp((ev.clientX - rect.left) / rect.width, 0, 1), clamp((ev.clientY - rect.top) / rect.height, 0, 1)]
    const [nx0, ny0] = toNorm(e)
    const zooming = isNearCropCorner(nx0, ny0, crop.cx, crop.cy, crop.wf, crop.hf, rect)

    if (isOverlay(clip)) {
      const applyMove = (cx, cy) => {
        const c = clampCrop(cx, cy, crop.wf, crop.hf)
        upsertKeyframe(clip, localT, c.cx, c.cy)
      }
      const applySize = (nx, ny) => {
        const sized = cropSizeFromCorner(nx, ny, crop.cx, crop.cy)
        const c = clampCrop(crop.cx, crop.cy, sized.wf, sized.hf)
        changeReframe(clip.id, { crop_w: +c.wf.toFixed(4), crop_h: +c.hf.toFixed(4) })
        upsertKeyframe(clip, localT, c.cx, c.cy)
      }
      if (zooming) applySize(nx0, ny0)
      else applyMove(nx0, ny0)
      const move = (ev) => {
        const [nx, ny] = toNorm(ev)
        if (zooming) applySize(nx, ny)
        else applyMove(nx, ny)
      }
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      return
    }

    const rf = clip.reframe
    const fr = frameAt(rf?.keyframes, localT, rf?.zoom ?? 1, rf?.pan_mode || 'smooth')
    const applyMove = (cx, cy) => {
      const c = clampCenter(cx, cy, fr.zoom, srcAspect, outAspect)
      upsertKeyframe(clip, localT, c.cx, c.cy)
    }
    const applyZoom = (nx, ny) => {
      const z = zoomFromCorner(nx, ny, crop.cx, crop.cy, srcAspect, outAspect)
      const c = clampCenter(crop.cx, crop.cy, z, srcAspect, outAspect)
      upsertKeyframe(clip, localT, c.cx, c.cy, { zoom: z })
    }
    if (zooming) applyZoom(nx0, ny0)
    else applyMove(nx0, ny0)
    const move = (ev) => {
      const [nx, ny] = toNorm(ev)
      if (zooming) applyZoom(nx, ny)
      else applyMove(nx, ny)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
}

export function createResultDownHandler(ctx) {
  const {
    resultCanvasRef, selectedClip, playhead, mediaEls, outW, outH,
    changeTransform, playingRef, stopPlayback,
  } = ctx

  return function onResultDown(e) {
    const clip = selectedClip
    if (!isOverlay(clip) || clip.kind !== 'video') return
    const end = clip.start + Math.max(0, clip.out_point - clip.in_point)
    if (playhead < clip.start - 0.02 || playhead >= end) return
    const canvas = resultCanvasRef.current
    const el = mediaEls.current.get(clip.id)
    if (!canvas || !el?.videoWidth) return
    if (playingRef.current) stopPlayback()

    const localT = clamp(clip.in_point + (playhead - clip.start), clip.in_point, clip.out_point)
    const crop = cropWindow(clip, el.videoWidth / el.videoHeight, outW / outH, localT)
    const pxCrop = sourceCropPx(crop, el.videoWidth, el.videoHeight)
    const dest = destRectOnCanvas(clip.transform, pxCrop, outW, outH, canvas.width, canvas.height)
    const p0 = canvasPointer(e, canvas)
    const mode = hitTransformHandle(p0.x, p0.y, dest)
    if (!mode) return

    const t0 = { ...newTransform(), ...clip.transform }
    const cx0 = dest.dx + dest.dw / 2
    const cy0 = dest.dy + dest.dh / 2
    const dist0 = Math.hypot(p0.x - cx0, p0.y - cy0) || 1
    const ang0 = Math.atan2(p0.y - cy0, p0.x - cx0)

    const move = (ev) => {
      const p = canvasPointer(ev, canvas)
      if (mode === 'move') {
        const dxN = (p.x - p0.x) / canvas.width
        const dyN = (p.y - p0.y) / canvas.height
        changeTransform(clip.id, {
          x: +clamp(t0.x + dxN, -0.2, 1.2).toFixed(4),
          y: +clamp(t0.y + dyN, -0.2, 1.2).toFixed(4),
        })
      } else if (mode === 'scale') {
        const dist = Math.hypot(p.x - cx0, p.y - cy0)
        changeTransform(clip.id, { scale: +clamp(t0.scale * (dist / dist0), 0.05, 8).toFixed(4) })
      } else if (mode === 'rotate') {
        const ang = Math.atan2(p.y - cy0, p.x - cx0)
        changeTransform(clip.id, { rotation: +((t0.rotation + (ang - ang0) * 180 / Math.PI) % 360).toFixed(2) })
      }
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
}
