// Encuadre (crop sobre la fuente) y transformación del resultado en el canvas
// de salida: dos niveles independientes. El editor de clips (compose/slots)
// no usa este módulo.
import { clamp, clampCenter, frameAt, geomFor } from './panning.js'
import { clipEnd, isVisualClip } from '../features/editor/editorModel.js'
import { clipPose } from './clipAnim.js'
import { keyframesOn } from './clipKeyframes.js'

export const newTransform = () => ({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })

/** Huecos asistidos en el canvas de salida (fracción). x/y = centro; w/h = tamaño. */
export const FRAME_SLOTS = {
  top: { x: 0.5, y: 0.25, w: 1, h: 0.5 },
  bottom: { x: 0.5, y: 0.75, w: 1, h: 0.5 },
  left: { x: 0.25, y: 0.5, w: 0.5, h: 1 },
  right: { x: 0.75, y: 0.5, w: 0.5, h: 1 },
}

export const FRAME_OPTIONS = [
  { id: 'full', label: 'Completo', icon: 'crop_free' },
  { id: 'top', label: 'Mitad superior', icon: 'vertical_align_top' },
  { id: 'bottom', label: 'Mitad inferior', icon: 'vertical_align_bottom' },
  { id: 'left', label: 'Mitad izquierda', icon: 'align_horizontal_left' },
  { id: 'right', label: 'Mitad derecha', icon: 'align_horizontal_right' },
]

export function frameOf(clip) {
  const f = clip?.frame
  return FRAME_SLOTS[f] ? f : 'full'
}

/**
 * Aspecto del slot del clip dentro de la salida. Para `full` = aspecto de salida;
 * para las mitades = (slot.w · outAspect) / slot.h. El recorte (Fijar vídeo) y sus
 * keyframes se hacen respecto a este aspecto.
 */
export function slotAspectOf(clip, outAspect) {
  const slot = FRAME_SLOTS[frameOf(clip)]
  if (!slot) return outAspect
  return (slot.w * outAspect) / slot.h
}

export function isOverlay(clip) {
  return clip?.layout === 'overlay'
}

// Clip "encuadrado" (Fijar vídeo): llena el marco completo (fill) o un slot (overlay en
// mitad sup/inf/izq/der). Se edita con la vista de recorte. Un overlay libre (frame 'free')
// NO está encuadrado (se mueve/escala en el compuesto).
export function isFramed(clip) {
  return isVisualClip(clip) && (!isOverlay(clip) || !!FRAME_SLOTS[clip?.frame])
}

// --- Main / workspace (estilo CapCut) ---
// El canvas del editor conserva el aspecto de salida; el "Main" (área exportada)
// es un recuadro concéntrico dentro del canvas. Lo que queda fuera del recuadro es
// contexto (el clip se ve, atenuado) que NO se exporta. `viewZoom` es solo visual.
export const MAIN_FRAME_FRAC = 0.82

// Rango de posición (centro del clip) en coords normalizadas del cuadro de salida.
// El cuadro naranja es solo el área exportada, NO el límite de movimiento: el clip
// puede salir ~2 anchos/altos hacia cada lado para animar entradas/salidas de escena.
export const CLIP_POS_MIN = -2
export const CLIP_POS_MAX = 3

