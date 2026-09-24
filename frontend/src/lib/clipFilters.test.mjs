import assert from 'node:assert/strict'
import {
  FILTERS, FILTER_GROUPS, FILTER_IDS, SWATCH, applyMatrix, clipFilters, compose, filterMatrix, stackMatrix,
} from './clipFilters.js'
import { pasteClipAttrs } from './clipAttrs.js'

const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]
const close = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-12, `${msg}: ${a} ≠ ${b}`))

assert.equal(FILTER_IDS.length, 15)
assert.ok(FILTERS.every((f) => FILTER_GROUPS.some((g) => g.id === f.group)))
for (const id of ['bw', 'cinematic', 'vintage', 'contrast', 'warm', 'cool', 'saturated']) {
  assert.ok(FILTER_IDS.includes(id), `el look antiguo «${id}» sigue existiendo`)
}

// Intensidad: 0 = original, 1 = filtro, en medio = mezcla lineal.
assert.deepEqual(filterMatrix('noir', 0), I)
const c = [0.8, 0.3, 0.2]
const full = applyMatrix(filterMatrix('sepia', 1), c)
close(applyMatrix(filterMatrix('sepia', 0.5), c), c.map((v, i) => (v + full[i]) / 2), 'media intensidad')

// La pila se aplica en orden (Noir y luego Cálido).
const m = stackMatrix([{ id: 'noir', amount: 1 }, { id: 'warm', amount: 1 }])
close(applyMatrix(m, c), applyMatrix(filterMatrix('warm'), applyMatrix(filterMatrix('noir'), c)), 'orden')
assert.equal(stackMatrix([{ id: 'bw', amount: 0 }]), null)
assert.deepEqual(compose(I, filterMatrix('bw')), filterMatrix('bw'))

// Look antiguo → pila; la pila manda sobre el look.
assert.deepEqual(clipFilters({ look: 'vintage' }), [{ id: 'vintage', amount: 1 }])
assert.deepEqual(clipFilters({ look: 'none' }), [])
assert.deepEqual(clipFilters({ filters: [{ id: 'x' }, { id: 'bw', amount: 3 }], look: 'warm' }), [{ id: 'bw', amount: 1 }])

// Muestra: B/N deja los cuatro colores grises; recorta a 0–1.
for (const rgb of SWATCH.map((s) => applyMatrix(filterMatrix('bw'), s))) {
  assert.ok(Math.abs(rgb[0] - rgb[1]) < 1e-9 && Math.abs(rgb[1] - rgb[2]) < 1e-9)
}
assert.deepEqual(applyMatrix(filterMatrix('contrast'), [1, 1, 1]), [1, 1, 1])

// Pegar atributos → Filtro, efectos y ajustes copia la pila.
const out = pasteClipAttrs({ id: 'b', kind: 'video' }, { id: 'a', kind: 'video', filters: [{ id: 'noir', amount: 0.4 }] }, ['effects'])
assert.deepEqual(out.filters, [{ id: 'noir', amount: 0.4 }])

console.log('clipFilters ok')
