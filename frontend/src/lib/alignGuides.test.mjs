import assert from 'node:assert/strict'
import { canvasAlignTargets, snapAlign, textAlignTargets } from './alignGuides.js'

const canvas = canvasAlignTargets([])
assert.deepEqual(canvas.xs, [0.5])
assert.deepEqual(canvas.ys, [0.5])

const withOther = canvasAlignTargets([{ x: 0.3, y: 0.8, w: 0.4 }])
assert.ok(withOther.xs.includes(0.5))
assert.ok(withOther.xs.includes(0.3))
assert.ok(withOther.xs.includes(0.1))
assert.ok(withOther.xs.includes(0.5) && withOther.xs.includes(0.3 + 0.2))
assert.ok(withOther.ys.includes(0.8))

const near = snapAlign(0.51, 0.49, canvasAlignTargets([]), 0.02)
assert.equal(near.x, 0.5)
assert.equal(near.y, 0.5)
assert.deepEqual(near.guides.v, [0.5])
assert.deepEqual(near.guides.h, [0.5])

const far = snapAlign(0.2, 0.2, canvasAlignTargets([]), 0.02)
assert.equal(far.x, 0.2)
assert.equal(far.y, 0.2)
assert.deepEqual(far.guides.v, [])
assert.deepEqual(far.guides.h, [])

const clips = [
  { id: 'a', kind: 'text', track_id: 'T1', start: 0, in_point: 0, out_point: 2, style: { x: 0.5, y: 0.2, w: 0.4 } },
  { id: 'b', kind: 'text', track_id: 'T1', start: 0, in_point: 0, out_point: 2, style: { x: 0.7, y: 0.2, w: 0.2 } },
  { id: 'c', kind: 'text', track_id: 'T1', start: 10, in_point: 0, out_point: 1, style: { x: 0.1, y: 0.1, w: 0.2 } },
]
const t = textAlignTargets(clips, [{ id: 'T1', kind: 'text' }], 0.5, 'a')
assert.ok(t.xs.includes(0.7))
assert.ok(!t.xs.includes(0.1))

console.log('alignGuides ok')
