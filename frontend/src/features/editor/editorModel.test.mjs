import assert from 'node:assert/strict'
import { makeClip, newReframe } from './editorModel.js'

const legacy = makeClip('clips', { index: 1, filename: 'a.mp4', end: 5, start: 0 }, 'V1', 0, 5)
assert.equal(legacy.reframe.dual_crop, false)
assert.equal(legacy.reframe.master, false)
assert.equal((legacy.reframe.keyframes || []).length, 0)

const master = makeClip('clips', {
  index: 2, filename: 'b.mp4', end: 8, start: 0,
  reframe: {
    master: true, dual_crop: true, split_layout: 'auto',
    keyframes: [{ t: 0, cx: 0.3, cy: 0.5, zoom: 1 }],
    keyframes2: [{ t: 0, cx: 0.7, cy: 0.5, zoom: 0.5 }],
  },
}, 'V1', 0, 8)
assert.equal(master.reframe.master, true)
assert.equal(master.reframe.dual_crop, true)
assert.equal(master.reframe.keyframes[0].cx, 0.3)
assert.ok(master.reframe.keyframes[0].id)
assert.equal(newReframe().split_layout, 'auto')

console.log('makeClip reframe copy ok')
