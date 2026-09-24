// Beats y marcadores (#12): paso a tiempo de timeline, densidad e imán.
import assert from 'node:assert/strict'
import { clipBeatTimes, nextSnapTime, normalizeMarkers, snapTargets, toggleMarkerAt } from './beats.js'

const audio = (extra = {}) => ({
  id: 'a', track_id: 'A1', kind: 'audio', start: 10, in_point: 2, out_point: 6, source_duration: 20, speed: 1,
  beats: { times: [1, 2, 2.5, 3, 3.5, 4, 5, 7], bpm: 120, every: 1 }, ...extra,
})

// Solo los beats dentro del recorte, en tiempo de timeline (start + src − in).
assert.deepEqual(clipBeatTimes(audio()), [10, 10.5, 11, 11.5, 12, 13])
// Uno de cada 2, contando desde el primer beat del tema (no cambia al recortar).
assert.deepEqual(clipBeatTimes(audio({ beats: { times: [1, 2, 2.5, 3, 3.5, 4, 5, 7], every: 2 } })), [10.5, 11.5, 13])
// Velocidad 2x: la barra va al doble.
assert.deepEqual(clipBeatTimes(audio({ speed: 2 })), [10, 10.25, 10.5, 10.75, 11, 11.5])
assert.deepEqual(clipBeatTimes({ ...audio(), beats: null }), [])

// Marcadores: M añade y, sobre uno existente, lo quita.
let mk = toggleMarkerAt([], 3, 30)
assert.equal(mk.length, 1)
assert.equal(mk[0].t, 3)
mk = toggleMarkerAt(mk, 1, 30)
assert.deepEqual(mk.map((m) => m.t), [1, 3])
mk = toggleMarkerAt(mk, 3.01, 30)
assert.deepEqual(mk.map((m) => m.t), [1])
assert.deepEqual(normalizeMarkers([{ t: -2 }, { t: 1.23456, label: 'x' }]).map((m) => m.t), [0, 1.235])

// Imán: marcadores + beats (sin los del clip que se mueve).
const targets = snapTargets([{ id: 'm1', t: 4 }], [audio()], [])
assert.equal(targets.length, 7)
assert.ok(targets.every((p) => p.start === p.end && p.trackId.startsWith('__')))
assert.equal(snapTargets([{ id: 'm1', t: 4 }], [audio()], ['a']).length, 1)
assert.equal(snapTargets([], [audio({ disabled: true })]).length, 0)

// , y . saltan entre marcadores y beats.
assert.equal(nextSnapTime([{ id: 'm', t: 4 }], [audio()], 0, 1), 4)
assert.equal(nextSnapTime([{ id: 'm', t: 4 }], [audio()], 10.2, 1), 10.5)
assert.equal(nextSnapTime([{ id: 'm', t: 4 }], [audio()], 10.2, -1), 10)
assert.equal(nextSnapTime([], [], 5, 1), null)

console.log('beats ok')
