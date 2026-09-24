// Efectos y filtros de sonido en la vista previa (#16) con Web Audio.
//
// Solo se enruta por Web Audio el <video>/<audio> de un clip que tiene algún
// efecto: el resto suena como siempre, directo. Los nodos son los de
// lib/audioFx.js (los mismos que el export de FFmpeg) y los pesos de cada etapa
// se actualizan en cada fotograma con la intensidad (keyframes incluidos).
//
// El AudioContext solo se crea/reanuda con un gesto del usuario (reproducir):
// un elemento enrutado a un contexto suspendido se quedaría mudo.

import {
  AUDIO_FX_BY_ID, activeAudioFx, audioFxValuesAt, driveCurve, stageWeights, webAudioQ,
} from '../../lib/audioFx.js'

let ctx = null
const graphs = new WeakMap()   // elemento → { src, sig, nodes: [], fx: [{ id, n, gains }] }

/** Crea (o reanuda) el contexto de audio. Llamar desde un gesto del usuario. */
export function resumeAudio() {
  try {
    if (!ctx) {
      const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null
      if (!AC) return
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  } catch { /* sin Web Audio: los efectos solo se oirán en el export */ }
}

function buildNode(ac, node, keep) {
  let input
  let output
  if (node.t === 'lowpass' || node.t === 'highpass' || node.t === 'peaking' || node.t === 'lowshelf' || node.t === 'highshelf') {
    const b = ac.createBiquadFilter()
    b.type = node.t
    b.frequency.value = node.f
    if (node.q != null) b.Q.value = webAudioQ(node)
    if (node.g != null) b.gain.value = node.g
    input = output = b
  } else if (node.t === 'echo') {
    // = aecho de FFmpeg: (entrada·in + entrada retrasada·decay)·out
    input = ac.createGain()
    output = ac.createGain()
    const direct = ac.createGain()
    direct.gain.value = node.in * node.out
    const delay = ac.createDelay(Math.max(1, node.delay + 0.1))
    delay.delayTime.value = node.delay
    const tap = ac.createGain()
    tap.gain.value = node.decay * node.out
    input.connect(direct).connect(output)
    input.connect(delay).connect(tap).connect(output)
    keep.push(direct, delay, tap)
  } else if (node.t === 'compressor') {
    const c = ac.createDynamicsCompressor()
    c.threshold.value = node.threshold
    c.ratio.value = node.ratio
    c.attack.value = node.attack
    c.release.value = node.release
    c.knee.value = node.knee
    input = output = c
  } else if (node.t === 'drive') {
    const w = ac.createWaveShaper()
    w.curve = driveCurve(node.k)
    w.oversample = 'none'
    input = output = w
  } else {
    input = output = ac.createGain()
  }
  keep.push(input, output)
  return { input, output }
}

function rebuild(ac, g, ids) {
  try { g.src.disconnect() } catch { /* noop */ }
  for (const n of g.nodes) { try { n.disconnect() } catch { /* noop */ } }
  g.nodes = []
  g.fx = []
  let last = g.src
  for (const id of ids) {
    const spec = AUDIO_FX_BY_ID[id]
    const fxIn = ac.createGain()
    const fxOut = ac.createGain()
    g.nodes.push(fxIn, fxOut)
    const gains = []
    // Etapa 0 = señal seca; 1..N = las etapas del efecto.
    for (let j = 0; j <= spec.stages.length; j++) {
      const gain = ac.createGain()
      gain.gain.value = 0
      g.nodes.push(gain)
      let tail = fxIn
      for (const node of j ? spec.stages[j - 1] : []) {
        const b = buildNode(ac, node, g.nodes)
        tail.connect(b.input)
        tail = b.output
      }
      tail.connect(gain).connect(fxOut)
      gains.push(gain)
    }
    last.connect(fxIn)
    last = fxOut
    g.fx.push({ id, n: spec.stages.length, gains })
  }
  last.connect(ac.destination)
  g.sig = ids.join(',')
}

/**
 * Deja el audio del elemento `el` con los efectos del clip en el instante local
 * `localT`. Barato si nada cambia: solo actualiza los pesos.
 */
export function syncAudioFx(el, clip, localT) {
  if (!el) return
  const ids = clip ? activeAudioFx(clip) : []
  let g = graphs.get(el)
  if (!g && !ids.length) return
  if (!ctx || ctx.state !== 'running') return
  try {
    if (!g) {
      g = { src: ctx.createMediaElementSource(el), sig: null, nodes: [], fx: [] }
      graphs.set(el, g)
    }
    if (g.sig !== ids.join(',')) rebuild(ctx, g, ids)
    if (!g.fx.length) return
    const vals = audioFxValuesAt(clip, localT)
    const now = ctx.currentTime
    for (const f of g.fx) {
      const w = stageWeights(vals[f.id] || 0, f.n)
      f.gains.forEach((gain, j) => gain.gain.setTargetAtTime(w[j], now, 0.012))
    }
  } catch { /* el elemento no admite Web Audio: suena sin efectos */ }
}
