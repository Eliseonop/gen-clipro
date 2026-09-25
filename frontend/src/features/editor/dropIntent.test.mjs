import assert from 'node:assert/strict'
import {
  NEW_TRACK_BAND, REPLACE_TOL,
  clipAtTime, clipCollidingWith, dropIntent, trackAbove, resolveNewTrack, newTrackIndex,
} from './dropIntent.js'

const V = (id, track_id, start, dur) => ({
  id, track_id, kind: 'video', start, in_point: 0, out_point: dur, speed: 1,
})

// V1: [0-10) y [20-24).  V2: [0-4).
const clips = [V('a', 'V1', 0, 10), V('b', 'V1', 20, 4), V('up', 'V2', 0, 4)]
const tracks = [
  { id: 'V1', kind: 'video' },
  { id: 'V2', kind: 'video' },
  { id: 'A1', kind: 'audio' },
]

// --- localizar clips ----------------------------------------------------------
assert.equal(clipAtTime(clips, 'V1', 5)?.id, 'a')
assert.equal(clipAtTime(clips, 'V1', 10), null)      // fin exclusivo
assert.equal(clipAtTime(clips, 'V1', 21)?.id, 'b')
assert.equal(clipAtTime(clips, 'V1', 15), null)
assert.equal(clipCollidingWith(clips, 'V1', 8, 5)?.id, 'a')   // pisa el final de 'a'
assert.equal(clipCollidingWith(clips, 'V1', 10, 5), null)     // justo en el hueco
assert.equal(clipCollidingWith(clips, 'V1', 12, 20)?.id, 'b') // alcanza a 'b'

// --- hueco libre: se coloca donde sueltas ------------------------------------
let r = dropIntent(clips, 'V1', 12, 3, 0.5)
assert.equal(r.action, 'place')
assert.equal(r.start, 12)
assert.equal(r.targetId, null)

// --- casi alineado con un clip = reemplazar ----------------------------------
r = dropIntent(clips, 'V1', 0, 5, 0.5)
assert.equal(r.action, 'replace')
assert.equal(r.targetId, 'a')
assert.equal(r.start, 0)
// dentro de la tolerancia (10s * 0.2 = 2s)
r = dropIntent(clips, 'V1', 1.5, 5, 0.5)
assert.equal(r.action, 'replace')

// --- desplazado >= 20% = detrás del clip -------------------------------------
r = dropIntent(clips, 'V1', 2, 5, 0.5)      // 2s == 20% de 10s → ya no es reemplazo
assert.equal(r.action, 'after')
assert.equal(r.targetId, 'a')
assert.equal(r.start, 10)                   // justo detrás de 'a'
r = dropIntent(clips, 'V1', 6, 3, 0.9)
assert.equal(r.action, 'after')
assert.equal(r.start, 10)
// Si detrás tampoco cabe, sigue buscando hueco (10-20 admite 6s; 12 no cabría).
r = dropIntent(clips, 'V1', 5, 12, 0.5)
assert.equal(r.action, 'after')
assert.equal(r.start, 24)                   // detrás de 'b'

// --- franja superior = pista nueva -------------------------------------------
r = dropIntent(clips, 'V1', 0, 5, 0.1)
assert.equal(r.action, 'newTrack')
assert.equal(r.targetId, 'a')
r = dropIntent(clips, 'V1', 6, 3, NEW_TRACK_BAND - 0.01)
assert.equal(r.action, 'newTrack')
// Justo en el límite ya no es pista nueva.
r = dropIntent(clips, 'V1', 6, 3, NEW_TRACK_BAND)
assert.equal(r.action, 'after')
// En hueco libre la franja superior NO crea pista: no hay nada que esquivar.
r = dropIntent(clips, 'V1', 12, 3, 0.05)
assert.equal(r.action, 'place')

// yRatio ausente: se comporta como si fuera el cuerpo de la pista.
r = dropIntent(clips, 'V1', 0, 5, undefined)
assert.equal(r.action, 'replace')

