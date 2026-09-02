import assert from 'node:assert/strict'
import {
  alignOthers, alignThresholdSec, asAlignClip, nearestAlignTime,
  snapClipGroup, snapClipMove, snapClipTrim, timelineAlignHits,
} from './timelineAlign.js'

const v1 = { id: 'a', kind: 'video', track_id: 'V1', start: 0, in_point: 0, out_point: 10, speed: 1 }
const v2 = { id: 'b', kind: 'video', track_id: 'V2', start: 5, in_point: 0, out_point: 5, speed: 1 }
const same = { id: 'c', kind: 'video', track_id: 'V1', start: 10, in_point: 0, out_point: 2, speed: 1 }

assert.equal(asAlignClip(v1).end, 10)
assert.equal(asAlignClip(v2).end, 10)

const others = alignOthers([v1, v2, same], ['a'])
assert.equal(others.length, 2)
assert.deepEqual(
  timelineAlignHits([asAlignClip(v1)], others, 0.05),
  [10],
  'final de V1 con final de V2',
)

assert.deepEqual(
  timelineAlignHits([asAlignClip(v1)], [asAlignClip(same)], 0.05),
  [],
  'misma pista no cuenta',
)

assert.deepEqual(
  timelineAlignHits([asAlignClip({ ...v1, start: 0 })], [asAlignClip(v2)], 0.01),
  [10],
)

const far = asAlignClip({ ...v2, start: 20, in_point: 0, out_point: 5 })
assert.deepEqual(timelineAlignHits([asAlignClip(v1)], [far], 0.05), [])

const startHit = asAlignClip({ id: 'd', track_id: 'V2', start: 0, in_point: 0, out_point: 2 })
assert.deepEqual(timelineAlignHits([asAlignClip(v1)], [startHit], 0.01), [0])

assert.equal(nearestAlignTime(9.96, 'V1', [asAlignClip(v2)], 0.05), 10)
assert.equal(nearestAlignTime(8, 'V1', [asAlignClip(v2)], 0.05), null)

const moved = snapClipMove(
  { id: 'a', kind: 'video', track_id: 'V1', start: 5.04, in_point: 0, out_point: 5, speed: 1 },
  0,
  [asAlignClip(v2)],
  0.08,
  'V1',
)
assert.equal(moved.start, 5)
assert.deepEqual(moved.times, [5, 10])

const trimmed = snapClipTrim(
  { id: 't', kind: 'video', track_id: 'V1', start: 0, in_point: 0, out_point: 10, speed: 1, source_duration: 20 },
  'trim-right',
  0.03,
  [asAlignClip({ id: 'u', track_id: 'V2', start: 0, in_point: 0, out_point: 10, speed: 1 })],
  0.08,
)
assert.equal(trimmed.patch.out_point, 10)
assert.deepEqual(trimmed.times, [10])

const group = snapClipGroup(
  [{ id: 'g1', track_id: 'V1', start: 1.02, in_point: 0, out_point: 2, speed: 1 }],
  0,
  [asAlignClip({ id: 'g2', track_id: 'V2', start: 1, in_point: 0, out_point: 3, speed: 1 })],
  0.05,
)
assert.ok(Math.abs(group.deltaT - -0.02) < 1e-9)
assert.deepEqual(group.times, [1])

assert.ok(Math.abs(alignThresholdSec(80) - 0.1) < 1e-9)

console.log('timelineAlign ok')
