// Voltear (#7): mismo espejo que el export (backend/tests/test_clip_flip.py).
import assert from 'node:assert/strict'
import { clipFlip } from './clipAnim.js'
import { flipGeometry } from './shapes.js'

assert.deepEqual(clipFlip({}), { h: false, v: false })
assert.deepEqual(clipFlip({ flip_v: true }), { h: false, v: true })
assert.deepEqual(clipFlip(null), { h: false, v: false })

const geo = { fills: [[[10, 20], [90, 20], [50, 80]]], strokes: [[[0, 0], [100, 50]]] }
assert.equal(flipGeometry(geo, { h: false, v: false }), geo)
assert.deepEqual(flipGeometry(geo, { h: true, v: false }).fills[0], [[90, 20], [10, 20], [50, 80]])
assert.deepEqual(flipGeometry(geo, { h: false, v: true }).strokes[0], [[0, 100], [100, 50]])

console.log('clipFlip ok')
