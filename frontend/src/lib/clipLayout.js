// Encuadre (crop sobre la fuente) y transformación del resultado en el canvas
// de salida: dos niveles independientes. El editor de clips (compose/slots)
// no usa este módulo.
import { clamp, clampCenter, frameAt, geomFor } from './panning.js'
import { clipEnd, isVisualClip, timelineToSource } from '../features/editor/editorModel.js'
import { clipPose, posedTransform } from './clipAnim.js'
import { keyframesOn } from './clipKeyframes.js'

export const newTransform = () => ({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })

// Huecos asistidos en el canvas de salida (fracción). x/y = centro; w/h = tamaño.
// LEGADO: el editor ya no coloca clips en huecos (todo clip visual es un objeto
// libre); se conserva para leer el `frame` de timelines antiguas hasta que el
// editor las convierte.
export const FRAME_SLOTS = {
  top: { x: 0.5, y: 0.25, w: 1, h: 0.5 },
  bottom: { x: 0.5, y: 0.75, w: 1, h: 0.5 },
  left: { x: 0.25, y: 0.5, w: 0.5, h: 1 },
  right: { x: 0.75, y: 0.5, w: 0.5, h: 1 },
}

export function frameOf(clip) {
  const f = clip?.frame
  return FRAME_SLOTS[f] ? f : 'full'
}

/**
 * Aspecto del slot del clip dentro de la salida. Para `full` = aspecto de salida;
 * para las mitades = (slot.w · outAspect) / slot.h. El recorte y sus keyframes se
 * hacen respecto a este aspecto.
 */
export function slotAspectOf(clip, outAspect) {
  const slot = FRAME_SLOTS[frameOf(clip)]
  if (!slot) return outAspect
  return (slot.w * outAspect) / slot.h
}

export function isOverlay(clip) {
  return clip?.layout === 'overlay'
}

// --- Main / workspace (estilo CapCut) ---
// El canvas del editor conserva el aspecto de salida; el "Main" (área exportada)
// es un recuadro concéntrico dentro del canvas. Lo que queda fuera del recuadro es
// contexto (el clip se ve, atenuado) que NO se exporta. `viewZoom` es solo visual.
// A zoom 1 el recuadro llena la dimensión limitante del stage (toda la altura en un
// stage apaisado): sin banda atenuada arriba/abajo por defecto. El desborde lateral
// (p. ej. 16:9 dentro de 9:16) sigue viéndose como contexto; con zoom se puede
// alejar para ver también el desborde vertical.
export const MAIN_FRAME_FRAC = 1

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

/**
 * Traduce un recorte en píxeles del MATERIAL a píxeles del lienzo que se va a
 * dibujar. La fuente de dibujo puede no ser el material: el recorte de Eliminar
 * fondo conserva su aspecto pero topa la resolución, y ahí los píxeles no son los
 * mismos. La geometría (recorte, escala, posición) se calcula SIEMPRE con las
 * dimensiones del material; esto solo reubica el rectángulo de origen. Sin esto,
 * activar Eliminar fondo encogía el clip en el preview, porque la escala de un
 * objeto libre es "1 px de fuente → 1 px de salida".
 */
