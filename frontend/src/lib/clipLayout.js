// Encuadre (crop sobre la fuente) y transformación del resultado en el canvas
// de salida: dos niveles independientes. El editor de clips (compose/slots)
// no usa este módulo.
import { clamp, clampCenter, frameAt, geomFor } from './panning.js'

export const newTransform = () => ({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })

/** Huecos asistidos en el canvas de salida (fracción). Cuarteto más adelante. */
export const FRAME_SLOTS = {
  top: { x: 0.5, y: 0.25, w: 1, h: 0.5 },
  bottom: { x: 0.5, y: 0.75, w: 1, h: 0.5 },
}

export const FRAME_OPTIONS = [
  { id: 'full', label: 'Completo' },
  { id: 'top', label: 'Mitad superior' },
  { id: 'bottom', label: 'Mitad inferior' },
]

export function frameOf(clip) {
  if (clip?.frame === 'top' || clip?.frame === 'bottom') return clip.frame
  return 'full'
}

export function isOverlay(clip) {
  return clip?.layout === 'overlay'
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
export function cropWindow(clip, srcAspect, outAspect, srcTime) {
  const rf = clip?.reframe
  const fr = frameAt(rf?.keyframes, srcTime, rf?.zoom ?? 1, rf?.pan_mode || 'smooth')
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
export function enableOverlay(clip, srcAspect, outAspect, srcTime, srcW, srcH, outW, outH) {
  const crop = cropWindow({ ...clip, layout: 'fill' }, srcAspect, outAspect, srcTime)
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
export function applyFrame(clip, slot, srcAspect, outAspect, srcTime, srcW, srcH, outW, outH) {
  if (slot === 'full' || !FRAME_SLOTS[slot]) {
    return { ...disableOverlay(clip), reframe: { ...(clip.reframe || {}), dual_crop: clip.reframe?.dual_crop } }
  }
  const spec = FRAME_SLOTS[slot]
  const slotAspect = (spec.w * outAspect) / spec.h
  const crop = cropWindow({ ...clip, layout: 'fill' }, srcAspect, slotAspect, srcTime)
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

/** Clips de vídeo visibles en `head`, de fondo a frente. */
export function videosAt(head, clips, tracks) {
  const vids = (tracks || []).filter((t) => t.kind === 'video')
  const layer = (id) => vids.findIndex((t) => t.id === id)
  return (clips || [])
    .filter((c) => {
      if (c.kind !== 'video') return false
      const track = (tracks || []).find((t) => t.id === c.track_id)
      if (!track || track.hidden) return false
      const end = c.start + Math.max(0, c.out_point - c.in_point)
      return head >= c.start - 0.02 && head < end
    })
    .sort((a, b) => layer(a.track_id) - layer(b.track_id))
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
