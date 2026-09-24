import assert from 'node:assert/strict'
import { BAR_MAX, CINEMA_RATIOS, cinemaBar, normalizeShape, shapeGeometry } from './shapes.js'

// Barras de cine (#20). Mismos números que backend/tests/test_cinema_bars.py.
assert.equal(cinemaBar(16 / 9, 2.39), 0.1281)
assert.equal(cinemaBar(16 / 9, 16 / 9), 0)
assert.equal(cinemaBar(9 / 16, 16 / 9), 0.3418)
assert.equal(cinemaBar(9 / 16, 2.39), 0.3823)
assert.equal(cinemaBar(9 / 16, 100), BAR_MAX, 'con tope')
assert.deepEqual(CINEMA_RATIOS.map((r) => r.id), ['2.39', '2', '1.85', '16:9'])

const st = normalizeShape({ type: 'letterbox', bar: 0.9 })
assert.deepEqual([st.bar, st.w, st.h, st.x, st.fill], [0.5, 1, 1, 0.5, '#000000'])
const geo = shapeGeometry('letterbox', normalizeShape({ type: 'letterbox', bar: 0.2 }))
assert.equal(geo.fills.length, 2)
assert.deepEqual(geo.fills[0][2], [101, 20])
assert.deepEqual(geo.fills[1][0], [-1, 80])
assert.equal(shapeGeometry('letterbox', { bar: 0 }).fills.length, 0)
assert.equal(normalizeShape({ type: 'rect' }).bar, undefined, 'solo las barras llevan grosor')

console.log('cinemaBars ok')
