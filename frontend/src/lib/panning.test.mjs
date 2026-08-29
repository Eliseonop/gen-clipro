import assert from 'node:assert/strict'
import { frameAt, posAt, zoomFromCorner, isNearCropCorner, sourceDrawRect } from './panning.js'

const kfs = [
  { t: 0, cx: 0.2, cy: 0.5, zoom: 1, pan_mode: 'smooth' },
  { t: 2, cx: 0.8, cy: 0.5, zoom: 0.5, pan_mode: 'smooth' },
  { t: 4, cx: 0.8, cy: 0.2, zoom: 0.5, pan_mode: 'direct' },
]

const mid = frameAt(kfs, 1)
assert.ok(Math.abs(mid.cx - 0.5) < 1e-9)
assert.ok(Math.abs(mid.zoom - 0.75) < 1e-9)

const hold = frameAt(kfs, 3)
assert.ok(Math.abs(hold.cx - 0.8) < 1e-9)
assert.ok(Math.abs(hold.zoom - 0.5) < 1e-9)
assert.equal(hold.pan_mode, 'direct')

const snap = frameAt(kfs, 4)
assert.ok(Math.abs(snap.cy - 0.2) < 1e-9)

const legacy = posAt([{ t: 0, cx: 0.1, cy: 0.5 }, { t: 2, cx: 0.9, cy: 0.5 }], 1, 'smooth')
assert.ok(Math.abs(legacy.cx - 0.5) < 1e-9)

const empty = frameAt([], 1, 0.8, 'direct')
assert.equal(empty.zoom, 0.8)
assert.equal(empty.cx, 0.5)
assert.equal(empty.fit, 'cover')
assert.equal(mid.fit, 'cover')

const z = zoomFromCorner(0.5, 0.25, 0.5, 0.5, 16 / 9, 9 / 16)
assert.ok(z > 0.35 && z <= 1)

const rect = { width: 400, height: 225 }
assert.equal(isNearCropCorner(0.2, 0.2, 0.5, 0.5, 0.6, 0.6, rect), true)
assert.equal(isNearCropCorner(0.5, 0.5, 0.5, 0.5, 0.6, 0.6, rect), false)

const contain = sourceDrawRect(
  { cx: 0.2, cy: 0.2, zoom: 0.4, fit: 'contain' },
  1920, 1080,
  { dx: 0, dy: 0, dw: 720, dh: 1280 },
  9 / 16,
)
assert.equal(contain.sx, 0)
assert.equal(contain.sy, 0)
assert.equal(contain.sw, 1920)
assert.equal(contain.sh, 1080)
assert.ok(contain.dw <= 720 + 1e-6)
assert.ok(Math.abs(contain.dw / contain.dh - 1920 / 1080) < 1e-6)

const cover = sourceDrawRect(
  { cx: 0.5, cy: 0.5, zoom: 1, fit: 'cover' },
  1920, 1080,
  { dx: 0, dy: 0, dw: 720, dh: 1280 },
  9 / 16,
)
assert.ok(cover.sh > 1070)
assert.ok(cover.sw < 1920)
assert.equal(cover.dx, 0)
assert.equal(cover.dw, 720)

console.log('panning frameAt ok')
