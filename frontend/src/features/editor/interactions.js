// Puntero del canvas: compuesto (mover/escalar/rotar/seleccionar) o recorte de fuente.
import { clamp, clampCenter } from '../../lib/panning'
import {
  canvasPointer, CLIP_POS_MAX, CLIP_POS_MIN, cropWindow, frameRectOf, TEXT_SCALE_MAX,
  hitTransformHandle, isOverlay, mediaSize,
} from '../../lib/clipLayout'
import { boxToDest, canvasToSourceNorm, framingRect, hitFrontmost, pointInDest } from './render/canvas'
import { ROTATE_CURSOR, frameHandles, frameOfDest, handleAt, handleCursor } from '../../lib/selectionFrame'
import { canvasAlignTargets, halfOnFrame, snapAlign, snapMove, textAlignTargets } from '../../lib/alignGuides'
import { clipEnd, isVisualClip, timelineToSource } from './editorModel'
import { clipMasksAt, clipPose, posedTransform } from '../../lib/clipAnim'
import { clipBg, isInteractiveProvider } from '../../lib/clipBg'
import { MASK_FEATHER_MAX, maskHandleBox, maskHitMode, toMaskLocal } from '../../lib/clipMask'
import {
  hitPathAnchor, hitPathSegment, normalizeShape, pathAnchorPoints, pathAnchors, pathLocalPoint,
} from '../../lib/shapes'

const TEXT_HANDLES = { del: 'delete', rot: 'rotate', tr: 'scale', bl: 'scale', br: 'scale', l: 'width-l', r: 'width-r' }
const SHAPE_HANDLES = {
  rot: 'rotate', tl: 'corner', tr: 'corner', bl: 'corner', br: 'corner',
  l: 'width-l', r: 'width-r', t: 'height-t', b: 'height',
}

