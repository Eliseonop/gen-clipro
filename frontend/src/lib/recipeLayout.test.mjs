import assert from 'node:assert/strict'
import { splitOrientationFor, syncedDualSlots, isMasterReframe, containDest } from './recipeLayout.js'
import { frameAt } from './panning.js'

assert.equal(splitOrientationFor(9 / 16, { split_layout: 'auto' }), 'vertical')
assert.equal(splitOrientationFor(16 / 9, { split_layout: 'auto' }), 'horizontal')
assert.equal(splitOrientationFor(9 / 16, { split_layout: 'horizontal' }), 'horizontal')
assert.equal(splitOrientationFor(16 / 9, { split_orientation: 'vertical' }), 'vertical')

assert.deepEqual(syncedDualSlots(9 / 16, { split_layout: 'auto' }), ['top', 'bottom'])
assert.deepEqual(syncedDualSlots(16 / 9, { split_layout: 'auto' }), ['left', 'right'])

assert.equal(isMasterReframe({ master: true }), true)
assert.equal(isMasterReframe({}), false)
assert.equal(isMasterReframe(null), false)

const box = containDest(720, 1280, 1920, 1080)
assert.ok(box.dw <= 720 + 1e-6)
assert.ok(box.dh <= 1280 + 1e-6)
assert.ok(Math.abs(box.dw / box.dh - 1920 / 1080) < 1e-6)

const kfs = [
  { t: 0, cx: 0.2, cy: 0.5, zoom: 1, pan_mode: 'smooth', fit: 'contain' },
  { t: 2, cx: 0.8, cy: 0.5, zoom: 0.5, pan_mode: 'smooth', fit: 'cover' },
]
assert.equal(frameAt(kfs, 0).fit, 'contain')
assert.equal(frameAt(kfs, 0.5).fit, 'cover')
assert.equal(frameAt(kfs, 1.5).fit, 'cover')
assert.equal(frameAt([], 0).fit, 'cover')

const held = [
  { t: 0, cx: 0.2, cy: 0.5, zoom: 1, pan_mode: 'smooth', fit: 'contain' },
  { t: 2, cx: 0.8, cy: 0.5, zoom: 0.5, pan_mode: 'direct', fit: 'cover' },
]
assert.equal(frameAt(held, 1).fit, 'contain')

console.log('recipeLayout ok')
