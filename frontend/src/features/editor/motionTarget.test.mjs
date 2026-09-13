import assert from 'node:assert/strict'
import {
  EMPTY_MARK, setMark, hasMarkRange, resolveGenerateTarget, withDuration,
  motionClipName, fmtMoment, GENERATE_DEFAULT_DURATION,
} from './motionTarget.js'

// setMark: I y O en el cursor; una marca invertida descarta la otra.
let m = setMark(EMPTY_MARK, 'in', 27.1234)
assert.deepEqual(m, { in: 27.123, out: null })
m = setMark(m, 'out', 32.12)
assert.deepEqual(m, { in: 27.123, out: 32.12 })
assert.equal(hasMarkRange(m), true)
assert.deepEqual(setMark(m, 'in', 40), { in: 40, out: null })
assert.deepEqual(setMark(m, 'out', 10), { in: null, out: 10 })
assert.equal(hasMarkRange({ in: 5, out: null }), false)
assert.equal(hasMarkRange({ in: 5, out: 5 }), false)

// Con rango I/O manda el rango (exacto), aunque el clic sea en otro sitio.
assert.deepEqual(
  resolveGenerateTarget({ mark: { in: 27.12, out: 32.12 }, time: 50, clip: { id: 'c1' } }),
  { start: 27.12, end: 32.12, playhead: 50, explicit: true, clipId: 'c1' },
)
// Sin rango: instante del clic + 5 s por defecto.
assert.deepEqual(
  resolveGenerateTarget({ mark: EMPTY_MARK, time: 27.12 }),
  { start: 27.12, end: 32.12, playhead: 27.12, explicit: false, clipId: null },
)
assert.equal(GENERATE_DEFAULT_DURATION, 5)
// Solo entrada: entrada + duración por defecto.
assert.equal(resolveGenerateTarget({ mark: { in: 10, out: null }, time: 3 }).end, 15)
// Duración configurable, con mínimo.
assert.equal(resolveGenerateTarget({ time: 2, defaultDuration: 8 }).end, 10)
assert.equal(withDuration({ start: 27.12, end: 32.12 }, 3).end, 30.12)
assert.equal(withDuration({ start: 1, end: 2 }, 0.1).end, 1.5)

assert.equal(motionClipName(27.12, 32.12), 'motion_027_032')
assert.equal(motionClipName(125.9, 131), 'motion_125_131')
assert.equal(fmtMoment(27.12), '00:27.1')
assert.equal(fmtMoment(92.05), '01:32.0')

console.log('motionTarget ok')
