// Puntero del canvas: compuesto (mover/escalar/rotar/seleccionar) o recorte de fuente.
import { clamp, clampCenter } from '../../lib/panning'
import {
  canvasPointer, CLIP_POS_MAX, CLIP_POS_MIN, cropWindow, frameRectOf,
  hitTransformHandle, isOverlay, mediaSize,
} from '../../lib/clipLayout'
import { canvasToSourceNorm, framingRect, hitFrontmost, pointInDest } from './render/canvas'
import { snapAlign, textAlignTargets } from '../../lib/alignGuides'
import { clipEnd, isVisualClip, timelineToSource } from './editorModel'
import { clipMasksAt, clipPose, posedTransform } from '../../lib/clipAnim'
import { clipBg, isInteractiveProvider } from '../../lib/clipBg'
import { MASK_FEATHER_MAX, maskHandleBox, maskHitMode, toMaskLocal } from '../../lib/clipMask'
import {
  hitPathAnchor, hitPathSegment, normalizeShape, pathAnchorPoints, pathAnchors, pathLocalPoint,
} from '../../lib/shapes'

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

function listenMove(move, onUp) {
  // pointercancel (el sistema se queda el puntero: gesto táctil, pérdida de foco)
  // también termina el arrastre; si no, el trazo quedaría "en curso" para siempre.
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    onUp?.()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

// --- Máscara: arrastrar / redimensionar / girar / pluma sobre el preview ----
// La geometría es animable, así que se escribe con `commitMask` (mismo camino
// que la pose: valor estático + keyframe en el cabezal si los hay activos).
function startMaskDrag(e, canvas, clip, mask, mode, ctx, frame) {
  const { commitMask, playingRef, stopPlayback } = ctx
  if (playingRef?.current) stopPlayback?.()
  const g = maskHandleBox(mask, frame)
  const p0 = canvasPointer(e, canvas)
  const ang0 = Math.atan2(p0.y - g.cy, p0.x - g.cx)
  const l0 = toMaskLocal(p0.x, p0.y, mask, frame)
  const s0 = {
    x: mask.x, y: mask.y, sx: mask.scale_x || 1, sy: mask.scale_y || 1,
    rot: mask.rotation || 0, feather: mask.feather || 0,
  }
  listenMove((ev) => {
    const p = canvasPointer(ev, canvas)
    if (mode === 'move') {
      commitMask?.(clip.id, {
        mx: +clamp(s0.x + (p.x - p0.x) / frame.w, -1, 2).toFixed(4),
        my: +clamp(s0.y + (p.y - p0.y) / frame.h, -1, 2).toFixed(4),
      })
      return
    }
    if (mode === 'rotate') {
      const ang = Math.atan2(p.y - g.cy, p.x - g.cx)
      commitMask?.(clip.id, { mrot: +((s0.rot + (ang - ang0) * 180 / Math.PI) % 360).toFixed(2) })
      return
    }
    const l = toMaskLocal(p.x, p.y, mask, frame)
    if (mode === 'feather') {
      commitMask?.(clip.id, {
        mfeather: +clamp(s0.feather + (l0.x - l.x), 0, MASK_FEATHER_MAX).toFixed(4),
      })
      return
    }
    const patch = {}
    if (mode === 'width' || mode === 'corner') patch.mw = +clamp(Math.abs(l.x) * 2 / s0.sx, 0.01, 8).toFixed(4)
    if (mode === 'height' || mode === 'corner') patch.mh = +clamp(Math.abs(l.y) * 2 / s0.sy, 0.01, 8).toFixed(4)
    if (Object.keys(patch).length) commitMask?.(clip.id, patch)
  })
}

// Pincel: los puntos se guardan en el espacio LOCAL de la máscara (unidades de
// alto), así que mover/rotar/escalar la máscara arrastra el trazo con ella.
function startMaskBrush(e, canvas, clip, mask, ctx, frame) {
  const { changeMask, playingRef, stopPlayback } = ctx
  if (playingRef?.current) stopPlayback?.()
  const pts = [...(mask.brush?.points || [])]
  const sx = mask.scale_x || 1
  const sy = mask.scale_y || 1
  const add = (ev, first) => {
    const p = canvasPointer(ev, canvas)
    const l = toMaskLocal(p.x, p.y, mask, frame)
    const pt = { x: +(l.x / sx).toFixed(4), y: +(l.y / sy).toFixed(4) }
    const last = pts[pts.length - 1]
    if (first) pt.m = 1
    else if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.004) return
    pts.push(pt)
    changeMask?.(clip.id, { brush: { ...(mask.brush || {}), points: [...pts] } })
  }
  add(e, true)
  listenMove((ev) => add(ev, false))
}

