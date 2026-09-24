import assert from 'node:assert/strict'
import {
  ATTR_GROUP_IDS, copyClipAttrs, groupApplies, mergeKeyframes, pasteClipAttrs, pasteableGroups,
} from './clipAttrs.js'
import { clipPropsAt } from './clipKeyframes.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-5, `${msg}: ${a} ≠ ${b}`)

const clip = (id, kind = 'video', extra = {}) => ({
  id, track_id: 'V1', kind, filename: 'a.mp4', start: 0, in_point: 0, out_point: 4, source_duration: 4,
  volume: 1, ...extra,
})

// Keyframe como los crea el editor: instantánea de TODAS las propiedades.
const full = (t, props = {}) => ({
  id: `k${t}`, t, interpolation: 'linear',
  props: {
    x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, cx: 0.5, cy: 0.5, zoom: 1, rot_x: 0, rot_y: 0,
    volume: 1, eq: 0, compressor: 0, reverb: 0, echo: 0, denoise: 0, distortion: 0, ...props,
  },
})
const zoomAnim = () => ({ enabled: true, items: [full(0, { scale: 1 }), full(2, { scale: 2 })] })

// --- Grupos -------------------------------------------------------------------
{
  const v = clip('v'), a = clip('a', 'audio'), t = clip('t', 'text'), s = clip('s', 'shape')
  assert.ok(groupApplies('transform', v, t))
  assert.ok(!groupApplies('audio', v, t))
  assert.ok(groupApplies('audio', v, a))
  assert.ok(!groupApplies('crop', v, s))
  assert.ok(groupApplies('style', t, clip('t2', 'text')))
  assert.ok(!groupApplies('style', t, s), 'estilo solo entre clips del mismo tipo')

  const offered = pasteableGroups(v, [v, clip('b'), a])
  assert.equal(offered.find((g) => g.id === 'audio').count, 2)
  assert.equal(offered.find((g) => g.id === 'flip').count, 1, 'el audio no se voltea')
  assert.equal(offered[0].total, 2, 'el propio origen no cuenta')
  assert.ok(!offered.some((g) => g.id === 'style'))
}

// --- Valores fijos ----------------------------------------------------------------
{
  const src = clip('A', 'video', {
    transform: { x: 0.2, y: 0.7, scale: 1.5, rotation: 10 }, layout: 'overlay',
    effects: { blur: 2 }, look: 'warm', volume: 0.3, speed: 2,
  })
  const board = copyClipAttrs(src)
  src.effects.blur = 9
  assert.equal(board.effects.blur, 2, 'el portapapeles es una copia profunda')
  const dst = clip('B', 'video', { filename: 'b.mp4', start: 9, in_point: 1, out_point: 3 })
  const out = pasteClipAttrs(dst, board, ATTR_GROUP_IDS)
  for (const k of ['id', 'filename', 'start', 'in_point', 'out_point', 'track_id']) assert.equal(out[k], dst[k])
  assert.deepEqual(out.transform, { x: 0.2, y: 0.7, scale: 1.5, rotation: 10 })
  assert.equal(out.layout, 'overlay')
  assert.deepEqual(out.effects, { blur: 2 })
  assert.equal(out.look, 'warm')
  assert.equal(out.volume, 0.3)
  assert.equal(out.speed, 2)
  assert.equal(dst.volume, 1, 'no muta la entrada')
}
{
  const out = pasteClipAttrs(clip('B'), clip('A', 'video', { transform: { x: 0.2 }, effects: { blur: 2 }, flip_h: true }), ['flip'])
  assert.equal(out.flip_h, true)
  assert.equal(out.effects, undefined, 'solo los grupos elegidos')
  assert.equal(out.transform, undefined)
}
{
  // Pose y opacidad entre tipos: el vídeo las guarda en transform/opacity, el texto en style.
  const src = clip('A', 'video', { transform: { x: 0.3, y: 0.6, scale: 2, rotation: 45 }, opacity: 0.4, blend_mode: 'screen' })
  const out = pasteClipAttrs(clip('T', 'text', { style: { x: 0.5, y: 0.9, font: 'Anton', opacity: 1 } }), src, ['transform', 'blend'])
  assert.deepEqual([out.style.x, out.style.y, out.style.scale, out.style.rotation], [0.3, 0.6, 2, 45])
  assert.equal(out.style.opacity, 0.4)
  assert.equal(out.style.font, 'Anton')
  assert.equal(out.blend_mode, 'screen')
  assert.equal(pasteClipAttrs(src, out, ['blend']).opacity, 0.4)
}
{
  const src = clip('A', 'text', { style: { font: 'Anton', color: '#ff0', x: 0.1, y: 0.1, rot_x: 30 } })
  const out = pasteClipAttrs(clip('B', 'text', { style: { font: 'Arial', x: 0.5, y: 0.8 } }), src, ['style'])
  assert.deepEqual(out.style, { font: 'Anton', color: '#ff0', x: 0.5, y: 0.8 }, 'el estilo no mueve el texto')
}
{
  const src = clip('A', 'shape', { shape: { type: 'star', fill: '#111111', stroke: '#222222', strokeWidth: 9, w: 0.9, x: 0.1 } })
  const out = pasteClipAttrs(clip('B', 'shape', { shape: { type: 'rect', fill: '#e53935', w: 0.3, x: 0.5 } }), src, ['style'])
  assert.deepEqual(out.shape, { type: 'rect', fill: '#111111', stroke: '#222222', strokeWidth: 9, w: 0.3, x: 0.5 })
}
{
  const src = clip('A', 'video', { reframe: { zoom: 0.6, crop_w: 0.5, crop_h: 0.5, master: true, keyframes: [{ id: 'r1', t: 0, cx: 0.3, cy: 0.5 }] } })
  const out = pasteClipAttrs(clip('B', 'video', { reframe: { zoom: 1, master: false } }), src, ['crop'])
  assert.equal(out.reframe.crop_w, 0.5)
  assert.equal(out.reframe.master, false, 'master es del archivo del destino')
  assert.equal(out.reframe.keyframes[0].cx, 0.3)
  assert.notEqual(out.reframe.keyframes[0].id, 'r1')
}
{
  const src = clip('A', 'video', {
    bg_removal: {
      enabled: true, mode: 'chroma', chroma: { enabled: true, color: '#00ff00' },
      outline: { enabled: true, width: 8 }, auto: { enabled: true, base_key: 'SRC' },
    },
  })
  const out = pasteClipAttrs(clip('B', 'video', { bg_removal: { enabled: true, auto: { enabled: true, base_key: 'DST' } } }), src, ['chroma'])
  assert.equal(out.bg_removal.auto.base_key, 'DST', 'el recorte IA nunca se pega')
  assert.equal(out.bg_removal.chroma.color, '#00ff00')
  assert.equal(out.bg_removal.outline.width, 8)
  assert.equal(pasteClipAttrs(clip('C', 'video', { bg_removal: { chroma: { enabled: true } } }), clip('D'), ['chroma']).bg_removal, null)
}
{
  const out = pasteClipAttrs(clip('B'), clip('A', 'video', { masks: [{ id: 'm1', type: 'circle', w: 0.3 }] }), ['mask'])
  assert.equal(out.masks[0].w, 0.3)
  assert.notEqual(out.masks[0].id, 'm1')
}

