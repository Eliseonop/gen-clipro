// Figuras vectoriales parametrizables (no PNG).
// La geometría vive en un viewBox 0–100; x/y/w/h del clip son fracciones del canvas.
import { applyShapePose, clipFlip, clipPose } from './clipAnim.js'
import { clipPropsAt, easeT, keyframesEnabled, normalizeItems, upsertKeyframeAt } from './clipKeyframes.js'

export const SHAPE_DEFAULT_DUR = 5

export const SHAPE_CATALOG = [
  {
    id: 'basic',
    label: 'Básicas',
    items: [
      { type: 'square', label: 'Cuadrado', icon: 'crop_square' },
      { type: 'circle', label: 'Círculo', icon: 'radio_button_unchecked' },
      { type: 'rect', label: 'Rectángulo', icon: 'crop_landscape' },
      { type: 'line', label: 'Línea', icon: 'horizontal_rule' },
    ],
  },
  {
    id: 'arrows',
    label: 'Flechas',
    items: [
      { type: 'arrow', label: 'Flecha', icon: 'east' },
      { type: 'arrow_curve', label: 'Flecha curva', icon: 'subdirectory_arrow_right' },
      { type: 'arrow_double', label: 'Flecha doble', icon: 'sync_alt' },
    ],
  },
  {
    id: 'geo',
    label: 'Geométricas',
    items: [
      { type: 'triangle', label: 'Triángulo', icon: 'change_history' },
      { type: 'star', label: 'Estrella', icon: 'star' },
      { type: 'polygon', label: 'Polígono', icon: 'category' },
    ],
  },
  {
    id: 'ui',
    label: 'UI',
    items: [
      { type: 'speech', label: 'Burbuja', icon: 'chat_bubble' },
      { type: 'check', label: 'Check', icon: 'check' },
      { type: 'x', label: 'X', icon: 'close' },
      { type: 'marker', label: 'Marcador', icon: 'place' },
      { type: 'heart', label: 'Corazón', icon: 'favorite' },
    ],
  },
]

// Estilo del trazo (#14). El patrón va en múltiplos del grosor: con extremos
// redondos cada guion crece medio grosor por lado, así que [2, 2] se ve como
// guiones de 3 grosores con huecos de 1, y [0, 2] como puntos redondos.
export const DASH_STYLES = [
  { id: 'solid', label: 'Continuo' },
  { id: 'dash', label: 'Discontinuo' },
  { id: 'dot', label: 'Punteado' },
]
const DASH_IDS = new Set(DASH_STYLES.map((d) => d.id))

export function dashPattern(dash, lw) {
  if (dash === 'dash') return [2 * lw, 2 * lw]
  if (dash === 'dot') return [0, 2 * lw]
  return null
}

// Trazado con pluma (#14): anclas en el viewBox 0–100 de la figura, unidas por
// una curva Catmull-Rom (pasa por todas) o por rectas. Espejo de path_points.
export const PATH_STEPS = 12

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  const c = (a, b, cc, d) => 0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3)
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]
}

export function pathAnchors(points) {
  return (Array.isArray(points) ? points : [])
    .map((p) => [Number(p?.[0]), Number(p?.[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
}

/** Polilínea (o anillo si `closed`, sin repetir el primer punto) del trazado. */
export function pathPoints(points, { closed = false, smooth = true } = {}) {
  const pts = pathAnchors(points)
  const n = pts.length
  if (n < 2) return pts
  if (!smooth || n === 2) return pts
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
  const out = []
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    for (let s = 0; s < PATH_STEPS; s++) out.push(catmull(p0, p1, p2, p3, s / PATH_STEPS))
  }
  if (!closed) out.push(pts[n - 1])
  return out
}

/** Figura `path` a partir de puntos en 0–1 del cuadro: la caja es la de los puntos
 *  y las anclas quedan en su viewBox 0–100. Espejo de path_shape. */
export function pathShape(framePoints, opts = {}) {
  const pts = pathAnchors(framePoints)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  const w = clampN(x1 - x0, 0.04, 1)
  const h = clampN(y1 - y0, 0.03, 1)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const r4 = (v) => +v.toFixed(4)
  return {
    ...defaultShape('path'),
    ...opts,
    type: 'path',
    x: r4(cx),
    y: r4(cy),
    w: r4(w),
    h: r4(h),
    rotation: 0,
    points: pts.map(([x, y]) => [+(50 + ((x - cx) / w) * 100).toFixed(3), +(50 + ((y - cy) / h) * 100).toFixed(3)]),
  }
}

/** Primer tramo de la polilínea (en px) que cubre la fracción `frac` de su largo. */
export function trimPolyline(pts, frac) {
  if (frac >= 1 || pts.length < 2) return pts
  if (frac <= 0) return []
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  let left = total * frac
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d >= left) {
      const u = d > 0 ? left / d : 0
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])
      return out
    }
    left -= d
    out.push(b)
  }
  return out
}