export function frameRectOf(cw, ch, viewZoom = 1, outAspect) {
  const z = Number(viewZoom)
  const zoom = Number.isFinite(z) && z > 0 ? z : 1
  const frac = MAIN_FRAME_FRAC * zoom
  // El canvas ocupa todo el stage (puede ser más ancho que la salida); el cuadro
  // conserva el aspecto de salida y se ajusta dentro de `frac` del canvas, centrado.
  const a = Number(outAspect) > 0 ? Number(outAspect) : (cw / ch)
  const maxW = cw * frac
  const maxH = ch * frac
  let h = maxH
  let w = h * a
  if (w > maxW) { w = maxW; h = w / a }
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

/** destRectOnCanvas pero mapeando al recuadro Main (offset + tamaño del frame). */
export function destRectOnFrame(transform, cropPx, outW, outH, frame) {
  const d = destRectOnCanvas(transform, cropPx, outW, outH, frame.w, frame.h)
  return { dx: d.dx + frame.x, dy: d.dy + frame.y, dw: d.dw, dh: d.dh, rotation: d.rotation }
}

export function mediaSize(el) {
  if (!el) return { w: 0, h: 0 }
  // videoWidth (<video>), naturalWidth (<img>), width (<canvas>: fotograma de GIF).
  const w = Number(el.videoWidth || el.naturalWidth || el.width || 0) || 0
  const h = Number(el.videoHeight || el.naturalHeight || el.height || 0) || 0
  return { w, h }
}

export function clampCrop(cx, cy, wf, hf) {
  const w = clamp(wf, 0.05, 1)
  const h = clamp(hf, 0.05, 1)
  return {
    cx: w >= 1 ? 0.5 : clamp(cx, w / 2, 1 - w / 2),
    cy: h >= 1 ? 0.5 : clamp(cy, h / 2, 1 - h / 2),
    wf: w,
    hf: h,
  }
}

/** Tamaño de encuadre al arrastrar una esquina, centro fijo, aspecto libre. */
export function cropSizeFromCorner(nx, ny, cx, cy) {
  return {
    wf: clamp(Math.abs(nx - cx) * 2, 0.05, 1),
    hf: clamp(Math.abs(ny - cy) * 2, 0.05, 1),
  }
}

/**
 * Ventana de recorte sobre la fuente (fracciones 0-1).
 * Overlay: crop_w/crop_h propios. Fill: zoom + aspecto de salida (comportamiento actual).
 */
export function cropWindow(clip, srcAspect, outAspect, srcTime, localT) {
  const rf = clip?.reframe
  const posed = keyframesOn(clip)
    ? clipPose(clip, localT ?? 0, srcTime)
    : null
  const fr = posed
    ? { cx: posed.cx, cy: posed.cy, zoom: posed.zoom, fit: 'cover' }
    : frameAt(rf?.keyframes, srcTime, rf?.zoom ?? 1, rf?.pan_mode || 'smooth')
  if (isOverlay(clip) && rf?.crop_w != null && rf?.crop_h != null) {
    const sized = clampCrop(fr.cx, fr.cy, rf.crop_w, rf.crop_h)
    return { cx: sized.cx, cy: sized.cy, wf: sized.wf, hf: sized.hf }
  }
  if (fr.fit === 'contain') return { cx: 0.5, cy: 0.5, wf: 1, hf: 1 }
  const zoom = fr.zoom
  const { widthFrac, heightFrac } = geomFor(zoom, srcAspect, outAspect)
  const p = clampCenter(fr.cx, fr.cy, zoom, srcAspect, outAspect)
  return { cx: p.cx, cy: p.cy, wf: widthFrac, hf: heightFrac }
}

export function sourceCropPx(crop, srcW, srcH) {
  const sw = crop.wf * srcW
  const sh = crop.hf * srcH
  return {
    sx: clamp((crop.cx - crop.wf / 2) * srcW, 0, Math.max(0, srcW - sw)),
    sy: clamp((crop.cy - crop.hf / 2) * srcH, 0, Math.max(0, srcH - sh)),
    sw,
    sh,
  }
}

/** Destino en píxeles de SALIDA. scale 1 = 1 px fuente → 1 px de salida. */
export function destRect(transform, cropPx, outW, outH) {
  const t = { ...newTransform(), ...transform }
  const dw = cropPx.sw * t.scale
  const dh = cropPx.sh * t.scale
  return {
    dx: t.x * outW - dw / 2,
    dy: t.y * outH - dh / 2,
    dw,
    dh,
    rotation: t.rotation || 0,
  }
}

export function destRectOnCanvas(transform, cropPx, outW, outH, canvasW, canvasH) {
  const d = destRect(transform, cropPx, outW, outH)
  const sx = canvasW / outW
  const sy = canvasH / outH
  return {
    dx: d.dx * sx,
    dy: d.dy * sy,
    dw: d.dw * sx,
    dh: d.dh * sy,
    rotation: d.rotation,
  }
}

/** Pasa un clip fill a overlay capturando el encuadre actual (sin deformarlo). */
export function enableOverlay(clip, srcAspect, outAspect, srcTime, srcW, srcH, outW, outH, localT) {
  const crop = cropWindow({ ...clip, layout: 'fill' }, srcAspect, outAspect, srcTime, localT)
  const px = sourceCropPx(crop, srcW, srcH)
  const pipW = 0.44 * outW
  const pipH = 0.38 * outH
  const scale = Math.min(pipW / Math.max(1, px.sw), pipH / Math.max(1, px.sh))
  return {
    layout: 'overlay',
    frame: 'free',
    reframe: {
      ...(clip.reframe || {}),
      crop_w: crop.wf,
      crop_h: crop.hf,
      dual_crop: false,
    },
    transform: { x: 0.5, y: 0.5, scale, rotation: 0 },
  }
}

export function disableOverlay(clip) {
  return { layout: 'fill', frame: 'full', transform: newTransform() }
}

/**
 * Encuadre asistido: Completo (fill) o mitad superior/inferior (overlay que llena el hueco).
 * El recorte de fuente usa el aspecto del hueco; Main sigue editando qué zona se ve.
 */
export function applyFrame(clip, slot, srcAspect, outAspect, srcTime, srcW, srcH, outW, outH, localT) {
  if (slot === 'full' || !FRAME_SLOTS[slot]) {
    return { ...disableOverlay(clip), reframe: { ...(clip.reframe || {}), dual_crop: clip.reframe?.dual_crop } }
  }
  const spec = FRAME_SLOTS[slot]
  const slotAspect = (spec.w * outAspect) / spec.h
  const crop = cropWindow({ ...clip, layout: 'fill' }, srcAspect, slotAspect, srcTime, localT)
  const px = sourceCropPx(crop, srcW, srcH)
  const slotW = spec.w * outW
  const slotH = spec.h * outH
  const scale = Math.min(slotW / Math.max(1, px.sw), slotH / Math.max(1, px.sh))
  return {
    layout: 'overlay',
    frame: slot,
    reframe: {
      ...(clip.reframe || {}),
      crop_w: crop.wf,
      crop_h: crop.hf,
      dual_crop: false,
    },
    transform: { x: spec.x, y: spec.y, scale, rotation: 0 },
  }
}

/** Clips de vídeo visibles en `head`, de fondo a frente (pista, luego orden en la lista). */
export function videosAt(head, clips, tracks) {
  const list = clips || []
  const vids = (tracks || []).filter((t) => t.kind === 'video')
  const layer = (id) => vids.findIndex((t) => t.id === id)
  const index = new Map(list.map((c, i) => [c.id, i]))
  return list
    .filter((c) => {
      if (!isVisualClip(c) && c.kind !== 'shape') return false
      const track = (tracks || []).find((t) => t.id === c.track_id)
      if (!track || track.hidden) return false
      return head >= c.start - 0.02 && head < clipEnd(c)
    })
    .sort((a, b) => {
      const dl = layer(a.track_id) - layer(b.track_id)
      if (dl) return dl
      return (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0)
    })
}

/** Puntero → píxeles del bitmap, respetando object-fit: contain. */
export function canvasPointer(ev, canvas) {
  const rect = canvas.getBoundingClientRect()
  const cw = canvas.width, ch = canvas.height
  const scale = Math.min(rect.width / cw, rect.height / ch)
  const dw = cw * scale, dh = ch * scale
  const ox = rect.left + (rect.width - dw) / 2
  const oy = rect.top + (rect.height - dh) / 2
  return {
    x: (ev.clientX - ox) / scale,
    y: (ev.clientY - oy) / scale,
    scale,
    rect,
  }
}

export function hitTransformHandle(px, py, dest, pad = 12) {
  const { dx, dy, dw, dh } = dest
  const near = (hx, hy) => (px - hx) ** 2 + (py - hy) ** 2 <= pad * pad
  const corners = [
    [dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh],
  ]
  if (corners.some(([x, y]) => near(x, y))) return 'scale'
  const rx = dx + dw / 2
  const ry = dy - 22
  if (near(rx, ry)) return 'rotate'
  if (px >= dx && px <= dx + dw && py >= dy && py <= dy + dh) return 'move'
  return null
}
