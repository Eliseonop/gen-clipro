// Puntero del canvas: compuesto (mover/escalar/rotar/seleccionar) o recorte de fuente.
import { clamp, clampCenter, frameAt, zoomFromCorner, isNearCropCorner } from '../../lib/panning'
import {
  canvasPointer, clampCrop, CLIP_POS_MAX, CLIP_POS_MIN, cropSizeFromCorner, cropWindow, destRectOnCanvas,
  frameRectOf, hitTransformHandle, isOverlay, mediaSize, sourceCropPx,
} from '../../lib/clipLayout'
import { framingRect, hitFrontmost, pointInDest } from './render/canvas'
import { snapAlign, textAlignTargets } from '../../lib/alignGuides'
import { clipEnd, isVisualClip, timelineToSource } from './editorModel'
import { clipPose, posedTransform } from '../../lib/clipAnim'
import { keyframesOn } from '../../lib/clipKeyframes'

function nearHandle(px, py, h, pad = 12) {
  return !!(h && Math.abs(px - h.x) < pad && Math.abs(py - h.y) < pad)
}

function textShapeMode(px, py, clip, render) {
  if (clip.kind === 'text') {
    let mode = 'move'
    if (render?.handles) {
      if (nearHandle(px, py, render.handles.br)) mode = 'size'
      else if (nearHandle(px, py, render.handles.r)) mode = 'width-r'
      else if (nearHandle(px, py, render.handles.l)) mode = 'width-l'
    }
    return mode
  }
  if (clip.kind === 'shape') {
    let mode = 'move'
    if (render?.handles) {
      if (nearHandle(px, py, render.handles.rot)) mode = 'rotate'
      else if (nearHandle(px, py, render.handles.br)) mode = 'corner'
      else if (nearHandle(px, py, render.handles.r)) mode = 'width-r'
      else if (nearHandle(px, py, render.handles.l)) mode = 'width-l'
      else if (nearHandle(px, py, render.handles.b)) mode = 'height'
      else if (nearHandle(px, py, render.handles.t)) mode = 'height-t'
    }
    return mode
  }
  return 'move'
}

