import assert from 'node:assert/strict'
import { magneticCut, mainTrackOf, packMagnetic } from './magnetic.js'

const V = (id, start, dur, track_id = 'V1') => ({ id, track_id, kind: 'video', start, in_point: 0, out_point: dur, speed: 1 })
const starts = (list) => Object.fromEntries(list.map((c) => [c.id, c.start]))

// A [0-2) B [2-5) C [5-9)
const row = [V('A', 0, 2), V('B', 2, 3), V('C', 5, 4), V('x', 1, 3, 'V2')]

// --- corte: delante del primer clip cuya mitad queda a la derecha --------------
assert.deepEqual(magneticCut(row, 'V1', 0.5), { start: 0, index: 0 })   // mitad de A = 1
assert.deepEqual(magneticCut(row, 'V1', 1.5), { start: 2, index: 1 })   // pasada la mitad de A
assert.deepEqual(magneticCut(row, 'V1', 6.9), { start: 5, index: 2 })   // mitad de C = 7
assert.deepEqual(magneticCut(row, 'V1', 8), { start: 9, index: 3 })     // al final
assert.deepEqual(magneticCut([], 'V1', 4), { start: 0, index: 0 })     // pista vacía
// El clip que se mueve no cuenta.
assert.deepEqual(magneticCut(row, 'V1', 0.5, ['A']), { start: 2, index: 0 })
console.log('magneticCut ok')

// --- empaquetar: sin huecos desde 0 -------------------------------------------
// Ya empaquetada: mismo array (sin cambios).
assert.equal(packMagnetic(row, 'V1'), row)
// Borrar B cierra el hueco.
assert.deepEqual(starts(packMagnetic(row.filter((c) => c.id !== 'B'), 'V1')), { A: 0, C: 2, x: 1 })
// Mover A al corte de C (start = 5): empata con C y, al ser el movido, va delante.
let moved = row.map((c) => (c.id === 'A' ? { ...c, start: 5 } : c))
assert.deepEqual(starts(packMagnetic(moved, 'V1', ['A'])), { A: 3, B: 0, C: 5, x: 1 })
// Mover C al corte de A (start = 0): con prioridad va delante de A; sin ella
// manda el orden del array (A primero).
const toFront = row.map((c) => (c.id === 'C' ? { ...c, start: 0 } : c))
assert.deepEqual(starts(packMagnetic(toFront, 'V1', ['C'])), { A: 4, B: 6, C: 0, x: 1 })
assert.deepEqual(starts(packMagnetic(toFront, 'V1')), { A: 0, B: 6, C: 2, x: 1 })
// Insertar uno nuevo en el corte de B empuja B y C.
const ins = [...row, V('N', 2, 1)]
assert.deepEqual(starts(packMagnetic(ins, 'V1', ['N'])), { A: 0, B: 3, C: 6, N: 2, x: 1 })
// Alargar A empuja a los de detrás.
const grown = row.map((c) => (c.id === 'A' ? { ...c, out_point: 3 } : c))
assert.deepEqual(starts(packMagnetic(grown, 'V1')), { A: 0, B: 3, C: 6, x: 1 })
// Otras pistas intactas.
assert.equal(packMagnetic(moved, 'V1', ['A']).find((c) => c.id === 'x'), row[3])
console.log('packMagnetic ok')

assert.equal(mainTrackOf([{ id: 'T1', kind: 'text' }, { id: 'V1', kind: 'video' }, { id: 'V2', kind: 'video' }]).id, 'V1')
assert.equal(mainTrackOf([{ id: 'A1', kind: 'audio' }]), null)
console.log('mainTrackOf ok')
