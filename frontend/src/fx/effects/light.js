// Efectos de la categoría Luz.
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 0.7, label: 'Intensidad' }
const rate = { type: 'range', min: 0.2, max: 8, step: 0.1, def: 2, label: 'Ritmo (por segundo)' }

export const flash = defineEffect({
  id: 'flash',
  name: 'Destello',
  description: 'Destellos de luz que decaen, uno por golpe de ritmo.',
  category: 'light',
  engine: 'shader',
  tags: ['flash', 'destello', 'blanco', 'golpe', 'beat'],
  defaultDur: 1,
  thumb: { t: 0.06 },
  params: {
    amount: { ...amount, def: 0.9 },
    rate: { ...rate, def: 1 },
    color: { type: 'color', def: '#ffffff', label: 'Color' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_rate; uniform vec3 u_color;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float k = exp(-fract(uTime * u_rate) * 8.0) * u_amount;
  return vec4(mix(c.rgb, u_color * c.a, k), c.a);
}`,
})

export const strobe = defineEffect({
  id: 'strobe',
  name: 'Estroboscopio',
  description: 'Parpadeo rápido a negro, a blanco o invirtiendo colores.',
  category: 'light',
  engine: 'shader',
  tags: ['estrobo', 'parpadeo', 'fiesta', 'flash'],
  thumb: { t: 0.1, params: { mode: 'invert' } },
  params: {
    amount: { ...amount, def: 1 },
    rate: { ...rate, def: 6 },
    mode: {
      type: 'select',
      label: 'Modo',
      def: 'black',
      options: [{ id: 'black', label: 'Negro' }, { id: 'white', label: 'Blanco' }, { id: 'invert', label: 'Invertir' }],
    },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_rate; uniform float u_mode;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float on = step(0.5, fract(uTime * u_rate));
  vec3 alt = u_mode < 0.5 ? vec3(0.0) : (u_mode < 1.5 ? vec3(c.a) : vec3(c.a) - c.rgb);
  return vec4(mix(c.rgb, alt, on * u_amount), c.a);
}`,
})

export const lightLeak = defineEffect({
  id: 'light_leak',
  name: 'Fuga de luz',
  description: 'Manchas de luz cálida que cruzan la imagen, como en película.',
  category: 'light',
  engine: 'shader',
  tags: ['fuga de luz', 'light leak', 'cálido', 'película', 'sueño'],
  params: {
    amount,
    speed: { type: 'range', min: 0, max: 3, step: 0.1, def: 1, label: 'Velocidad' },
    color: { type: 'color', def: '#ff8a3d', label: 'Color' },
    seed: { type: 'seed', def: 1, label: 'Variación' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_speed; uniform vec3 u_color;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float t = uTime * u_speed * 0.25 + uSeed * 1.7;
  float f = fbm(uv * vec2(1.8, 1.2) + vec2(t, -t * 0.7));
  float g = smoothstep(0.35, 0.95, f + 0.35 * sin(uv.x * 2.0 + t * 2.0));
  vec3 leak = u_color * g * 1.2 * u_amount * c.a;
  return vec4(min(c.rgb + leak - c.rgb * leak, vec3(c.a)), c.a);
}`,
})

export const glowPulse = defineEffect({
  id: 'glow_pulse',
  name: 'Brillo que late',
  description: 'Las zonas claras irradian un resplandor que late.',
  category: 'light',
  engine: 'shader',
  tags: ['brillo', 'glow', 'bloom', 'resplandor'],
  params: {
    amount,
    rate: { ...rate, def: 1 },
    radius: { type: 'range', min: 0.1, max: 2, step: 0.05, def: 0.8, label: 'Radio' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_rate; uniform float u_radius;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  vec2 px = u_radius * 0.03 * minSide() * onePx();
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * TAU / 12.0;
    for (int j = 1; j <= 3; j++) {
      vec4 s = src(uv + vec2(cos(a), sin(a)) * px * float(j) / 3.0);
      acc += s * smoothstep(0.55, 1.0, luma(straight(s).rgb));
    }
  }
  acc /= 36.0;
  float pulse = 0.5 + 0.5 * sin(uTime * u_rate * TAU);
  float a = max(c.a, acc.a * u_amount);
  vec3 col = c.rgb + acc.rgb * u_amount * (0.6 + 0.8 * pulse) * 2.0;
  return vec4(min(col, vec3(a)), a);
}`,
})

export const rainbow = defineEffect({
  id: 'rainbow',
  name: 'Arcoíris',
  description: 'Los colores giran por todo el arcoíris.',
  category: 'light',
  engine: 'shader',
  tags: ['arcoíris', 'color', 'psicodélico', 'hue'],
  params: {
    amount,
    speed: { type: 'range', min: 0, max: 4, step: 0.1, def: 1, label: 'Velocidad' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_speed;
vec4 effect(vec2 uv) {
  vec4 c = straight(src(uv));
  vec3 h = rgb2hsv(c.rgb);
  h.x = fract(h.x + uTime * u_speed * 0.25 + uv.y * 0.3 * u_amount);
  h.y = max(h.y, 0.5 * u_amount);
  return premul(vec4(mix(c.rgb, hsv2rgb(h), u_amount), c.a));
}`,
})

export default [flash, strobe, lightLeak, glowPulse, rainbow]
