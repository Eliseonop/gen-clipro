import assert from 'node:assert/strict'
import { buildTicks, clampPps, fmtRuler, maxPps, minPps, tickStep } from './timelineScale.js'

assert.ok(minPps(7200, 1000) < 1, 'un vídeo de 2 h cabe al alejar')
assert.equal(minPps(20, 1000), 8)
assert.ok(maxPps(30) >= 2000)
assert.ok(maxPps(60) > maxPps(30))
assert.ok(maxPps(30, 7200) < maxPps(30) && maxPps(30, 7200) > 500)

assert.equal(clampPps(8, 7200, 1000, 30), 8)
assert.ok(clampPps(0.01, 7200, 1000, 30) >= minPps(7200, 1000))
assert.ok(clampPps(99999, 30, 1000, 30) <= maxPps(30, 30))

const far = tickStep(minPps(7200, 1000), 30)
assert.ok(far > 15, `al alejar un 2 h el paso no se queda en 15 s (es ${far})`)

const close = tickStep(maxPps(30), 30)
assert.ok(Math.abs(close - 1 / 30) < 1e-9, `al acercar el paso es 1 cuadro (${close})`)

assert.equal(fmtRuler(2 + 1 / 30, { step: 1 / 30, fps: 30 }), '0:02:01')
assert.equal(fmtRuler(2 + 1 / 30, { step: 1 / 30, fps: 30, long: true }), '0:02:01')
assert.equal(fmtRuler(125, { step: 1 }), '2:05')
assert.equal(fmtRuler(3661, { step: 1 }), '1:01:01')

const ticks = buildTicks(7200, maxPps(30), { fps: 30, scrollX: 0, viewW: 1000 })
assert.ok(ticks.length > 4 && ticks.length < 400, `ticks visibles acotados (${ticks.length})`)
assert.ok(ticks.some((tk) => tk.major && Math.abs(tk.step - 1 / 30) < 1e-9))

console.log('timelineScale ok')
