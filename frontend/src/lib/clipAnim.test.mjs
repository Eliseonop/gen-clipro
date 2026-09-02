import assert from 'node:assert/strict'
import {
  interpTrack, clipPose, posedTransform, applyShapePose, staticPose, normalizeTrack,
} from './clipAnim.js'

assert.equal(interpTrack([], 1, 0.4), 0.4)
assert.equal(interpTrack(null, 1, 0.4), 0.4)

const track = [
  { t: 0, v: 0.2, ease: 'smooth' },
  { t: 2, v: 0.8, ease: 'smooth' },
  { t: 4, v: 0.1, ease: 'direct' },
]
assert.equal(interpTrack(track, -1, 0), 0.2)
assert.ok(Math.abs(interpTrack(track, 1, 0) - 0.5) < 1e-9)
assert.equal(interpTrack(track, 2, 0), 0.8)
assert.equal(interpTrack(track, 3, 0), 0.8)
assert.equal(interpTrack(track, 4, 0), 0.1)
assert.equal(interpTrack(track, 9, 0), 0.1)
assert.equal(normalizeTrack([{ t: 'x', v: 1 }, { t: 1, v: 2 }]).length, 1)

const shape = {
  kind: 'shape',
  shape: { x: 0.4, y: 0.6, w: 0.2, h: 0.1, rotation: 10, opacity: 1 },
}
assert.deepEqual(staticPose(shape), { x: 0.4, y: 0.6, scale: 1, rotation: 10, opacity: 1 })
assert.equal(clipPose(shape, 0).x, 0.4)

const moving = {
  ...shape,
  anim: { x: [{ t: 0, v: 0.2 }, { t: 2, v: 0.8 }] },
}
assert.ok(Math.abs(clipPose(moving, 1).x - 0.5) < 1e-9)
assert.equal(clipPose(moving, 1).y, 0.6)

const overlay = {
  kind: 'image',
  layout: 'overlay',
  transform: { x: 0.5, y: 0.5, scale: 2, rotation: 0 },
  anim: {
    scale: [{ t: 0, v: 1 }, { t: 1, v: 3 }],
    opacity: [{ t: 0, v: 0 }, { t: 1, v: 1 }],
  },
}
const mid = clipPose(overlay, 0.5)
assert.ok(Math.abs(mid.scale - 2) < 1e-9)
assert.ok(Math.abs(mid.opacity - 0.5) < 1e-9)
assert.equal(posedTransform(overlay, 0.5).x, 0.5)

const posed = applyShapePose(shape.shape, clipPose(moving, 1))
assert.ok(Math.abs(posed.x - 0.5) < 1e-9)
assert.equal(posed.w, 0.2)
assert.equal(posed.h, 0.1)

const scaled = applyShapePose(shape.shape, { x: 0.4, y: 0.6, scale: 2, rotation: 10, opacity: 0.5 })
assert.equal(scaled.w, 0.4)
assert.equal(scaled.h, 0.2)
assert.equal(scaled.opacity, 0.5)

const scaledKf = {
  ...shape,
  keyframes: {
    enabled: true,
    items: [
      { t: 0, interpolation: 'linear', props: { x: 0.4, y: 0.6, scale: 1, rotation: 10, opacity: 1 } },
      { t: 2, interpolation: 'linear', props: { x: 0.4, y: 0.6, scale: 2, rotation: 10, opacity: 1 } },
    ],
  },
}
assert.ok(Math.abs(clipPose(scaledKf, 1).scale - 1.5) < 1e-9)
assert.equal(clipPose({ ...shape, keyframes: { enabled: false, items: scaledKf.keyframes.items } }, 0).scale, 1)

console.log('clipAnim interp ok')
