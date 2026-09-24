// Modos de fusión (#8): mismos ids que el export (backend/tests/test_clip_blend.py).
import assert from 'node:assert/strict'
import { BLEND_MODES, blendOp, clipBlend, normalizeBlend } from './clipBlend.js'

assert.deepEqual(BLEND_MODES.map((m) => m.id), [
  'normal', 'darken', 'multiply', 'color_burn', 'lighten', 'screen', 'color_dodge',
  'overlay', 'soft_light', 'hard_light', 'difference', 'exclusion',
])
assert.equal(normalizeBlend('raro'), 'normal')
assert.equal(clipBlend({}), 'normal')
assert.equal(clipBlend({ blend_mode: 'soft_light' }), 'soft_light')
assert.equal(blendOp({}), null)
assert.equal(blendOp({ blend_mode: 'normal' }), null)
assert.equal(blendOp({ blend_mode: 'color_dodge' }), 'color-dodge')
assert.equal(blendOp({ blend_mode: 'screen' }), 'screen')

console.log('clipBlend ok')
