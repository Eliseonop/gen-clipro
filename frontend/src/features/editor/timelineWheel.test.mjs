import assert from 'node:assert/strict'
import { timelineWheelAction, headerScrollPad } from './timelineWheel.js'

const none = { ctrlKey: false, shiftKey: false, altKey: false }

assert.equal(timelineWheelAction({ ...none, ctrlKey: true }, { canScrollY: false, overRuler: false }), 'rowHeight')
assert.equal(timelineWheelAction({ ...none, shiftKey: true }, { canScrollY: true, overRuler: true }), 'scrollX')
assert.equal(
  timelineWheelAction(none, { canScrollY: true, overRuler: false }),
  'scrollY',
  'en las pistas la rueda baja, no hace zoom',
)
assert.equal(
  timelineWheelAction(none, { canScrollY: false, overRuler: false }),
  'scrollY',
  'fuera de la regla no hay zoom aunque las pistas quepan',
)
assert.equal(
  timelineWheelAction(none, { canScrollY: true, overRuler: true }),
  'zoom',
  'sobre .ed-ruler la rueda hace zoom aunque haya pistas de más',
)
assert.equal(timelineWheelAction(none, { canScrollY: false, overRuler: true }), 'zoom')

assert.equal(headerScrollPad(277, 267), 10)
assert.equal(headerScrollPad(267, 267), 0)

console.log('timelineWheelAction ok')
