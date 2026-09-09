// Máscaras de clip: geometría, dibujo y composición sobre canvas.
//
// La máscara es una CAPA DE COMPOSICIÓN del clip: no toca el archivo fuente,
// solo decide qué parte del clip ya compuesto (recorte + pose + efectos) se ve.
// Espejo de `backend/app/clip_mask.py`; ambos deben dar el mismo alfa.
//
// Coordenadas NORMALIZADAS e independientes de la resolución:
//   x, y      → centro, fracción del ancho/alto de salida (0-1).
//   w, h      → tamaño en unidades de ALTO de salida (una circunferencia sigue
//               siendo redonda en 9:16, 16:9 o 1:1).
//   feather   → radio de difuminado, también en unidades de alto.
//   rotation  → grados.
//
// Para añadir un tipo nuevo (elipse, polígono, personalizada…) basta con:
//   1) añadir su entrada a MASK_SHAPES (dibujo en espacio local),
//   2) añadirlo a MASK_TYPES (selector), y
//   3) reflejarlo en `backend/app/clip_mask.py` (mismo id).

const num = (v, d) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const MASK_TYPES = [
  { id: 'linear', label: 'División', icon: 'horizontal_split' },
  { id: 'circle', label: 'Círculo', icon: 'circle' },
  { id: 'rectangle', label: 'Rectángulo', icon: 'crop_square' },
  { id: 'star', label: 'Estrella', icon: 'star' },
  { id: 'heart', label: 'Corazón', icon: 'favorite' },
  { id: 'text', label: 'Texto', icon: 'title' },
  { id: 'brush', label: 'Pincel', icon: 'brush' },
]

export const MASK_TYPE_IDS = MASK_TYPES.map((t) => t.id)
export const MASK_FEATHER_MAX = 0.25
export const MASK_KIND_OK = ['video', 'image', 'shape']

/** Claves animables de la máscara (se suman a KF_PROP_KEYS). Solo masks[0]. */
export const MASK_KF_KEYS = ['mx', 'my', 'mw', 'mh', 'msx', 'msy', 'mrot', 'mfeather']

let _maskUid = 1
export function maskId() {
  return `m${Date.now().toString(36)}${(_maskUid++).toString(36)}`
}

/** ¿El clip admite máscara? Vídeo, imagen y figura pasan por el mismo pipeline. */
export function maskable(clip) {
  return MASK_KIND_OK.includes(clip?.kind)
}

/** Tamaño por defecto: ~60% del ancho de salida, en unidades de alto. */
export function defaultMask(type = 'circle', outAspect = 0.5625) {
  const a = num(outAspect, 0.5625) > 0 ? num(outAspect, 0.5625) : 0.5625
  const wide = clamp(0.62 * a, 0.16, 1.6)
  const base = {
    id: maskId(),
    type: MASK_TYPE_IDS.includes(type) ? type : 'circle',
    enabled: true,
    x: 0.5,
    y: 0.5,
    w: wide,
    h: 0.42,
    scale_x: 1,
    scale_y: 1,
    rotation: 0,
    feather: 0,
    invert: false,
    opacity: 1,
    radius: 0,
  }
  if (base.type === 'circle') { base.w = 0.5; base.h = 0.5 }
  if (base.type === 'star' || base.type === 'heart') { base.w = 0.55; base.h = 0.55 }
  if (base.type === 'linear') { base.w = 2.4; base.h = 2.4 }
  if (base.type === 'text') {
    base.w = wide
    base.h = 0.3
    base.text = { content: 'TEXTO', font: 'Anton', size: 0.22, weight: 700, align: 'center' }
  }
  if (base.type === 'brush') {
    base.w = 1
    base.h = 1
    base.brush = { size: 0.12, points: [] }
  }
  return base
}

