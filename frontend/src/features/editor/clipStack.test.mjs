import assert from 'node:assert/strict'
import {
  clipsOverlap, fullyCovers, hidesUnder, overlapClusters,
  frontClipId, peekClipIds, packClusterLanes, resolveExpandedClusterId,
  STACK_PAD, STACK_STEP,
  trackLaneHeight, clusterSpan, stackViewForTrack,
} from './clipStack.js'

function clip(id, trackId, start, dur) {
  return { id, track_id: trackId, start, in_point: 0, out_point: dur }
}

assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4)), true)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 2, 5)), true)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 1, 2)), true)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 10, 5)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 12, 8)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V2', 3, 4)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 0), clip('b', 'V1', 0, 5)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('a', 'V1', 0, 10)), false)

assert.equal(fullyCovers(clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4)), true)
assert.equal(fullyCovers(clip('a', 'V1', 0, 10), clip('b', 'V1', 0, 10)), true)
assert.equal(fullyCovers(clip('a', 'V1', 0, 10), clip('b', 'V1', 8, 4)), false)
assert.equal(fullyCovers(clip('a', 'V1', 0, 10), clip('b', 'V1', 12, 8)), false)
assert.equal(fullyCovers(clip('a', 'V1', 0, 10), clip('b', 'V2', 3, 4)), false)
assert.equal(fullyCovers(clip('a', 'V1', 0, 10), clip('a', 'V1', 0, 10)), false)

const wideOnTop = [clip('b', 'V1', 3, 4), clip('a', 'V1', 0, 10)]
assert.equal(hidesUnder(clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4), wideOnTop), true)
const smallOnTop = [clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4)]
assert.equal(hidesUnder(clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4), smallOnTop), false)
assert.equal(hidesUnder(clip('a', 'V1', 0, 10), clip('b', 'V1', 0, 10), [clip('b', 'V1', 0, 10), clip('a', 'V1', 0, 10)]), true)
assert.equal(hidesUnder(clip('b', 'V1', 0, 10), clip('a', 'V1', 0, 10), [clip('b', 'V1', 0, 10), clip('a', 'V1', 0, 10)]), false)

const almostOnTop = [clip('q', 'V1', 2, 10), clip('p', 'V1', 0, 10)]
assert.equal(hidesUnder(clip('p', 'V1', 0, 10), clip('q', 'V1', 2, 10), almostOnTop), true)
const shyOverlap = [clip('q', 'V1', 2.2, 10), clip('p', 'V1', 0, 10)]
assert.equal(hidesUnder(clip('p', 'V1', 0, 10), clip('q', 'V1', 2.2, 10), shyOverlap), false)

const row = [
  clip('b', 'V1', 3, 4),
  clip('a', 'V1', 0, 10),
  clip('c', 'V1', 8, 4),
  clip('e', 'V1', 22, 3),
  clip('d', 'V1', 20, 5),
  clip('f', 'V2', 0, 30),
]
const v1 = overlapClusters(row, 'V1')
assert.equal(v1.length, 2)
assert.deepEqual(v1[0].clipIds.slice().sort(), ['a', 'b'])
assert.equal(v1[0].id, ['a', 'b'].sort().join('|'))
assert.deepEqual(v1[1].clipIds.slice().sort(), ['d', 'e'])
assert.equal(overlapClusters(row, 'V2').length, 0)
assert.equal(overlapClusters([], 'V1').length, 0)
assert.equal(overlapClusters(smallOnTop, 'V1').length, 0)
assert.equal(overlapClusters([clip('a', 'V1', 0, 10), clip('b', 'V1', 0, 10)], 'V1').length, 1)

const partialOnly = [clip('p', 'V1', 0, 10), clip('q', 'V1', 8, 4)]
assert.equal(overlapClusters(partialOnly, 'V1').length, 0)

console.log('clipStack overlap ok')

const ordered = [clip('b', 'V1', 3, 4), clip('c', 'V1', 5, 3), clip('a', 'V1', 0, 10)]
assert.equal(frontClipId(['a', 'b', 'c'], ordered, []), 'a')
assert.equal(frontClipId(['a', 'b', 'c'], ordered, ['b']), 'a')
assert.equal(frontClipId([], ordered, []), null)

assert.deepEqual(peekClipIds(['a', 'b', 'c'], ordered, 'a'), ['b', 'c'])

