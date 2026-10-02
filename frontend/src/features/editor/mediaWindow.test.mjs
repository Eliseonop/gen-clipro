import assert from 'node:assert/strict'
import { distanceToHead, mediaWindow, sameIds } from './mediaWindow.js'

const v = (id, start, dur, kind = 'video') => ({ id, kind, start, in_point: 0, out_point: dur, speed: 1 })
const opts = { behind: 2, ahead: 5, keepBehind: 6, keepAhead: 10, max: 3 }

// Solo entran los medios cerca del cabezal (ni textos ni figuras).
{
  const clips = [v('a', 0, 4), v('b', 4, 4), v('c', 20, 4), { id: 't', kind: 'text', start: 0, out_point: 5 }, v('s', 5, 2, 'audio')]
  const w = mediaWindow(clips, 3, { opts })
  assert.deepEqual([...w].sort(), ['a', 'b', 's'])
}

// Los fijados siempre, aunque estén lejos y aunque se pase del tope.
{
  const clips = [v('a', 0, 4), v('b', 4, 4), v('c', 6, 2), v('far', 100, 4)]
  const w = mediaWindow(clips, 3, { opts, pinned: new Set(['far']) })
  assert.ok(w.has('far'))
  assert.equal(w.size, 4)   // 3 cercanos (tope) + el fijado
}

// Tope: se quedan los más cercanos al cabezal.
{
  const clips = [v('a', 0, 1), v('b', 1, 1), v('c', 2, 1), v('d', 3, 1), v('e', 4, 1)]
  const w = mediaWindow(clips, 2.5, { opts })
  assert.deepEqual([...w].sort(), ['b', 'c', 'd'])
}

// Histéresis: un clip ya montado aguanta más allá de la ventana normal.
{
  const clips = [v('a', 0, 2), v('b', 10, 2)]
  assert.ok(!mediaWindow(clips, 5, { opts }).has('a'))                       // 3 s por detrás > behind
  assert.ok(mediaWindow(clips, 5, { opts, prev: new Set(['a']) }).has('a'))  // pero < keepBehind
  assert.ok(!mediaWindow(clips, 9, { opts, prev: new Set(['a']) }).has('a')) // demasiado lejos ya
}

assert.equal(distanceToHead(v('a', 5, 2), 3), 2)
assert.equal(distanceToHead(v('a', 5, 2), 6), 0)
assert.equal(distanceToHead(v('a', 5, 2), 9), 2)
assert.ok(sameIds(new Set(['a', 'b']), new Set(['b', 'a'])))
assert.ok(!sameIds(new Set(['a']), new Set(['a', 'b'])))

console.log('mediaWindow ok')