// --- Eliminar fondo: pincel de corrección de la máscara de IA ---------------
// Los puntos se guardan en el espacio NORMALIZADO DE LA FUENTE (0-1 del material),
// no del lienzo: así el trazo sigue pegado al sujeto aunque después se recorte,
// se mueva, se escale o se anime el clip. `canvasToSourceNorm` es la inversa
// exacta de lo que dibuja el compuesto.
function startBgBrush(e, canvas, clip, ctx, frame) {
  const { addBgStroke, extendBgStroke, playingRef, stopPlayback, bgBrushRef } = ctx
  if (playingRef?.current) stopPlayback?.()
  const head = ctx.playheadRef?.current ?? ctx.playhead ?? 0
  const brush = bgBrushRef?.current || {}
  const op = brush.op === 'keep' ? 'keep' : 'erase'
  const size = brush.size || 0.08
  // Eliminación personalizada (SAM): la marca recuerda en qué fotograma de la
  // fuente se hizo y con qué herramienta; desde ahí se sigue al objeto.
  const sam = isInteractiveProvider(clipBg(clip)?.auto?.provider)
  const mark = sam
    ? {
        t: +clamp(timelineToSource(clip, head), clip.in_point || 0, clip.out_point || 0).toFixed(3),
        tool: brush.tool === 'manual' ? 'manual' : 'smart',
      }
    : {}
  let last = null

  const at = (ev) => {
    const p = canvasPointer(ev, canvas)
    return canvasToSourceNorm(clip, p.x, p.y, frame, ctx, head)
  }
  const first = at(e)
  if (!first) return false
  // Un trazo = una entrada de `edits`. Al soltar queda un único estado en el
  // historial (el snapshot del editor colapsa los cambios del arrastre).
  addBgStroke?.(clip.id, { op, size, ...mark, points: [{ x: +first.x.toFixed(4), y: +first.y.toFixed(4), m: 1 }] })
  last = first
  // Trazo en curso: la selección inteligente se pide al SOLTAR (como CapCut).
  ctx.onBgStroke?.(true)
  listenMove((ev) => {
    const q = at(ev)
    if (!q) return
    if (last && Math.hypot(q.x - last.x, q.y - last.y) < 0.003) return
    last = q
    extendBgStroke?.(clip.id, { x: +q.x.toFixed(4), y: +q.y.toFixed(4) })
  }, () => ctx.onBgStroke?.(false))
  return true
}

// --- Pluma (#14): cada clic añade un ancla del trazado nuevo -------------------
// Doble clic (o Enter) termina; pulsar el primer punto (con 3 o más) lo cierra.
// Doble clic por tiempo y distancia: `detail` no cuenta clics en todos los
// navegadores para los eventos de puntero.
let penLastDown = null

function handlePenPointer(e, canvas, ctx) {
  const pen = ctx.penRef?.current
  if (!pen) return false
  if (ctx.playingRef?.current) ctx.stopPlayback?.()
  const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1, ctx.outAspect)
  const p = canvasPointer(e, canvas)
  const now = performance.now()
  const last = (pen.points || []).length ? penLastDown : null
  penLastDown = { t: now, x: p.x, y: p.y }
  if (last && now - last.t < 350 && Math.hypot(p.x - last.x, p.y - last.y) < 8) {
    penLastDown = null
    ctx.finishPen?.()
    return true
  }
  const pts = pen.points || []
  if (pts.length >= 3) {
    const [fx, fy] = pts[0]
    if (Math.hypot(p.x - (frame.x + fx * frame.w), p.y - (frame.y + fy * frame.h)) < 10) {
      ctx.finishPen?.({ closed: true })
      return true
    }
  }
  ctx.addPenPoint?.([+((p.x - frame.x) / frame.w).toFixed(4), +((p.y - frame.y) / frame.h).toFixed(4)])
  return true
}

