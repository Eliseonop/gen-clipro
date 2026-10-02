// Efectos de la categoría Distorsión.
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Intensidad' }
const speed = { type: 'range', min: 0, max: 4, step: 0.1, def: 1, label: 'Velocidad' }

export const wave = defineEffect({
  id: 'wave',
  name: 'Ondas',
  description: 'La imagen ondula como una bandera o el agua.',
  category: 'distort',
  engine: 'shader',
  tags: ['ondas', 'agua', 'ondular', 'bandera'],
  params: {
    amount,
    freq: { type: 'range', min: 0.5, max: 12, step: 0.5, def: 3, label: 'Frecuencia' },
    speed,
    dir: { type: 'select', options: [{ id: 'h', label: 'Horizontal' }, { id: 'v', label: 'Vertical' }], def: 'h', label: 'Dirección' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_freq; uniform float u_speed; uniform float u_dir;
vec4 effect(vec2 uv) {
  float a = u_amount * 0.03;
  float ph = uTime * u_speed * TAU;
  vec2 off = u_dir < 0.5
    ? vec2(sin(uv.y * u_freq * TAU + ph) * a, 0.0)
    : vec2(0.0, sin(uv.x * u_freq * TAU + ph) * a);
  return src(mirrorUv(uv + off));
}`,
})

export const bulge = defineEffect({
  id: 'bulge',
  name: 'Ojo de pez',
  description: 'Abomba el centro (o lo hunde) con un pulso opcional.',
  category: 'distort',
  engine: 'shader',
  tags: ['ojo de pez', 'fisheye', 'lente', 'abombar'],
  params: {
    amount: { type: 'range', min: -1, max: 1, step: 0.01, def: 0.5, label: 'Fuerza' },
    pulse: { type: 'range', min: 0, max: 1, step: 0.01, def: 0, label: 'Pulso' },
    rate: { type: 'range', min: 0.1, max: 4, step: 0.1, def: 1, label: 'Ritmo' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_pulse; uniform float u_rate;
vec4 effect(vec2 uv) {
  float s = u_amount * (1.0 - u_pulse + u_pulse * (0.5 + 0.5 * sin(uTime * u_rate * TAU)));
  vec2 asp = aspect();
  vec2 d = (uv - 0.5) * asp;
  float r = length(d);
  vec2 p = d * (1.0 - s * 0.6 * (1.0 - smoothstep(0.0, 0.9, r)));
  return src(p / asp + 0.5);
}`,
})

export const swirl = defineEffect({
  id: 'swirl',
  name: 'Remolino',
  description: 'Retuerce el centro de la imagen en espiral.',
  category: 'distort',
  engine: 'shader',
  tags: ['remolino', 'espiral', 'twirl', 'hipnótico'],
  params: {
    amount,
    radius: { type: 'range', min: 0.1, max: 1.2, step: 0.01, def: 0.6, label: 'Radio' },
    speed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_radius; uniform float u_speed;
vec4 effect(vec2 uv) {
  vec2 asp = aspect();
  vec2 d = (uv - 0.5) * asp;
  float r = length(d);
  float ang = u_amount * 6.0 * (1.0 - smoothstep(0.0, u_radius, r))
    * (u_speed > 0.0 ? sin(uTime * u_speed * 0.5 * TAU) : 1.0);
  float s = sin(ang);
  float c = cos(ang);
  d = mat2(c, -s, s, c) * d;
  return src(mirrorUv(d / asp + 0.5));
}`,
})

export const ripple = defineEffect({
  id: 'ripple',
  name: 'Gota de agua',
  description: 'Ondas concéntricas que salen del centro.',
  category: 'distort',
  engine: 'shader',
  tags: ['gota', 'agua', 'ondas', 'ripple'],
  params: {
    amount,
    freq: { type: 'range', min: 1, max: 20, step: 0.5, def: 8, label: 'Frecuencia' },
    speed,
  },
  frag: /* glsl */ `
uniform float u_amount; uniform float u_freq; uniform float u_speed;
vec4 effect(vec2 uv) {
  vec2 asp = aspect();
  vec2 d = (uv - 0.5) * asp;
  float r = length(d);
  float w = sin(r * u_freq * TAU - uTime * u_speed * TAU) * u_amount * 0.02 * (1.0 - smoothstep(0.3, 1.2, r));
  vec2 p = (d + normalize(d + 1e-6) * w) / asp + 0.5;
  return src(mirrorUv(p));
}`,
})

export const mirror = defineEffect({
  id: 'mirror',
  name: 'Espejo',
  description: 'Refleja una mitad sobre la otra, o en cuatro.',
  category: 'distort',
  engine: 'shader',
  tags: ['espejo', 'simetría', 'reflejo'],
  params: {
    mode: {
      type: 'select',
      label: 'Modo',
      def: 'lr',
      options: [
        { id: 'lr', label: 'Izquierda ↔ derecha' },
        { id: 'tb', label: 'Arriba ↔ abajo' },
        { id: 'quad', label: 'Cuatro' },
      ],
    },
    drift: { type: 'range', min: -1, max: 1, step: 0.01, def: 0, label: 'Desplazamiento' },
  },
  frag: /* glsl */ `
uniform float u_mode; uniform float u_drift;
vec4 effect(vec2 uv) {
  vec2 p = uv;
  float o = u_drift * 0.2 * uTime;
  if (u_mode < 0.5) p.x = p.x < 0.5 ? p.x : 1.0 - p.x;
  else if (u_mode < 1.5) p.y = p.y < 0.5 ? p.y : 1.0 - p.y;
  else p = 0.5 - abs(p - 0.5);
  return src(mirrorUv(p + vec2(o, 0.0)));
}`,
})

export const kaleidoscope = defineEffect({
  id: 'kaleidoscope',
  name: 'Caleidoscopio',
  description: 'Gajos reflejados que giran alrededor del centro.',
  category: 'distort',
  engine: 'shader',
  tags: ['caleidoscopio', 'psicodélico', 'simetría'],
  params: {
    segments: { type: 'range', min: 2, max: 16, step: 1, def: 6, label: 'Gajos' },
    speed: { ...speed, def: 0.3 },
    zoom: { type: 'range', min: 0.3, max: 2, step: 0.01, def: 1, label: 'Zoom' },
  },
  frag: /* glsl */ `
uniform float u_segments; uniform float u_speed; uniform float u_zoom;
vec4 effect(vec2 uv) {
  vec2 asp = aspect();
  vec2 d = (uv - 0.5) * asp;
  float r = length(d) / u_zoom;
  float a = atan(d.y, d.x) + uTime * u_speed;
  float seg = TAU / max(2.0, floor(u_segments));
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  vec2 p = vec2(cos(a), sin(a)) * r;
  return src(mirrorUv(p / asp + 0.5));
}`,
})

export const splitScreen = defineEffect({
  id: 'split_screen',
  name: 'Pantalla dividida',
  description: 'La imagen repetida en 2, 3, 4 o 9 recuadros.',
  category: 'distort',
  engine: 'shader',
  tags: ['dividir', 'split', 'repetir', 'cuadrícula', 'multipantalla'],
  params: {
    count: {
      type: 'select',
      label: 'Copias',
      def: '3',
      options: [{ id: '2', label: '2' }, { id: '3', label: '3' }, { id: '4', label: '4' }, { id: '9', label: '9' }],
    },
  },
  frag: /* glsl */ `
uniform float u_count;
vec4 effect(vec2 uv) {
  vec2 n = u_count < 0.5 ? vec2(1.0, 2.0) : (u_count < 1.5 ? vec2(1.0, 3.0) : (u_count < 2.5 ? vec2(2.0, 2.0) : vec2(3.0, 3.0)));
  vec2 cu = fract(uv * n);
  vec2 px = contentPx();
  float cellAsp = (px.x / n.x) / (px.y / n.y);
  float srcAsp = px.x / px.y;
  vec2 frac = cellAsp > srcAsp ? vec2(1.0, srcAsp / cellAsp) : vec2(cellAsp / srcAsp, 1.0);
  return src(0.5 + (cu - 0.5) * frac);
}`,
})

export default [wave, bulge, swirl, ripple, mirror, kaleidoscope, splitScreen]
