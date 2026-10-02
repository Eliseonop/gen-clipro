import assert from 'node:assert/strict'
import { cacheStats, createLruBytes, pixelBytes, registerStats } from './lruBytes.js'

// Descarta las más antiguas al pasar el tope de bytes.
{
  const evicted = []
  const c = createLruBytes({ maxBytes: 100, onEvict: (k) => evicted.push(k) })
  c.set('a', 1, 40)
  c.set('b', 2, 40)
  c.get('a')                // 'a' pasa a ser la más reciente
  c.set('c', 3, 40)         // 120 > 100 → sale 'b'
  assert.deepEqual(evicted, ['b'])
  assert.equal(c.bytes, 80)
  assert.deepEqual(c.keys(), ['a', 'c'])
}

// Una entrada sola mayor que el tope se conserva (no se queda la caché vacía).
{
  const c = createLruBytes({ maxBytes: 10 })
  c.set('x', 'big', 50)
  assert.equal(c.size, 1)
  assert.equal(c.bytes, 50)
  c.set('y', 'big2', 50)
  assert.deepEqual(c.keys(), ['y'])
}

// Reemplazar una clave no cuenta dos veces y avisa del valor anterior.
{
  const evicted = []
  const c = createLruBytes({ maxBytes: 1000, onEvict: (k, v) => evicted.push(v) })
  c.set('k', 'v1', 10)
  c.set('k', 'v2', 30)
  assert.equal(c.bytes, 30)
  assert.deepEqual(evicted, ['v1'])
  c.set('k', 'v2', 30)          // mismo valor: no es un descarte
  assert.deepEqual(evicted, ['v1'])
}

// purge borra lo que ya no está vivo; resize ajusta el total y recorta.
{
  const c = createLruBytes({ maxBytes: 100 })
  c.set('clip1', 'a', 10)
  c.set('clip2', 'b', 10)
  c.set('clip3', 'c', 10)
  c.purge((k) => k !== 'clip2')
  assert.deepEqual(c.keys(), ['clip1', 'clip3'])
  c.resize('clip3', 95)
  assert.deepEqual(c.keys(), ['clip3'])
  assert.equal(c.bytes, 95)
  c.clear()
  assert.equal(c.size, 0)
  assert.equal(c.bytes, 0)
}

// Registro para el panel de memoria.
{
  createLruBytes({ maxBytes: 5, name: 'test-cache' }).set('a', 1, 3)
  registerStats('test-stats', () => ({ entries: 2, bytes: 7 }))
  const stats = cacheStats()
  assert.deepEqual(stats.find((s) => s.name === 'test-cache'), { name: 'test-cache', entries: 1, bytes: 3, maxBytes: 5 })
  assert.deepEqual(stats.find((s) => s.name === 'test-stats'), { name: 'test-stats', entries: 2, bytes: 7, maxBytes: 0 })
}

assert.equal(pixelBytes({ width: 10, height: 20 }), 800)
assert.equal(pixelBytes({ naturalWidth: 2, naturalHeight: 2 }), 16)
assert.equal(pixelBytes(null), 0)

console.log('lruBytes ok')