// Tirador del recuadro de CapCut bajo el puntero → modo de arrastre ('move' si ninguno).
function textShapeMode(px, py, clip, render) {
  const map = clip.kind === 'text' ? TEXT_HANDLES : clip.kind === 'shape' ? SHAPE_HANDLES : null
  if (!map) return 'move'
  const k = handleAt(px, py, render?.handles, Object.keys(map))
  return k ? map[k] : 'move'
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

// Máscara editable del clip seleccionado (con su panel abierto), o null.
function activeMask(ctx) {
  if (!ctx.maskModeRef?.current) return null
  const sel = (ctx.clipsRef?.current || []).find((c) => c.id === ctx.selectedClip?.id) || ctx.selectedClip
  if (!sel) return null
  const head = ctx.playheadRef?.current ?? ctx.playhead ?? 0
  const mask = clipMasksAt(sel, Math.max(0, head - (sel.start || 0)), { includeAdjust: true })[0]
  return mask ? { sel, mask } : null
}

/** Máscara bajo el puntero: devuelve true si el arrastre lo consume la máscara. */
function handleMaskPointer(e, canvas, ctx) {
  const active = activeMask(ctx)
  if (!active) return false
  const { sel, mask } = active
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

function startOverlayTransform(e, canvas, clip, dest, mode, { changeTransform, playhead, alignGuidesRef }, frame) {
  const fr = frame || { x: 0, y: 0, w: canvas.width, h: canvas.height }
  const localT = Math.max(0, playhead - clip.start)
  const t0 = posedTransform(clip, localT)
  const p0 = canvasPointer(e, canvas)
  const cx0 = dest.dx + dest.dw / 2
  const cy0 = dest.dy + dest.dh / 2
  const dist0 = Math.hypot(p0.x - cx0, p0.y - cy0) || 1
  const ang0 = Math.atan2(p0.y - cy0, p0.x - cx0)
  const half = halfOnFrame(dest, fr)

  listenMove((ev) => {
    const p = canvasPointer(ev, canvas)
    if (mode === 'move') {
      const dxN = (p.x - p0.x) / fr.w
      const dyN = (p.y - p0.y) / fr.h
      // Imán al centro y a los bordes del cuadro (el borde tocado brilla).
      const snapped = snapMove(
        clamp(t0.x + dxN, CLIP_POS_MIN, CLIP_POS_MAX),
        clamp(t0.y + dyN, CLIP_POS_MIN, CLIP_POS_MAX),
        canvasAlignTargets([]), half,
      )
      if (alignGuidesRef) alignGuidesRef.current = snapped.guides
      changeTransform(clip.id, { x: +snapped.x.toFixed(4), y: +snapped.y.toFixed(4) })
    } else if (mode === 'scale') {
      const dist = Math.hypot(p.x - cx0, p.y - cy0)
      changeTransform(clip.id, { scale: +clamp(t0.scale * (dist / dist0), 0.05, 8).toFixed(4) })
    } else if (mode === 'rotate') {
      const ang = Math.atan2(p.y - cy0, p.x - cx0)
      changeTransform(clip.id, { rotation: +((t0.rotation + (ang - ang0) * 180 / Math.PI) % 360).toFixed(2) })
    }
  }, () => { if (alignGuidesRef) alignGuidesRef.current = null })
}

function startTextShapeDrag(e, canvas, clip, render, ctx, frame) {
  const {
    playingRef, stopPlayback, changeStyle, changeShape, commitPose, deleteClip,
    clipsRef, tracksRef, playheadRef, alignGuidesRef, playhead,
  } = ctx
  const p0 = canvasPointer(e, canvas)
  const fr = frame || { x: 0, y: 0, w: canvas.width, h: canvas.height }
  const dispW = fr.w * p0.scale, dispH = fr.h * p0.scale
  if (playingRef.current) stopPlayback()
  const localT = Math.max(0, playhead - (clip.start || 0))
  const pose = clipPose(clip, localT)
  const mode = textShapeMode(p0.x, p0.y, clip, render)
  if (mode === 'delete') { deleteClip?.(clip.id); return }
  // Sin tope en el cuadro (como CapCut): se puede sacar del todo para animar su
  // entrada. El imán pega sus lados a los bordes del cuadro (que brillan).
  const half = halfOnFrame(render?.dest || render?.box, fr)
  const moveTo = (dxN, dyN) => snapMove(
    clamp(pose.x + dxN, CLIP_POS_MIN, CLIP_POS_MAX),
    clamp(pose.y + dyN, CLIP_POS_MIN, CLIP_POS_MAX),
    textAlignTargets(clipsRef?.current, tracksRef?.current, playheadRef?.current ?? playhead, clip.id), half,
  )
  // Centro y giro del recuadro (px del canvas): escalar, girar y los laterales
  // trabajan en sus ejes, también con el elemento girado.
  const dest = render?.dest || boxToDest(render?.box, render?.box?.rotation || 0)
  const f = dest ? frameOfDest(dest) : { cx: fr.x + pose.x * fr.w, cy: fr.y + pose.y * fr.h, rotation: pose.rotation || 0 }
  const rad = -(f.rotation || 0) * Math.PI / 180
  const local = (ev) => {
    const p = canvasPointer(ev, canvas)
    const x = p.x - f.cx, y = p.y - f.cy
    return { x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad), p }
  }
  const l0 = local(e)
  const dist0 = Math.hypot(l0.x, l0.y) || 1
  const ang0 = Math.atan2(p0.y - f.cy, p0.x - f.cx)
  const rot0 = pose.rotation || 0
  const angleAt = (p) => +(((rot0 + (Math.atan2(p.y - f.cy, p.x - f.cx) - ang0) * 180 / Math.PI) % 360)).toFixed(1)
  const sc0 = pose.scale || 1

  let move
  if (clip.kind === 'text') {
    // Ancho de partida = el recuadro que se ve (ceñido al texto), no la caja guardada.
    const w0 = dest ? dest.dw / fr.w / sc0 : (clip.style?.w ?? 0.8)
    move = (ev) => {
      if (mode === 'move') {
        const snapped = moveTo((ev.clientX - e.clientX) / dispW, (ev.clientY - e.clientY) / dispH)
        if (alignGuidesRef) alignGuidesRef.current = snapped.guides
        changeStyle(clip.id, { x: +snapped.x.toFixed(4), y: +snapped.y.toFixed(4) })
        return
      }
      const l = local(ev)
      // Esquinas = Escala de Transformación (como CapCut), no el tamaño de fuente.
      if (mode === 'scale') commitPose?.(clip.id, { scale: +clamp(sc0 * Math.hypot(l.x, l.y) / dist0, 0.05, TEXT_SCALE_MAX).toFixed(4) })
      else if (mode === 'rotate') commitPose?.(clip.id, { rotation: angleAt(l.p) })
      // La caja en pantalla mide w · escala: el tirador sigue al ratón.
      else if (mode === 'width-r') changeStyle(clip.id, { w: +clamp(w0 + (l.x - l0.x) * 2 / fr.w / sc0, 0.1, 1).toFixed(4) })
      else if (mode === 'width-l') changeStyle(clip.id, { w: +clamp(w0 - (l.x - l0.x) * 2 / fr.w / sc0, 0.1, 1).toFixed(4) })
    }
  } else {
    const st = clip.shape || {}
    const s0 = { w: st.w ?? 0.38, h: st.h ?? 0.16 }
    move = (ev) => {
      if (mode === 'move') {
        const snapped = moveTo((ev.clientX - e.clientX) / dispW, (ev.clientY - e.clientY) / dispH)
        if (alignGuidesRef) alignGuidesRef.current = snapped.guides
        changeShape(clip.id, { x: +snapped.x.toFixed(4), y: +snapped.y.toFixed(4) })
        return
      }
      const l = local(ev)
      const dw = (l.x - l0.x) * 2 / fr.w / sc0
      const dh = (l.y - l0.y) * 2 / fr.h / sc0
      if (mode === 'width-r') changeShape(clip.id, { w: +clamp(s0.w + dw, 0.04, 1).toFixed(4) })
      else if (mode === 'width-l') changeShape(clip.id, { w: +clamp(s0.w - dw, 0.04, 1).toFixed(4) })
      else if (mode === 'height') changeShape(clip.id, { h: +clamp(s0.h + dh, 0.03, 1).toFixed(4) })
      else if (mode === 'height-t') changeShape(clip.id, { h: +clamp(s0.h - dh, 0.03, 1).toFixed(4) })
      // Cualquier esquina: la esquina sigue al ratón y el centro no se mueve.
      else if (mode === 'corner') {
        changeShape(clip.id, {
          w: +clamp(Math.abs(l.x) * 2 / fr.w / sc0, 0.04, 1).toFixed(4),
          h: +clamp(Math.abs(l.y) * 2 / fr.h / sc0, 0.03, 1).toFixed(4),
        })
      } else if (mode === 'rotate') changeShape(clip.id, { rotation: angleAt(l.p) })
    }
  }
  listenMove(move, () => { if (alignGuidesRef) alignGuidesRef.current = null })
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

// --- Cursor como CapCut: flechas de redimensionar en los tiradores (giradas con
// el elemento), el de girar en su botón y «mover» solo sobre algo que se movería
// al arrastrar. Es el espejo de lo que haría pulsar ahí (onCanvasDown).
const VIDEO_HANDLE_KEYS = ['rot', 'tl', 'tr', 'bl', 'br']
const MASK_HANDLE_OF = { corner: 'br', width: 'r', height: 'b', feather: 'l' }

function selectedHandleCursor(px, py, hit) {
  const map = hit.kind === 'text' ? TEXT_HANDLES : hit.kind === 'shape' ? SHAPE_HANDLES : null
  const handles = map ? hit.handles : hit.dest && frameHandles(frameOfDest(hit.dest))
  const k = handleAt(px, py, handles, map ? Object.keys(map) : VIDEO_HANDLE_KEYS)
  return k ? handleCursor(k, hit.dest?.rotation) : null
}

function maskCursor(px, py, canvas, ctx) {
  const active = activeMask(ctx)
  if (!active) return null
  const { mask } = active
  if (ctx.maskDrawRef?.current && mask.type === 'brush') return 'crosshair'
  const frame = frameRectOf(canvas.width, canvas.height, ctx.viewZoomRef?.current ?? 1, ctx.outAspect)
  const mode = maskHitMode(px, py, mask, frame)
  if (mode === 'move') return 'move'
  if (mode === 'rotate') return ROTATE_CURSOR
  return mode ? handleCursor(MASK_HANDLE_OF[mode], maskHandleBox(mask, frame).rot * 180 / Math.PI) : null
}

/** Cursor del lienzo en el punto del evento. */
export function canvasCursorAt(e, ctx) {
  const canvas = ctx.mainCanvasRef.current
  if (!canvas) return ''
  const p = canvasPointer(e, canvas)
  const onMask = maskCursor(p.x, p.y, canvas, ctx)
  if (onMask) return onMask
  const hits = ctx.hitListRef?.current || []
  const selId = ctx.selectedClip?.id
  const sel = selId ? hits.find((h) => h.id === selId) : null
  const onHandle = sel && selectedHandleCursor(p.x, p.y, sel)
  if (onHandle) return onHandle
  return hitFrontmost(hits, p.x, p.y) ? 'move' : 'default'
}

/**
 * Pasar el ratón por el lienzo: pone el cursor en el <canvas>. Mientras se
 * arrastra se queda el del principio; con la pluma, el pincel, el cuentagotas, el
 * seguimiento o el encuadre de texto manda la cruz del escenario.
 */
export function createCanvasHoverHandler(ctx) {
  return function onCanvasHover(e) {
    const canvas = ctx.mainCanvasRef.current
    if (!canvas || e.buttons) return
    const crosshair = ctx.framingModeRef?.current || ctx.penRef?.current || ctx.trackPickRef?.current
      || ctx.bgBrushRef?.current?.on || ctx.chromaPickRef?.current
    const cursor = crosshair ? '' : canvasCursorAt(e, ctx)
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor
  }
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
      // Sin seleccionar no se ven tiradores: pulsar en cualquier punto lo mueve.
      mode = 'move'
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
        changeTransform, playhead, alignGuidesRef: ctx.alignGuidesRef,
      }, frame)
      return
    }

    startFillSourcePan(e, canvas, clip, dest, handle, ctx, frame)
  }
}
