// Efectos de la categoría Lente.
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Intensidad' }
const rate = { type: 'range', min: 0, max: 4, step: 0.1, def: 1, label: 'Ritmo' }

export const zoomBlur = defineEffect({
  id: 'zoom_blur',
  name: 'Zoom borroso',
  description: 'Desenfoque radial desde el centro, como un golpe de zoom.',
  category: 'lens',
  engine: 'shader',
  tags: ['zoom', 'desenfoque', 'radial', 'velocidad', 'impacto'],
  params: {
    amount,
    pulse: { type: 'range', min: 0, max: 1, step: 0.01, def: 0, label: 'Pulso' },
    rate: { ...rate, def: 1.5 },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_pulse; uniform float u_rate;
vec4 effect(vec2 uv) {
  float s = u_amount * 0.15 * (1.0 - u_pulse + u_pulse * (0.5 + 0.5 * sin(uTime * u_rate * TAU)));
  vec2 d = uv - 0.5;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 24; i++) acc += src(0.5 + d * (1.0 - s * float(i) / 23.0));
  return acc / 24.0;
}`,
})

export const chromatic = defineEffect({
  id: 'chromatic',
  name: 'Aberración cromática',
  description: 'Bordes de color separados que laten desde el centro.',
  category: 'lens',
  engine: 'shader',
  tags: ['aberración', 'cromática', 'rgb', 'lente'],
  params: { amount, rate },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_rate;
vec4 effect(vec2 uv) {
  float k = u_amount * 0.02 * (u_rate > 0.0 ? 0.6 + 0.4 * sin(uTime * u_rate * TAU) : 1.0);
  vec2 d = uv - 0.5;
  vec4 r = src(uv + d * k);
  vec4 g = src(uv);
  vec4 b = src(uv - d * k);
  return vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
}`,
})

export const vignettePulse = defineEffect({
  id: 'vignette_pulse',
  name: 'Viñeta que late',
  description: 'Bordes oscurecidos que se abren y se cierran.',
  category: 'lens',
  engine: 'shader',
  tags: ['viñeta', 'bordes', 'latido', 'tensión'],
  params: {
    amount: { ...amount, def: 0.8 },
    rate,
    color: { type: 'color', def: '#000000', label: 'Color' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_rate; uniform vec3 u_color;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float r = length((uv - 0.5) * aspect());
  float p = 0.5 + 0.5 * sin(uTime * u_rate * TAU);
  float v = smoothstep(0.35 + 0.12 * (1.0 - p), 0.95, r) * u_amount;
  return vec4(mix(c.rgb, u_color * c.a, v), c.a);
}`,
})

export const defocus = defineEffect({
  id: 'defocus',
  name: 'Desenfoque que respira',
  description: 'La imagen entra y sale de foco suavemente.',
  category: 'lens',
  engine: 'shader',
  tags: ['desenfoque', 'foco', 'blur', 'sueño'],
  params: { amount, rate: { ...rate, def: 0.5 } },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_rate;
vec4 effect(vec2 uv) {
  float p = u_rate > 0.0 ? 0.5 - 0.5 * cos(uTime * u_rate * TAU) : 1.0;
  vec2 px = u_amount * 0.02 * p * minSide() * onePx();
  vec4 acc = src(uv);
  for (int i = 0; i < 24; i++) {
    float a = float(i) * 2.39996;
    float rr = sqrt(float(i) + 0.5) / sqrt(24.0);
    acc += src(uv + vec2(cos(a), sin(a)) * rr * px);
  }
  return acc / 25.0;
}`,
})

export default [zoomBlur, chromatic, vignettePulse, defocus]
