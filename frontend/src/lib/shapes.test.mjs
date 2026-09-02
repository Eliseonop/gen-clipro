import assert from 'node:assert/strict'
import {
  SHAPE_CATALOG, SHAPE_DEFAULT_DUR, defaultShape, normalizeShape, shapeGeometry,
  shapeBox, mapShapePoint, polyToSvg, dragShapePayload, shapeNeedsFill,
} from './shapes.js'

assert.equal(SHAPE_DEFAULT_DUR, 5)
assert.ok(SHAPE_CATALOG.every((c) => c.items.length))
const types = SHAPE_CATALOG.flatMap((c) => c.items.map((i) => i.type))
assert.ok(types.includes('arrow'))
assert.ok(types.includes('speech'))

const arrow = defaultShape('arrow')
assert.equal(arrow.type, 'arrow')
assert.equal(arrow.fill, '#e53935')
assert.ok(arrow.w > 0.2)

const geo = shapeGeometry('arrow', arrow)
assert.ok(geo.fills[0].length >= 7)
assert.equal(shapeNeedsFill('line'), false)
assert.equal(shapeNeedsFill('rect'), true)

const curve = shapeGeometry('arrow_curve', defaultShape('arrow_curve'))
assert.equal(curve.fills.length, 1)
assert.equal(curve.strokes.length, 0)
const ring = curve.fills[0]
const tip = ring.reduce((a, p) => (p[0] > a[0] ? p : a), ring[0])
const sameTip = ring.filter((p) => Math.abs(p[0] - tip[0]) < 0.2 && Math.abs(p[1] - tip[1]) < 0.2)
assert.equal(sameTip.length, 1)
assert.ok(tip[0] > 80)
const tipI = ring.findIndex((p) => Math.abs(p[0] - tip[0]) < 0.2 && Math.abs(p[1] - tip[1]) < 0.2)
const wingA = ring[(tipI + ring.length - 1) % ring.length]
const wingB = ring[(tipI + 1) % ring.length]
assert.ok(Math.hypot(wingA[0] - wingB[0], wingA[1] - wingB[1]) > 22)
const nearTip = ring.filter((p) => Math.hypot(p[0] - tip[0], p[1] - tip[1]) < 10)
assert.equal(nearTip.length, 1)
const lineDist = (p, a, b) => {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const L = Math.hypot(vx, vy) || 1
  return Math.abs((p[0] - a[0]) * vy - (p[1] - a[1]) * vx) / L
}
const baseA = ring[(tipI + ring.length - 2) % ring.length]
const baseB = ring[(tipI + 2) % ring.length]
assert.ok(lineDist(baseA, wingA, wingB) < 1.2)
assert.ok(lineDist(baseB, wingA, wingB) < 1.2)
const neckW = Math.hypot(baseA[0] - baseB[0], baseA[1] - baseB[1])
const tailW = Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1])
assert.ok(Math.abs(neckW - tailW) < 1.6)
assert.ok(Math.abs(neckW - 10) < 1.2)

const line = normalizeShape({ type: 'line', x: 2, w: 0.01, opacity: 3 })
assert.equal(line.x, 1)
assert.equal(line.w, 0.04)
assert.equal(line.opacity, 1)

const box = shapeBox({ type: 'rect', x: 0.5, y: 0.5, w: 0.4, h: 0.2, rotation: 0 }, 200, 400)
assert.equal(box.cx, 100)
assert.equal(box.cy, 200)
assert.equal(box.bw, 80)
const mid = mapShapePoint([50, 50], box)
assert.equal(Math.round(mid[0]), 100)
assert.equal(Math.round(mid[1]), 200)

assert.ok(polyToSvg([[0, 0], [10, 0], [10, 10]]).endsWith('Z'))
const payload = JSON.parse(dragShapePayload({ type: 'heart', label: 'Corazón' }))
assert.equal(payload.kind, 'shape')
assert.equal(payload.shape.type, 'heart')

for (const type of types) {
  const g = shapeGeometry(type, defaultShape(type))
  assert.ok(g.fills.length + g.strokes.length > 0, type)
}
console.log('shapes ok')
