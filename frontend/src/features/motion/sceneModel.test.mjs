import assert from 'node:assert/strict'
import {
  FALLBACK_BRIEF, answersPayload, applyPreset, beatsToRows, moveRow, newBeatId, parseSeconds,
  pickPresetFields, presetDirty, rowsToBeats, rowsTotal,
} from './sceneModel.js'

// Preset: conserva idea/guion/duración; fusiona recursos y nunca activa vídeo.
const brief = { ...FALLBACK_BRIEF, idea: 'Sol', script: 'El Sol se apaga', duration: 8 }
const loaded = applyPreset(brief, { direction: 'blueprint', resources: { stick: 'off', video: 'required' } })
assert.equal(loaded.idea, 'Sol')
assert.equal(loaded.duration, 8)
assert.equal(loaded.direction, 'blueprint')
assert.equal(loaded.resources.stick, 'off')
assert.equal(loaded.resources.graphic, 'auto')
assert.equal(loaded.resources.video, 'off')

// pickPresetFields no guarda campos del tramo y copia en profundidad.
const p = pickPresetFields(loaded)
assert.equal(p.idea, undefined)
assert.equal(p.script, undefined)
p.resources.text = 'off'
assert.equal(loaded.resources.text, 'auto')

assert.equal(presetDirty(loaded, { direction: 'blueprint' }), false)
assert.equal(presetDirty({ ...loaded, direction: 'swiss' }, { direction: 'blueprint' }), true)
assert.equal(presetDirty(loaded, null), false)

// Filas de beats: duración ↔ start/end contiguos.
const rows = beatsToRows([{ id: 'b1', start: 0, end: 2.5 }, { id: 'b2', start: 2.5, end: 6 }])
assert.deepEqual(rows.map((r) => r.duration), [2.5, 3.5])
assert.equal(rowsTotal(rows), 6)
const swapped = moveRow(rows, 1, -1)
assert.deepEqual(rowsToBeats(swapped).map((b) => [b.id, b.start, b.end]), [['b2', 0, 3.5], ['b1', 3.5, 6]])
assert.equal(moveRow(rows, 0, -1), rows)
assert.equal('duration' in rowsToBeats(rows)[0], false)
assert.equal(newBeatId(rows), 'b3')
assert.equal(newBeatId([{ id: 'b2' }]), 'b3')

assert.equal(parseSeconds('1,5'), 1.5)
assert.equal(parseSeconds('2s'), 2)
assert.equal(parseSeconds('x'), null)

// Respuestas: multi → lista, vacías fuera.
const qs = [{ id: 'q1', question: '¿Tono?' }, { id: 'q2', question: '¿Qué?' }, { id: 'q3', question: '¿Nada?' }]
assert.deepEqual(answersPayload(qs, { q1: ['serio', 'claro'], q2: ' un Sol ', q3: '' }), [
  { question: '¿Tono?', answer: 'serio, claro' },
  { question: '¿Qué?', answer: 'un Sol' },
])

console.log('sceneModel OK')