function listenMove(move) {
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

export function createMainDownHandler(ctx) {
  const {
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    selectedClip, mainTextBox, changeStyle, changeShape, mediaEls, playhead, upsertKeyframe, outAspect,
    changeReframe, clipsRef, tracksRef, playheadRef, alignGuidesRef, seek, croppingRef, viewZoomRef,
  } = ctx

  return function onMainDown(e) {
    const canvas = mainCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ptr0 = canvasPointer(e, canvas)

    const fm = framingModeRef.current
    if (fm) {
      if (playingRef.current) stopPlayback()
      // El encuadre de texto se dibuja dentro del recuadro Main (workspace).
      const frame = frameRectOf(canvas.width, canvas.height, viewZoomRef?.current ?? 1)
      const dispW = frame.w * ptr0.scale, dispH = frame.h * ptr0.scale
      const px = ptr0.x, py = ptr0.y
      const local = framingRect(frame.w, frame.h, fm)
      const bx = local.bx + frame.x, by = local.by + frame.y, boxW = local.boxW, boxH = local.boxH
      const near = (hx, hy) => Math.abs(px - hx) < 14 && Math.abs(py - hy) < 14
      let mode = 'move'
      if (near(bx + boxW, by + boxH)) mode = 'corner'
      else if (near(bx, by + boxH / 2)) mode = 'width-l'
      else if (near(bx + boxW, by + boxH / 2)) mode = 'width-r'
      else if (near(bx + boxW / 2, by + boxH)) mode = 'height'
      const s0 = { x: fm.x ?? 0.5, y: fm.y ?? 0.5, w: fm.w ?? 0.8, h: fm.h ?? 0.13, cx: e.clientX, cy: e.clientY }
      const move = (ev) => {
        const dxN = (ev.clientX - s0.cx) / dispW, dyN = (ev.clientY - s0.cy) / dispH
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

    if (clip.kind === 'text') {
      const render = mainTextBox.current
      if (!render) return
      if (playingRef.current) stopPlayback()
      const st = clip.style || {}
      const localT = Math.max(0, playhead - (clip.start || 0))
      const pose = clipPose(clip, localT)
      const px = ptr0.x, py = ptr0.y
      const mode = textShapeMode(px, py, clip, render)
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
      const px = ptr0.x, py = ptr0.y
      const mode = textShapeMode(px, py, clip, render)
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
          const p = canvasPointer(ev, canvas)
          const cx = pose.x * canvas.width
          const cy = pose.y * canvas.height
          const ang = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90
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
    if (playingRef.current) { stopPlayback(); return }
    const srcAspect = sz.w / sz.h
    const srcT = clamp(timelineToSource(clip, playhead), clip.in_point, clip.out_point)
    const clipT = Math.max(0, playhead - clip.start)
    const crop = cropWindow(clip, srcAspect, outAspect, srcT, clipT)
    const toNorm = (ev) => {
      const p = canvasPointer(ev, canvas)
      return [clamp(p.x / canvas.width, 0, 1), clamp(p.y / canvas.height, 0, 1)]
    }
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
    resultCanvasRef, mainCanvasRef, selectedClip, playhead, mediaEls, outW, outH,
    changeTransform, playingRef, stopPlayback,
  } = ctx

  return function onResultDown(e) {
    const clip = selectedClip
    if (!isOverlay(clip) || !isVisualClip(clip)) return
    const end = clipEnd(clip)
    if (playhead < clip.start - 0.02 || playhead >= end) return
    const canvas = resultCanvasRef?.current || mainCanvasRef?.current
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
    startOverlayTransform(e, canvas, clip, dest, mode, { changeTransform, playhead })
  }
}

function startOverlayTransform(e, canvas, clip, dest, mode, { changeTransform, playhead }, frame) {
  const fr = frame || { x: 0, y: 0, w: canvas.width, h: canvas.height }
  const localT = Math.max(0, playhead - clip.start)
  const t0 = posedTransform(clip, localT)
  const p0 = canvasPointer(e, canvas)
  const cx0 = dest.dx + dest.dw / 2
  const cy0 = dest.dy + dest.dh / 2
  const dist0 = Math.hypot(p0.x - cx0, p0.y - cy0) || 1
  const ang0 = Math.atan2(p0.y - cy0, p0.x - cx0)

  listenMove((ev) => {
    const p = canvasPointer(ev, canvas)
    if (mode === 'move') {
      const dxN = (p.x - p0.x) / fr.w
      const dyN = (p.y - p0.y) / fr.h
      changeTransform(clip.id, {
        x: +clamp(t0.x + dxN, CLIP_POS_MIN, CLIP_POS_MAX).toFixed(4),
        y: +clamp(t0.y + dyN, CLIP_POS_MIN, CLIP_POS_MAX).toFixed(4),
      })
    } else if (mode === 'scale') {
      const dist = Math.hypot(p.x - cx0, p.y - cy0)
      changeTransform(clip.id, { scale: +clamp(t0.scale * (dist / dist0), 0.05, 8).toFixed(4) })
    } else if (mode === 'rotate') {
      const ang = Math.atan2(p.y - cy0, p.x - cx0)
      changeTransform(clip.id, { rotation: +((t0.rotation + (ang - ang0) * 180 / Math.PI) % 360).toFixed(2) })
    }
  })
}

function startTextShapeDrag(e, canvas, clip, render, ctx, frame) {
  const {
    playingRef, stopPlayback, changeStyle, changeShape,
    clipsRef, tracksRef, playheadRef, alignGuidesRef, playhead,
  } = ctx
  const p0 = canvasPointer(e, canvas)
  const fr = frame || { x: 0, y: 0, w: canvas.width, h: canvas.height }
  const dispW = fr.w * p0.scale, dispH = fr.h * p0.scale
  if (playingRef.current) stopPlayback()
  const localT = Math.max(0, playhead - (clip.start || 0))
  const pose = clipPose(clip, localT)
  const mode = textShapeMode(p0.x, p0.y, clip, render)

  if (clip.kind === 'text') {
    const st = clip.style || {}
    const s0 = { x: pose.x, y: pose.y, w: st.w ?? 0.8, size: st.size ?? 0.07, cx: e.clientX, cy: e.clientY }
    const move = (ev) => {
      const dxN = (ev.clientX - s0.cx) / dispW, dyN = (ev.clientY - s0.cy) / dispH
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

  const st = clip.shape || {}
  const s0 = {
    x: pose.x, y: pose.y, w: st.w ?? 0.38, h: st.h ?? 0.16, scale: pose.scale || 1,
    cx: e.clientX, cy: e.clientY,
  }
  const move = (ev) => {
    const dxN = (ev.clientX - s0.cx) / dispW, dyN = (ev.clientY - s0.cy) / dispH
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
      const p = canvasPointer(ev, canvas)
      const cx = fr.x + pose.x * fr.w
      const cy = fr.y + pose.y * fr.h
      const ang = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90
      changeShape(clip.id, { rotation: +ang.toFixed(1) })
    }
  }
  const up = () => {
    if (alignGuidesRef) alignGuidesRef.current = null
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}

function startFillSourcePan(e, canvas, clip, dest, mode, ctx, frame) {
  const { playhead, mediaEls, upsertKeyframe, commitPose, outW, outH } = ctx
  const fr = frame || { x: 0, y: 0, w: canvas.width, h: canvas.height }
  const el = mediaEls.current.get(clip.id)
  const sz = mediaSize(el)
  if (!sz.w || !outW || !outH) return
  const srcAspect = sz.w / sz.h
  const outAspect = outW / outH
  const localT = Math.max(0, playhead - clip.start)
  const srcT = clamp(timelineToSource(clip, playhead), clip.in_point, clip.out_point)
  const crop = cropWindow(clip, srcAspect, outAspect, srcT, localT)
  const pose0 = clipPose(clip, localT)
  const p0 = canvasPointer(e, canvas)
  const cx0 = dest.dx + dest.dw / 2
  const cy0 = dest.dy + dest.dh / 2
  const dist0 = Math.hypot(p0.x - cx0, p0.y - cy0) || 1
  const ang0 = Math.atan2(p0.y - cy0, p0.x - cx0)
  const z0 = pose0.zoom ?? clip.reframe?.zoom ?? 1

  listenMove((ev) => {
    const p = canvasPointer(ev, canvas)
    if (mode === 'rotate') {
      const ang = Math.atan2(p.y - cy0, p.x - cx0)
      commitPose(clip.id, { rotation: +(((pose0.rotation || 0) + (ang - ang0) * 180 / Math.PI) % 360).toFixed(2) })
      return
    }
    if (mode === 'scale') {
      const dist = Math.hypot(p.x - cx0, p.y - cy0)
      const z = +clamp(z0 / (dist / dist0), 0.1, 1).toFixed(4)
      const c = clampCenter(crop.cx, crop.cy, z, srcAspect, outAspect)
      upsertKeyframe(clip, srcT, c.cx, c.cy, { zoom: z })
      return
    }
    const cx = crop.cx - ((p.x - p0.x) / fr.w) * crop.wf
    const cy = crop.cy - ((p.y - p0.y) / fr.h) * crop.hf
    const c = clampCenter(cx, cy, z0, srcAspect, outAspect)
    upsertKeyframe(clip, srcT, c.cx, c.cy)
  })
}

export function createCanvasDownHandler(ctx) {
  const {
    mainCanvasRef, framingModeRef, playingRef, stopPlayback,
    selectedClip, playhead, mediaEls,
    changeTransform, commitPose, clipsRef,
    cropModeRef, hitListRef, onSelectClip, onClearSelection,
  } = ctx
  const onCropDown = createMainDownHandler(ctx)

  return function onCanvasDown(e) {
    if (e.button != null && e.button !== 0) return
    const canvas = mainCanvasRef.current
    if (!canvas) return

    if (framingModeRef.current || cropModeRef?.current) {
      onCropDown(e)
      return
    }

    // Recuadro Main (área exportable) dentro del workspace; el hit-testing usa dests
    // ya en coordenadas de canvas, pero los arrastres normalizan respecto al frame.
    const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1)
    const p0 = canvasPointer(e, canvas)
    const hits = hitListRef?.current || []
    const selId = selectedClip?.id
    const selectedHit = selId ? hits.find((h) => h.id === selId) : null
    let mode = null
    if (selectedHit) {
      if (selectedHit.kind === 'text' || selectedHit.kind === 'shape') {
        const onHandle = selectedHit.handles && textShapeMode(p0.x, p0.y, { kind: selectedHit.kind }, selectedHit) !== 'move'
        if (onHandle || pointInDest(p0.x, p0.y, selectedHit.dest)) {
          mode = textShapeMode(p0.x, p0.y, { kind: selectedHit.kind }, selectedHit)
        }
      } else {
        mode = hitTransformHandle(p0.x, p0.y, selectedHit.dest)
      }
    }

    let clip = selectedClip
    if (!mode) {
      const hit = hitFrontmost(hits, p0.x, p0.y)
      if (!hit) {
        onClearSelection?.()
        return
      }
      clip = clipsRef.current.find((c) => c.id === hit.id) || null
      if (!clip) return
      if (clip.id !== selId) onSelectClip?.(clip, e)
      mode = (hit.kind === 'text' || hit.kind === 'shape')
        ? textShapeMode(p0.x, p0.y, clip, hit)
        : (hitTransformHandle(p0.x, p0.y, hit.dest) || 'move')
    }
    if (!clip) return

    if (playingRef.current) stopPlayback()

    if (clip.kind === 'text' || clip.kind === 'shape') {
      const hit = hits.find((h) => h.id === clip.id)
      const render = hit?.handles ? hit : (clip.id === selId ? ctx.mainTextBox.current : hit)
      startTextShapeDrag(e, canvas, clip, render, ctx, frame)
      return
    }
    if (!isVisualClip(clip)) return
    const end = clipEnd(clip)
    if (playhead < clip.start - 0.02 || playhead >= end) return

    const hit = hits.find((h) => h.id === clip.id)
    const dest = hit?.dest
    if (!dest) return

    const handle = mode === 'move' || mode === 'scale' || mode === 'rotate' ? mode : 'move'
    if (isOverlay(clip)) {
      const el = mediaEls.current.get(clip.id)
      const sz = mediaSize(el)
      if (!sz.w) return
      startOverlayTransform(e, canvas, clip, dest, handle, {
        changeTransform, playhead,
      }, frame)
      return
    }

    startFillSourcePan(e, canvas, clip, dest, handle, ctx, frame)
  }
}
