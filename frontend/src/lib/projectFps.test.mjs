import assert from 'node:assert/strict'
import { kfSnap, normalizeFps, snapToFrame, frameDuration } from './projectFps.js'

assert.equal(normalizeFps(30), 30)
assert.equal(normalizeFps(60), 60)
assert.equal(normalizeFps(20), 30)
assert.equal(normalizeFps(null), 30)

assert.ok(Math.abs(frameDuration(30) - 1 / 30) < 1e-12)
assert.ok(Math.abs(kfSnap(30) - 1 / 60) < 1e-12)
assert.ok(Math.abs(kfSnap(60) - 1 / 120) < 1e-12)

assert.equal(snapToFrame(0, 30), 0)
assert.ok(Math.abs(snapToFrame(1 / 30, 30) - 1 / 30) < 1e-12)
assert.equal(snapToFrame(1 / 120, 30), 0)
assert.ok(Math.abs(snapToFrame(1 / 30 + 1 / 120, 30) - 1 / 30) < 1e-9)

console.log('projectFps ok')