// --- Edición del trazado sobre el preview ---------------------------------------
// `frame` = recuadro exportable en px del canvas ({x, y, w, h}).

function posedBox(clip, frame, localT) {
  const st = applyShapePose(normalizeShape(clip?.shape), clipPose(clip, localT ?? 0))
  return {
    st,
    box: { cx: frame.x + st.x * frame.w, cy: frame.y + st.y * frame.h, bw: st.w * frame.w, bh: st.h * frame.h, rotation: st.rotation },
  }
}

/** Anclas del trazado en px del canvas (con pose, volteo y giro). */
export function pathAnchorPoints(clip, frame, localT) {
  const { st, box } = posedBox(clip, frame, localT)
  const flip = clipFlip(clip)
  return pathAnchors(st.points).map(([x, y]) => mapShapePoint([flip.h ? 100 - x : x, flip.v ? 100 - y : y], box))
}

/** Punto del canvas (px) → coordenadas 0–100 del trazado (inversa de pathAnchorPoints). */
export function pathLocalPoint(clip, frame, localT, px, py) {
  const { box } = posedBox(clip, frame, localT)
  const rad = (box.rotation || 0) * Math.PI / 180
  const dx = px - box.cx
  const dy = py - box.cy
  const lx = dx * Math.cos(rad) + dy * Math.sin(rad)
  const ly = -dx * Math.sin(rad) + dy * Math.cos(rad)
  let x = (lx / (box.bw || 1) + 0.5) * 100
  let y = (ly / (box.bh || 1) + 0.5) * 100
  const flip = clipFlip(clip)
  if (flip.h) x = 100 - x
  if (flip.v) y = 100 - y
  return [+x.toFixed(3), +y.toFixed(3)]
}

/** Vuelve a ajustar la caja a las anclas (tras moverlas fuera de 0–100) sin que el
 *  trazado se mueva en pantalla. `aspect` = ancho/alto de la salida; `flip` el
 *  volteo del clip (refleja las anclas respecto al centro de la caja). */
export function renormalizePath(shape, aspect = 9 / 16, flip = null) {
  const st = normalizeShape(shape)
  const pts = pathAnchors(st.points)
  if (pts.length < 2) return shape
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const w = clampN(st.w * (x1 - x0) / 100, 0.04, 1)
  const h = clampN(st.h * (y1 - y0) / 100, 0.03, 1)
  // Centro nuevo en px de una salida de alto 1 y ancho `aspect`, girado con la figura.
  const ox = ((x0 + x1) / 2 - 50) / 100 * st.w * aspect * (flip?.h ? -1 : 1)
  const oy = ((y0 + y1) / 2 - 50) / 100 * st.h * (flip?.v ? -1 : 1)
  const rad = st.rotation * Math.PI / 180
  const cx = st.x * aspect + ox * Math.cos(rad) - oy * Math.sin(rad)
  const cy = st.y + ox * Math.sin(rad) + oy * Math.cos(rad)
  const cxl = (x0 + x1) / 2
  const cyl = (y0 + y1) / 2
  return {
    ...shape,
    x: +(cx / aspect).toFixed(4),
    y: +cy.toFixed(4),
    w: +w.toFixed(4),
    h: +h.toFixed(4),
    points: pts.map(([x, y]) => [
      +(50 + (x - cxl) * (st.w / w)).toFixed(3),
      +(50 + (y - cyl) * (st.h / h)).toFixed(3),
    ]),
  }
}