// --- Editar puntos de un trazado: arrastrar un ancla, clic en la línea inserta
// una, Alt+clic en un ancla la borra. Al soltar, la caja se reajusta a las anclas.
function handlePathEditPointer(e, canvas, ctx) {
  if (!ctx.pathEditRef?.current) return false
  const sel = (ctx.clipsRef?.current || []).find((c) => c.id === ctx.selectedClip?.id)
  if (sel?.kind !== 'shape' || sel.shape?.type !== 'path') return false
  const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1, ctx.outAspect)
  const localT = Math.max(0, (ctx.playheadRef?.current ?? 0) - (sel.start || 0))
  const p0 = canvasPointer(e, canvas)
  const anchors = pathAnchorPoints(sel, frame, localT)
  const pts = pathAnchors(normalizeShape(sel.shape).points)
  let i = hitPathAnchor(anchors, p0.x, p0.y)
  if (i >= 0 && e.altKey) {
    if (pts.length > 2) ctx.setPathShape?.(sel.id, { points: pts.filter((_, j) => j !== i) }, true)
    return true
  }
  if (i < 0) {
    const seg = hitPathSegment(anchors, p0.x, p0.y, !!sel.shape.closed)
    if (seg < 0) return false   // fuera del trazado: mover / seleccionar como siempre
    pts.splice(seg + 1, 0, pathLocalPoint(sel, frame, localT, p0.x, p0.y))
    i = seg + 1
    ctx.setPathShape?.(sel.id, { points: pts.map((q) => [...q]) }, false)
  }
  if (ctx.playingRef?.current) ctx.stopPlayback?.()
  const cur = pts.map((q) => [...q])
  listenMove((ev) => {
    const p = canvasPointer(ev, canvas)
    cur[i] = pathLocalPoint(sel, frame, localT, p.x, p.y)
    ctx.setPathShape?.(sel.id, { points: cur.map((q) => [...q]) }, false)
  }, () => ctx.setPathShape?.(sel.id, { points: cur }, true))
  return true
}

// --- Seguimiento (#15): recuadro sobre el objeto a seguir ------------------------
// Se arrastra sobre el compuesto; al soltar, sus esquinas pasan al espacio de la
// FUENTE del vídeo (la inversa exacta del dibujo) y su caja es lo que se sigue.
function handleTrackBoxPointer(e, canvas, ctx) {
  const pick = ctx.trackPickRef?.current
  if (!pick) return false
  const video = (ctx.clipsRef?.current || []).find((c) => c.id === pick.videoId)
  if (!video) return false
  const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1, ctx.outAspect)
  const head = ctx.playheadRef?.current ?? 0
  const p0 = canvasPointer(e, canvas)
  const box = { x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y }
  ctx.trackBoxRef.current = box
  listenMove((ev) => {
    const p = canvasPointer(ev, canvas)
    box.x1 = p.x
    box.y1 = p.y
  }, () => {
    ctx.trackBoxRef.current = null
    if (Math.abs(box.x1 - box.x0) < 8 || Math.abs(box.y1 - box.y0) < 8) return
    const corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]]
      .map(([x, y]) => canvasToSourceNorm(video, x, y, frame, ctx, head))
      .filter(Boolean)
    if (corners.length < 2) return
    const xs = corners.map((q) => Math.min(1, Math.max(0, q.x)))
    const ys = corners.map((q) => Math.min(1, Math.max(0, q.y)))
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return
    ctx.onTrackBox?.({
      cx: +((x0 + x1) / 2).toFixed(5), cy: +((y0 + y1) / 2).toFixed(5),
      w: +(x1 - x0).toFixed(5), h: +(y1 - y0).toFixed(5),
    })
  })
  return true
}

