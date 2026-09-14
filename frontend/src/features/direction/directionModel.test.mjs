import assert from 'node:assert/strict'
import {
  directedCount, filterMaterials, fmtTime, hasMaterial, makeSegment, overlapsOf, patchSegment,
  primaryAction, removeSegment, retimeSegment, segmentAt, textInRange, toggleMaterial,
} from './directionModel.js'

const units = [
  { start: 0, end: 2.2, text: '¿Podrías sobrevivir en Marte?' },
  { start: 2.4, end: 8.1, text: 'The Martian parece ciencia ficción.' },
  { start: 8.6, end: 13.7, text: 'Watney necesita agua.' },
]

// Texto del tramo por el centro de cada frase.
assert.equal(textInRange(units, 0, 8.6), '¿Podrías sobrevivir en Marte? The Martian parece ciencia ficción.')
assert.equal(textInRange(units, 20, 25), '')

// Tramo nuevo desde un rango (aunque venga invertido) con su texto.
const a = makeSegment({ start: 8.6, end: 0 }, units, 'captions')
assert.equal(a.start, 0)
assert.equal(a.end, 8.6)
assert.equal(a.status, 'empty')
assert.match(a.id, /^sd_/)
const b = { ...makeSegment({ start: 8.6, end: 14 }, units), id: 'sd_b' }
const c = { ...makeSegment({ start: 30, end: 33 }, units), id: 'sd_c' }   // sin guion: tramo sin subtítulos
assert.equal(c.text, '')
let segs = [c, b, a]

// patch ordena y pasa a "ready" al dirigir.
segs = patchSegment(segs, 'sd_b', { mode: 'explain' })
assert.deepEqual(segs.map((s) => s.id), [a.id, 'sd_b', 'sd_c'])
assert.equal(segs[1].status, 'ready')
assert.equal(directedCount(segs), 1)

assert.equal(segmentAt(segs, 9).id, 'sd_b')
assert.equal(segmentAt(segs, 20), null)

// Retime refresca el texto; solapes detectados.
segs = retimeSegment(segs, 'sd_b', { start: 2.4, end: 14 }, units)
assert.equal(segs[1].text, 'The Martian parece ciencia ficción. Watney necesita agua.')
assert.deepEqual(overlapsOf(segs, segs[1]).map((s) => s.id), [a.id])

// Materiales: alternar por scope+kind+id.
const clip = { kind: 'clips', id: 5, scope: 'project' }
let seg = { ...segs[1], materials: toggleMaterial(segs[1], clip) }
assert.equal(hasMaterial(seg, { kind: 'clips', id: '5' }), true)
assert.equal(hasMaterial(seg, { kind: 'clips', id: '5', scope: 'library' }), false)
seg = { ...seg, materials: toggleMaterial(seg, clip) }
assert.deepEqual(seg.materials, [])

// Borrar un tramo limpia las referencias a él.
const withRef = patchSegment(segs, 'sd_c', { mode: 'reinforce', reference_id: 'sd_b' })
assert.equal(removeSegment(withRef, 'sd_b').find((s) => s.id === 'sd_c').reference_id, null)

// Acción principal: primero lo determinista.
assert.equal(primaryAction({ mode: 'material', materials: [clip] }, []).id, 'place')
assert.equal(primaryAction({ mode: 'material', materials: [] }, []).id, 'generate')
assert.equal(primaryAction({ mode: 'reinforce', reference_id: 'r' }, [{ id: 'r', composition_id: 'mg_1' }]).id, 'reuse')
assert.equal(primaryAction({ mode: 'reinforce', reference_id: 'r' }, [{ id: 'r' }]).id, 'generate')

// Filtro de materiales: texto en título o descripción; los sin descripción al final.
const cat = [
  { kind: 'clips', id: '1', title: 'Trailer', description: '' },
  { kind: 'images', id: '2', title: 'Poster', description: 'póster de Marte' },
  { kind: 'clips', id: '3', title: 'Huerto', description: 'papas en Marte' },
]
assert.deepEqual(filterMaterials(cat).map((m) => m.id), ['2', '3', '1'])
assert.deepEqual(filterMaterials(cat, { q: 'marte', kind: 'clips' }).map((m) => m.id), ['3'])

assert.equal(fmtTime(0), '0:00.0')
assert.equal(fmtTime(75.25), '1:15.3')

console.log('directionModel OK')
