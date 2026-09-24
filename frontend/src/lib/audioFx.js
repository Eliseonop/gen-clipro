// Efectos y filtros de sonido (#16). Cada efecto son una o más ETAPAS (cadenas
// de nodos) que suenan igual en la vista previa (Web Audio,
// features/editor/audioGraph.js) y en el export (FFmpeg, backend/app/audio_fx.py,
// espejo de este archivo). La intensidad k (0–1, animable con keyframes) funde la
// señal seca con las etapas: con una etapa, out = (1 − k)·seco + k·efecto; con N,
// p = k·N y cada etapa j pesa max(0, 1 − |p − j|) (la 0 es la seca), así que
// «Bajo el agua» va cerrando el paso bajo poco a poco en vez de mezclar de golpe.
//
// Nodos: biquads del «Audio EQ Cookbook» (los mismos en Web Audio y FFmpeg),
// eco de una repetición (= aecho), compresor y saturación tanh.

import { clipPropsAt, keyframesEnabled } from './clipKeyframes.js'

const BW = 0.7071   // Q de Butterworth

export const AUDIO_FX = [
  // Efectos
  { id: 'eq', label: 'Brillo (EQ)', icon: 'equalizer', group: 'effect', stages: [[{ t: 'peaking', f: 3000, q: 1, g: 4 }]] },
  { id: 'compressor', label: 'Compresor', icon: 'compress', group: 'effect', stages: [[{ t: 'compressor', threshold: -20, ratio: 8, attack: 0.02, release: 0.2, knee: 6 }]] },
  { id: 'reverb', label: 'Reverberación', icon: 'waves', group: 'effect', stages: [[{ t: 'echo', in: 0.8, out: 0.88, delay: 0.04, decay: 0.4 }]] },
  { id: 'echo', label: 'Eco', icon: 'record_voice_over', group: 'effect', stages: [[{ t: 'echo', in: 0.8, out: 0.9, delay: 1.0, decay: 0.3 }]] },
  { id: 'denoise', label: 'Reducir ruido', icon: 'hearing', group: 'effect', stages: [[{ t: 'highpass', f: 80, q: BW }, { t: 'lowpass', f: 12000, q: BW }]] },
  { id: 'distortion', label: 'Distorsión', icon: 'speaker', group: 'effect', stages: [[{ t: 'drive', k: 4 }]] },
  // Filtros de sonido (#16)
  {
    id: 'underwater', label: 'Bajo el agua', icon: 'water', group: 'filter', stages: [
      [{ t: 'lowpass', f: 2500, q: 0.8 }, { t: 'lowshelf', f: 160, g: 2 }],
      [{ t: 'lowpass', f: 900, q: 0.85 }, { t: 'lowshelf', f: 160, g: 3.5 }],
      [{ t: 'lowpass', f: 380, q: 0.9 }, { t: 'lowshelf', f: 160, g: 5 }],
    ],
  },
  { id: 'telephone', label: 'Teléfono', icon: 'call', group: 'filter', stages: [[{ t: 'highpass', f: 450, q: BW }, { t: 'lowpass', f: 3000, q: BW }, { t: 'peaking', f: 1700, q: 1, g: 6 }]] },
  { id: 'radio', label: 'Radio antigua', icon: 'radio', group: 'filter', stages: [[{ t: 'highpass', f: 300, q: BW }, { t: 'lowpass', f: 4500, q: BW }, { t: 'peaking', f: 1200, q: 0.8, g: 5 }, { t: 'drive', k: 1.5 }]] },
  { id: 'megaphone', label: 'Megáfono', icon: 'campaign', group: 'filter', stages: [[{ t: 'highpass', f: 800, q: BW }, { t: 'lowpass', f: 3200, q: BW }, { t: 'peaking', f: 2000, q: 1.2, g: 9 }, { t: 'drive', k: 3 }]] },
  {
    id: 'muffled', label: 'Amortiguado', icon: 'meeting_room', group: 'filter', stages: [
      [{ t: 'lowpass', f: 3500, q: BW }],
      [{ t: 'lowpass', f: 1600, q: BW }],
      [{ t: 'lowpass', f: 900, q: BW }],
    ],
  },
]
export const AUDIO_FX_IDS = AUDIO_FX.map((f) => f.id)
export const AUDIO_FX_BY_ID = Object.fromEntries(AUDIO_FX.map((f) => [f.id, f]))

/** Peso de cada etapa (índice 0 = señal seca) para la intensidad k (0–1). */
export function stageWeights(k, nStages) {
  const p = Math.min(1, Math.max(0, k)) * nStages
  const out = []
  for (let j = 0; j <= nStages; j++) out.push(Math.max(0, 1 - Math.abs(p - j)))
  return out
}

/** Intensidad 0–1 de un valor guardado (true = 1, false/ausente = 0). */
export function fxIntensity(v) {
  if (v === true) return 1
  if (v === false || v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

/** Web Audio interpreta la Q de lowpass/highpass en dB (10^(Q/20) es la Q real). */
export function webAudioQ(node) {
  return node.t === 'lowpass' || node.t === 'highpass' ? 20 * Math.log10(node.q) : node.q
}

/** Ganancia de compensación que el DynamicsCompressor de Web Audio aplica solo
 *  (spec: (1 / ganancia a 0 dBFS)^0,6); en FFmpeg se pone a mano (`makeup`). */
export function compressorMakeup(node) {
  const full = 10 ** ((node.threshold * (1 - 1 / node.ratio)) / 20)
  return full ** -0.6
}

/** Curva de la saturación: y = tanh(k·x) / tanh(k). */
export function driveCurve(k, n = 4097) {
  const curve = new Float32Array(n)
  const norm = Math.tanh(k)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1
    curve[i] = Math.tanh(k * x) / norm
  }
  return curve
}

/** Intensidad de cada efecto en el instante local `t` ({id: 0–1}). */
export function audioFxValuesAt(clip, t) {
  const out = {}
  if (keyframesEnabled(clip)) {
    const p = clipPropsAt(clip, t)
    for (const id of AUDIO_FX_IDS) out[id] = fxIntensity(p[id])
    return out
  }
  const fx = clip?.audio_fx && typeof clip.audio_fx === 'object' ? clip.audio_fx : {}
  for (const id of AUDIO_FX_IDS) out[id] = fxIntensity(fx[id])
  return out
}

/** Efectos que suenan en algún momento del clip (valor fijo o algún keyframe > 0),
 *  en el orden de la cadena. Decide qué nodos se montan (no cambia cada fotograma). */
export function activeAudioFx(clip) {
  const fx = clip?.audio_fx && typeof clip.audio_fx === 'object' ? clip.audio_fx : {}
  const items = keyframesEnabled(clip) ? (clip.keyframes.items || []) : []
  return AUDIO_FX_IDS.filter((id) => fxIntensity(fx[id]) > 0 || items.some((k) => fxIntensity(k?.props?.[id]) > 0))
}
