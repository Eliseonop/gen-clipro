import assert from 'node:assert/strict'
import {
  defaultTrackIndex, displayTracks, insertTrack, isStackTrack, reorderTrack, stackLayers, stepTrack, trackNeighbor,
} from './trackStack.js'

const V1 = { id: 'V1', kind: 'video' }
const V2 = { id: 'V2', kind: 'video' }
const T1 = { id: 'T1', kind: 'text' }
const A1 = { id: 'A1', kind: 'audio' }
const A2 = { id: 'A2', kind: 'audio' }
const ids = (list) => list.map((t) => t.id)

// --- la pila: vídeo y texto juntos, en el orden del array --------------------
assert.equal(isStackTrack(T1), true)
assert.equal(isStackTrack(A1), false)
assert.deepEqual(ids(displayTracks([V1, A1, V2, T1, A2])), ['T1', 'V2', 'V1', 'A1', 'A2'])
// Un texto por debajo de un vídeo se ve por debajo (no se sube solo arriba).
assert.deepEqual(ids(displayTracks([V1, T1, V2, A1])), ['V2', 'T1', 'V1', 'A1'])
assert.deepEqual([...stackLayers([V1, A1, T1, V2]).entries()], [['V1', 0], ['T1', 1], ['V2', 2]])
assert.deepEqual(displayTracks(undefined), [])

// --- pista nueva: se ve igual que antes ---------------------------------------
assert.equal(defaultTrackIndex([V1, T1, A1], 'video'), 1)     // encima de V1, debajo de T1
assert.equal(defaultTrackIndex([T1, A1], 'video'), 0)         // sin vídeo: al fondo
assert.equal(defaultTrackIndex([V1, A1, T1], 'text'), 3)      // arriba del todo de la pila
assert.equal(defaultTrackIndex([V1, A1], 'text'), 2)             // al final: el audio no cuenta
assert.equal(defaultTrackIndex([V1, T1, A1], 'audio'), 3)
assert.deepEqual(ids(insertTrack([V1, T1, A1], V2)), ['V1', 'V2', 'T1', 'A1'])
assert.deepEqual(ids(insertTrack([V1, T1, A1], V2, 2)), ['V1', 'T1', 'V2', 'A1'])
assert.deepEqual(ids(insertTrack([V1], V2, 99)), ['V1', 'V2'])

// --- reordenar en pantalla ------------------------------------------------------
// Texto detrás de la persona: T1 entre el vídeo completo (V1) y el recorte (V2).
const base = [V1, V2, T1, A1]
let next = reorderTrack(base, 'T1', 'V2', 'below')
assert.deepEqual(ids(displayTracks(next)), ['V2', 'T1', 'V1', 'A1'])
assert.deepEqual(ids(next), ['V1', 'T1', 'V2', 'A1'])
// Mismo sitio = mismo array (sin cambios que guardar ni que deshacer).
assert.equal(reorderTrack(base, 'T1', 'V2', 'above'), base)
assert.equal(reorderTrack(base, 'T1', 'T1', 'below'), base)
// Audio y pila no se mezclan.
assert.equal(reorderTrack(base, 'A1', 'V1', 'above'), base)
assert.equal(reorderTrack(base, 'nope', 'V1', 'above'), base)
next = reorderTrack([V1, A1, A2], 'A2', 'A1', 'above')
assert.deepEqual(ids(next), ['V1', 'A2', 'A1'])

// --- subir / bajar un puesto ----------------------------------------------------
assert.equal(trackNeighbor(base, 'T1', -1), null)              // T1 ya está arriba
assert.equal(trackNeighbor(base, 'V1', 1), null)               // debajo de V1 empieza el audio
assert.equal(trackNeighbor(base, 'A1', -1), null)
assert.equal(trackNeighbor(base, 'V2', -1)?.id, 'T1')
assert.deepEqual(ids(displayTracks(stepTrack(base, 'T1', 1))), ['V2', 'T1', 'V1', 'A1'])
assert.deepEqual(ids(displayTracks(stepTrack(base, 'V1', -1))), ['T1', 'V1', 'V2', 'A1'])
assert.equal(stepTrack(base, 'T1', -1), base)

console.log('trackStack ok')