export function srcRectOn(drawEl, media, px) {
  const a = mediaSize(media)
  const b = mediaSize(drawEl)
  if (!a.w || !a.h || !b.w || !b.h || (a.w === b.w && a.h === b.h)) return px
  const kx = b.w / a.w
  const ky = b.h / a.h
  return { sx: px.sx * kx, sy: px.sy * ky, sw: px.sw * kx, sh: px.sh * ky }
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

// --- Tiradores del recuadro de recorte (estilo recortador con bordes anclados) --
// 8 tiradores: 4 esquinas + 4 lados. hx/hy ∈ {-1,0,1} indican qué borde arrastra
// (izq/der, sup/inf). (0,0) queda excluido: el interior es "mover todo el recuadro".
export function cropHandleNorms(cx, cy, wf, hf) {
  const xs = [cx - wf / 2, cx, cx + wf / 2]
  const ys = [cy - hf / 2, cy, cy + hf / 2]
  const out = []
  for (let iy = 0; iy < 3; iy++) {
    for (let ix = 0; ix < 3; ix++) {
      if (ix === 1 && iy === 1) continue
      out.push({ hx: ix - 1, hy: iy - 1, x: xs[ix], y: ys[iy] })
    }
  }
  return out
}

/** Tirador bajo el puntero (coords norm), con tolerancia en px de pantalla. null si ninguno. */
export function cropHandleAt(nx, ny, crop, rect, px = 12) {
  let best = null
  let bestD = px * px
  for (const h of cropHandleNorms(crop.cx, crop.cy, crop.wf, crop.hf)) {
    const dx = (nx - h.x) * (rect?.width || 1)
    const dy = (ny - h.y) * (rect?.height || 1)
    const d = dx * dx + dy * dy
    if (d <= bestD) { bestD = d; best = { hx: h.hx, hy: h.hy } }
  }
  return best
}

/** ¿El puntero (norm) cae dentro del recuadro? (para mover todo el recuadro). */
export function insideCrop(nx, ny, crop) {
  return nx >= crop.cx - crop.wf / 2 && nx <= crop.cx + crop.wf / 2
    && ny >= crop.cy - crop.hf / 2 && ny <= crop.cy + crop.hf / 2
}

/**
 * Redimensiona un recorte de aspecto LIBRE (overlay): el borde/esquina arrastrado
 * sigue al puntero y el opuesto queda anclado. `start` = recorte al iniciar el gesto.
 */
export function resizeCropFree(start, hx, hy, nx, ny, min = 0.05) {
  let L = start.cx - start.wf / 2
  let R = start.cx + start.wf / 2
  let T = start.cy - start.hf / 2
  let B = start.cy + start.hf / 2
  if (hx < 0) L = clamp(Math.min(nx, R - min), 0, R - min)
  else if (hx > 0) R = clamp(Math.max(nx, L + min), L + min, 1)
  if (hy < 0) T = clamp(Math.min(ny, B - min), 0, B - min)
  else if (hy > 0) B = clamp(Math.max(ny, T + min), T + min, 1)
  const wf = R - L
  const hf = B - T
  return { cx: L + wf / 2, cy: T + hf / 2, wf, hf }
}

/**
 * Redimensiona un recorte de aspecto BLOQUEADO (fill): conserva la relación `r`
 * (= wf/hf) y ancla el borde/esquina opuesto. En un lado, el eje sin tirador crece
 * simétrico (su centro no se mueve). Devuelve cx/cy/wf/hf.
 */
export function resizeCropLocked(start, hx, hy, nx, ny, r, min = 0.1) {
  const L = start.cx - start.wf / 2
  const R = start.cx + start.wf / 2
  const T = start.cy - start.hf / 2
  const B = start.cy + start.hf / 2
  // Tamaño deseado, medido desde el borde opuesto (anclado).
  const wantW = hx < 0 ? (R - nx) : hx > 0 ? (nx - L) : null
  const wantH = hy < 0 ? (B - ny) : hy > 0 ? (ny - T) : null
  const fromW = wantW != null ? wantW / r : null
  let hf = start.hf
  if (fromW != null && wantH != null) hf = Math.max(fromW, wantH) // esquina: cubre el puntero
  else if (fromW != null) hf = fromW
  else if (wantH != null) hf = wantH
  hf = clamp(hf, min, 1)
  let wf = hf * r
  if (wf > 1) { wf = 1; hf = wf / r }
  const cx = hx < 0 ? R - wf / 2 : hx > 0 ? L + wf / 2 : start.cx
  const cy = hy < 0 ? B - hf / 2 : hy > 0 ? T + hf / 2 : start.cy
  return { cx, cy, wf, hf }
}

/** Cursor CSS para un tirador de recorte. */
export function cropCursor(hx, hy) {
  if (hx && hy) return hx === hy ? 'nwse-resize' : 'nesw-resize'
  if (hx) return 'ew-resize'
  if (hy) return 'ns-resize'
  return 'move'
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

/**
 * Encuadre equivalente (cx/cy/zoom sobre la fuente) de un clip en modo libre, en el
 * instante LOCAL `t`. Un objeto libre guarda una ventana de recorte más una
 * transformación en el lienzo; quien solo entiende cx/cy/zoom — guardar un clip
 * cortado, o el encuadre horneado — necesita la traducción: qué zona de la fuente
 * cae dentro del cuadro de salida, que es justo lo que se ve.
 *
 * La ventana resultante ya tiene el aspecto de la salida (el destino se escala por
 * igual en ambos ejes), así que `zoom` = su fracción de alto. Sin equivalente
 * posible: la rotación y las bandas si el clip no llena el cuadro (se recortan).
 */
export function freeFrameAt(clip, t, srcW, srcH, outW, outH) {
  const srcAspect = srcW / srcH
  const outAspect = outW / outH
  const srcTime = clamp(timelineToSource(clip, (clip.start || 0) + t), clip.in_point, clip.out_point)
  const crop = cropWindow(clip, srcAspect, outAspect, srcTime, t)
  const px = sourceCropPx(crop, srcW, srcH)
  const d = destRect(posedTransform(clip, t), px, outW, outH)
  if (!(d.dw > 0) || !(d.dh > 0)) return { cx: 0.5, cy: 0.5, zoom: 1 }
  const zoom = clamp((outH / d.dh) * crop.hf, 0.1, 1)
  const cx = crop.cx - crop.wf / 2 + ((outW / 2 - d.dx) / d.dw) * crop.wf
  const cy = crop.cy - crop.hf / 2 + ((outH / 2 - d.dy) / d.dh) * crop.hf
  return { ...clampCenter(cx, cy, zoom, srcAspect, outAspect), zoom }
}

/** Clips de vídeo visibles en `head`, de fondo a frente (pista, luego orden en la lista). */
export function videosAt(head, clips, tracks) {
  const list = clips || []
  const vids = (tracks || []).filter((t) => t.kind === 'video')
  const layer = (id) => vids.findIndex((t) => t.id === id)
  const index = new Map(list.map((c, i) => [c.id, i]))
  return list
    .filter((c) => {
      // motion se dibuja (overlay con alfa) pero NO es "visual" editable (sin recorte/reframe).
      if (!isVisualClip(c) && c.kind !== 'shape' && c.kind !== 'motion') return false
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
