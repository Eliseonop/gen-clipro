import assert from 'node:assert/strict'
import {
  bestForHint, contextLine, contextStats, dedupe, iconOf, isCustom, KIND_ICON, TYPE_HINTS,
} from './resourceModel.js'

// iconOf cae a 'custom' con un kind desconocido o ausente.
assert.equal(iconOf({ kind: 'timeline' }), KIND_ICON.timeline)
assert.equal(iconOf({ kind: 'inventado' }), KIND_ICON.custom)
assert.equal(iconOf(null), KIND_ICON.custom)

// Sin plantilla = composición a medida (la IA la escribe desde cero).
assert.equal(isCustom({ template: null }), true)
assert.equal(isCustom({ template: 'stack_list' }), false)

// dedupe conserva el orden y se queda con la PRIMERA de cada plantilla: la IA va
// delante de las heurísticas, así que gana la suya.
const deduped = dedupe([
  { id: 'a1', template: 'timeline_track', label: 'IA' },
  { id: 'h1', template: 'timeline_track', label: 'heurística' },
  { id: 'a2', template: 'versus', label: 'VS' },
  null,
])
assert.deepEqual(deduped.map((s) => s.id), ['a1', 'a2'])

// Dos sugerencias sin plantilla no se pisan si el texto difiere.
const customs = dedupe([
  { id: 'c1', template: null, label: 'uno' },
  { id: 'c2', template: null, label: 'dos' },
  { id: 'c3', template: null, label: 'uno' },
])
assert.deepEqual(customs.map((s) => s.id), ['c1', 'c2'])

// Instrucción escrita (§16): se construye la mejor propuesta de la IA, que suele
// ser una plantilla; las heurísticas no cuentan (no han leído la instrucción).
const heur = { id: 'h1', source: 'heuristic', template: 'timeline_track' }
const aiTpl = { id: 'a1', source: 'ai', template: 'flow_steps' }
const aiFree = { id: 'a2', source: 'ai', template: null, concept: 'un cilindro en un flujo' }
assert.equal(bestForHint({ suggestions: [heur, aiTpl, aiFree] }), aiTpl)
assert.equal(bestForHint({ suggestions: [aiFree, aiTpl] }), aiFree)
// Sin IA (caída o lenta) no se lanza nada: el modal enseña lo del guion.
assert.equal(bestForHint({ suggestions: [heur], degraded: 'La IA tardó demasiado' }), null)
assert.equal(bestForHint({ suggestions: [{ source: 'ai', template: null }] }), null)
assert.equal(bestForHint(null), null)
assert.equal(bestForHint(undefined), null)

// contextLine prefiere lo que se dice ahora; si no hay guion, la nota de un
// material; si tampoco, lo que haya en pantalla.
assert.equal(contextLine({ scriptContext: { current: 'En 1822 Navier…' } }), 'En 1822 Navier…')
assert.equal(
  contextLine({
    scriptContext: { current: '  ' },
    timelineContext: { existingElements: [{ id: '1', kind: 'video', note: 'El científico escribe' }] },
  }),
  'El científico escribe')
assert.equal(
  contextLine({ timelineContext: { existingElements: [{ id: '1', kind: 'video', name: 'toma.mp4' }] } }),
  'En pantalla: toma.mp4')
assert.equal(contextLine({}), 'Nadie habla en este tramo.')
assert.equal(contextLine(null), '')

// contextStats cuenta las señales que recibe la IA.
const stats = contextStats({
  scriptContext: { current: 'algo' },
  timelineContext: { existingElements: [{ note: 'a' }, { note: 'b' }, {}] },
  availableAssets: [{ kind: 'image' }, { kind: 'video' }],
})
assert.deepEqual(stats, { hasScript: true, notes: 2, elements: 3, images: 1 })
assert.deepEqual(contextStats(null), { hasScript: false, notes: 0, elements: 0, images: 0 })

// Los chips de tipo llevan icono y una indicación para la IA.
assert.ok(TYPE_HINTS.length >= 5)
for (const t of TYPE_HINTS) {
  assert.ok(t.id && t.label && t.icon && t.hint, `chip incompleto: ${t.id}`)
}

console.log('resourceModel: ok')
