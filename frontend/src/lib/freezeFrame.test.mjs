// Congelar fotograma (#11): misma inserción que el export/MCP
// (backend/tests/test_freeze_frame.py). De paso: split con keyframes e invertido.
import assert from 'node:assert/strict'
import { canFreeze, freezeSourceTime, frozenClipFrom, insertFreeze } from './freezeFrame.js'
import { splitClipAt } from '../features/editor/editorModel.js'

const video = (extra = {}) => ({
  id: 'v', track_id: 'V1', kind: 'video', asset_kind: 'clips', asset_id: '0', filename: 'a.mp4',
  start: 0, in_point: 0, out_point: 6, source_duration: 6, speed: 1, ...extra,
})
const image = { id: 'img1', filename: 'f.png', label: 'congelado' }

// Parte, inserta y desplaza (solo la misma pista).
{
  const clips = [video(), { ...video({ id: 'w', start: 6, out_point: 2 }) }, video({ id: 'o', track_id: 'V2', start: 3, out_point: 2 })]
  const frozen = frozenClipFrom(clips[0], image, 2)
  const out = insertFreeze(clips, 'v', 2, frozen, 'r')
  const [left, f, right] = out
  assert.deepEqual([left.id, left.out_point], ['v', 2])
  assert.deepEqual([f.kind, f.start, f.out_point, f.asset_id], ['image', 2, 3, 'img1'])
  assert.deepEqual([right.id, right.in_point, right.start], ['r', 2, 5])
  assert.equal(out.find((c) => c.id === 'w').start, 9)
  assert.equal(out.find((c) => c.id === 'o').start, 3)
}

// Pose congelada (keyframes) y la parte derecha continúa la animación.
{
  const base = { y: 0.5, scale: 1, rotation: 0, opacity: 1 }
  const v = video({
    layout: 'overlay', flip_h: true, blend_mode: 'screen',
    keyframes: { enabled: true, items: [
      { id: 'a', t: 0, interpolation: 'linear', props: { ...base, x: 0.2 } },
      { id: 'b', t: 4, interpolation: 'linear', props: { ...base, x: 0.8 } },
    ] },
  })
  const f = frozenClipFrom(v, image, 2)
  assert.ok(Math.abs(f.transform.x - 0.5) < 1e-9)
  assert.equal(f.keyframes, undefined)
  assert.deepEqual([f.flip_h, f.blend_mode, f.layout], [true, 'screen', 'overlay'])
  const [, , right] = insertFreeze([v], 'v', 2, f, 'r')
  assert.deepEqual(right.keyframes.items.map((k) => k.t), [-2, 2])
}

// Encuadre de fuente de ese instante.
{
  const v = video({ reframe: { zoom: 0.6, keyframes: [{ t: 0, cx: 0.3, cy: 0.5 }, { t: 4, cx: 0.7, cy: 0.5 }] } })
  const f = frozenClipFrom(v, image, 2)
  assert.equal(f.reframe.keyframes.length, 1)
  assert.ok(Math.abs(f.reframe.keyframes[0].cx - 0.5) < 1e-3)
}

// En los bordes: delante o detrás.
{
  const f = frozenClipFrom(video(), image, 0.02)
  const [a, b] = insertFreeze([video()], 'v', 0.02, f, 'r')
  assert.deepEqual([a.kind, a.start, b.start], ['image', 0, 3])
  const g = frozenClipFrom(video(), image, 5.98)
  const [c, d] = insertFreeze([video()], 'v', 5.98, g, 'r')
  assert.deepEqual([c.kind, c.start, d.kind, d.start], ['video', 0, 'image', 6])
}

// Velocidad: el segundo 1 de la barra a 2x es el 2 de la fuente.
assert.equal(freezeSourceTime(video({ speed: 2 }), 1), 2)
assert.equal(canFreeze(video(), 3), true)
assert.equal(canFreeze({ ...video(), kind: 'image' }, 3), false)
assert.equal(canFreeze(video(), 7), false)

// Split invertido: la izquierda se queda con el final de la fuente.
{
  const { left, right } = splitClipAt(video({ reverse: true }), 2, 'r')
  assert.deepEqual([left.in_point, left.out_point], [4, 6])
  assert.deepEqual([right.in_point, right.out_point, right.start], [0, 4, 2])
}

console.log('freezeFrame ok')
