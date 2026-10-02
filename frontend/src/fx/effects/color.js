// Efectos de la categoría Color (animados; los filtros fijos están en Filtros).
import { defineEffect } from '../core/define.js'

const amount = { type: 'range', min: 0, max: 1, step: 0.01, def: 1, label: 'Intensidad' }

export const thermal = defineEffect({
  id: 'thermal',
  name: 'Cámara térmica',
  description: 'Colores de mapa de calor, del azul frío al amarillo.',
  category: 'color',
  engine: 'shader',
  tags: ['térmica', 'calor', 'infrarrojo', 'depredador'],
  params: { amount },
  frag: /* glsl */ `
uniform float u_amount;
vec3 heat(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 a = mix(vec3(0.0, 0.0, 0.25), vec3(0.45, 0.0, 0.7), smoothstep(0.0, 0.3, x));
  a = mix(a, vec3(0.95, 0.15, 0.1), smoothstep(0.3, 0.6, x));
  a = mix(a, vec3(1.0, 0.85, 0.1), smoothstep(0.6, 0.85, x));
  return mix(a, vec3(1.0), smoothstep(0.88, 1.0, x));
}
vec4 effect(vec2 uv) {
  vec4 c = straight(src(uv));
  float l = luma(c.rgb) + (noise(uv * 30.0 + uTime) - 0.5) * 0.05;
  return premul(vec4(mix(c.rgb, heat(l), u_amount), c.a));
}`,
})

export const nightVision = defineEffect({
  id: 'night_vision',
  name: 'Visión nocturna',
  description: 'Verde fósforo con ruido, líneas y viñeta de visor.',
  category: 'color',
  engine: 'shader',
  tags: ['visión nocturna', 'verde', 'militar', 'visor'],
  params: { amount, seed: { type: 'seed', def: 1, label: 'Variación' } },
  frag: /* glsl */ `
uniform float u_amount;
vec4 effect(vec2 uv) {
  vec4 c = straight(src(uv));
  float l = pow(luma(c.rgb), 0.8) * 1.4;
  vec3 g = vec3(0.1, 1.0, 0.25) * l;
  g += (hash12(uv * uRes + vec2(uFrame, uSeed)) - 0.5) * 0.25;
  g *= 0.9 + 0.1 * sin(uv.y * contentPx().y * 1.2);
  g *= 1.0 - smoothstep(0.4, 0.95, length((uv - 0.5) * aspect()));
  return premul(vec4(mix(c.rgb, clamp(g, 0.0, 1.0), u_amount), c.a));
}`,
})

export const duotone = defineEffect({
  id: 'duotone',
  name: 'Duotono',
  description: 'Dos colores (sombras y luces) que pueden alternarse con el ritmo.',
  category: 'color',
  engine: 'shader',
  tags: ['duotono', 'dos colores', 'póster', 'spotify'],
  params: {
    amount,
    dark: { type: 'color', def: '#2b1055', label: 'Sombras' },
    light: { type: 'color', def: '#ff5e7e', label: 'Luces' },
    swap: { type: 'range', min: 0, max: 4, step: 0.1, def: 0, label: 'Alternar (por segundo)' },
  },
  frag: /* glsl */ `
uniform float u_amount; uniform vec3 u_dark; uniform vec3 u_light; uniform float u_swap;
vec4 effect(vec2 uv) {
  vec4 c = straight(src(uv));
  float l = smoothstep(0.05, 0.95, luma(c.rgb));
  float s = u_swap > 0.0 ? step(0.5, fract(uTime * u_swap)) : 0.0;
  vec3 a = mix(u_dark, u_light, s);
  vec3 b = mix(u_light, u_dark, s);
  return premul(vec4(mix(c.rgb, mix(a, b, l), u_amount), c.a));
}`,
})

export const colorPop = defineEffect({
  id: 'color_pop',
  name: 'Color selectivo',
  description: 'Todo en blanco y negro salvo un color, que puede ir cambiando.',
  category: 'color',
  engine: 'shader',
  tags: ['color selectivo', 'blanco y negro', 'resaltar', 'sin city'],
  params: {
    hue: { type: 'range', min: 0, max: 360, step: 1, def: 0, label: 'Tono conservado' },
    range: { type: 'range', min: 0.02, max: 0.3, step: 0.01, def: 0.08, label: 'Margen' },
    cycle: { type: 'range', min: 0, max: 2, step: 0.05, def: 0, label: 'Recorrer tonos' },
  },
  frag: /* glsl */ `
uniform float u_hue; uniform float u_range; uniform float u_cycle;
vec4 effect(vec2 uv) {
  vec4 c = straight(src(uv));
  vec3 h = rgb2hsv(c.rgb);
  float target = fract(u_hue / 360.0 + uTime * u_cycle * 0.25);
  float d = abs(h.x - target);
  d = min(d, 1.0 - d);
  float keep = (1.0 - smoothstep(u_range, u_range * 1.6, d)) * smoothstep(0.15, 0.3, h.y);
  return premul(vec4(mix(vec3(luma(c.rgb)), c.rgb, keep), c.a));
}`,
})

export default [thermal, nightVision, duotone, colorPop]
