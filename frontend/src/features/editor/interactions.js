// Manejador de puntero del canvas Main: mover/redimensionar el encuadre de texto de
// pista (overlay amarillo), mover/redimensionar un texto seleccionado, o reencuadrar
// arrastrando un clip de vídeo (crea/actualiza keyframes).
//
// Se construye por render con el contexto vivo (clip seleccionado, playhead, aspecto…),
// igual que la función inline original, para no alterar el comportamiento.
import { clamp, clampCenter, frameAt, zoomFromCorner, isNearCropCorner } from '../../lib/panning'
import {
  canvasPointer, clampCrop, cropSizeFromCorner, cropWindow, destRectOnCanvas,
  hitTransformHandle, isOverlay, mediaSize, sourceCropPx,
} from '../../lib/clipLayout'
import { framingRect } from './render/canvas'
import { snapAlign, textAlignTargets } from '../../lib/alignGuides'
import { clipEnd, isVisualClip, timelineToSource } from './editorModel'
import { clipPose, posedTransform } from '../../lib/clipAnim'
import { keyframesOn } from '../../lib/clipKeyframes'

export function createMainDownHandler(ctx) {
  const {
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    selectedClip, mainTextBox, changeStyle, changeShape, mediaEls, playhead, upsertKeyframe, outAspect,
    changeReframe, clipsRef, tracksRef, playheadRef, alignGuidesRef, seek, croppingRef,
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
          if (mode === 'move') {
            const rawX = clamp(s0.x + dxN, 0, 1)
            const rawY = clamp(s0.y + dyN, 0, 1)
            const snapped = snapAlign(rawX, rawY, textAlignTargets(clipsRef?.current, tracksRef?.current, playheadRef?.current ?? 0, null))
            if (alignGuidesRef) alignGuidesRef.current = snapped.guides
            n.x = snapped.x
            n.y = snapped.y
          }
          else if (mode === 'width-r') n.w = clamp(s0.w + dxN * 2, 0.05, 1)
          else if (mode === 'width-l') n.w = clamp(s0.w - dxN * 2, 0.05, 1)
          else if (mode === 'height') n.h = clamp(s0.h + dyN * 2, 0.03, 0.95)
          else if (mode === 'corner') { n.w = clamp(s0.w + dxN * 2, 0.05, 1); n.h = clamp(s0.h + dyN * 2, 0.03, 0.95) }
          return n
        })
      }
      const up = () => {
        if (alignGuidesRef) alignGuidesRef.current = null
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      }
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
      const localT = Math.max(0, playhead - (clip.start || 0))
      const pose = clipPose(clip, localT)
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height
      const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy
      let mode = 'move'
      if (render.handles) {
        const near = (h) => Math.abs(px - h.x) < 12 && Math.abs(py - h.y) < 12
        if (near(render.handles.br)) mode = 'size'
        else if (near(render.handles.r)) mode = 'width-r'
        else if (near(render.handles.l)) mode = 'width-l'
      }
      const s0 = { x: pose.x, y: pose.y, w: st.w ?? 0.8, size: st.size ?? 0.07, cx: e.clientX, cy: e.clientY }
      const move = (ev) => {
        const dxN = (ev.clientX - s0.cx) / rect.width, dyN = (ev.clientY - s0.cy) / rect.height
        if (mode === 'move') {
          const rawX = clamp(s0.x + dxN, 0, 1)
          const rawY = clamp(s0.y + dyN, 0, 1)
          const snapped = snapAlign(rawX, rawY, textAlignTargets(clipsRef?.current, tracksRef?.current, playheadRef?.current ?? playhead, clip.id))
          if (alignGuidesRef) alignGuidesRef.current = snapped.guides
          changeStyle(clip.id, { x: +snapped.x.toFixed(4), y: +snapped.y.toFixed(4) })
        }
        else if (mode === 'width-r') changeStyle(clip.id, { w: +clamp(s0.w + dxN * 2, 0.1, 1).toFixed(4) })
        else if (mode === 'width-l') changeStyle(clip.id, { w: +clamp(s0.w - dxN * 2, 0.1, 1).toFixed(4) })
        else if (mode === 'size') changeStyle(clip.id, { size: +clamp(s0.size + dyN * 0.3, 0.02, 0.3).toFixed(4) })
      }
      const up = () => {
        if (alignGuidesRef) alignGuidesRef.current = null
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      return
    }

    if (clip.kind === 'shape') {
      const render = mainTextBox.current
      if (!render) return
      if (playingRef.current) stopPlayback()
      const st = clip.shape || {}
      const localT = Math.max(0, playhead - (clip.start || 0))
      const pose = clipPose(clip, localT)
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height
      const px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy
      let mode = 'move'
      if (render.handles) {
        const near = (h) => h && Math.abs(px - h.x) < 12 && Math.abs(py - h.y) < 12
        if (near(render.handles.rot)) mode = 'rotate'
        else if (near(render.handles.br)) mode = 'corner'
        else if (near(render.handles.r)) mode = 'width-r'
        else if (near(render.handles.l)) mode = 'width-l'
        else if (near(render.handles.b)) mode = 'height'
        else if (near(render.handles.t)) mode = 'height-t'
      }
      const s0 = {
        x: pose.x, y: pose.y, w: st.w ?? 0.38, h: st.h ?? 0.16, scale: pose.scale || 1,
        rotation: pose.rotation ?? 0, cx: e.clientX, cy: e.clientY, px, py,
      }
      const move = (ev) => {
        const dxN = (ev.clientX - s0.cx) / rect.width, dyN = (ev.clientY - s0.cy) / rect.height
        if (mode === 'move') {
          const rawX = clamp(s0.x + dxN, 0, 1)
          const rawY = clamp(s0.y + dyN, 0, 1)
          const snapped = snapAlign(rawX, rawY, textAlignTargets(clipsRef?.current, tracksRef?.current, playheadRef?.current ?? playhead, clip.id))
          if (alignGuidesRef) alignGuidesRef.current = snapped.guides
          changeShape(clip.id, { x: +snapped.x.toFixed(4), y: +snapped.y.toFixed(4) })
        } else if (mode === 'width-r') changeShape(clip.id, { w: +clamp(s0.w + dxN * 2 / (s0.scale || 1), 0.04, 1).toFixed(4) })
        else if (mode === 'width-l') changeShape(clip.id, { w: +clamp(s0.w - dxN * 2 / (s0.scale || 1), 0.04, 1).toFixed(4) })
        else if (mode === 'height') changeShape(clip.id, { h: +clamp(s0.h + dyN * 2 / (s0.scale || 1), 0.03, 1).toFixed(4) })
        else if (mode === 'height-t') changeShape(clip.id, { h: +clamp(s0.h - dyN * 2 / (s0.scale || 1), 0.03, 1).toFixed(4) })
        else if (mode === 'corner') {
          changeShape(clip.id, {
            w: +clamp(s0.w + dxN * 2 / (s0.scale || 1), 0.04, 1).toFixed(4),
            h: +clamp(s0.h + dyN * 2 / (s0.scale || 1), 0.03, 1).toFixed(4),
          })
        } else if (mode === 'rotate') {
          const nx = (ev.clientX - rect.left) * sx
          const ny = (ev.clientY - rect.top) * sy
          const cx = pose.x * canvas.width
          const cy = pose.y * canvas.height
          const ang = Math.atan2(ny - cy, nx - cx) * 180 / Math.PI + 90
          changeShape(clip.id, { rotation: +ang.toFixed(1) })
        }
      }
      const up = () => {
        if (alignGuidesRef) alignGuidesRef.current = null
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      return
    }

    if (!isVisualClip(clip)) return
    const el = mediaEls.current.get(clip.id)
    const sz = mediaSize(el)
    if (!el || !sz.w) return
    // Al reproducir, Main enseña el compuesto: el clic solo pausa, no recorta.
    if (playingRef.current) { stopPlayback(); return }
    const srcAspect = sz.w / sz.h
    const srcT = clamp(timelineToSource(clip, playhead), clip.in_point, clip.out_point)
    const clipT = Math.max(0, playhead - clip.start)
    const crop = cropWindow(clip, srcAspect, outAspect, srcT, clipT)
    const toNorm = (ev) => [clamp((ev.clientX - rect.left) / rect.width, 0, 1), clamp((ev.clientY - rect.top) / rect.height, 0, 1)]
    const [nx0, ny0] = toNorm(e)
    const zooming = isNearCropCorner(nx0, ny0, crop.cx, crop.cy, crop.wf, crop.hf, rect)
    const end = clipEnd(clip)
    const head = playheadRef?.current ?? playhead
    if (head < clip.start - 0.02 || head >= end) seek?.(clip.start + 0.02)
    if (croppingRef) croppingRef.current = true
    const listenCrop = (move) => {
      const up = () => {
        if (croppingRef) croppingRef.current = false
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

    if (isOverlay(clip)) {
      const applyMove = (cx, cy) => {
        const c = clampCrop(cx, cy, crop.wf, crop.hf)
        upsertKeyframe(clip, srcT, c.cx, c.cy)
      }
      const applySize = (nx, ny) => {
        const sized = cropSizeFromCorner(nx, ny, crop.cx, crop.cy)
        const c = clampCrop(crop.cx, crop.cy, sized.wf, sized.hf)
        changeReframe(clip.id, { crop_w: +c.wf.toFixed(4), crop_h: +c.hf.toFixed(4) })
        upsertKeyframe(clip, srcT, c.cx, c.cy)
      }
      if (zooming) applySize(nx0, ny0)
      else applyMove(nx0, ny0)
      listenCrop((ev) => {
        const [nx, ny] = toNorm(ev)
        if (zooming) applySize(nx, ny)
        else applyMove(nx, ny)
      })
      return
    }

    const rf = clip.reframe
    const pose = clipPose(clip, clipT, srcT)
    const fr = keyframesOn(clip)
      ? { zoom: pose.zoom, cx: pose.cx, cy: pose.cy }
      : frameAt(rf?.keyframes, srcT, rf?.zoom ?? 1, rf?.pan_mode || 'smooth')
    const applyMove = (cx, cy) => {
      const c = clampCenter(cx, cy, fr.zoom, srcAspect, outAspect)
      upsertKeyframe(clip, srcT, c.cx, c.cy)
    }
    const applyZoom = (nx, ny) => {
      const z = zoomFromCorner(nx, ny, crop.cx, crop.cy, srcAspect, outAspect)
      const c = clampCenter(crop.cx, crop.cy, z, srcAspect, outAspect)
      upsertKeyframe(clip, srcT, c.cx, c.cy, { zoom: z })
    }
    if (zooming) applyZoom(nx0, ny0)
    else applyMove(nx0, ny0)
    listenCrop((ev) => {
      const [nx, ny] = toNorm(ev)
      if (zooming) applyZoom(nx, ny)
      else applyMove(nx, ny)
    })
  }
}

export function createResultDownHandler(ctx) {
  const {
    resultCanvasRef, selectedClip, playhead, mediaEls, outW, outH,
    changeTransform, playingRef, stopPlayback,
  } = ctx

  return function onResultDown(e) {
    const clip = selectedClip
    if (!isOverlay(clip) || !isVisualClip(clip)) return
    const end = clipEnd(clip)
    if (playhead < clip.start - 0.02 || playhead >= end) return
    const canvas = resultCanvasRef.current
    const el = mediaEls.current.get(clip.id)
    const sz = mediaSize(el)
    if (!canvas || !sz.w) return
    if (playingRef.current) stopPlayback()

    const localT = Math.max(0, playhead - clip.start)
    const srcT = clamp(timelineToSource(clip, playhead), clip.in_point, clip.out_point)
    const crop = cropWindow(clip, sz.w / sz.h, outW / outH, srcT, localT)
    const pxCrop = sourceCropPx(crop, sz.w, sz.h)
    const dest = destRectOnCanvas(posedTransform(clip, localT), pxCrop, outW, outH, canvas.width, canvas.height)
    const p0 = canvasPointer(e, canvas)
    const mode = hitTransformHandle(p0.x, p0.y, dest)
    if (!mode) return

    const t0 = posedTransform(clip, localT)
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