// --- pista de encima ----------------------------------------------------------
assert.equal(trackAbove(tracks, 'V1')?.id, 'V2')
assert.equal(trackAbove(tracks, 'V2'), null)      // no hay V3
assert.equal(trackAbove(tracks, 'A1'), null)
assert.equal(trackAbove(tracks, 'nope'), null)

// V2 está ocupada en 0-4 → hay que crear pista, justo encima de V1.
assert.deepEqual(resolveNewTrack(clips, tracks, 'V1', 0, 3), { trackId: null, create: true, index: 1 })
// En 10 sí cabe en V2 → se reutiliza en vez de crear otra.
assert.deepEqual(resolveNewTrack(clips, tracks, 'V1', 10, 3), { trackId: 'V2', create: false })
// Pista de encima bloqueada → crear.
const locked = [{ id: 'V1', kind: 'video' }, { id: 'V2', kind: 'video', locked: true }]
assert.deepEqual(resolveNewTrack(clips, locked, 'V1', 10, 3), { trackId: null, create: true, index: 1 })
// Sin pista encima → crear.
assert.deepEqual(resolveNewTrack(clips, tracks, 'V2', 10, 3), { trackId: null, create: true, index: 2 })
// Pila con un texto entre dos vídeos: la de encima de V1 es T1 (otro tipo), así
// que la nueva va entre V1 y T1 y no por delante del texto.
const mixed = [{ id: 'V1', kind: 'video' }, { id: 'T1', kind: 'text' }, { id: 'V2', kind: 'video' }]
assert.equal(trackAbove(mixed, 'V1')?.id, 'T1')
assert.deepEqual(resolveNewTrack(clips, mixed, 'V1', 10, 3), { trackId: null, create: true, index: 1 })
// En audio no hay pila: se deja el sitio de siempre.
assert.deepEqual(resolveNewTrack(clips, tracks, 'A1', 10, 3), { trackId: null, create: true, index: null })

assert.equal(REPLACE_TOL, 0.2)
console.log('dropIntent ok')

// --- excluir el clip que se arrastra -----------------------------------------
// Sin excluirlo, 'a' choca consigo mismo y nunca podría quedarse donde está.
assert.equal(clipCollidingWith(clips, 'V1', 0, 10, ['a']), null)
assert.equal(clipCollidingWith(clips, 'V1', 0, 10)?.id, 'a')
let m = dropIntent(clips, 'V1', 0, 10, 0.5, ['a'])
assert.equal(m.action, 'place')
assert.equal(m.start, 0)
// Excluido 'a', mover 'a' sobre 'b' sí es reemplazo de 'b'.
m = dropIntent(clips, 'V1', 20, 4, 0.5, ['a'])
assert.equal(m.action, 'replace')
assert.equal(m.targetId, 'b')
// Y 'after' respeta la exclusión al buscar hueco.
m = dropIntent(clips, 'V1', 21.5, 4, 0.5, ['a'])
assert.equal(m.action, 'after')
assert.equal(m.start, 24)

// --- dónde se inserta la pista nueva -----------------------------------------
// tracks = [V1, V2, A1]; en pantalla el vídeo va invertido (V2 arriba de V1).
assert.equal(newTrackIndex(tracks, 'video', 'above'), 2)   // detrás de V2 = arriba del todo
assert.equal(newTrackIndex(tracks, 'video', 'below'), 0)   // delante de V1 = abajo del todo
// El audio NO se invierte: 'below' va al final del grupo.
assert.equal(newTrackIndex(tracks, 'audio', 'below'), 3)
assert.equal(newTrackIndex(tracks, 'audio', 'above'), 2)
// El texto comparte pila con el vídeo: 'above' = arriba del todo de la pila.
assert.equal(newTrackIndex(tracks, 'text', 'above'), 2)
assert.equal(newTrackIndex(tracks, 'text', 'below'), 0)
// Sin pistas de ese grupo, al final.
assert.equal(newTrackIndex([{ id: 'A1', kind: 'audio' }], 'text', 'above'), 1)
assert.equal(newTrackIndex([], 'video', 'above'), 0)
console.log('dropIntent move ok')
