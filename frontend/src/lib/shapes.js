// Figuras vectoriales parametrizables (no PNG).
// La geometría vive en un viewBox 0–100; x/y/w/h del clip son fracciones del canvas.
import { applyShapePose, clipPose } from './clipAnim.js'

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

function qbez(p0, p1, p2, n = 28) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ])
  }
  return pts
}

function normals(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    return [-dy / len, dx / len]
  })
}

function thickPoly(pts, half) {
  const nrm = normals(pts)
  const left = pts.map((p, i) => [p[0] + nrm[i][0] * half, p[1] + nrm[i][1] * half])
  const right = pts.map((p, i) => [p[0] - nrm[i][0] * half, p[1] - nrm[i][1] * half]).reverse()
  return left.concat(right)
}

function neckAndShaft(pts, headLen) {
  const tip = pts[pts.length - 1]
  let acc = 0
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1]
    const b = pts[i]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (acc + d >= headLen) {
      const t = (headLen - acc) / (d || 1)
      const neck = [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t]
      return { shaft: pts.slice(0, i).concat([neck]), neck, tip }
    }
    acc += d
  }
  return { shaft: pts.slice(0, -1), neck: pts[Math.max(0, pts.length - 2)], tip }
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
  return base
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
  const geo = shapeGeometry(st.type, st)
  const sw = Math.max(0.75, (st.strokeWidth || 0) * (ch / 720))
  ctx.save()
  ctx.globalAlpha *= st.opacity
  ctx.lineJoin = ARROW_TYPES.has(st.type) ? 'miter' : 'round'
  ctx.miterLimit = 8
  ctx.lineCap = ARROW_TYPES.has(st.type) ? 'butt' : 'round'
  ctx.lineWidth = sw
  ctx.strokeStyle = st.stroke
  if (st.fill && st.fill !== 'none') {
    ctx.fillStyle = st.fill
    for (const ring of geo.fills) {
      ctx.beginPath()
      pathFromRing(ctx, ring, box)
      if (st.strokeWidth > 0) ctx.stroke()
      ctx.fill()
    }
  } else {
    for (const ring of geo.fills) {
      ctx.beginPath()
      pathFromRing(ctx, ring, box)
      ctx.stroke()
    }
  }
  for (const line of geo.strokes) {
    ctx.beginPath()
    line.forEach((pt, i) => {
      const [x, y] = mapShapePoint(pt, box)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }

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