/** Índice del ancla más cercana a (px, py) dentro de `radius` px, o -1. */
export function hitPathAnchor(anchors, px, py, radius = 9) {
  let best = -1
  let bestD = radius
  anchors.forEach(([x, y], i) => {
    const d = Math.hypot(px - x, py - y)
    if (d <= bestD) { best = i; bestD = d }
  })
  return best
}

/** Tramo del trazado (entre anclas i e i+1) más cercano a (px, py) dentro de
 *  `radius` px, o -1. Sirve para insertar un ancla nueva. */
export function hitPathSegment(anchors, px, py, closed, radius = 8) {
  const n = anchors.length
  let best = -1
  let bestD = radius
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = anchors[i]
    const b = anchors[(i + 1) % n]
    const vx = b[0] - a[0], vy = b[1] - a[1]
    const L2 = vx * vx + vy * vy || 1
    const u = clampN(((px - a[0]) * vx + (py - a[1]) * vy) / L2, 0, 1)
    const d = Math.hypot(px - (a[0] + vx * u), py - (a[1] + vy * u))
    if (d <= bestD) { best = i; bestD = d }
  }
  return best
}

/** Keyframes de «Dibujar trazo» (#14): de 0 a 100 % en `seconds` desde el
 *  inicio del clip, con curva ease-in-out. Conserva el resto de la animación. */
export function drawInKeyframes(clip, seconds = 1.5, fps) {
  const dur = Math.max(0.1, (clip?.out_point ?? 0) - (clip?.in_point ?? 0))
  const d = Math.min(Math.max(0.1, seconds), dur)
  const items = normalizeItems(clip?.keyframes?.enabled ? clip.keyframes.items : []).map((k) => {
    // Los keyframes que caen dentro siguen la misma curva; los de después, al 100 %.
    const u = k.t >= d ? 1 : easeT(k.t / d, 'ease-in-out')
    return { ...k, props: { ...k.props, draw: +u.toFixed(4) } }
  })
  let next = { ...clip, shape: { ...(clip?.shape || {}), draw: 1 }, keyframes: { enabled: true, items } }
  next = upsertKeyframeAt(next, 0, { draw: 0 }, undefined, fps)
  next = upsertKeyframeAt(next, d, { draw: 1 }, 'ease-in-out', fps)
  return next
}

/** Cuánto del trazo está dibujado (0–1) en el instante local `t` (keyframe `draw`). */
export function shapeDrawAt(clip, t) {
  if (keyframesEnabled(clip)) return clampN(Number(clipPropsAt(clip, t).draw), 0, 1)
  return normalizeShape(clip?.shape).draw
}

const STROKE_ONLY = new Set(['line', 'check', 'x'])
const RADIUS_TYPES = new Set(['square', 'rect', 'speech'])
const SIDES_TYPES = new Set(['polygon', 'star'])
const ARROW_TYPES = new Set(['arrow', 'arrow_curve', 'arrow_double'])

export function shapeNeedsFill(type) { return !STROKE_ONLY.has(type) }
export function shapeNeedsRadius(type) { return RADIUS_TYPES.has(type) }
export function shapeNeedsSides(type) { return SIDES_TYPES.has(type) }
export function shapeNeedsArrow(type) { return ARROW_TYPES.has(type) }

const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function hexColor(v, fallback) {
  const s = String(v || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback
}

function ellipsePts(cx, cy, rx, ry, n = 64) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

function roundRectPts(x, y, w, h, r, n = 6) {
  const rr = clampN(r, 0, Math.min(w, h) / 2)
  if (rr < 0.4) {
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  }
  const pts = []
  const corners = [
    [x + w - rr, y + rr, -Math.PI / 2, 0],
    [x + w - rr, y + h - rr, 0, Math.PI / 2],
    [x + rr, y + h - rr, Math.PI / 2, Math.PI],
    [x + rr, y + rr, Math.PI, Math.PI * 1.5],
  ]
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n)
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
    }
  }
  return pts
}

