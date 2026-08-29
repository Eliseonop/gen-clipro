import assert from 'node:assert/strict'
import {
  slotRect, outputRect, slotTargetAspect, invertSlots, splitLayer,
  layersFromInitial, addSecondLayer, applySlotPreset, complementSlot,
  cutLayerAt, isSequentialLayout, compositionDuration, layerDelay, layerDuration,
  makeLayer, addSplitTrack, recipeFromLayers, isSyncedDual, previewDest, recipeForFile,
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

const cutSrc = { id: 'a', trimIn: 0, trimOut: 10, slot: 'full', url: 'u', keyframes: [{ t: 2, cx: 0.4, cy: 0.5 }] }
assert.equal(cutLayerAt(cutSrc, 0.1), null)
const cut = cutLayerAt(cutSrc, 4)
assert.equal(cut[0].trimOut, 4)
assert.equal(cut[1].trimIn, 4)
assert.equal(cut[0].slot, 'full')
assert.equal(cut[1].slot, 'full')
assert.equal(isSequentialLayout(cut), true)
assert.equal(compositionDuration(cut), 10)
assert.equal(layerDelay(cut, 0), 0)
assert.equal(layerDelay(cut, 1), 4)
assert.equal(layerDuration(cut[0]), 4)

const parallel = [
  { trimIn: 0, trimOut: 8, slot: 'top' },
  { trimIn: 0, trimOut: 5, slot: 'bottom' },
]
assert.equal(isSequentialLayout(parallel), false)
assert.equal(compositionDuration(parallel), 8)
assert.equal(layerDelay(parallel, 1), 0)

console.log('composeModel cut ok')

const one = [makeLayer({ id: 1, url: 'http://x', trimIn: 0, trimOut: 8, keyframes: [{ t: 1, cx: 0.4, cy: 0.5, zoom: 0.7, fit: 'cover' }] })]
assert.equal(addSplitTrack([one[0], { ...one[0], id: 2 }]), null)
const split = addSplitTrack(one)
assert.equal(split.length, 2)
assert.equal(split[0].url, split[1].url)
assert.equal(split[0].trimOut, 8)
assert.equal(split[1].trimOut, 8)
assert.equal(split[0].keyframes[0].cx, 0.4)
assert.equal(split[1].keyframes[0].cx, 0.4)
assert.notEqual(split[1].id, split[0].id)
assert.equal(isSyncedDual(split), true)
assert.equal(isSyncedDual(cut), false)

const rf = recipeFromLayers(split)
assert.equal(rf.master, true)
assert.equal(rf.dual_crop, true)
assert.equal(rf.split_layout, 'auto')
assert.equal(rf.keyframes2[0].cx, 0.4)

const singleRf = recipeFromLayers(one)
assert.equal(singleRf.dual_crop, false)
assert.equal(singleRf.master, true)
assert.equal((singleRf.keyframes2 || []).length, 0)

const trimmed = [makeLayer({
  id: 3, url: 'http://x', trimIn: 2, trimOut: 8,
  keyframes: [{ t: 3, cx: 0.4, cy: 0.5, zoom: 0.7, fit: 'cover' }],
})]
const fileRf = recipeForFile(trimmed)
assert.equal(fileRf.keyframes[0].t, 1)
assert.equal(fileRf.master, true)

console.log('composeModel split track ok')

assert.deepEqual(
  previewDest({ slot: 'top' }, 0, 2, { syncedDual: true, outAspect: 16 / 9 }),
  { x: 0, y: 0, w: 0.5, h: 1 },
)
assert.deepEqual(
  previewDest({ slot: 'top' }, 1, 2, { syncedDual: true, outAspect: 16 / 9 }),
  { x: 0.5, y: 0, w: 0.5, h: 1 },
)
assert.deepEqual(
  previewDest({ slot: 'top' }, 0, 2, { syncedDual: true, outAspect: 9 / 16 }),
  { x: 0, y: 0, w: 1, h: 0.5 },
)
assert.deepEqual(previewDest({ slot: 'top' }, 0, 2, {}), { x: 0, y: 0, w: 1, h: 0.5 })
assert.deepEqual(previewDest({ slot: 'bottom' }, 0, 2, { solo: true }), { x: 0, y: 0, w: 1, h: 1 })

console.log('composeModel previewDest ok')
