import assert from 'node:assert/strict'
import { HISTORY_MAX_STEPS, snapBytes, trimHistory } from './useEditorHistory.js'

// Tope de pasos.
{
  const past = Array.from({ length: HISTORY_MAX_STEPS + 5 }, (_, i) => `s${i}`)
  trimHistory(past)
  assert.equal(past.length, HISTORY_MAX_STEPS)
  assert.equal(past[0], 's5')
}

// Tope de bytes: se van las más antiguas, siempre queda al menos una.
{
  const big = 'x'.repeat(100)            // 200 bytes contados
  const past = [big + 'a', big + 'b', big + 'c']
  trimHistory(past, [], 80, 450)
  assert.deepEqual(past.map((s) => s.at(-1)), ['b', 'c'])
  trimHistory(past, [], 80, 10)
  assert.equal(past.length, 1)
}

// El futuro (redo) también cuenta para el tope.
{
  const s = 'y'.repeat(50)               // 100 bytes
  const past = [s, s, s]
  trimHistory(past, [s, s], 80, 350)
  assert.equal(past.length, 1)
}

assert.equal(snapBytes('abc'), 6)
assert.equal(snapBytes(null), 0)

console.log('useEditorHistory ok')
