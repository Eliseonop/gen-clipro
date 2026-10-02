// Efectos de la categoría Glitch.
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, label: 'Intensidad' }
const speed = { type: 'range', min: 0.1, max: 4, step: 0.1, def: 1, label: 'Velocidad' }
const seed = { type: 'seed', def: 1, label: 'Variación' }

export const glitchRgb = defineEffect({
  id: 'glitch_rgb',
  name: 'Glitch RGB',
  description: 'Canales de color separados a golpes, con cortes horizontales.',
  category: 'glitch',
  engine: 'shader',
  tags: ['glitch', 'rgb', 'digital', 'error', 'aberración'],
  params: { amount, speed, seed },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_speed;
vec4 effect(vec2 uv) {
  float t = floor(uTime * 12.0 * u_speed);
  float burst = step(0.55, hash11(t + uSeed * 7.13));
  float k = u_amount * (0.004 + 0.03 * burst * hash11(t * 1.7 + uSeed));
  float row = floor(uv.y * 24.0);
  float shift = (hash12(vec2(row, t + uSeed)) - 0.5) * 0.08 * u_amount * burst;
  vec2 p = uv + vec2(shift, 0.0);
  vec4 c = src(p);
  vec4 r = src(p + vec2(k, 0.0));
  vec4 b = src(p - vec2(k, 0.0));
  return vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
}`,
})

export const glitchBlocks = defineEffect({
  id: 'glitch_blocks',
  name: 'Bloques',
  description: 'Bloques de imagen que saltan de sitio, como un vídeo corrupto.',
  category: 'glitch',
  engine: 'shader',
  tags: ['glitch', 'bloques', 'datamosh', 'corrupto'],
  params: {
    amount,
    speed,
    size: { type: 'range', min: 0.02, max: 0.2, step: 0.01, def: 0.06, label: 'Tamaño' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_speed; uniform float u_size;
vec4 effect(vec2 uv) {
  float t = floor(uTime * 10.0 * u_speed);
  vec2 cell = floor(uv / vec2(u_size * 3.0, u_size));
  float r = hash12(cell + vec2(t * 13.1, uSeed));
  float on = step(1.0 - 0.35 * u_amount, r);
  vec2 off = (hash22(cell + vec2(t, uSeed * 3.0)) - 0.5) * vec2(0.2, 0.02) * u_amount * on;
  vec4 c = src(uv + off);
  if (on > 0.5) {
    vec4 c2 = src(uv + off * 1.6);
    c = vec4(c2.r, c.g, c.b, max(c.a, c2.a));
  }
  return c;
}`,
})

export const glitchTear = defineEffect({
  id: 'glitch_tear',
  name: 'Interferencia',
  description: 'Una franja que recorre la imagen desgarrándola en horizontal.',
  category: 'glitch',
  engine: 'shader',
  tags: ['glitch', 'interferencia', 'señal', 'tv'],
  params: { amount, speed, seed },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_speed;
vec4 effect(vec2 uv) {
  float t = uTime * u_speed;
  float y = fract(t * 0.35 + uSeed * 0.13);
  float bar = smoothstep(0.12, 0.0, abs(uv.y - y));
  float jitter = (hash12(vec2(floor(uv.y * 200.0), floor(t * 30.0))) - 0.5) * 0.02 * u_amount;
  vec2 p = uv + vec2(jitter + bar * 0.06 * u_amount * sin(uv.y * 80.0 + t * 20.0), 0.0);
  vec4 c = src(p);
  float n = hash12(uv * uRes + uFrame) * bar * u_amount;
  c.rgb = min(c.rgb + n * 0.5 * c.a, vec3(c.a));
  return c;
}`,
})

export const tvStatic = defineEffect({
  id: 'tv_static',
  name: 'Estática',
  description: 'Ruido de televisión sin señal, continuo o a ráfagas.',
  category: 'glitch',
  engine: 'shader',
  tags: ['ruido', 'estática', 'tv', 'nieve'],
  params: {
    amount: { ...amount, def: 0.5 },
    bursts: { type: 'toggle', def: true, label: 'A ráfagas' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_bursts;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float t = floor(uFrame / 2.0);
  float on = u_bursts > 0.5 ? step(0.6, hash11(t * 3.3 + uSeed)) : 1.0;
  float n = hash12(floor(uv * contentPx() / 2.0) + vec2(uFrame * 17.0, uSeed));
  return vec4(mix(c.rgb, vec3(n) * c.a, u_amount * on), c.a);
}`,
})

export const pixelSort = defineEffect({
  id: 'pixel_drift',
  name: 'Arrastre de píxeles',
  description: 'Las zonas claras se estiran hacia abajo, como un pixel sort.',
  category: 'glitch',
  engine: 'shader',
  tags: ['pixel sort', 'arrastre', 'glitch', 'derretir'],
  params: {
    amount,
    threshold: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, label: 'Umbral' },
    speed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_threshold; uniform float u_speed;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float len = u_amount * 0.25 * (0.6 + 0.4 * sin(uTime * u_speed * 2.0 + uv.x * 9.0));
  vec4 best = c;
  float bl = luma(straight(c).rgb);
  for (int i = 1; i <= 24; i++) {
    vec4 s = src(uv - vec2(0.0, len * float(i) / 24.0));
    float l = luma(straight(s).rgb);
    if (l > u_threshold && l > bl) { best = s; bl = l; }
  }
  return best;
}`,
})

export default [glitchRgb, glitchBlocks, glitchTear, tvStatic, pixelSort]
