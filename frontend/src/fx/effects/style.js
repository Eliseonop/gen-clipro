// Efectos de la categoría Estilo.
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 1, label: 'Intensidad' }

// Bordes (Sobel) sobre la luminancia; `s` = paso en px del contenido.
const SOBEL = /* glsl */ `
float edgeAt(vec2 uv, float s) {
  vec2 o = onePx() * s;
  float tl = luma(straight(src(uv + o * vec2(-1.0, -1.0))).rgb);
  float t  = luma(straight(src(uv + o * vec2( 0.0, -1.0))).rgb);
  float tr = luma(straight(src(uv + o * vec2( 1.0, -1.0))).rgb);
  float l  = luma(straight(src(uv + o * vec2(-1.0,  0.0))).rgb);
  float r  = luma(straight(src(uv + o * vec2( 1.0,  0.0))).rgb);
  float bl = luma(straight(src(uv + o * vec2(-1.0,  1.0))).rgb);
  float b  = luma(straight(src(uv + o * vec2( 0.0,  1.0))).rgb);
  float br = luma(straight(src(uv + o * vec2( 1.0,  1.0))).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(vec2(gx, gy));
}`

export const halftone = defineEffect({
  id: 'halftone',
  name: 'Cómic (semitono)',
  description: 'Puntos de imprenta de cómic, con giro opcional de la trama.',
  category: 'style',
  engine: 'shader',
  tags: ['cómic', 'semitono', 'puntos', 'pop art', 'halftone'],
  params: {
    amount,
    size: { type: 'range', min: 0.005, max: 0.05, step: 0.001, def: 0.014, label: 'Tamaño del punto' },
    spin: { type: 'range', min: 0, max: 1, step: 0.01, def: 0, label: 'Giro de la trama' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_size; uniform float u_spin;
vec4 effect(vec2 uv) {
  vec2 px = uv * contentPx();
  float cell = max(3.0, u_size * minSide());
  float a = 0.785 + uTime * u_spin;
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 q = R * px;
  vec2 cid = floor(q / cell) + 0.5;
  vec2 center = transpose(R) * (cid * cell);
  vec4 s = straight(src(center / contentPx()));
  float rad = (1.0 - luma(s.rgb)) * cell * 0.62;
  float d = length(q - cid * cell);
  float dotv = 1.0 - smoothstep(rad - 1.0, rad + 1.0, d);
  vec3 col = mix(vec3(1.0, 0.98, 0.94), s.rgb * 0.35, dotv);
  vec4 o = straight(src(uv));
  return premul(vec4(mix(o.rgb, col, u_amount), o.a));
}`,
})

export const neonEdges = defineEffect({
  id: 'neon_edges',
  name: 'Contornos de neón',
  description: 'Oscurece la imagen y hace brillar sus contornos como tubos de neón.',
  category: 'style',
  engine: 'shader',
  tags: ['neón', 'contornos', 'bordes', 'brillo', 'cyberpunk'],
  params: {
    amount,
    color: { type: 'color', def: '#22d3ee', label: 'Color' },
    pulse: { type: 'range', min: 0, max: 4, step: 0.1, def: 1, label: 'Ritmo' },
  },
  frag: SOBEL + /* glsl */ `
uniform float u_amount; uniform vec3 u_color; uniform float u_pulse;
vec4 effect(vec2 uv) {
  float s = max(1.0, minSide() / 540.0);
  float glow = smoothstep(0.1, 0.5, edgeAt(uv, s)) + 0.5 * smoothstep(0.1, 0.5, edgeAt(uv, s * 3.0));
  float p = 0.75 + 0.25 * sin(uTime * u_pulse * TAU);
  vec4 c = src(uv);
  vec3 col = c.rgb * (1.0 - 0.8 * u_amount) + u_color * glow * p * u_amount * c.a;
  return vec4(min(col, vec3(c.a)), c.a);
}`,
})

export const cartoon = defineEffect({
  id: 'cartoon',
  name: 'Dibujo animado',
  description: 'Colores planos con contorno negro que tiembla un poco.',
  category: 'style',
  engine: 'shader',
  tags: ['cartoon', 'dibujo', 'posterizar', 'cel shading'],
  params: {
    amount,
    levels: { type: 'range', min: 2, max: 12, step: 1, def: 5, label: 'Colores' },
    boil: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.4, label: 'Temblor del trazo' },
  },
  frag: SOBEL + /* glsl */ `
uniform float u_amount; uniform float u_levels; uniform float u_boil;
vec4 effect(vec2 uv) {
  vec2 j = (vec2(noise(uv * 40.0 + floor(uFrame / 4.0)), noise(uv * 40.0 + 9.0 + floor(uFrame / 4.0))) - 0.5) * 0.003 * u_boil;
  vec4 c = straight(src(uv + j));
  vec3 q = floor(c.rgb * u_levels + 0.5) / u_levels;
  float e = smoothstep(0.25, 0.6, edgeAt(uv + j, max(1.0, minSide() / 720.0)));
  q *= 1.0 - e;
  return premul(vec4(mix(c.rgb, q, u_amount), c.a));
}`,
})

export const pixelPulse = defineEffect({
  id: 'pixel_pulse',
  name: 'Píxeles',
  description: 'La imagen se pixela y vuelve, a golpes o fija.',
  category: 'style',
  engine: 'shader',
  tags: ['pixelar', 'píxeles', '8 bits', 'mosaico'],
  params: {
    amount: { ...amount, def: 0.5 },
    rate: { type: 'range', min: 0, max: 4, step: 0.1, def: 1, label: 'Ritmo (0 = fijo)' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_rate;
vec4 effect(vec2 uv) {
  float p = u_rate > 0.0 ? 0.5 - 0.5 * cos(uTime * u_rate * TAU) : 1.0;
  float block = 1.0 + u_amount * 0.08 * minSide() * p;
  vec2 bs = vec2(block) * onePx();
  return src((floor(uv / bs) + 0.5) * bs);
}`,
})

export const sketch = defineEffect({
  id: 'sketch',
  name: 'Boceto a lápiz',
  description: 'Trazos de lápiz sobre papel, con sombreado a rayas.',
  category: 'style',
  engine: 'shader',
  tags: ['boceto', 'lápiz', 'dibujo', 'sketch'],
  params: {
    amount,
    boil: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Temblor del trazo' },
  },
  frag: SOBEL + /* glsl */ `
uniform float u_amount; uniform float u_boil;
vec4 effect(vec2 uv) {
  float f = floor(uFrame / 4.0);
  vec2 j = (hash22(floor(uv * 60.0) + f) - 0.5) * 0.002 * u_boil;
  vec4 c = straight(src(uv + j));
  float l = luma(c.rgb);
  float e = edgeAt(uv + j, max(1.0, minSide() / 720.0));
  float pencil = 1.0 - smoothstep(0.08, 0.45, e);
  vec2 px = uv * contentPx();
  float hatch = step(0.5, fract((px.x + px.y) / max(4.0, minSide() / 180.0)));
  float shade = mix(1.0, 0.78 + 0.22 * hatch, step(l, 0.45));
  vec3 col = vec3(0.97, 0.96, 0.93) * pencil * shade;
  return premul(vec4(mix(c.rgb, col, u_amount), c.a));
}`,
})

export const sticker = defineEffect({
  id: 'sticker',
  name: 'Pegatina',
  description: 'Borde grueso alrededor del sujeto recortado, como una pegatina.',
  category: 'style',
  engine: 'shader',
  pad: 0.06,
  tags: ['pegatina', 'sticker', 'borde', 'contorno', 'recorte'],
  params: {
    width: { type: 'range', min: 0.005, max: 0.06, step: 0.001, def: 0.025, label: 'Grosor' },
    color: { type: 'color', def: '#ffffff', label: 'Color' },
    wobble: { type: 'range', min: 0, max: 1, step: 0.01, def: 0, label: 'Temblor' },
  },
  frag: /* glsl */ `
uniform float u_width; uniform vec3 u_color; uniform float u_wobble;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float w = noise(uv * 8.0 + floor(uFrame / 4.0) * 3.1);
  float rad = u_width * minSide() * (1.0 + 0.4 * u_wobble * (w - 0.5));
  float a = 0.0;
  for (int i = 0; i < 24; i++) {
    float ang = float(i) * TAU / 24.0;
    vec2 dir = vec2(cos(ang), sin(ang)) * onePx();
    a = max(a, src(uv + dir * rad).a);
    a = max(a, src(uv + dir * rad * 0.5).a);
  }
  return c + vec4(u_color, 1.0) * a * (1.0 - c.a);
}`,
})

export const floatShadow = defineEffect({
  id: 'float_shadow',
  name: 'Sombra flotante',
  description: 'Sombra suave debajo del sujeto que sube y baja, como si flotara.',
  category: 'style',
  engine: 'shader',
  pad: 0.12,
  tags: ['sombra', 'flotar', 'profundidad', 'recorte'],
  params: {
    distance: { type: 'range', min: 0, max: 0.1, step: 0.002, def: 0.03, label: 'Distancia' },
    blur: { type: 'range', min: 0, max: 0.06, step: 0.002, def: 0.02, label: 'Difuminado' },
    opacity: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Opacidad' },
    color: { type: 'color', def: '#000000', label: 'Color' },
    float: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Flotación' },
  },
  frag: /* glsl */ `
uniform float u_distance; uniform float u_blur; uniform float u_opacity; uniform vec3 u_color; uniform float u_float;
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float k = 1.0 + u_float * 0.35 * sin(uTime * TAU * 0.8);
  vec2 off = vec2(0.35, 1.0) * u_distance * k * minSide() * onePx();
  vec2 br = u_blur * k * minSide() * onePx();
  float a = src(uv - off).a;
  for (int i = 0; i < 16; i++) {
    float ang = float(i) * 2.39996;
    float rr = sqrt(float(i) + 0.5) / 4.0;
    a += src(uv - off + vec2(cos(ang), sin(ang)) * rr * br).a;
  }
  a = a / 17.0 * u_opacity;
  return c + vec4(u_color, 1.0) * a * (1.0 - c.a);
}`,
})

export default [halftone, neonEdges, cartoon, pixelPulse, sketch, sticker, floatShadow]