const packedTwo = packClusterLanes([clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4)])
assert.equal(packedTwo.size, 2)
assert.notEqual(packedTwo.get('a'), packedTwo.get('b'))

const packedTouching = packClusterLanes([clip('a', 'V1', 0, 5), clip('b', 'V1', 5, 4)])
assert.equal(packedTouching.get('a'), packedTouching.get('b'))

const A = clip('a', 'V1', 0, 5)
const B = clip('b', 'V1', 4, 4)
const C = clip('c', 'V1', 7, 5)
const packed = packClusterLanes([A, B, C])
assert.equal(Math.max(...packed.values()) + 1, 2)
assert.equal(packed.get('a'), packed.get('c'))
assert.notEqual(packed.get('a'), packed.get('b'))

const clusters = [
  { id: 'a|b', clipIds: ['a', 'b'] },
  { id: 'c|d', clipIds: ['c', 'd'] },
]
assert.equal(resolveExpandedClusterId('a|b', clusters), 'a|b')
assert.equal(resolveExpandedClusterId('a|b', [
  { id: 'a|b|x', clipIds: ['a', 'b', 'x'] },
]), 'a|b|x')
const grownClusterId = resolveExpandedClusterId('a|b', [
  { id: 'a|b|x', clipIds: ['a', 'b', 'x'] },
])
assert.equal(resolveExpandedClusterId(grownClusterId, [
  { id: 'b|x', clipIds: ['b', 'x'] },
]), 'b|x')
assert.equal(resolveExpandedClusterId('a|b|x', [
  { id: 'a|b', clipIds: ['a', 'b'] },
]), 'a|b')
assert.equal(resolveExpandedClusterId('a|b', [
  { id: 'c|d', clipIds: ['c', 'd'] },
]), null)

console.log('clipStack pack/front ok')

assert.equal(trackLaneHeight(52, 0), 52)
assert.equal(trackLaneHeight(52, 1), 52 + STACK_STEP)
assert.ok(STACK_STEP >= 10 && STACK_STEP <= 20)

const span = clusterSpan(['a', 'b'], [clip('b', 'V1', 3, 4), clip('a', 'V1', 0, 10)])
assert.equal(span.start, 0)
assert.equal(span.end, 10)

const rowH = 52
const clipH = rowH - 2 * STACK_PAD
const clips = [clip('b', 'V1', 3, 4), clip('a', 'V1', 0, 10), clip('z', 'V1', 20, 2)]
const stair = stackViewForTrack(clips, 'V1', [], null, rowH)
assert.equal(stair.height, rowH + STACK_STEP)
assert.equal(stair.layouts.get('z').variant, 'solo')
assert.equal(stair.layouts.get('a').variant, 'front')
assert.equal(stair.layouts.get('b').variant, 'step')
assert.equal(stair.layouts.get('a').height, clipH)
assert.equal(stair.layouts.get('b').height, clipH)
assert.equal(stair.layouts.get('z').height, clipH)
assert.equal(stair.layouts.get('a').top, STACK_PAD)
assert.equal(stair.layouts.get('b').top, STACK_PAD + STACK_STEP)
assert.equal(stair.layouts.get('z').top, STACK_PAD)
assert.equal(stair.toggle, null)

const noStair = stackViewForTrack(smallOnTop, 'V1', [], null, rowH)
assert.equal(noStair.height, 52)
assert.equal(noStair.layouts.get('a').variant, 'solo')
assert.equal(noStair.layouts.get('b').variant, 'solo')
assert.equal(noStair.layouts.get('a').height, clipH)
assert.equal(noStair.layouts.get('b').height, clipH)

const sameRange = [clip('b', 'V1', 10, 2), clip('a', 'V1', 10, 2)]
const sameStair = stackViewForTrack(sameRange, 'V1', [], null, rowH)
assert.equal(sameStair.height, rowH + STACK_STEP)
assert.equal(sameStair.layouts.get('a').variant, 'front')
assert.equal(sameStair.layouts.get('b').variant, 'step')
assert.equal(sameStair.layouts.get('b').top, STACK_PAD + STACK_STEP)

const eighty = stackViewForTrack(almostOnTop, 'V1', [], null, rowH)
assert.equal(eighty.layouts.get('p').variant, 'front')
assert.equal(eighty.layouts.get('q').variant, 'step')

console.log('clipStack layout ok')
