import assert from 'node:assert/strict'
import {
  AUDIO_FX, AUDIO_FX_IDS, activeAudioFx, audioFxValuesAt, compressorMakeup, driveCurve, fxIntensity,
  stageWeights, webAudioQ,
} from './audioFx.js'
import { AUDIO_FX_KEYS } from './clipKeyframes.js'
import { AUDIO_FX_TOGGLES } from './clipFx.js'

const near = (a, b, msg, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} ≠ ${b}`)

assert.deepEqual(AUDIO_FX_IDS, AUDIO_FX_KEYS, 'todas son propiedades animables')
assert.deepEqual(AUDIO_FX_TOGGLES.map((t) => t.id), AUDIO_FX_IDS, 'el panel muestra todas')
assert.equal(AUDIO_FX.filter((f) => f.group === 'filter').length, 5)
assert.ok(AUDIO_FX.every((f) => f.stages.length >= 1 && f.stages.every((s) => s.length >= 1)))

// Pesos de etapa (mismos que audio_fx.stage_weights).
assert.deepEqual(stageWeights(0, 1), [1, 0])
assert.deepEqual(stageWeights(0.25, 1), [0.75, 0.25])
assert.deepEqual(stageWeights(0.5, 3), [0, 0.5, 0.5, 0])
assert.deepEqual(stageWeights(1, 3), [0, 0, 0, 1])
for (let k = 0; k <= 1; k += 0.1) near(stageWeights(k, 3).reduce((a, b) => a + b, 0), 1, `suman 1 en ${k}`)

// Web Audio: la Q de lowpass/highpass va en dB; la de peaking no.
near(webAudioQ({ t: 'lowpass', q: 0.7071 }), -3.0103, 'Butterworth en dB')
assert.equal(webAudioQ({ t: 'peaking', q: 1 }), 1)
near(compressorMakeup({ threshold: -20, ratio: 8 }), 3.3497, 'compensación del compresor')
const curve = driveCurve(4)
near(curve[0], -1, 'extremo')
near(curve[curve.length - 1], 1, 'extremo')
near(curve[(curve.length - 1) / 2], 0, 'centro')

// Intensidad: fija o por keyframes; los activos incluyen los que solo animan.
assert.equal(fxIntensity(true), 1)
assert.equal(fxIntensity('x'), 0)
assert.equal(fxIntensity(4), 1)
const fixed = { kind: 'audio', audio_fx: { echo: true, eq: 0.3 } }
assert.deepEqual(activeAudioFx(fixed), ['eq', 'echo'])
assert.equal(audioFxValuesAt(fixed, 1).echo, 1)
const anim = {
  kind: 'audio', audio_fx: {},
  keyframes: { enabled: true, items: [
    { id: 'a', t: 0, interpolation: 'linear', props: { underwater: 0 } },
    { id: 'b', t: 2, interpolation: 'linear', props: { underwater: 1 } },
  ] },
}
assert.deepEqual(activeAudioFx(anim), ['underwater'])
near(audioFxValuesAt(anim, 1).underwater, 0.5, 'mitad de la rampa')
assert.deepEqual(activeAudioFx({ kind: 'audio', audio_fx: {} }), [])

console.log('audioFx ok')
