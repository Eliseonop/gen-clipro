// Efectos de la categoría Movimiento (se mueve el contenido DENTRO del encuadre;
// para mover el clip entero están las Animaciones).
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Intensidad' }
const seed = { type: 'seed', def: 1, label: 'Variación' }

export const shake = defineEffect({
  id: 'shake',
  name: 'Temblor',
  description: 'Cámara en mano nerviosa: sacudidas suaves con un poco de giro.',
  category: 'motion',
  engine: 'shader',
  tags: ['temblor', 'sacudida', 'cámara', 'shake', 'terremoto'],
  params: {
    amount,
    speed: { type: 'range', min: 0.2, max: 4, step: 0.1, def: 1, label: 'Velocidad' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_speed;
vec4 effect(vec2 uv) {
  float t = uTime * u_speed * 12.0;
  float i = floor(t);
  float f = smoothstep(0.0, 1.0, fract(t));
  vec2 off = mix(hash22(vec2(i, uSeed)), hash22(vec2(i + 1.0, uSeed)), f) - 0.5;
  off *= 0.06 * u_amount;
  float rot = (mix(hash11(i + uSeed * 3.0), hash11(i + 1.0 + uSeed * 3.0), f) - 0.5) * 0.08 * u_amount;
  float zoom = 1.0 + 0.08 * u_amount;
  vec2 asp = aspect();
  vec2 d = (uv - 0.5) * asp;
  float s = sin(rot);
  float c = cos(rot);
  d = mat2(c, -s, s, c) * d;
  return src(mirrorUv(d / asp / zoom + 0.5 + off));
}`,
})

export const heartbeat = defineEffect({
  id: 'heartbeat',
  name: 'Latido',
  description: 'Golpes de zoom al ritmo de un corazón (o de la música).',
  category: 'motion',
  engine: 'shader',
  tags: ['latido', 'zoom', 'pulso', 'beat', 'corazón'],
  params: {
    amount,
    bpm: { type: 'range', min: 40, max: 180, step: 1, def: 90, label: 'Pulsaciones (BPM)' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_bpm;
vec4 effect(vec2 uv) {
  float ph = fract(uTime * u_bpm / 60.0);
  float beat = exp(-ph * 8.0) + 0.6 * exp(-max(0.0, ph - 0.18) * 10.0) * step(0.18, ph);
  float z = 1.0 + u_amount * 0.12 * beat;
  return src((uv - 0.5) / z + 0.5);
}`,
})

export const earthquake = defineEffect({
  id: 'earthquake',
  name: 'Terremoto',
  description: 'Sacudida fuerte con estela, para impactos y explosiones.',
  category: 'motion',
  engine: 'shader',
  tags: ['terremoto', 'impacto', 'explosión', 'sacudida'],
  defaultDur: 1.2,
  params: {
    amount: { ...amount, def: 0.8 },
    decay: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, label: 'Se calma' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_decay;
vec4 effect(vec2 uv) {
  float k = u_amount * mix(1.0, 1.0 - uProgress, u_decay);
  float t = uFrame;
  vec2 off = (hash22(vec2(t, uSeed)) - 0.5) * 0.08 * k;
  vec2 prev = (hash22(vec2(t - 1.0, uSeed)) - 0.5) * 0.08 * k;
  float zoom = 1.0 + 0.1 * k;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 o = mix(prev, off, float(i) / 5.0);
    acc += src(mirrorUv((uv - 0.5) / zoom + 0.5 + o));
  }
  return acc / 6.0;
}`,
})

export const drift = defineEffect({
  id: 'drift',
  name: 'Flotar',
  description: 'El encuadre deriva despacio, como una cámara flotando.',
  category: 'motion',
  engine: 'shader',
  tags: ['flotar', 'deriva', 'suave', 'handheld'],
  params: {
    amount: { ...amount, def: 0.4 },
    speed: { type: 'range', min: 0.05, max: 2, step: 0.05, def: 0.3, label: 'Velocidad' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_speed;
vec4 effect(vec2 uv) {
  float t = uTime * u_speed;
  vec2 off = vec2(noise(vec2(t, uSeed)) - 0.5, noise(vec2(uSeed, t + 7.0)) - 0.5) * 0.08 * u_amount;
  float zoom = 1.0 + 0.1 * u_amount;
  return src(mirrorUv((uv - 0.5) / zoom + 0.5 + off));
}`,
})

export default [shake, heartbeat, earthquake, drift]
