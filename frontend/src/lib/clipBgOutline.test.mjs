// Contorno del sujeto recortado (#9): mismos números que el export
// (backend/tests/test_bg_outline.py).
import assert from 'node:assert/strict'
import { normalizeBg, normalizeOutline, OUTLINE_LEVEL, outlineAlpha, outlineParams } from './clipBg.js'

assert.deepEqual(normalizeOutline(null), { enabled: false, color: '#FFFFFF', width: 0.3, soft: 0, opacity: 1 })
const o = normalizeOutline({ enabled: 1, color: 'f00', width: 7, soft: -1 })
assert.deepEqual([o.enabled, o.color, o.width, o.soft], [true, '#FF0000', 1, 0])
assert.equal(normalizeBg({ chroma: { enabled: true }, outline: { enabled: true, width: 0.5 } }).outline.width, 0.5)

assert.equal(OUTLINE_LEVEL, 17)
assert.equal(outlineParams(normalizeOutline({ enabled: false }), 1080), null)
assert.equal(outlineParams(normalizeOutline({ enabled: true, width: 0 }), 1080), null)
const p = outlineParams(normalizeOutline({ enabled: true, width: 0.5, soft: 0.4 }), 1080)
assert.ok(Math.abs(p.width - 27) < 1e-9)
assert.ok(Math.abs(p.sigma - 18) < 1e-9)
assert.ok(Math.abs(p.gain - 92.664093) < 1e-5)
assert.ok(Math.abs(p.halo - 10.8) < 1e-9)
// Misma tabla que el `lut` del export.
assert.equal(outlineAlpha(17, p), 0)
assert.equal(outlineAlpha(0, p), 0)
assert.equal(outlineAlpha(200, p), 255)
assert.ok(Math.abs(outlineAlpha(18, p) - 92.664093) < 1e-4)

console.log('clipBg outline ok')