function starPts(cx, cy, rOuter, rInner, spikes) {
  const n = Math.max(3, Math.round(spikes))
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const r = i % 2 === 0 ? rOuter : rInner
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function polyPts(cx, cy, r, sides) {
  const n = Math.max(3, Math.round(sides))
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function curvedArrowPoly() {
  const cx = 66
  const cy = 84
  const r = 50
  const half = 5
  const headLen = 26
  const headHalf = 14
  const a0 = Math.PI
  const aNeck = Math.PI * 1.5
  const nShaft = 44
  const left = []
  const right = []
  for (let i = 0; i < nShaft; i++) {
    const a = a0 + (aNeck - a0) * (i / nShaft)
    const c = Math.cos(a)
    const s = Math.sin(a)
    left.push([cx + c * (r + half), cy + s * (r + half)])
    right.push([cx + c * (r - half), cy + s * (r - half)])
  }
  const neck = [cx, cy - r]
  const neckL = [neck[0], neck[1] - half]
  const neckR = [neck[0], neck[1] + half]
  const wingL = [neck[0], neck[1] - headHalf]
  const wingR = [neck[0], neck[1] + headHalf]
  const tip = [neck[0] + headLen, neck[1]]
  return [...left, neckL, wingL, tip, wingR, neckR, ...right.reverse()]
}

function heartPts() {
  const raw = []
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    raw.push([x, -y])
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of raw) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const sx = 76 / (maxX - minX || 1)
  const sy = 76 / (maxY - minY || 1)
  return raw.map(([x, y]) => [12 + (x - minX) * sx, 12 + (y - minY) * sy])
}

function markerPts() {
  return [[50, 94], [24, 40], [76, 40]]
}

export function defaultShape(type) {
  const t = type || 'rect'
  const base = {
    type: t,
    x: 0.5,
    y: 0.42,
    w: 0.38,
    h: 0.16,
    rotation: 0,
    fill: '#e53935',
    stroke: '#ffffff',
    strokeWidth: 4,
    opacity: 1,
    cornerRadius: 0.12,
    sides: t === 'star' ? 5 : 6,
    arrowHead: 'filled',
  }
  if (t === 'square' || t === 'circle') { base.w = 0.28; base.h = 0.16 }
  if (t === 'ellipse') { base.w = 0.4; base.h = 0.18 }
  if (t === 'line') { base.w = 0.42; base.h = 0.06; base.fill = 'none'; base.strokeWidth = 6 }
  if (t === 'arrow' || t === 'arrow_double') { base.w = 0.46; base.h = 0.14 }
  if (t === 'arrow_curve') { base.w = 0.42; base.h = 0.28; base.y = 0.38 }
  if (t === 'triangle') { base.w = 0.3; base.h = 0.18 }
  if (t === 'star') { base.w = 0.3; base.h = 0.17 }
  if (t === 'polygon') { base.w = 0.3; base.h = 0.17 }
  if (t === 'speech') { base.w = 0.42; base.h = 0.22; base.y = 0.4 }
  if (t === 'check' || t === 'x') { base.w = 0.2; base.h = 0.12; base.fill = 'none'; base.strokeWidth = 8; base.stroke = '#22c55e' }
  if (t === 'x') base.stroke = '#ef4444'
  if (t === 'marker') { base.w = 0.18; base.h = 0.2; base.y = 0.4 }
  if (t === 'heart') { base.w = 0.26; base.h = 0.16; base.fill = '#e11d48' }
  if (t === 'path') {
    Object.assign(base, { w: 0.42, h: 0.2, fill: 'none', strokeWidth: 6, points: [[0, 100], [50, 0], [100, 100]], closed: false, smooth: true })
  }
  if (t === 'letterbox') {
    Object.assign(base, { x: 0.5, y: 0.5, w: 1, h: 1, fill: '#000000', stroke: '#000000', strokeWidth: 0, bar: 0.12 })
  }
  return base
}

// Barras de cine (#20): dos bandas a lo ancho del cuadro. `bar` = alto de cada banda
// (fracción del alto). Con `draw` < 1 las bandas entran desde los bordes.
export const CINEMA_RATIOS = [
  { id: '2.39', label: '2,39:1 (cine)', ratio: 2.39 },
  { id: '2', label: '2:1', ratio: 2 },
  { id: '1.85', label: '1,85:1', ratio: 1.85 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
]
export const BAR_MAX = 0.45

/** Alto de cada barra para que lo visible tenga la proporción `ratio` en una salida
 *  de proporción `outAspect` (ancho/alto). Espejo de cinema_bar. */
export function cinemaBar(outAspect, ratio) {
  return +clampN((1 - outAspect / ratio) / 2, 0, BAR_MAX).toFixed(4)
}

export function normalizeShape(raw) {
  const type = raw?.type || 'rect'
  const d = defaultShape(type)
  const fill = raw?.fill === 'none' ? 'none' : hexColor(raw?.fill, d.fill)
  return {
    ...d,
    ...raw,
    type,
    x: clampN(Number(raw?.x ?? d.x), 0, 1),
    y: clampN(Number(raw?.y ?? d.y), 0, 1),
    w: clampN(Number(raw?.w ?? d.w), 0.04, 1),
    h: clampN(Number(raw?.h ?? d.h), 0.03, 1),
    rotation: Number(raw?.rotation ?? d.rotation) || 0,
    fill,
    stroke: hexColor(raw?.stroke, d.stroke),
    strokeWidth: clampN(Number(raw?.strokeWidth ?? d.strokeWidth), 0, 24),
    opacity: clampN(Number(raw?.opacity ?? d.opacity), 0, 1),
    cornerRadius: clampN(Number(raw?.cornerRadius ?? d.cornerRadius), 0, 0.5),
    sides: clampN(Math.round(Number(raw?.sides ?? d.sides) || d.sides), 3, 12),
    arrowHead: raw?.arrowHead === 'line' || raw?.arrowHead === 'none' ? raw.arrowHead : 'filled',
    dash: DASH_IDS.has(raw?.dash) ? raw.dash : 'solid',
    draw: clampN(Number(raw?.draw ?? 1), 0, 1),
    ...(type === 'letterbox' ? { bar: clampN(Number(raw?.bar ?? d.bar), 0, 0.5) } : {}),
    ...(type === 'path' ? {
      points: pathAnchors(raw?.points ?? d.points),
      closed: !!(raw?.closed ?? d.closed),
      smooth: raw?.smooth !== false,
    } : {}),
  }
}

export function shapeGeometry(type, opts = {}) {
  const t = type || 'rect'
  const radius = clampN(Number(opts.cornerRadius) || 0, 0, 0.5) * 50
  const sides = clampN(Math.round(Number(opts.sides) || 6), 3, 12)
  const fills = []
  const strokes = []

  if (t === 'square' || t === 'rect') {
    const pad = t === 'square' ? 12 : 8
    const x = pad
    const y = t === 'square' ? 12 : 22
    const w = 100 - pad * 2
    const h = t === 'square' ? 76 : 56
    fills.push(roundRectPts(x, y, w, h, radius))
  } else if (t === 'circle') {
    fills.push(ellipsePts(50, 50, 40, 40))
  } else if (t === 'ellipse') {
    fills.push(ellipsePts(50, 50, 44, 28))
  } else if (t === 'line') {
    strokes.push([[8, 50], [92, 50]])
  } else if (t === 'arrow') {
    fills.push([[8, 38], [58, 38], [58, 20], [94, 50], [58, 80], [58, 62], [8, 62]])
  } else if (t === 'arrow_double') {
    fills.push([
      [6, 50], [24, 22], [24, 38], [76, 38], [76, 22], [94, 50],
      [76, 78], [76, 62], [24, 62], [24, 78],
    ])
  } else if (t === 'arrow_curve') {
    fills.push(curvedArrowPoly())
  } else if (t === 'triangle') {
    fills.push([[50, 10], [92, 88], [8, 88]])
  } else if (t === 'star') {
    fills.push(starPts(50, 52, 40, 16, sides))
  } else if (t === 'polygon') {
    fills.push(polyPts(50, 52, 40, sides))
  } else if (t === 'speech') {
    fills.push(roundRectPts(8, 8, 84, 62, Math.max(8, radius)))
    fills.push([[36, 68], [22, 94], [54, 68]])
  } else if (t === 'check') {
    strokes.push([[18, 52], [40, 74], [84, 26]])
  } else if (t === 'x') {
    strokes.push([[22, 22], [78, 78]])
    strokes.push([[78, 22], [22, 78]])
  } else if (t === 'marker') {
    fills.push(markerPts())
    fills.push(ellipsePts(50, 34, 16, 16))
  } else if (t === 'heart') {
    fills.push(heartPts())
  } else if (t === 'letterbox') {
    const b = clampN(Number(opts.bar ?? 0.12), 0, 0.5) * 100
    if (b > 0) {
      // Un poco más anchas que el cuadro: sin rendija en los bordes por el antialias.
      fills.push([[-1, -1], [101, -1], [101, b], [-1, b]])
      fills.push([[-1, 100 - b], [101, 100 - b], [101, 101], [-1, 101]])
    }
  } else if (t === 'path') {
    const line = pathPoints(opts.points, opts)
    if (opts.closed && line.length >= 3) fills.push(line)
    else if (line.length >= 2) strokes.push(line)
  } else {
    fills.push(roundRectPts(8, 22, 84, 56, radius))
  }

  const head = opts.arrowHead
  if (ARROW_TYPES.has(t) && head === 'line') {
    return { fills: [], strokes: fills.map((ring) => ring.concat([ring[0]])) }
  }
  if (ARROW_TYPES.has(t) && head === 'none') {
    return { fills: [], strokes: fills }
  }
  return { fills, strokes }
}

export function shapeBox(shape, cw, ch) {
  const st = normalizeShape(shape)
  return {
    cx: st.x * cw,
    cy: st.y * ch,
    bw: st.w * cw,
    bh: st.h * ch,
    rotation: st.rotation,
  }
}

// Voltear (#7): la geometría (0–100) se refleja en los ejes de la figura antes de
// colocarla y girarla. Espejo de shapes.flip_geometry (export).
export function flipGeometry(geo, flip) {
  if (!flip?.h && !flip?.v) return geo
  const f = ([x, y]) => [flip.h ? 100 - x : x, flip.v ? 100 - y : y]
  return { fills: geo.fills.map((r) => r.map(f)), strokes: geo.strokes.map((l) => l.map(f)) }
}

export function mapShapePoint(pt, box) {
  const rad = (box.rotation || 0) * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const lx = (pt[0] / 100 - 0.5) * box.bw
  const ly = (pt[1] / 100 - 0.5) * box.bh
  return [box.cx + lx * cos - ly * sin, box.cy + lx * sin + ly * cos]
}

function pathFromRing(ctx, ring, box) {
  ring.forEach((pt, i) => {
    const [x, y] = mapShapePoint(pt, box)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

export function polyToSvg(ring, close = true) {
  if (!ring?.length) return ''
  const d = ring.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return close ? `${d} Z` : d
}

export function svgPreview(type, opts = {}) {
  const st = { ...defaultShape(type), ...opts, type }
  const geo = shapeGeometry(type, st)
  const fill = st.fill === 'none' ? 'none' : (st.fill || '#e53935')
  const stroke = st.stroke || '#fff'
  const sw = STROKE_ONLY.has(type) ? 8 : 4
  const join = ARROW_TYPES.has(type) ? 'miter' : 'round'
  const miter = ARROW_TYPES.has(type) ? ' stroke-miterlimit="8"' : ''
  const parts = []
  for (const ring of geo.fills) {
    parts.push(`<path d="${polyToSvg(ring)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="${join}"${miter} paint-order="stroke fill"/>`)
  }
  for (const line of geo.strokes) {
    parts.push(`<path d="${polyToSvg(line, false)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`)
  }
  return parts.join('')
}

export function dragShapePayload(item) {
  const shape = defaultShape(item.type)
  return JSON.stringify({
    asset_kind: 'shape',
    asset_id: item.type,
    filename: '',
    name: item.label,
    duration: SHAPE_DEFAULT_DUR,
    kind: 'shape',
    shape,
    type: item.type,
    label: item.label,
  })
}

export function drawShapeClip(ctx, clip, cw, ch, opts = {}) {
  const pose = clipPose(clip, opts.time ?? 0)
  const st = applyShapePose(normalizeShape(clip?.shape), pose)
  const box = { cx: st.x * cw, cy: st.y * ch, bw: st.w * cw, bh: st.h * ch, rotation: st.rotation }
  // «Dibujar trazo» (#14): cada línea o contorno se dibuja hasta la fracción
  // `draw` de su largo (todos a la vez) y el relleno aparece con la misma fracción.
  // En las barras de cine (#20) `draw` es cuánto han entrado las barras.
  const drawn = shapeDrawAt(clip, opts.time ?? 0)
  const letterbox = st.type === 'letterbox'
  const draw = letterbox ? 1 : drawn
  const geo = flipGeometry(shapeGeometry(st.type, letterbox ? { ...st, bar: st.bar * drawn } : st), clipFlip(clip))
  const sw = Math.max(0.75, (st.strokeWidth || 0) * (ch / 720))
  const pattern = dashPattern(st.dash, sw)
  ctx.save()
  ctx.globalAlpha *= st.opacity
  ctx.lineJoin = ARROW_TYPES.has(st.type) ? 'miter' : 'round'
  ctx.miterLimit = 8
  ctx.lineCap = ARROW_TYPES.has(st.type) && st.dash !== 'dot' ? 'butt' : 'round'
  ctx.lineWidth = sw
  ctx.strokeStyle = st.stroke
  if (pattern) ctx.setLineDash(pattern)
  const strokeLine = (pts, closed) => {
    if (draw >= 1) {
      ctx.beginPath()
      if (closed) pathFromRing(ctx, pts, box)
      else pts.forEach((pt, i) => { const [x, y] = mapShapePoint(pt, box); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
      ctx.stroke()
      return
    }
    const mapped = pts.map((pt) => mapShapePoint(pt, box))
    if (closed && mapped.length) mapped.push(mapped[0])
    const part = trimPolyline(mapped, draw)
    if (part.length < 2) return
    ctx.beginPath()
    part.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.stroke()
  }
  if (st.fill && st.fill !== 'none') {
    ctx.fillStyle = st.fill
    for (const ring of geo.fills) {
      if (st.strokeWidth > 0) strokeLine(ring, true)
      if (draw <= 0) continue
      const a = ctx.globalAlpha
      ctx.globalAlpha = a * draw
      ctx.beginPath()
      pathFromRing(ctx, ring, box)
      ctx.fill()
      ctx.globalAlpha = a
    }
  } else {
    for (const ring of geo.fills) strokeLine(ring, true)
  }
  for (const line of geo.strokes) strokeLine(line, false)
  ctx.setLineDash([])

  const hw = box.bw / 2
  const hh = box.bh / 2
  const corners = [
    mapShapePoint([0, 0], box),
    mapShapePoint([100, 0], box),
    mapShapePoint([0, 100], box),
    mapShapePoint([100, 100], box),
  ]
  const dest = { dx: box.cx - hw, dy: box.cy - hh, dw: box.bw, dh: box.bh, rotation: box.rotation }
  let handles = null
  if (opts.selected) {
    ctx.save()
    ctx.strokeStyle = 'rgba(120,190,255,0.95)'
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    corners.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    const hs = 5
    ctx.fillStyle = '#7cc4ff'
    const l = mapShapePoint([0, 50], box)
    const r = mapShapePoint([100, 50], box)
    const t = mapShapePoint([50, 0], box)
    const b = mapShapePoint([50, 100], box)
    const br = mapShapePoint([100, 100], box)
    const rot = mapShapePoint([50, -18], box)
    handles = { l: { x: l[0], y: l[1] }, r: { x: r[0], y: r[1] }, t: { x: t[0], y: t[1] }, b: { x: b[0], y: b[1] }, br: { x: br[0], y: br[1] }, rot: { x: rot[0], y: rot[1] } }
    for (const h of [l, r, t, b, br]) {
      ctx.fillRect(h[0] - hs, h[1] - hs, hs * 2, hs * 2)
    }
    ctx.beginPath()
    ctx.moveTo(t[0], t[1])
    ctx.lineTo(rot[0], rot[1])
    ctx.strokeStyle = '#7cc4ff'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(rot[0], rot[1], 6, 0, Math.PI * 2)
    ctx.fillStyle = '#7cc4ff'
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
  return { box: dest, handles, cx: box.cx, cy: box.cy }
}
