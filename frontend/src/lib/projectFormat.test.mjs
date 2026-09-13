import assert from 'node:assert/strict'
import {
  aspectOf, evenDim, resolutionOf, sizeForRatio, withAspect, withMediaAspect, withResolution,
} from './projectFormat.js'

// Presets: los tamaños históricos siguen resolviendo igual.
assert.deepEqual(sizeForRatio(9, 16, 720), { w: 720, h: 1280 })
assert.deepEqual(sizeForRatio(16, 9, 720), { w: 1280, h: 720 })
assert.deepEqual(sizeForRatio(1, 1, 1080), { w: 1080, h: 1080 })
assert.deepEqual(sizeForRatio(4, 3, 720), { w: 960, h: 720 })
assert.deepEqual(sizeForRatio(3, 4, 1080), { w: 1080, h: 1440 })
assert.deepEqual(sizeForRatio(4, 5, 1080), { w: 1080, h: 1350 })
assert.deepEqual(sizeForRatio(16, 9, 480), { w: 854, h: 480 })
assert.deepEqual(sizeForRatio(9, 16, 2160), { w: 2160, h: 3840 })
assert.deepEqual(sizeForRatio(16, 9, 2160), { w: 3840, h: 2160 })

// El lado largo nunca supera 4096 (se reduce el corto).
const wide = sizeForRatio(21, 9, 2160)
assert.ok(wide.w <= 4096 && wide.w % 2 === 0 && wide.h % 2 === 0)

assert.equal(evenDim(853.3), 854)
assert.equal(evenDim(99999), 4096)
assert.equal(evenDim(3), 144)

assert.equal(aspectOf(720, 1280), '9:16')
assert.equal(aspectOf(854, 480), '16:9')
assert.equal(aspectOf(864, 1080), '4:5')
assert.equal(aspectOf(1000, 700), 'custom')

assert.equal(resolutionOf(720, 1280), 720)
assert.equal(resolutionOf(3840, 2160), 2160)
assert.equal(resolutionOf(864, 1080), 'custom')

assert.deepEqual(withAspect('16:9', 720, 1280), { w: 1280, h: 720 })
assert.deepEqual(withResolution(1080, 720, 1280), { w: 1080, h: 1920 })
// Proporción personalizada: se conserva al cambiar resolución.
assert.deepEqual(withResolution(720, 1000, 500), { w: 1440, h: 720 })
// Original: proporción del medio.
assert.deepEqual(withMediaAspect(1920, 1080, 720, 1280), { w: 1280, h: 720 })
assert.deepEqual(withMediaAspect(0, 0, 720, 1280), { w: 720, h: 1280 })

console.log('projectFormat ok')
