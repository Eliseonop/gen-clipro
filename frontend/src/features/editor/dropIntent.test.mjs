import assert from 'node:assert/strict'
import {
  BOUNDARY_PX, STICK_PX,
  clipAtTime, clipCollidingWith, dropTarget, liftTarget, newTrackIndex, placeOnTrack, slotBoundary, slotIndex, zoneAt,
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
assert.equal(clipAtTime(clips, 'V1', 5, ['a']), null)
assert.equal(clipCollidingWith(clips, 'V1', 8, 5)?.id, 'a')   // pisa el final de 'a'
assert.equal(clipCollidingWith(clips, 'V1', 10, 5), null)     // justo en el hueco
assert.equal(clipCollidingWith(clips, 'V1', 12, 20)?.id, 'b') // alcanza a 'b'
// Sin excluirlo, 'a' choca consigo mismo y nunca podría quedarse donde está.
assert.equal(clipCollidingWith(clips, 'V1', 0, 10, ['a']), null)
assert.equal(clipCollidingWith(clips, 'V1', 0, 10)?.id, 'a')
console.log('dropIntent clips ok')

// --- zonas: cuerpo = esta pista; raya entre pistas = pista nueva ---------------
// En pantalla (pila invertida): V2 [0-52), V1 [52-104), A1 [104-156).
const geo = [
  { id: 'V2', top: 0, bottom: 52 },
  { id: 'V1', top: 52, bottom: 104 },
  { id: 'A1', top: 104, bottom: 156 },
]
// Todo el cuerpo de la pista es "esta pista": arriba, en medio y abajo.
assert.deepEqual(zoneAt(tracks, geo, 'video', 60), { trackId: 'V1' })
assert.deepEqual(zoneAt(tracks, geo, 'video', 78), { trackId: 'V1' })
assert.deepEqual(zoneAt(tracks, geo, 'video', 96), { trackId: 'V1' })
// Solo la banda fija de la raya pide pista nueva (debajo de V2 = encima de V1).
assert.deepEqual(zoneAt(tracks, geo, 'video', 52 + BOUNDARY_PX - 1), { slot: { targetId: 'V1', place: 'above' }, lineY: 52 })
assert.deepEqual(zoneAt(tracks, geo, 'video', 52 - 1), { slot: { targetId: 'V2', place: 'below' }, lineY: 52 })
// Encima del bloque (la regla) o fuera: pista nueva en el borde.
assert.deepEqual(zoneAt(tracks, geo, 'video', -20), { slot: { targetId: 'V2', place: 'above' }, lineY: 0 })
// Un vídeo llevado al audio: pista nueva al fondo de la pila.
assert.deepEqual(zoneAt(tracks, geo, 'video', 130), { slot: { targetId: 'V1', place: 'below' }, lineY: 104 })
// Un audio subido a la pila: pista nueva encima del audio.
assert.deepEqual(zoneAt(tracks, geo, 'audio', 20), { slot: { targetId: 'A1', place: 'above' }, lineY: 104 })
assert.deepEqual(zoneAt(tracks, geo, 'audio', 130), { trackId: 'A1' })
// Debajo de todo: pista nueva debajo del último audio.
assert.deepEqual(zoneAt(tracks, geo, 'audio', 400), { slot: { targetId: 'A1', place: 'below' }, lineY: 156 })

// Pista de texto baja (29 px): la banda no se come la pista (máx. 1/4 del alto).
const tt = [{ id: 'T1', kind: 'text' }, { id: 'V1', kind: 'video' }]
const tgeo = [{ id: 'T1', top: 0, bottom: 29 }, { id: 'V1', top: 29, bottom: 81 }]
assert.deepEqual(zoneAt(tt, tgeo, 'text', 8), { trackId: 'T1' })
assert.deepEqual(zoneAt(tt, tgeo, 'text', 22), { trackId: 'T1' })
// Un texto sobre una de vídeo: pista nueva, encima o debajo según la mitad.
assert.deepEqual(zoneAt(tt, tgeo, 'text', 45).slot, { targetId: 'V1', place: 'above' })
assert.deepEqual(zoneAt(tt, tgeo, 'text', 70).slot, { targetId: 'V1', place: 'below' })
// Bloqueada = no es suya.
assert.equal(zoneAt([{ id: 'V1', kind: 'video', locked: true }], [{ id: 'V1', top: 0, bottom: 52 }], 'video', 20).slot.targetId, 'V1')
// Sin pistas de su bloque: la primera (pila arriba, audio al final).
assert.deepEqual(zoneAt([{ id: 'A1', kind: 'audio' }], [{ id: 'A1', top: 0, bottom: 52 }], 'video', 20),
  { slot: { targetId: null, place: 'above' }, lineY: 0 })
assert.deepEqual(zoneAt([{ id: 'V1', kind: 'video' }], [{ id: 'V1', top: 0, bottom: 52 }], 'audio', 20),
  { slot: { targetId: null, place: 'below' }, lineY: 52 })
// El único clip de su pista: una pista nueva pegada a ella no cambia nada → se queda.
assert.deepEqual(zoneAt(tracks, geo, 'video', 53, { originId: 'V1', originAlone: true }), { trackId: 'V1' })
assert.deepEqual(zoneAt(tracks, geo, 'video', 2, { originId: 'V1', originAlone: true }).slot, { targetId: 'V2', place: 'above' })
console.log('dropIntent zoneAt ok')

// --- colocar en la pista --------------------------------------------------------
// Libre: donde se suelta.
assert.deepEqual(placeOnTrack(clips, 'V1', 12, 3), { start: 12 })
// Libre y rozando al vecino: se pega (imán de la misma pista).
assert.deepEqual(placeOnTrack(clips, 'V1', 10.1, 3, { snapSec: 0.2 }), { start: 10 })
assert.deepEqual(placeOnTrack(clips, 'V1', 16.9, 3, { snapSec: 0.2 }), { start: 17 })
// Ocupado pero el hueco está cerca: se pega a él.
assert.deepEqual(placeOnTrack(clips, 'V1', 9.5, 3, { stickSec: 1 }), { start: 10 })
// Ocupado y el hueco está lejos: no se manda al final, null (sube de pista).
assert.equal(placeOnTrack(clips, 'V1', 2, 3, { stickSec: 1 }), null)
// Un hueco que no admite el clip no cuenta (10-20 no admite 12 s).
assert.equal(placeOnTrack(clips, 'V1', 9, 12, { stickSec: 1 }), null)
console.log('dropIntent placeOnTrack ok')

// --- subir de pista: la vecina libre o una nueva ------------------------------
assert.deepEqual(liftTarget(tracks, clips, 'V1', 5, 3), { trackId: 'V2' })            // V2 libre en 5-8
assert.deepEqual(liftTarget(tracks, clips, 'V1', 2, 3), { slot: { targetId: 'V1', place: 'above' } }) // V2 ocupada en 2-5
assert.deepEqual(liftTarget(tracks, clips, 'V2', 1, 1), { slot: { targetId: 'V2', place: 'above' } }) // no hay pista encima
// La vecina oculta o bloqueada no sirve.
assert.deepEqual(liftTarget([{ id: 'V1', kind: 'video' }, { id: 'V2', kind: 'video', hidden: true }], clips, 'V1', 5, 3).slot.place, 'above')
// El audio crece hacia abajo.
const aTracks = [{ id: 'A1', kind: 'audio' }, { id: 'A2', kind: 'audio' }]
assert.deepEqual(liftTarget(aTracks, [], 'A1', 0, 2), { trackId: 'A2' })
assert.deepEqual(liftTarget(aTracks, [], 'A2', 0, 2), { slot: { targetId: 'A2', place: 'below' } })
console.log('dropIntent liftTarget ok')

// --- dropTarget: todo junto ---------------------------------------------------
const base = { tracks, clips, geo, kind: 'video', pps: 60 }
// Cuerpo de V1 en un hueco libre: entra tal cual.
assert.deepEqual(dropTarget({ ...base, y: 78, time: 12, dur: 3 }), { trackId: 'V1', start: 12 })
// Sobre 'a' con el hueco lejos: sube a V2 (libre en 5-8) en el mismo instante.
assert.deepEqual(dropTarget({ ...base, y: 78, time: 5, dur: 3 }), { trackId: 'V2', start: 5, lifted: true })
// Sobre 'a' donde V2 también está ocupada: pista nueva encima de V1.
const lifted = dropTarget({ ...base, y: 78, time: 2, dur: 3 })
assert.deepEqual(lifted.slot, { targetId: 'V1', place: 'above' })
assert.equal(lifted.lineY, 52)
assert.equal(lifted.start, 2)
assert.equal(lifted.lifted, true)
// Rozando el final de 'a' (a ≤ STICK_PX): se pega detrás de 'a', sin subir.
assert.deepEqual(dropTarget({ ...base, y: 78, time: 10 - 30 / 60, dur: 3 }), { trackId: 'V1', start: 10 })
assert.equal(STICK_PX, 48)
// Alt: reemplaza el clip bajo el puntero.
assert.deepEqual(dropTarget({ ...base, y: 78, time: 3, pointerTime: 3, dur: 3, replace: true }),
  { trackId: 'V1', start: 0, replaceId: 'a' })
// Alt en un hueco: no hay nada que reemplazar, se coloca.
assert.deepEqual(dropTarget({ ...base, y: 78, time: 12, pointerTime: 12, dur: 3, replace: true }), { trackId: 'V1', start: 12 })
// Moviendo 'a': no choca consigo mismo.
assert.deepEqual(dropTarget({ ...base, y: 78, time: 1, dur: 10, excludeIds: ['a'] }), { trackId: 'V1', start: 1 })
// Raya entre pistas: pista nueva aunque debajo haya hueco.
assert.deepEqual(dropTarget({ ...base, y: 53, time: 12, dur: 3 }).slot, { targetId: 'V1', place: 'above' })
// Pista magnética: se inserta en el corte más cercano (delante de 'b', mitad en 22).
const mag = [{ id: 'V1', kind: 'video', magnetic: true }, { id: 'V2', kind: 'video' }, { id: 'A1', kind: 'audio' }]
assert.deepEqual(dropTarget({ ...base, tracks: mag, y: 78, time: 21, pointerTime: 21, dur: 3 }), { trackId: 'V1', start: 20, insert: true })
assert.deepEqual(dropTarget({ ...base, tracks: mag, y: 78, time: 23, pointerTime: 23, dur: 3 }), { trackId: 'V1', start: 24, insert: true })
// Alt también reemplaza en la magnética (la pista se empaqueta después).
assert.deepEqual(dropTarget({ ...base, tracks: mag, y: 78, time: 21, pointerTime: 21, dur: 3, replace: true }),
  { trackId: 'V1', start: 20, replaceId: 'b' })
console.log('dropIntent dropTarget ok')

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

// Array: V1 (fondo), T1, V2 (delante), A1, A2. En pantalla: V2, T1, V1, A1, A2.
const stackTracks = [
  { id: 'V1', kind: 'video' }, { id: 'T1', kind: 'text' }, { id: 'V2', kind: 'video' },
  { id: 'A1', kind: 'audio' }, { id: 'A2', kind: 'audio' },
]
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
console.log('dropIntent slots ok')
