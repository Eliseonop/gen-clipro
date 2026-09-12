import assert from 'node:assert/strict'
import {
  easeT, interpItems, enableKeyframes, upsertKeyframeAt, clipPropsAt, keyframesOn,
  deleteKeyframeItem, normalizeInterp, keyframeIdAt,
  canKeyframe, opensEffectsOnSelect, clipVolumeAt, applyVolumeFade, sampleVolumeCurve,
  shouldKeyframe, kfState, copyKeyframeAt, pasteKeyframeAt, duplicateKeyframeAt, pickProps, KF_GROUP_IDS, normalizeItems,
} from './clipKeyframes.js'

assert.equal(normalizeInterp('direct'), 'hold')
assert.equal(easeT(0.5, 'linear'), 0.5)
assert.ok(easeT(0.5, 'ease-in') < 0.5)
assert.ok(easeT(0.5, 'ease-out') > 0.5)
assert.equal(easeT(0.3, 'hold'), 0)

const clip = {
  kind: 'shape',
  start: 0,
  shape: { x: 0.2, y: 0.4, rotation: 0, opacity: 1 },
}
const on = enableKeyframes(clip, 0)
assert.equal(on.keyframes.enabled, true)
assert.equal(on.keyframes.items.length, 1)
assert.ok(Math.abs(on.keyframes.items[0].props.x - 0.2) < 1e-9)

const two = upsertKeyframeAt(on, 2, { x: 0.8, y: 0.4 }, 'ease-in-out')
assert.equal(two.keyframes.items.length, 2)
const mid = clipPropsAt(two, 1)
assert.ok(Math.abs(mid.x - 0.5) < 1e-9)

const hold = upsertKeyframeAt(on, 2, { x: 0.8 }, 'hold')
assert.equal(clipPropsAt(hold, 1).x, 0.2)
assert.ok(Math.abs(clipPropsAt(hold, 2).x - 0.8) < 1e-9)

const same = upsertKeyframeAt(two, 2 + 1 / 120, { x: 0.9 }, undefined, 30)
assert.equal(same.keyframes.items.length, 2)
assert.ok(Math.abs(same.keyframes.items[1].props.x - 0.9) < 1e-9)

const nextFrame = upsertKeyframeAt(two, 2 + 1 / 30, { x: 0.1 }, undefined, 30)
assert.equal(nextFrame.keyframes.items.length, 3)

assert.equal(keyframeIdAt(two, 2, 30), two.keyframes.items[1].id)
assert.equal(keyframeIdAt(two, 2 + 1 / 120, 30), two.keyframes.items[1].id)
assert.equal(keyframeIdAt(two, 0, 30), two.keyframes.items[0].id)

assert.equal(keyframesOn(clip), false)
assert.equal(keyframesOn(two), true)

const gone = deleteKeyframeItem(two, two.keyframes.items[1].id)
assert.equal(gone.keyframes.items.length, 1)

const cropA = enableKeyframes({
  kind: 'video',
  in_point: 0,
  reframe: { zoom: 0.5, keyframes: [{ t: 0, cx: 0.2, cy: 0.3, zoom: 0.5 }] },
}, 0, 0)
const cropB = upsertKeyframeAt(cropA, 2, { cx: 0.8, cy: 0.3, zoom: 1 })
const cropMid = clipPropsAt(cropB, 1)
assert.ok(Math.abs(cropMid.cx - 0.5) < 1e-9)
assert.ok(Math.abs(cropMid.zoom - 0.75) < 1e-9)

const items = [
  { t: 0, interpolation: 'linear', props: { x: 0, scale: 1, y: 0, rotation: 0, opacity: 1, cx: 0.5, cy: 0.5, zoom: 1 } },
  { t: 1, interpolation: 'ease-in', props: { x: 1, scale: 1, y: 0, rotation: 0, opacity: 1, cx: 0.5, cy: 0.5, zoom: 1 } },
]
const e = interpItems(items, 0.5, items[0].props)
assert.ok(e.x < 0.5)

assert.equal(clipPropsAt({ kind: 'image', opacity: null }, 0).opacity, 1)
assert.equal(clipPropsAt({ kind: 'image', opacity: 0.4 }, 0).opacity, 0.4)

assert.equal(canKeyframe({ kind: 'audio' }), true)
assert.equal(opensEffectsOnSelect({ kind: 'audio' }), true)
assert.equal(opensEffectsOnSelect({ kind: 'video' }), true)
assert.equal(opensEffectsOnSelect({ kind: 'shape' }), true)

assert.equal(clipVolumeAt({ kind: 'audio', volume: 0.5 }, 0), 0.5)
assert.equal(clipVolumeAt({ kind: 'video', volume: 0.4 }, 0), 0.4)

const volClip = {
  kind: 'audio',
  volume: 1,
  keyframes: {
    enabled: true,
    items: [
      { t: 0, interpolation: 'linear', props: { volume: 1 } },
      { t: 3, interpolation: 'linear', props: { volume: 0.3 } },
      { t: 5, interpolation: 'linear', props: { volume: 0.8 } },
    ],
  },
}
assert.ok(Math.abs(clipVolumeAt(volClip, 0) - 1) < 1e-9)
assert.ok(Math.abs(clipVolumeAt(volClip, 3) - 0.3) < 1e-9)
assert.ok(Math.abs(clipVolumeAt(volClip, 1.5) - 0.65) < 1e-9)
assert.ok(Math.abs(clipVolumeAt(volClip, 4) - 0.55) < 1e-9)