export function normalizeMask(raw) {
  const m = raw && typeof raw === 'object' ? raw : {}
  const type = MASK_TYPE_IDS.includes(m.type) ? m.type : 'circle'
  const out = {
    id: m.id || maskId(),
    type,
    enabled: m.enabled !== false,
    x: num(m.x, 0.5),
    y: num(m.y, 0.5),
    w: clamp(num(m.w, 0.5), 0.01, 8),
    h: clamp(num(m.h, 0.5), 0.01, 8),
    scale_x: clamp(num(m.scale_x, 1), 0.02, 12),
    scale_y: clamp(num(m.scale_y, 1), 0.02, 12),
    rotation: num(m.rotation, 0),
    feather: clamp(num(m.feather, 0), 0, MASK_FEATHER_MAX),
    invert: !!m.invert,
    opacity: clamp(num(m.opacity, 1), 0, 1),
    radius: clamp(num(m.radius, 0), 0, 0.5),
  }
  if (type === 'text') {
    const t = m.text && typeof m.text === 'object' ? m.text : {}
    out.text = {
      content: typeof t.content === 'string' ? t.content : 'TEXTO',
      font: t.font || 'Anton',
      size: clamp(num(t.size, 0.22), 0.02, 1.5),
      weight: clamp(num(t.weight, 700), 100, 900),
      align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'center',
    }
  }
  if (type === 'brush') {
    const b = m.brush && typeof m.brush === 'object' ? m.brush : {}
    const pts = Array.isArray(b.points) ? b.points : []
    out.brush = {
      size: clamp(num(b.size, 0.12), 0.005, 1),
      points: pts
        .map((p) => ({ x: num(p?.x, NaN), y: num(p?.y, NaN), ...(p?.m ? { m: 1 } : {}) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    }
  }
  return out
}

/** Lista normalizada de máscaras del clip (vacía si no tiene). */
export function clipMasks(clip) {
  const raw = clip?.masks
  if (!Array.isArray(raw) || !raw.length) return []
  return raw.map(normalizeMask)
}

export function hasMask(clip) {
  return clipMasks(clip).some((m) => m.enabled)
}

/** Props estáticas de máscara para el sistema de keyframes (masks[0]). */
export function maskStaticProps(clip) {
  const m = clipMasks(clip)[0]
  if (!m) return { mx: 0.5, my: 0.5, mw: 0.5, mh: 0.5, msx: 1, msy: 1, mrot: 0, mfeather: 0 }
  return {
    mx: m.x, my: m.y, mw: m.w, mh: m.h,
    msx: m.scale_x, msy: m.scale_y, mrot: m.rotation, mfeather: m.feather,
  }
}

/** Aplica al primer mask los valores animados de `props` (de clipPropsAt). */
export function maskFromProps(mask, props) {
  if (!mask || !props) return mask
  return normalizeMask({
    ...mask,
    x: num(props.mx, mask.x),
    y: num(props.my, mask.y),
    w: num(props.mw, mask.w),
    h: num(props.mh, mask.h),
    scale_x: num(props.msx, mask.scale_x),
    scale_y: num(props.msy, mask.scale_y),
    rotation: num(props.mrot, mask.rotation),
    feather: num(props.mfeather, mask.feather),
  })
}

/** Geometría en píxeles dentro de un recuadro de salida `frame` {x,y,w,h}. */
export function maskGeometry(mask, frame) {
  const ref = frame.h
  return {
    cx: frame.x + mask.x * frame.w,
    cy: frame.y + mask.y * frame.h,
    hw: Math.max(0.5, (mask.w * mask.scale_x * ref) / 2),
    hh: Math.max(0.5, (mask.h * mask.scale_y * ref) / 2),
    rot: (mask.rotation || 0) * Math.PI / 180,
    ref,
    feather: mask.feather * ref,
  }
}

/** Punto del canvas → espacio local de la máscara (unidades de alto). */
export function toMaskLocal(px, py, mask, frame) {
  const g = maskGeometry(mask, frame)
  const dx = px - g.cx
  const dy = py - g.cy
  const c = Math.cos(-g.rot)
  const s = Math.sin(-g.rot)
  return { x: (dx * c - dy * s) / g.ref, y: (dx * s + dy * c) / g.ref }
}

// --- Dibujo de la forma (espacio local ya trasladado y rotado) --------------

function pathRect(ctx, m, g) {
  const r = Math.min(m.radius * Math.min(g.hw, g.hh) * 2, Math.min(g.hw, g.hh))
  ctx.beginPath()
  if (r > 0.5 && ctx.roundRect) ctx.roundRect(-g.hw, -g.hh, g.hw * 2, g.hh * 2, r)
  else ctx.rect(-g.hw, -g.hh, g.hw * 2, g.hh * 2)
}

function pathCircle(ctx, m, g) {
  ctx.beginPath()
  ctx.ellipse(0, 0, g.hw, g.hh, 0, 0, Math.PI * 2)
}

/** División: semiplano superior. La "línea" pasa por el centro de la máscara. */
function pathLinear(ctx, m, g) {
  const big = Math.max(g.hw, g.hh) * 4 + g.ref * 4
  ctx.beginPath()
  ctx.rect(-big, -big, big * 2, big)
}

export function starPoints(hw, hh, spikes = 5, inner = 0.42) {
  const n = Math.max(3, Math.round(spikes))
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const r = i % 2 === 0 ? 1 : inner
    pts.push([Math.cos(a) * hw * r, Math.sin(a) * hh * r])
  }
  return pts
}

function pathStar(ctx, m, g) {
  const pts = starPoints(g.hw, g.hh)
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

/** Corazón paramétrico normalizado a [-1,1] en ambos ejes. */
export function heartPoints(hw, hh, n = 96) {
  const raw = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    raw.push([16 * Math.sin(t) ** 3,
      -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))])
  }
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return raw.map(([x, y]) => [
    (((x - minX) / (maxX - minX)) * 2 - 1) * hw,
    (((y - minY) / (maxY - minY)) * 2 - 1) * hh,
  ])
}

