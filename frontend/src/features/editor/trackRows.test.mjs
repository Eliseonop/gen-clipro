import assert from 'node:assert/strict'
import {
  ROW_H_DEFAULT, ROW_H_MAX, ROW_H_MIN, ROW_H_KEY, TEXT_ROW_MIN,
  clampRowHeight, trackRowHeight, stepRowHeight, readRowHeight, writeRowHeight,
} from './trackRows.js'

// --- clamp -------------------------------------------------------------------
assert.equal(clampRowHeight(52), 52)
assert.equal(clampRowHeight(5), ROW_H_MIN)
assert.equal(clampRowHeight(999), ROW_H_MAX)
assert.equal(clampRowHeight('60'), 60)
assert.equal(clampRowHeight(52.4), 52)
assert.equal(clampRowHeight('abc'), ROW_H_DEFAULT)
assert.equal(clampRowHeight(null), ROW_H_DEFAULT)

// --- alto por tipo de pista ---------------------------------------------------
// Vídeo y audio: alto completo.
assert.equal(trackRowHeight('video', 52), 52)
assert.equal(trackRowHeight('audio', 52), 52)
// Texto: ~la mitad.
assert.equal(trackRowHeight('text', 52), 29)
assert.equal(trackRowHeight('text', 100), 55)
// Nunca por debajo del mínimo legible, ni por encima del alto base.
assert.equal(trackRowHeight('text', ROW_H_MIN), TEXT_ROW_MIN)
assert.ok(trackRowHeight('text', ROW_H_MIN) <= ROW_H_MIN)
// El texto siempre es más bajo (o igual) que el vídeo, nunca más alto.
for (const h of [34, 40, 52, 80, 120]) {
  assert.ok(trackRowHeight('text', h) <= trackRowHeight('video', h), `texto <= video en ${h}`)
}

// --- paso con Ctrl+rueda ------------------------------------------------------
assert.equal(stepRowHeight(52, -1), 57)   // arriba agranda
assert.equal(stepRowHeight(52, 1), 47)    // abajo encoge
assert.equal(stepRowHeight(ROW_H_MAX, -1), ROW_H_MAX)
assert.equal(stepRowHeight(ROW_H_MIN, 1), ROW_H_MIN)

// --- persistencia -------------------------------------------------------------
function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _dump: () => Object.fromEntries(map),
  }
}
assert.equal(readRowHeight(fakeStorage({})), ROW_H_DEFAULT)
assert.equal(readRowHeight(fakeStorage({ [ROW_H_KEY]: '70' })), 70)
assert.equal(readRowHeight(fakeStorage({ [ROW_H_KEY]: '9999' })), ROW_H_MAX)
assert.equal(readRowHeight(fakeStorage({ [ROW_H_KEY]: 'nope' })), ROW_H_DEFAULT)
assert.equal(readRowHeight(null), ROW_H_DEFAULT)

const st = fakeStorage({})
writeRowHeight(st, 88)
assert.equal(st._dump()[ROW_H_KEY], '88')
assert.equal(readRowHeight(st), 88)
writeRowHeight(st, 5)
assert.equal(st._dump()[ROW_H_KEY], String(ROW_H_MIN))

// Modo privado / quota: no revienta.
const broken = { getItem: () => { throw new Error('nope') }, setItem: () => { throw new Error('nope') } }
assert.equal(readRowHeight(broken), ROW_H_DEFAULT)
writeRowHeight(broken, 60)

console.log('trackRows ok')