const fxClip = {
  kind: 'audio',
  audio_fx: { reverb: 0 },
  keyframes: {
    enabled: true,
    items: [
      { t: 0, interpolation: 'linear', props: { reverb: 0 } },
      { t: 2, interpolation: 'linear', props: { reverb: 1 } },
    ],
  },
}
assert.ok(Math.abs(clipPropsAt(fxClip, 1).reverb - 0.5) < 1e-9)

const faded = applyVolumeFade({ kind: 'audio', volume: 1 }, 5, 'in', 0.5)
assert.equal(faded.keyframes.enabled, true)
assert.ok(Math.abs(clipVolumeAt(faded, 0)) < 1e-9)
assert.ok(Math.abs(clipVolumeAt(faded, 0.5) - 1) < 1e-9)

const curve = sampleVolumeCurve(volClip, 5, 10)
assert.ok(curve.length >= 3)
assert.ok(Math.abs(curve[0].v - 1) < 1e-9)

// --- Regla "mover ≠ animar" -------------------------------------------------
const plain = { kind: 'shape', start: 0, shape: { x: 0.2, y: 0.4, scale: 1, rotation: 0, opacity: 1 } }

// Sin animar: mover una propiedad NO debe crear keyframe…
assert.equal(shouldKeyframe(plain, { x: 0.9 }), false)
assert.equal(shouldKeyframe(plain, { scale: 2, rotation: 45 }), false)
// …salvo el encuadre, cuyo único almacenamiento son los keyframes.
assert.equal(shouldKeyframe(plain, { cx: 0.3 }), true)
assert.equal(shouldKeyframe(plain, { cy: 0.3 }), true)
// Ya animado: cualquier cambio sí aterriza como keyframe.
const animated = enableKeyframes(plain, 0)
assert.equal(shouldKeyframe(animated, { x: 0.9 }), true)
// Un clip con items pero con la animación apagada sigue siendo estático.
assert.equal(shouldKeyframe(deleteKeyframeItem(animated, animated.keyframes.items[0].id), { x: 0.9 }), false)

// Estados del rombo.
assert.equal(kfState(plain, 0, 30), 'off')
assert.equal(kfState(animated, 0, 30), 'on')
assert.equal(kfState(animated, 5, 30), 'empty')

// Activar la animación siembra UN keyframe con los valores estáticos actuales.
assert.equal(animated.keyframes.items.length, 1)
assert.equal(animated.keyframes.items[0].props.x, 0.2)
assert.equal(animated.keyframes.items[0].props.y, 0.4)

// Estando sobre un keyframe existente se actualiza, no se duplica.
const twice = upsertKeyframeAt(upsertKeyframeAt(animated, 2, { x: 0.5 }), 2, { x: 0.7 })
assert.equal(twice.keyframes.items.length, 2)
assert.equal(twice.keyframes.items[1].props.x, 0.7)

// --- Portapapeles de keyframes ----------------------------------------------
const src = upsertKeyframeAt(
  upsertKeyframeAt(animated, 0, { x: 0.1, scale: 1, volume: 0.4 }),
  3, { x: 0.9, scale: 2, volume: 1 },
)
const board = copyKeyframeAt(src, 3, 30)
assert.equal(board.type, 'keyframe')
assert.ok(Math.abs(board.props.x - 0.9) < 1e-9)
assert.ok(Math.abs(board.props.scale - 2) < 1e-9)
// Sin keyframe en ese instante no hay nada que copiar.
assert.equal(copyKeyframeAt(src, 1.5, 30), null)

// Pegar en un instante libre crea un keyframe con los valores copiados.
const pasted = pasteKeyframeAt(src, 5, board, KF_GROUP_IDS, 30)
assert.equal(pasted.keyframes.items.length, 3)
assert.ok(Math.abs(clipPropsAt(pasted, 5).x - 0.9) < 1e-9)

// Pegar solo un grupo deja el resto intacto.
const onlyTransform = pasteKeyframeAt(src, 0, board, ['transform'], 30)
assert.ok(Math.abs(clipPropsAt(onlyTransform, 0).x - 0.9) < 1e-9)      // sí viaja
assert.ok(Math.abs(clipPropsAt(onlyTransform, 0).volume - 0.4) < 1e-9) // el audio no
assert.equal(onlyTransform.keyframes.items.length, 2)                  // y no duplica

// Sin ningún grupo marcado, pegar no toca el clip.
assert.equal(pasteKeyframeAt(src, 5, board, [], 30), src)
assert.deepEqual(pickProps({ x: 1, volume: 0.5 }, []), {})
assert.deepEqual(pickProps({ x: 1, volume: 0.5 }, ['audio']), { volume: 0.5 })
assert.deepEqual(pickProps({ x: 1, volume: 0.5 }, null), { x: 1, volume: 0.5 })

// Duplicar conserva todos los valores y solo cambia el instante.
const kf0 = normalizeItems(src.keyframes.items)[0]
const dup = duplicateKeyframeAt(src, kf0.id, 7, 30)
assert.equal(dup.keyframes.items.length, 3)
assert.ok(Math.abs(clipPropsAt(dup, 7).x - clipPropsAt(src, kf0.t).x) < 1e-9)
assert.ok(Math.abs(clipPropsAt(dup, 7).volume - clipPropsAt(src, kf0.t).volume) < 1e-9)

console.log('clipKeyframes ok')