function pathHeart(ctx, m, g) {
  const pts = heartPoints(g.hw, g.hh)
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

/** Registro tipo → trazado. Punto de extensión para tipos futuros. */
export const MASK_SHAPES = {
  linear: pathLinear,
  circle: pathCircle,
  rectangle: pathRect,
  star: pathStar,
  heart: pathHeart,
}

export function maskTextLines(mask) {
  return String(mask?.text?.content ?? '').split('\n')
}

function paintText(ctx, m, g, cssFontOf) {
  const t = m.text || {}
  const size = Math.max(2, t.size * g.ref)
  const fam = cssFontOf ? cssFontOf(t.font) : 'Arial, sans-serif'
  ctx.font = `${Math.round(t.weight || 700)} ${size}px ${fam}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = t.align || 'center'
  const lines = maskTextLines(m)
  const lh = size * 1.12
  const y0 = -((lines.length - 1) * lh) / 2
  const ax = t.align === 'left' ? -g.hw : t.align === 'right' ? g.hw : 0
  lines.forEach((line, i) => ctx.fillText(line, ax, y0 + i * lh))
}

function paintBrush(ctx, m, g) {
  const pts = m.brush?.points || []
  if (!pts.length) return
  const sx = m.scale_x || 1
  const sy = m.scale_y || 1
  const wpx = Math.max(1, (m.brush?.size || 0.12) * g.ref * (sx + sy) / 2)
  ctx.lineWidth = wpx
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = ctx.fillStyle
  ctx.beginPath()
  let open = false
  for (const p of pts) {
    const x = p.x * g.ref * sx
    const y = p.y * g.ref * sy
    if (!open || p.m) { ctx.moveTo(x, y); open = true } else ctx.lineTo(x, y)
  }
  ctx.stroke()
  // Un clic sin arrastrar debe pintar un disco.
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0].x * g.ref * sx, pts[0].y * g.ref * sy, wpx / 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Pinta la forma (blanca, opaca) de una máscara sobre `ctx`.
 * `opts.cssFontOf` traduce nombre de fuente → familia CSS (máscara de texto).
 */
export function paintMaskShape(ctx, mask, frame, opts = {}) {
  const g = maskGeometry(mask, frame)
  ctx.save()
  ctx.translate(g.cx, g.cy)
  ctx.rotate(g.rot)
  ctx.fillStyle = opts.color || '#fff'
  if (mask.type === 'text') paintText(ctx, mask, g, opts.cssFontOf)
  else if (mask.type === 'brush') paintBrush(ctx, mask, g)
  else {
    const shape = MASK_SHAPES[mask.type] || MASK_SHAPES.circle
    shape(ctx, mask, g)
    ctx.fill()
  }
  ctx.restore()
}

/** Contorno de la máscara (guía de edición en el preview). */
export function strokeMaskShape(ctx, mask, frame, opts = {}) {
  const g = maskGeometry(mask, frame)
  ctx.save()
  ctx.translate(g.cx, g.cy)
  ctx.rotate(g.rot)
  ctx.strokeStyle = opts.color || '#38bdf8'
  ctx.lineWidth = opts.lineWidth || 1.6
  if (opts.dash) ctx.setLineDash(opts.dash)
  if (mask.type === 'brush' || mask.type === 'text') {
    ctx.strokeRect(-g.hw, -g.hh, g.hw * 2, g.hh * 2)
  } else if (mask.type === 'linear') {
    const big = Math.max(g.hw, g.hh) * 4 + g.ref * 4
    ctx.beginPath()
    ctx.moveTo(-big, 0)
    ctx.lineTo(big, 0)
    ctx.stroke()
  } else {
    const shape = MASK_SHAPES[mask.type] || MASK_SHAPES.circle
    shape(ctx, mask, g)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}

// --- Composición sobre el canvas -------------------------------------------
// El clip se dibuja en una capa aparte y la máscara recorta su ALFA
// (destination-in). Así la máscara se aplica DESPUÉS del recorte, la pose y los
// efectos del clip, igual que `maskedmerge` en el export.

const _scratch = new Map()

function scratchCanvas(w, h, slot) {
  const key = `${slot}:${w}x${h}`
  let cv = _scratch.get(key)
  if (!cv) {
    if (typeof document === 'undefined') return null
    cv = document.createElement('canvas')
    if (_scratch.size > 6) _scratch.delete(_scratch.keys().next().value)
    _scratch.set(key, cv)
  }
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
  return cv
}

/** Capa temporal del tamaño del canvas destino, ya limpia. */
export function beginMaskLayer(ctx) {
  const cv = scratchCanvas(ctx.canvas.width, ctx.canvas.height, 'layer')
  if (!cv) return null
  const lctx = cv.getContext('2d')
  lctx.setTransform(1, 0, 0, 1, 0, 0)
  lctx.globalCompositeOperation = 'source-over'
  lctx.globalAlpha = 1
  lctx.filter = 'none'
  lctx.clearRect(0, 0, cv.width, cv.height)
  return { canvas: cv, ctx: lctx }
}

/** Recorta el alfa de `layerCtx` con cada máscara (intersección). */
export function applyMasksToLayer(layerCtx, masks, frame, opts = {}) {
  const w = layerCtx.canvas.width
  const h = layerCtx.canvas.height
  for (const mask of masks) {
    const cv = scratchCanvas(w, h, 'mask')
    if (!cv) return
    const mc = cv.getContext('2d')
    mc.setTransform(1, 0, 0, 1, 0, 0)
    mc.globalAlpha = 1
    mc.filter = 'none'
    mc.globalCompositeOperation = 'source-over'
    mc.clearRect(0, 0, w, h)
    if (mask.invert) {
      mc.fillStyle = '#fff'
      mc.fillRect(0, 0, w, h)
      mc.globalCompositeOperation = 'destination-out'
    }
    const blur = mask.feather * frame.h
    if (blur > 0.3) mc.filter = `blur(${blur.toFixed(2)}px)`
    paintMaskShape(mc, mask, frame, opts)
    mc.filter = 'none'
    if (mask.opacity < 0.999) {
      mc.globalCompositeOperation = 'destination-over'
      mc.fillStyle = `rgba(255,255,255,${1 - mask.opacity})`
      mc.fillRect(0, 0, w, h)
    }
    mc.globalCompositeOperation = 'source-over'
    layerCtx.save()
    layerCtx.setTransform(1, 0, 0, 1, 0, 0)
    layerCtx.globalAlpha = 1
    layerCtx.filter = 'none'
    layerCtx.globalCompositeOperation = 'destination-in'
    layerCtx.drawImage(cv, 0, 0)
    layerCtx.restore()
  }
}

/** Vuelca la capa enmascarada sobre el canvas destino. */
export function endMaskLayer(ctx, layer, masks, frame, opts = {}) {
  applyMasksToLayer(layer.ctx, masks, frame, opts)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(layer.canvas, 0, 0)
  ctx.restore()
}

// --- Manipulación directa en el preview -------------------------------------

/** Semiejes usados por los tiradores. La división es infinita: caja fija. */
export function maskHandleBox(mask, frame) {
  const g = maskGeometry(mask, frame)
  if (mask.type === 'linear') {
    return { ...g, hw: frame.w * 0.3, hh: Math.max(18, frame.h * 0.035) }
  }
  return g
}

/** Tiradores en coordenadas del canvas: mover, ancho, alto, esquina, girar, pluma. */
export function maskHandles(mask, frame) {
  const g = maskHandleBox(mask, frame)
  const c = Math.cos(g.rot)
  const s = Math.sin(g.rot)
  const at = (lx, ly) => ({ x: g.cx + lx * c - ly * s, y: g.cy + lx * s + ly * c })
  const pad = Math.max(16, frame.h * 0.022)
  return {
    c: at(0, 0),
    r: at(g.hw, 0),
    b: at(0, g.hh),
    br: at(g.hw, g.hh),
    rot: at(0, -g.hh - pad),
    fea: at(-g.hw - pad, 0),
    box: g,
  }
}

/** Modo de arrastre según el tirador más cercano al puntero. */
export function maskHitMode(px, py, mask, frame, pad = 13) {
  const h = maskHandles(mask, frame)
  const near = (p) => p && (px - p.x) ** 2 + (py - p.y) ** 2 <= pad * pad
  if (near(h.rot)) return 'rotate'
  if (near(h.fea)) return 'feather'
  if (near(h.br)) return 'corner'
  if (near(h.r)) return 'width'
  if (near(h.b)) return 'height'
  const local = toMaskLocal(px, py, mask, frame)
  const g = maskHandleBox(mask, frame)
  const inside = Math.abs(local.x) * g.ref <= g.hw && Math.abs(local.y) * g.ref <= g.hh
  return inside ? 'move' : null
}
