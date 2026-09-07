import assert from 'node:assert/strict'
import { pickClipVisualProps, applyClipVisualProps, CLIP_VISUAL_KEYS } from './editorModel.js'

const source = {
  id: 'cA', track_id: 'V1', kind: 'video', filename: 'a.mp4', asset_id: '1',
  start: 3, in_point: 0, out_point: 5, source_duration: 5,
  volume: 0.5, muted: true, speed: 2,
  layout: 'overlay', frame: 'full',
  transform: { x: 0.2, y: 0.8, scale: 1.5, rotation: 10, opacity: 0.9 },
  reframe: { zoom: 0.7, keyframes: [{ id: 'k1', t: 0, cx: 0.4, cy: 0.5 }] },
  keyframes: { enabled: true, items: [{ id: 'p1', t: 0, x: 0.2, y: 0.8 }] },
  effects: { blur: 2 },
}

const target = {
  id: 'cB', track_id: 'V2', kind: 'video', filename: 'b.mp4', asset_id: '2',
  start: 10, in_point: 1, out_point: 4, source_duration: 9,
  volume: 1, muted: false, speed: 1,
  layout: 'fill', transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
  reframe: { zoom: 1, keyframes: [] },
}

// Copiar: solo propiedades visuales, clonadas (no referencias).
const props = pickClipVisualProps(source)
assert.deepEqual(Object.keys(props).sort(), CLIP_VISUAL_KEYS.filter((k) => source[k] !== undefined).sort())
assert.ok(!('id' in props) && !('volume' in props) && !('start' in props), 'no copia id/audio/tiempos')
props.transform.x = 999   // mutar la copia no afecta al origen
assert.equal(source.transform.x, 0.2, 'la copia es profunda')

// Pegar: conserva identidad/tiempos/contenido/audio del destino.
const out = applyClipVisualProps(target, pickClipVisualProps(source))
assert.equal(out.id, 'cB')
assert.equal(out.track_id, 'V2')
assert.equal(out.start, 10)
assert.equal(out.in_point, 1)
assert.equal(out.out_point, 4)
assert.equal(out.source_duration, 9)
assert.equal(out.filename, 'b.mp4')
assert.equal(out.volume, 1)
assert.equal(out.muted, false)
assert.equal(out.speed, 1)

// Pero recibe exactamente las props visuales del origen.
assert.equal(out.layout, 'overlay')
assert.equal(out.frame, 'full')
assert.deepEqual(out.transform, source.transform)
assert.equal(out.reframe.zoom, 0.7)
assert.deepEqual(out.effects, { blur: 2 })

// Los ids de keyframes se regeneran (no colisionan con el origen).
assert.notEqual(out.reframe.keyframes[0].id, 'k1', 'reframe kf id regenerado')
assert.equal(out.reframe.keyframes[0].cx, 0.4, 'pero conserva el valor')
assert.notEqual(out.keyframes.items[0].id, 'p1', 'pose kf id regenerado')
assert.equal(out.keyframes.items[0].x, 0.2)

// No muta el destino original.
assert.equal(target.layout, 'fill', 'applyClipVisualProps es puro')

console.log('clipProps ok')
