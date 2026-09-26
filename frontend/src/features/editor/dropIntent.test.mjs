import assert from 'node:assert/strict'
import {
  NEW_TRACK_BAND, REPLACE_TOL, INSERT_EDGE, INSERT_EDGE_PX,
  clipAtTime, clipCollidingWith, dropIntent, newTrackIndex, insertEdge, insertSlot, slotBoundary, slotIndex,
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

// --- pista nueva al pasar por encima de otras pistas (como CapCut) ------------
// Array: V1 (fondo), T1, V2 (delante), A1, A2. En pantalla: V2, T1, V1, A1, A2.
const stackTracks = [
  { id: 'V1', kind: 'video' }, { id: 'T1', kind: 'text' }, { id: 'V2', kind: 'video' },
  { id: 'A1', kind: 'audio' }, { id: 'A2', kind: 'audio' },
]
// Un texto sobre una pista de VÍDEO: siempre pista nueva, arriba o abajo según la mitad.
assert.deepEqual(insertSlot(stackTracks, 'text', 'V1', 0.3, 'T1'), { targetId: 'V1', place: 'above' })
assert.deepEqual(insertSlot(stackTracks, 'text', 'V1', 0.7, 'T1'), { targetId: 'V1', place: 'below' })
assert.deepEqual(insertSlot(stackTracks, 'text', 'V2', 0.5, 'T1'), { targetId: 'V2', place: 'below' })
// …y un vídeo sobre una de texto, igual.
assert.deepEqual(insertSlot(stackTracks, 'video', 'T1', 0.1, 'V1'), { targetId: 'T1', place: 'above' })
// Sobre una de su tipo: en el cuerpo entra en ella; en los bordes, pista nueva.
const twoText = [{ id: 'T1', kind: 'text' }, { id: 'T2', kind: 'text' }]
assert.equal(insertSlot(twoText, 'text', 'T2', 0.5, 'T1'), null)
assert.deepEqual(insertSlot(twoText, 'text', 'T2', INSERT_EDGE - 0.01, 'T1'), { targetId: 'T2', place: 'above' })
assert.deepEqual(insertSlot(twoText, 'text', 'T2', 1 - INSERT_EDGE + 0.01, 'T1'), { targetId: 'T2', place: 'below' })
assert.equal(insertSlot(twoText, 'text', 'T2', INSERT_EDGE, 'T1'), null)
// También junto a su propia pista (CapCut): la de al lado sea del tipo que sea.
assert.deepEqual(insertSlot(twoText, 'text', 'T1', 0.05, 'T1'), { targetId: 'T1', place: 'above' })
// …salvo que sea el único clip de su pista: la nueva pegada a ella no cambiaría nada.
assert.equal(insertSlot(twoText, 'text', 'T1', 0.05, 'T1', { originAlone: true }), null)
assert.equal(insertSlot(twoText, 'text', 'T2', 0.95, 'T1', { originAlone: true }), null)   // debajo de T2 = encima de T1
assert.deepEqual(insertSlot(twoText, 'text', 'T2', 0.05, 'T1', { originAlone: true }), { targetId: 'T2', place: 'above' })
// Borde en px: se acierta igual en una pista de texto baja que en una de vídeo alta.
assert.equal(INSERT_EDGE_PX, 9)
assert.equal(insertEdge(52), 9 / 52)
assert.equal(insertEdge(28), 0.3)
assert.equal(insertEdge(120), 0.12)
assert.equal(insertEdge(0), INSERT_EDGE)
assert.equal(insertSlot(twoText, 'text', 'T2', 0.25, 'T1', { edge: 0.3 })?.place, 'above')
assert.equal(insertSlot(twoText, 'text', 'T2', 0.25, 'T1'), null)
// Una de su tipo pero bloqueada cuenta como "no es suya".
const lockedT = [{ id: 'T1', kind: 'text' }, { id: 'T2', kind: 'text', locked: true }]
assert.deepEqual(insertSlot(lockedT, 'text', 'T2', 0.5, 'T1'), { targetId: 'T2', place: 'below' })
// Un texto bajado hasta el audio: pista nueva al fondo de la pila (encima del audio).
assert.deepEqual(insertSlot(stackTracks, 'text', 'A2', 0.5, 'T1'), { targetId: 'V1', place: 'below' })
// Un audio subido hasta la pila: pista nueva arriba del bloque de audio.
assert.deepEqual(insertSlot(stackTracks, 'audio', 'V2', 0.5, 'A1'), { targetId: 'A1', place: 'above' })
// Pista desconocida o yRatio ausente.
assert.equal(insertSlot(stackTracks, 'text', 'nope', 0.5, 'T1'), null)
assert.deepEqual(insertSlot(stackTracks, 'text', 'V1', undefined, 'T1'), { targetId: 'V1', place: 'below' })

// Índice del array: en la pila "encima" es DESPUÉS en el array; en audio, antes.
assert.equal(slotIndex(stackTracks, { targetId: 'V1', place: 'above' }), 1)   // entre V1 y T1
assert.equal(slotIndex(stackTracks, { targetId: 'V1', place: 'below' }), 0)   // fondo de la pila
assert.equal(slotIndex(stackTracks, { targetId: 'V2', place: 'above' }), 3)   // delante de todo
assert.equal(slotIndex(stackTracks, { targetId: 'A1', place: 'above' }), 3)
assert.equal(slotIndex(stackTracks, { targetId: 'A2', place: 'below' }), 5)
assert.equal(slotIndex(stackTracks, { targetId: 'nope', place: 'above' }), 5)
// Hueco en pantalla (V2, T1, V1, A1, A2): debajo de V2 = encima de T1.
assert.equal(slotBoundary(stackTracks, { targetId: 'V2', place: 'below' }), 1)
assert.equal(slotBoundary(stackTracks, { targetId: 'T1', place: 'above' }), 1)
assert.equal(slotBoundary(stackTracks, { targetId: 'A2', place: 'below' }), 5)
assert.equal(slotBoundary(stackTracks, { targetId: 'nope', place: 'below' }), -1)
console.log('dropIntent insertSlot ok')
