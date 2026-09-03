import assert from 'node:assert/strict'
import {
  easeT, interpItems, enableKeyframes, upsertKeyframeAt, clipPropsAt, keyframesOn,
  deleteKeyframeItem, normalizeInterp, keyframeIdAt,
} from './clipKeyframes.js'

assert.equal(normalizeInterp('direct'), 'hold')
assert.equal(easeT(0.5, 'linear'), 0.5)
assert.ok(easeT(0.5, 'ease-in') < 0.5)
assert.ok(easeT(0.5, 'ease-out') > 0.5)
assert.equal(easeT(0.3, 'hold'), 0)

const clip = {
  kind: 'shape',
  start: 0,
  shape: { x: 0.2, y: 0.4, rotation: 0, opacity: 1 },
}
const on = enableKeyframes(clip, 0)
assert.equal(on.keyframes.enabled, true)
assert.equal(on.keyframes.items.length, 1)
assert.ok(Math.abs(on.keyframes.items[0].props.x - 0.2) < 1e-9)

const two = upsertKeyframeAt(on, 2, { x: 0.8, y: 0.4 }, 'ease-in-out')
assert.equal(two.keyframes.items.length, 2)
const mid = clipPropsAt(two, 1)
assert.ok(Math.abs(mid.x - 0.5) < 1e-9)

const hold = upsertKeyframeAt(on, 2, { x: 0.8 }, 'hold')
assert.equal(clipPropsAt(hold, 1).x, 0.2)
assert.ok(Math.abs(clipPropsAt(hold, 2).x - 0.8) < 1e-9)

const same = upsertKeyframeAt(two, 2 + 1 / 120, { x: 0.9 }, undefined, 30)
assert.equal(same.keyframes.items.length, 2)
assert.ok(Math.abs(same.keyframes.items[1].props.x - 0.9) < 1e-9)

const nextFrame = upsertKeyframeAt(two, 2 + 1 / 30, { x: 0.1 }, undefined, 30)
assert.equal(nextFrame.keyframes.items.length, 3)

assert.equal(keyframeIdAt(two, 2, 30), two.keyframes.items[1].id)
assert.equal(keyframeIdAt(two, 2 + 1 / 120, 30), two.keyframes.items[1].id)
assert.equal(keyframeIdAt(two, 0, 30), two.keyframes.items[0].id)

assert.equal(keyframesOn(clip), false)
assert.equal(keyframesOn(two), true)

const gone = deleteKeyframeItem(two, two.keyframes.items[1].id)
assert.equal(gone.keyframes.items.length, 1)

const cropA = enableKeyframes({
  kind: 'video',
  in_point: 0,
  reframe: { zoom: 0.5, keyframes: [{ t: 0, cx: 0.2, cy: 0.3, zoom: 0.5 }] },
}, 0, 0)
const cropB = upsertKeyframeAt(cropA, 2, { cx: 0.8, cy: 0.3, zoom: 1 })
const cropMid = clipPropsAt(cropB, 1)
assert.ok(Math.abs(cropMid.cx - 0.5) < 1e-9)
assert.ok(Math.abs(cropMid.zoom - 0.75) < 1e-9)

const items = [
  { t: 0, interpolation: 'linear', props: { x: 0, scale: 1, y: 0, rotation: 0, opacity: 1, cx: 0.5, cy: 0.5, zoom: 1 } },
  { t: 1, interpolation: 'ease-in', props: { x: 1, scale: 1, y: 0, rotation: 0, opacity: 1, cx: 0.5, cy: 0.5, zoom: 1 } },
]
const e = interpItems(items, 0.5, items[0].props)
assert.ok(e.x < 0.5)

assert.equal(clipPropsAt({ kind: 'image', opacity: null }, 0).opacity, 1)
assert.equal(clipPropsAt({ kind: 'image', opacity: 0.4 }, 0).opacity, 0.4)

console.log('clipKeyframes ok')
