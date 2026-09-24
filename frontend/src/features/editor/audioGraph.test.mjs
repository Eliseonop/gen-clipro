import assert from 'node:assert/strict'

// AudioContext simulado: registra nodos, conexiones y el último valor de cada ganancia.
class Param {
  constructor(v = 0) { this.value = v }
  setTargetAtTime(v) { this.value = v }
}
class Node {
  constructor(kind, ac) { this.kind = kind; this.ac = ac; this.out = []; ac.nodes.push(this) }
  connect(n) { this.out.push(n); return n }
  disconnect() { this.out = [] }
}
class FakeAC {
  constructor() { this.state = 'running'; this.currentTime = 0; this.nodes = []; this.destination = new Node('dest', this); FakeAC.last = this }
  resume() { this.state = 'running'; return Promise.resolve() }
  createGain() { const n = new Node('gain', this); n.gain = new Param(1); return n }
  createBiquadFilter() { const n = new Node('biquad', this); n.frequency = new Param(); n.Q = new Param(); n.gain = new Param(); return n }
  createDelay() { const n = new Node('delay', this); n.delayTime = new Param(); return n }
  createDynamicsCompressor() {
    const n = new Node('comp', this)
    for (const k of ['threshold', 'ratio', 'attack', 'release', 'knee']) n[k] = new Param()
    return n
  }
  createWaveShaper() { return new Node('shaper', this) }
  createMediaElementSource(el) { const n = new Node('src', this); n.el = el; return n }
}
globalThis.window = { AudioContext: FakeAC }

const { resumeAudio, syncAudioFx } = await import('./audioGraph.js')

const el = { id: 'video' }
const anim = {
  kind: 'audio', start: 0, audio_fx: {},
  keyframes: { enabled: true, items: [
    { id: 'a', t: 0, interpolation: 'linear', props: { underwater: 0 } },
    { id: 'b', t: 2, interpolation: 'linear', props: { underwater: 1 } },
  ] },
}

// Sin contexto (nadie ha pulsado reproducir) no se enruta nada.
syncAudioFx(el, anim, 1)
assert.equal(FakeAC.last, undefined)

resumeAudio()
const ac = FakeAC.last
syncAudioFx(el, { kind: 'audio', audio_fx: {} }, 0)
assert.equal(ac.nodes.filter((n) => n.kind === 'src').length, 0, 'sin efectos: el elemento suena directo')

syncAudioFx(el, anim, 1)
const src = ac.nodes.find((n) => n.kind === 'src')
assert.ok(src, 'con efectos se enruta por Web Audio')
const lowpass = ac.nodes.filter((n) => n.kind === 'biquad' && n.type === 'lowpass').map((n) => n.frequency.value)
assert.deepEqual(lowpass, [2500, 900, 380], 'las tres etapas de «Bajo el agua»')
// Pesos: intensidad 0,5 con 3 etapas → p = 1,5 → etapas 1 y 2 a medias.
// Las ganancias de etapa son las que desembocan en la salida del efecto (fxOut → destino).
const fxIn = src.out[0]
const stageGains = ac.nodes.filter((n) => n.kind === 'gain' && n.out.length === 1 && n.out[0] !== fxIn && n.out[0].out.includes(ac.destination))
assert.deepEqual(stageGains.map((g) => g.gain.value), [0, 0.5, 0.5, 0])
syncAudioFx(el, anim, 2.5)
assert.deepEqual(stageGains.map((g) => g.gain.value), [0, 0, 0, 1], 'al final, solo la última etapa')

// Quitar el efecto: el elemento vuelve a sonar directo (fuente → destino).
syncAudioFx(el, { kind: 'audio', audio_fx: {} }, 0)
assert.deepEqual(src.out, [ac.destination])

console.log('audioGraph ok')
