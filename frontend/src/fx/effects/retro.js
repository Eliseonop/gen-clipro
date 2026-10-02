// Efectos de la categoría Retro.
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 0.7, label: 'Intensidad' }
const seed = { type: 'seed', def: 1, label: 'Variación' }

export const vhs = defineEffect({
  id: 'vhs',
  name: 'VHS',
  description: 'Cinta de vídeo: color corrido, ondulación, franja de tracking y ruido.',
  category: 'retro',
  engine: 'shader',
  tags: ['vhs', 'cinta', '90s', 'retro', 'analógico'],
  params: {
    amount,
    noise: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Ruido' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_noise;
vec4 effect(vec2 uv) {
  float t = uTime;
  float wob = sin(uv.y * 12.0 + t * 3.0) * 0.0025 * u_amount
    + (hash11(floor(t * 8.0) + uSeed) - 0.5) * 0.002 * u_amount;
  float band = smoothstep(0.08, 0.0, abs(uv.y - fract(1.0 - t * 0.15 + uSeed * 0.37)));
  vec2 p = uv + vec2(wob + band * 0.03 * u_amount, 0.0);
  vec4 c = straight(src(p));
  float ca = 0.004 * u_amount;
  vec3 col = vec3(straight(src(p + vec2(ca, 0.0))).r, c.g, straight(src(p - vec2(ca, 0.0))).b);
  col = mix(col, vec3(luma(col)), 0.25 * u_amount);
  col = (col - 0.5) * (1.0 + 0.2 * u_amount) + 0.5;
  float n = hash12(uv * uRes * 0.5 + vec2(uFrame, uSeed));
  col += (n - 0.5) * 0.12 * u_noise;
  col += band * n * 0.4 * u_amount;
  col *= 0.92 + 0.08 * sin(uv.y * contentPx().y * 1.5);
  return premul(vec4(clamp(col, 0.0, 1.0), c.a));
}`,
})

export const film8mm = defineEffect({
  id: 'film_8mm',
  name: 'Película 8 mm',
  description: 'Película casera: tono cálido, grano, parpadeo, rayas y polvo.',
  category: 'retro',
  engine: 'shader',
  tags: ['película', 'super 8', 'vintage', 'grano', 'polvo'],
  params: {
    amount,
    grain: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Grano' },
    scratches: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.6, label: 'Rayas y polvo' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_grain; uniform float u_scratches;
vec4 effect(vec2 uv) {
  float f = floor(uFrame / 2.0);
  vec2 jit = (hash22(vec2(f, uSeed)) - 0.5) * 0.004 * u_amount;
  vec4 c = straight(src(uv + jit));
  vec3 col = c.rgb;
  col = mix(col, vec3(luma(col)) * vec3(1.08, 0.98, 0.82), 0.45 * u_amount);
  col *= 1.0 + (hash11(f + uSeed) - 0.5) * 0.12 * u_amount;
  col += (hash12(uv * uRes + vec2(uFrame * 7.0, uSeed)) - 0.5) * 0.18 * u_grain;
  float sx = hash11(f * 1.3 + uSeed);
  float scratch = step(0.5, hash11(f * 2.1 + uSeed)) * smoothstep(0.0015, 0.0, abs(uv.x - sx));
  col = mix(col, vec3(0.85), scratch * u_scratches * 0.7);
  float dust = step(0.9985, hash12(floor(uv * vec2(90.0, 160.0)) + vec2(f * 3.1, uSeed)));
  col = mix(col, vec3(0.08), dust * u_scratches);
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 0.9 * u_amount;
  return premul(vec4(clamp(col, 0.0, 1.0), c.a));
}`,
})

export const oldFilm = defineEffect({
  id: 'old_film',
  name: 'Cine antiguo',
  description: 'Blanco y negro de cine mudo con parpadeo, rayas y viñeta.',
  category: 'retro',
  engine: 'shader',
  tags: ['blanco y negro', 'cine mudo', 'antiguo', 'película'],
  params: { amount, seed },
  frag: /* glsl */ `
uniform float u_amount;
vec4 effect(vec2 uv) {
  float f = floor(uFrame / 2.0);
  vec2 jit = vec2(0.0, (hash11(f + uSeed * 5.0) - 0.5) * 0.006 * u_amount);
  vec4 c = straight(src(uv + jit));
  float l = luma(c.rgb);
  l = (l - 0.5) * 1.25 + 0.5;
  l *= 1.0 + (hash11(f * 0.7 + uSeed) - 0.5) * 0.2 * u_amount;
  l += (hash12(uv * uRes + vec2(uFrame, uSeed)) - 0.5) * 0.15 * u_amount;
  float sx = hash11(f * 1.9 + uSeed);
  l = mix(l, 0.9, step(0.6, hash11(f * 3.3)) * smoothstep(0.002, 0.0, abs(uv.x - sx)) * u_amount);
  vec2 d = uv - 0.5;
  l *= 1.0 - dot(d, d) * 1.3 * u_amount;
  vec3 col = mix(c.rgb, vec3(clamp(l, 0.0, 1.0)), u_amount);
  return premul(vec4(col, c.a));
}`,
})

export const crt = defineEffect({
  id: 'crt',
  name: 'Tele de tubo',
  description: 'Pantalla CRT: curvatura, líneas, rejilla de color y parpadeo.',
  category: 'retro',
  engine: 'shader',
  tags: ['crt', 'tele', 'tubo', 'monitor', 'arcade'],
  params: {
    amount,
    curve: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Curvatura' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_curve;
vec4 effect(vec2 uv) {
  vec2 q = uv * 2.0 - 1.0;
  q *= 1.0 + dot(q.yx, q.yx) * 0.08 * u_curve;
  vec2 p = q * 0.5 + 0.5;
  vec4 base = src(uv);
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec4(0.0, 0.0, 0.0, base.a);
  vec4 c = straight(src(p));
  vec3 col = c.rgb;
  float sl = 0.5 + 0.5 * sin(p.y * contentPx().y / 3.0 * PI);
  float m = mod(floor(p.x * contentPx().x), 3.0);
  vec3 mask = m < 1.0 ? vec3(1.0, 0.7, 0.7) : (m < 2.0 ? vec3(0.7, 1.0, 0.7) : vec3(0.7, 0.7, 1.0));
  col *= mix(vec3(1.0), mask, 0.35 * u_amount);
  col *= mix(1.0, 0.7 + 0.3 * sl, u_amount);
  col *= 1.0 - 0.04 * u_amount * hash11(uFrame + uSeed);
  vec2 d = p - 0.5;
  col *= 1.0 - dot(d, d) * 1.2 * u_amount;
  return premul(vec4(clamp(col * 1.1, 0.0, 1.0), c.a));
}`,
})

export const scanlines = defineEffect({
  id: 'scanlines',
  name: 'Líneas de barrido',
  description: 'Líneas horizontales de monitor con un parpadeo suave.',
  category: 'retro',
  engine: 'shader',
  tags: ['líneas', 'scanlines', 'monitor', 'crt'],
  params: {
    amount: { ...amount, def: 0.5 },
    lines: { type: 'range', min: 100, max: 800, step: 10, def: 360, label: 'Número de líneas' },
    flicker: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.4, label: 'Parpadeo' },
    seed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_lines; uniform float u_flicker;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float line = 0.5 + 0.5 * sin((uv.y * u_lines + uTime * 2.0) * TAU);
  float fl = 1.0 - u_flicker * 0.15 * hash11(uFrame + uSeed);
  return vec4(c.rgb * mix(1.0, 0.55 + 0.45 * line, u_amount) * fl, c.a);
}`,
})

export default [vhs, film8mm, oldFilm, crt, scanlines]
