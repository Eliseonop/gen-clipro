import assert from 'node:assert/strict'
import {
  slotRect, outputRect, slotTargetAspect, invertSlots, splitLayer,
  layersFromInitial, addSecondLayer, applySlotPreset, complementSlot,
} from './composeModel.js'

assert.deepEqual(slotRect('top'), { x: 0, y: 0, w: 1, h: 0.5 })
assert.deepEqual(slotRect('bottom'), { x: 0, y: 0.5, w: 1, h: 0.5 })
assert.deepEqual(slotRect('left'), { x: 0, y: 0, w: 0.5, h: 1 })
assert.deepEqual(slotRect('overlay', 0), { x: 0, y: 0, w: 1, h: 1 })
assert.equal(slotRect('overlay', 1).w < 1, true)

assert.deepEqual(outputRect({ slot: 'top' }, 0, 1), { x: 0, y: 0, w: 1, h: 1 })
assert.deepEqual(outputRect({ slot: 'top' }, 0, 2), { x: 0, y: 0, w: 1, h: 0.5 })

const topBottomAspect = slotTargetAspect({ x: 0, y: 0, w: 1, h: 0.5 })
assert.ok(Math.abs(topBottomAspect - (9 / 8)) < 1e-9)

assert.equal(complementSlot('top'), 'bottom')

const dual = layersFromInitial('http://x', 10, 20, {
  dual_crop: true, split_orientation: 'vertical', zoom: 0.8, zoom2: 0.5,
  keyframes: [{ t: 0, cx: 0.4, cy: 0.5 }],
  keyframes2: [{ t: 0, cx: 0.6, cy: 0.5 }],
})
assert.equal(dual.length, 2)
assert.equal(dual[0].slot, 'top')
assert.equal(dual[1].slot, 'bottom')
assert.equal(dual[1].zoom, 0.5)

const swapped = invertSlots(dual)
assert.equal(swapped[0].slot, 'bottom')
assert.equal(swapped[1].slot, 'top')

const layer = { id: 'a', trimIn: 0, trimOut: 10, slot: 'full', url: 'u' }
assert.equal(splitLayer(layer, 0.1), null)
const parts = splitLayer(layer, 4)
assert.equal(parts[0].trimOut, 4)
assert.equal(parts[1].trimIn, 4)
assert.equal(parts[1].slot, 'bottom')

const stacked = addSecondLayer(
  [{ slot: 'full', url: 'a' }],
  { slot: 'full', url: 'b' },
)
assert.equal(stacked[0].slot, 'top')
assert.equal(stacked[1].slot, 'bottom')

const horiz = applySlotPreset(stacked, 'horizontal')
assert.equal(horiz[0].slot, 'left')
assert.equal(horiz[1].slot, 'right')

console.log('composeModel ok')
