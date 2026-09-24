import assert from 'node:assert/strict'
import { adjustPasses, adjustValue, colorMatrix, hasAdjustMask, stripColor } from './clipAdjust.js'
import { clipMasksAt } from './clipAnim.js'
import { defaultMask, MASK_KIND_OK, MASK_TYPE_IDS, normalizeMask } from './clipMask.js'
import { followTrackMaskKeys, sourcePointToOutput } from './clipLayout.js'

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

// --- Rollo de película y máscaras en texto -----------------------------------
assert.ok(MASK_TYPE_IDS.includes('film'))
assert.ok(MASK_KIND_OK.includes('text'))
const film = defaultMask('film')
assert.equal(film.type, 'film')
near(film.h, 0.3)

// --- target --------------------------------------------------------------------
assert.equal(normalizeMask({}).target, 'clip')
assert.equal(normalizeMask({ target: 'adjust' }).target, 'adjust')
assert.equal(normalizeMask({ target: 'x' }).target, 'clip')
const adjClip = {
  kind: 'video', start: 0, in_point: 0, out_point: 4,
  effects: { exposure: 0.5, blur: 2 },
  masks: [{ type: 'circle', target: 'adjust', x: 0.2 }, { type: 'rectangle' }],
  keyframes: { enabled: true, items: [{ id: 'k', t: 0, props: { mx: 0.7 } }] },
}
assert.ok(hasAdjustMask(adjClip))
assert.equal(clipMasksAt(adjClip, 0).length, 1)                       // solo la del clip
near(clipMasksAt(adjClip, 0, { includeAdjust: true })[0].x, 0.7)      // el kf anima la de ajuste

// --- Pasadas (espejo de clip_adjust.adjust_passes) -------------------------------
const passes = adjustPasses(adjClip)
assert.equal(passes.length, 2)
assert.deepEqual(passes[0].clip.effects, { blur: 2 })
assert.equal(passes[1].ghost, true)
assert.equal(clipMasksAt(passes[1].clip, 0).length, 2)
assert.equal(adjustPasses({ ...adjClip, effects: { blur: 2 } }).length, 1)
assert.deepEqual(stripColor({ hue: 3, contrast: 1, grain: 5 }), { grain: 5 })

// --- Matriz: mismos números que test_clip_adjust.py ------------------------------
assert.equal(colorMatrix({}), null)
const ex = colorMatrix({ exposure: 1 })
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) near(ex[r][c], r === c ? 2 : 0)
const warm = colorMatrix({ temperature: 1 })
near(warm[0][0], 1.18)
near(warm[2][2], 0.82)
near(colorMatrix({ hue: 180 })[0][0], 0.213 - 0.787)
assert.equal(adjustValue({ hue: 999 }, 'hue'), 180)

// --- Seguir: fuente → lienzo -----------------------------------------------------
// Vídeo 1920×1080 a pantalla completa de alto en 720×1280 (escala 1280/1080), centrado.
const vid = {
  kind: 'video', layout: 'overlay', frame: 'free', start: 10, in_point: 5, out_point: 9, speed: 1,
  transform: { x: 0.5, y: 0.5, scale: 1280 / 1080, rotation: 0 },
  reframe: { crop_w: 1, crop_h: 1, keyframes: [{ t: 5, cx: 0.5, cy: 0.5 }] },
}
const c0 = sourcePointToOutput(vid, 0.5, 0.5, 1920, 1080, 720, 1280, 720 / 1280, 5, 0)
near(c0.x, 0.5); near(c0.y, 0.5)
const right = sourcePointToOutput(vid, 0.6, 0.25, 1920, 1080, 720, 1280, 720 / 1280, 5, 0)
near(right.x, 0.5 + (0.1 * 1920 * (1280 / 1080)) / 720, 1e-9)       // se sale por la derecha
near(right.y, 0.25, 1e-9)
const keys = followTrackMaskKeys(vid, [
  { t: 4, cx: 0.5, cy: 0.5 },          // antes del clip: fuera
  { t: 5, cx: 0.5, cy: 0.5 },
  { t: 5.1, cx: 0.55, cy: 0.5 },       // < minGap: se salta
  { t: 6, cx: 0.5, cy: 0.4 },
], { srcW: 1920, srcH: 1080, outW: 720, outH: 1280 })
assert.deepEqual(keys.map((k) => k.t), [0, 1])
near(keys[1].my, 0.4, 1e-4)

console.log('clipAdjust / film / target / follow ok')