/** Pincel de Eliminar fondo: consume el arrastre si está activo. */
function handleBgPointer(e, canvas, ctx) {
  if (!ctx.bgBrushRef?.current?.on) return false
  const sel = (ctx.clipsRef?.current || []).find((c) => c.id === ctx.selectedClip?.id) || ctx.selectedClip
  if (!sel) return false
  const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1, ctx.outAspect)
  return startBgBrush(e, canvas, sel, ctx, frame)
}

/** Máscara bajo el puntero: devuelve true si el arrastre lo consume la máscara. */
function handleMaskPointer(e, canvas, ctx) {
  if (!ctx.maskModeRef?.current) return false
  const sel = (ctx.clipsRef?.current || []).find((c) => c.id === ctx.selectedClip?.id) || ctx.selectedClip
  if (!sel) return false
  const head = ctx.playheadRef?.current ?? ctx.playhead ?? 0
  const mask = clipMasksAt(sel, Math.max(0, head - (sel.start || 0)), { includeAdjust: true })[0]
  if (!mask) return false
  const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1, ctx.outAspect)
  if (ctx.maskDrawRef?.current && mask.type === 'brush') {
    startMaskBrush(e, canvas, sel, mask, ctx, frame)
    return true
  }
  const p0 = canvasPointer(e, canvas)
  const mode = maskHitMode(p0.x, p0.y, mask, frame)
  if (!mode) return false
  startMaskDrag(e, canvas, sel, mask, mode, ctx, frame)
  return true
}

// Encuadre de texto (framingMode): mover/redimensionar el recuadro amarillo.
// El recorte de la fuente ya no se edita en el lienzo, sino en EdCropModal.
export function createFramingDownHandler(ctx) {
  const {
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    outAspect, clipsRef, tracksRef, playheadRef, alignGuidesRef, viewZoomRef,
  } = ctx

  return function onFramingDown(e) {
    const canvas = mainCanvasRef.current
    if (!canvas) return
    const ptr0 = canvasPointer(e, canvas)

    const fm = framingModeRef.current
    if (!fm) return
    if (playingRef.current) stopPlayback()
    // El encuadre de texto se dibuja dentro del recuadro Main (workspace).
    const frame = frameRectOf(canvas.width, canvas.height, viewZoomRef?.current ?? 1, outAspect)
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
      // La caja en pantalla mide w · escala: el tirador sigue al ratón.
      else if (mode === 'width-r') changeStyle(clip.id, { w: +clamp(s0.w + dxN * 2 / (pose.scale || 1), 0.1, 1).toFixed(4) })
      else if (mode === 'width-l') changeStyle(clip.id, { w: +clamp(s0.w - dxN * 2 / (pose.scale || 1), 0.1, 1).toFixed(4) })
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
    changeTransform, clipsRef,
    hitListRef, onSelectClip, onClearSelection,
  } = ctx
  const onFramingDown = createFramingDownHandler(ctx)

  return function onCanvasDown(e) {
    if (e.button != null && e.button !== 0) return
    const canvas = mainCanvasRef.current
    if (!canvas) return

    // Prioridad del puntero: encuadre de texto > máscara > compuesto.
    if (framingModeRef.current) {
      onFramingDown(e)
      return
    }
    // Seguimiento (#15): marcando el objeto, cada arrastre es su recuadro.
    if (handleTrackBoxPointer(e, canvas, ctx)) return
    // La pluma (#14) manda mientras está activa: cada clic es un ancla.
    if (handlePenPointer(e, canvas, ctx)) return
    // Editando los puntos de un trazado: las anclas y su línea van primero.
    if (handlePathEditPointer(e, canvas, ctx)) return
    // El pincel de Eliminar fondo manda sobre todo lo demás mientras está
    // activo: cada arrastre es un trazo, no una selección ni un movimiento.
    if (handleBgPointer(e, canvas, ctx)) return
    // Con su panel abierto la máscara manda: se edita sobre el compuesto, por
    // delante del recorte y del transform del clip.
    if (handleMaskPointer(e, canvas, ctx)) return
    // Recuadro Main (área exportable) dentro del workspace; el hit-testing usa dests
    // ya en coordenadas de canvas, pero los arrastres normalizan respecto al frame.
    const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1, ctx.outAspect)
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
