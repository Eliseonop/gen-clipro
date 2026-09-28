import assert from 'node:assert/strict'
import { clampGroupDelta, overlapPairs, separateOverlaps, settleClips, touchedClipIds } from './noOverlap.js'

const C = (id, track_id, start, dur, extra = {}) => ({ id, track_id, kind: 'video', start, in_point: 0, out_point: dur, speed: 1, ...extra })
const byId = (list) => Object.fromEntries(list.map((c) => [c.id, c]))
let n = 0
const makeTrack = (kind, style) => ({ id: `N${++n}`, kind, name: `N${n}`, ...(style ? { style } : {}) })

const tracks = [{ id: 'V1', kind: 'video' }, { id: 'V2', kind: 'video' }, { id: 'A1', kind: 'audio' }]
// V1: a [0-5) b [5-9)   V2: up [0-3)
const prev = [C('a', 'V1', 0, 5), C('b', 'V1', 5, 4), C('up', 'V2', 0, 3)]

// --- qué clips se tocaron ---------------------------------------------------
assert.deepEqual([...touchedClipIds(prev, prev)], [])
assert.deepEqual([...touchedClipIds(prev, [...prev, C('new', 'V1', 1, 1)])], ['new'])
assert.deepEqual([...touchedClipIds(prev, prev.map((c) => (c.id === 'a' ? { ...c, speed: 0.5 } : c)))], ['a'])
assert.deepEqual([...touchedClipIds(prev, prev.map((c) => (c.id === 'a' ? { ...c, opacity: 0.5 } : c)))], [])
console.log('touchedClipIds ok')

// --- nada montado: mismos arrays ----------------------------------------------
let r = settleClips(prev, prev, tracks, { makeTrack })
assert.equal(r.changed, false)
assert.equal(r.clips, prev)
assert.equal(r.tracks, tracks)

// --- crece por la derecha (velocidad): empuja a los de detrás -------------------
r = settleClips(prev, prev.map((c) => (c.id === 'a' ? { ...c, speed: 0.5 } : c)), tracks, { makeTrack })
assert.equal(r.changed, true)
assert.equal(byId(r.clips).a.start, 0)
assert.equal(byId(r.clips).b.start, 10)        // a ahora mide 10 s
assert.equal(byId(r.clips).b.track_id, 'V1')
assert.equal(byId(r.clips).up.start, 0)        // otra pista: intacta

// Un redondeo de duración (< SETTLE_EPS) no mueve nada.
r = settleClips(prev, prev.map((c) => (c.id === 'a' ? { ...c, out_point: 5.03 } : c)), tracks, { makeTrack })
assert.equal(r.changed, false)

// --- nuevo encima de otro: sube a la pista libre de encima ----------------------
r = settleClips(prev, [...prev, C('new', 'V1', 6, 2)], tracks, { makeTrack })
assert.equal(byId(r.clips).new.track_id, 'V2')   // V2 libre en 6-8
assert.equal(byId(r.clips).new.start, 6)         // mismo instante
assert.equal(r.tracks, tracks)
// …y si la de encima está ocupada, a una pista nueva justo encima.
r = settleClips(prev, [...prev, C('new', 'V1', 1, 1)], tracks, { makeTrack })
const nt = r.tracks.find((t) => t.id === byId(r.clips).new.track_id)
assert.equal(nt.kind, 'video')
assert.deepEqual(r.tracks.map((t) => t.id), ['V1', nt.id, 'V2', 'A1'])  // entre V1 y V2 del array = encima de V1
assert.equal(byId(r.clips).new.start, 1)

// Texto: la pista nueva copia el estilo de la suya.
const tTracks = [{ id: 'T1', kind: 'text', style: { font: 'X' } }]
const tPrev = [{ id: 's', track_id: 'T1', kind: 'text', start: 0, in_point: 0, out_point: 4 }]
r = settleClips(tPrev, [...tPrev, { id: 't', track_id: 'T1', kind: 'text', start: 1, in_point: 0, out_point: 2 }], tTracks, { makeTrack })
const tt = r.tracks.find((t) => t.id === byId(r.clips).t.track_id)
assert.deepEqual(tt.style, { font: 'X' })

// Movido encima de otro (no crece): sube.
r = settleClips(prev, prev.map((c) => (c.id === 'b' ? { ...c, start: 2 } : c)), tracks, { makeTrack })
assert.notEqual(byId(r.clips).b.track_id, 'V1')

// Un solape que YA estaba (proyecto viejo) no se toca si esos clips no cambian.
const legacy = [C('p', 'V1', 0, 5), C('q', 'V1', 2, 5)]
r = settleClips(legacy, legacy.map((c) => ({ ...c, opacity: 0.4 })), tracks, { makeTrack })
assert.equal(r.changed, false)
console.log('settleClips ok')

// --- pista magnética: siempre empaquetada ----------------------------------------
const mTracks = [{ id: 'V1', kind: 'video', magnetic: true }, { id: 'V2', kind: 'video' }]
r = settleClips(prev, prev.filter((c) => c.id !== 'a'), mTracks, { makeTrack })
assert.equal(byId(r.clips).b.start, 0)            // borrar a cierra el hueco
r = settleClips(prev, [...prev, C('n', 'V1', 5, 1)], mTracks, { makeTrack })
assert.deepEqual([byId(r.clips).a.start, byId(r.clips).n.start, byId(r.clips).b.start], [0, 5, 6])
console.log('settleClips magnetic ok')

// --- separar solapes de un proyecto viejo ---------------------------------------
assert.deepEqual(overlapPairs(legacy), [['p', 'q']])
assert.deepEqual(overlapPairs(prev), [])
const sep = separateOverlaps(legacy, tracks, { makeTrack })
assert.equal(sep.moved, 1)
assert.equal(byId(sep.clips).p.track_id, 'V1')    // el de detrás se queda
assert.equal(byId(sep.clips).q.track_id, 'V2')    // el de delante sube (V2 libre)
assert.deepEqual(overlapPairs(sep.clips), [])
console.log('separateOverlaps ok')

// --- mover un grupo: se para contra el primer vecino -----------------------------
// V1: a [0-5) b [5-9) g [12-14)   V2: h [4-6)
const row = [C('a', 'V1', 0, 5), C('b', 'V1', 5, 4), C('g', 'V1', 12, 2), C('h', 'V2', 4, 2)]
const origs = [row[2], row[3]]   // g y h
assert.equal(clampGroupDelta(row, origs, -10), -3)   // g choca con b (fin 9): 12-9
assert.equal(clampGroupDelta(row, origs, -2), -2)
assert.equal(clampGroupDelta(row, origs, 50), 50)    // a la derecha no hay nadie
assert.equal(clampGroupDelta(row, [row[1], row[2]], -10), 0)   // b ya toca a a
// En pista magnética no frena (la pista se empaqueta sola).
assert.equal(clampGroupDelta(row, origs, -10, [{ id: 'V1', kind: 'video', magnetic: true }]), -4)   // h llega a 0
console.log('clampGroupDelta ok')