// --- Keyframes ----------------------------------------------------------------------
{
  // La animación no pisa el volumen ni la posición del destino.
  const out = pasteClipAttrs(clip('B', 'video', { volume: 0.5, transform: { x: 0.2, y: 0.3 } }), clip('A', 'video', { keyframes: zoomAnim() }), ['animation'])
  for (const k of out.keyframes.items) assert.deepEqual(Object.keys(k.props), ['scale'], 'solo lo que de verdad anima')
  const p = clipPropsAt(out, 1)
  near(p.scale, 1.5, 'escala')
  near(p.volume, 0.5, 'volumen del destino')
  near(p.x, 0.2, 'x del destino')
  near(p.y, 0.3, 'y del destino')
}
{
  // Conserva el fundido de volumen del destino.
  const dst = clip('B', 'video', { keyframes: { enabled: true, items: [full(0, { volume: 0 }), full(1, { volume: 1 })] } })
  const out = pasteClipAttrs(dst, clip('A', 'video', { keyframes: zoomAnim() }), ['animation'])
  for (const t of [0, 0.5, 1, 2]) {
    near(clipPropsAt(out, t).volume, clipPropsAt(dst, t).volume, `volumen en ${t}`)
    near(clipPropsAt(out, t).scale, 1 + Math.min(t, 2) / 2, `escala en ${t}`)
  }
}
{
  // Origen sin animación → el destino deja de animar la pose (el fundido se queda).
  const dst = clip('B', 'video', { keyframes: { enabled: true, items: [full(0, { scale: 1, volume: 0 }), full(1, { scale: 3, volume: 1 })] } })
  const out = pasteClipAttrs(dst, clip('A'), ['animation'])
  near(clipPropsAt(out, 1).scale, 1, 'escala fija')
  near(clipPropsAt(out, 0.5).volume, 0.5, 'fundido intacto')
}
{
  // La posición pegada se ve aunque el destino tenga keyframes (su x fija iba repetida en ellos).
  const out = pasteClipAttrs(clip('B', 'video', { keyframes: zoomAnim() }), clip('A', 'video', { transform: { x: 0.1, y: 0.9 } }), ['transform'])
  near(clipPropsAt(out, 1).x, 0.1, 'x pegada')
  near(clipPropsAt(out, 1).scale, 1.5, 'la animación sigue')
}
{
  // Los dos animan en instantes distintos → unión de instantes, exacta en ellos.
  const dst = clip('B', 'video', { keyframes: { enabled: true, items: [full(0, { volume: 0 }), full(0.5, { volume: 1 }), full(3, { volume: 0.2 })] } })
  const src = clip('A', 'video', { keyframes: zoomAnim() })
  const out = pasteClipAttrs(dst, src, ['animation'])
  const times = out.keyframes.items.map((k) => k.t)
  assert.deepEqual(times, [0, 0.5, 2, 3])
  for (const t of times) {
    near(clipPropsAt(out, t).volume, clipPropsAt(dst, t).volume, `volumen en ${t}`)
    near(clipPropsAt(out, t).scale, clipPropsAt(src, t).scale, `escala en ${t}`)
  }
}
{
  const kf = { enabled: false, items: [full(0, { scale: 3 })] }
  assert.deepEqual(mergeKeyframes(clip('B', 'video', { keyframes: kf }), clip('A'), ['x']), kf, 'keyframes apagados intactos')
}
assert.equal(pasteClipAttrs(clip('A'), clip('A', 'video', { flip_h: true }), ['flip']).flip_h, undefined, 'no se pega en sí mismo')

console.log('clipAttrs ok')
