// UN contexto WebGL2 compartido por todo el editor (y por la página del export).
//
// Los navegadores limitan los contextos WebGL vivos (~16) y cada uno reserva
// memoria de GPU: uno por clip sería inviable. Aquí hay uno solo, con los
// programas compilados cacheados por efecto; cada pasada sube la fuente como
// textura, dibuja en el lienzo del contexto y quien llama copia el resultado.
//
// Convenciones del GLSL de los efectos (ver GLSL_PRELUDE):
//   · `vec4 effect(vec2 uv)` recibe uv del CONTENIDO (0–1 = la imagen; fuera de
//     ese rango solo si el efecto tiene margen `pad`) con (0,0) arriba-izquierda.
//   · `src(uv)` y el resultado de `effect` van en alfa PREMULTIPLICADO: mezclar
//     colores (desenfoques, desplazamientos) no oscurece los bordes transparentes.
//     `straight(c)` / `premul(c)` convierten cuando hace falta el color puro.

import { paramValue, uniformValue } from './params.js'

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export const GLSL_PRELUDE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec4 uSrcRect;   // contenido dentro de la textura de entrada (uv): x0, y0, x1, y1
uniform vec2 uRes;       // px del lienzo de salida (con margen)
uniform vec4 uContent;   // contenido dentro del lienzo de salida (uv): x0, y0, x1, y1
uniform float uTime;     // s desde el inicio del efecto
uniform float uDur;      // s que dura el efecto en el clip
uniform float uProgress; // uTime / uDur (0-1)
uniform float uFrame;    // fotograma (a 30 fps) desde el inicio del efecto
uniform float uSeed;
#define PI 3.14159265359
#define TAU 6.28318530718
vec2 contentPx() { return uRes * (uContent.zw - uContent.xy); }
float minSide() { vec2 c = contentPx(); return min(c.x, c.y); }
vec4 src(vec2 uv) {
  vec2 t = mix(uSrcRect.xy, uSrcRect.zw, uv);
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return vec4(0.0);
  return texture(uSrc, t);
}
// Repite la imagen en espejo fuera de 0-1 (sin huecos al desplazar o girar).
vec2 mirrorUv(vec2 p) { p = abs(mod(p, 2.0)); return mix(p, 2.0 - p, step(1.0, p)); }
vec2 aspect() { return contentPx() / minSide(); }
vec2 onePx() { return 1.0 / contentPx(); }
vec4 straight(vec4 c) { return c.a > 1e-5 ? vec4(c.rgb / c.a, c.a) : vec4(0.0); }
vec4 premul(vec4 c) { return vec4(c.rgb * c.a, c.a); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`

const MAIN = `
void main() {
  vec2 uv = (vUv - uContent.xy) / (uContent.zw - uContent.xy);
  outColor = clamp(effect(uv), 0.0, 1.0);
}`

let state = null   // { canvas, gl, buf, tex, programs: Map }

function compile(gl, type, source, label) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, source)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Shader ${label}: ${log}`)
  }
  return sh
}

/** El contexto compartido (null si el navegador no tiene WebGL2). */
export function sharedGL() {
  if (state) return state
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false,
  })
  if (!gl) return null
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // La fuente (vídeo, canvas) viene con alfa directo: se sube premultiplicada.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  canvas.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); state = null })
  state = { canvas, gl, buf, tex, programs: new Map() }
  return state
}

function program(st, effect) {
  const key = `${effect.id}@${effect.v}`
  let p = st.programs.get(key)
  if (p) return p
  const { gl } = st
  const vs = compile(gl, gl.VERTEX_SHADER, VERT, `${effect.id}.vert`)
  const fs = compile(gl, gl.FRAGMENT_SHADER, GLSL_PRELUDE + effect.frag + MAIN, effect.id)
  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Shader ${effect.id}: ${gl.getProgramInfoLog(prog)}`)
  const uniforms = {}
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i)
    uniforms[info.name] = gl.getUniformLocation(prog, info.name)
  }
  p = { prog, uniforms, aPos: gl.getAttribLocation(prog, 'aPos') }
  st.programs.set(key, p)
  return p
}

/**
 * Pasa `input` por el shader de `effect` y deja el resultado en el lienzo del
 * contexto (tamaño `cw`×`ch`), que se devuelve. `srcRect`: contenido dentro de
 * `input` (uv); `content`: contenido dentro de la salida (uv).
 */
export function runShader(effect, input, { cw, ch, srcRect, content, time, dur, frame, seed, params }) {
  const st = sharedGL()
  if (!st) return null
  const { gl, canvas } = st
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw
    canvas.height = ch
  }
  const p = program(st, effect)
  gl.viewport(0, 0, cw, ch)
  gl.useProgram(p.prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, st.buf)
  gl.enableVertexAttribArray(p.aPos)
  gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, st.tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input)
  const u = p.uniforms
  if (u.uSrc) gl.uniform1i(u.uSrc, 0)
  if (u.uSrcRect) gl.uniform4f(u.uSrcRect, ...srcRect)
  if (u.uRes) gl.uniform2f(u.uRes, cw, ch)
  if (u.uContent) gl.uniform4f(u.uContent, ...content)
  if (u.uTime) gl.uniform1f(u.uTime, time)
  if (u.uDur) gl.uniform1f(u.uDur, dur)
  if (u.uProgress) gl.uniform1f(u.uProgress, dur > 0 ? Math.min(1, Math.max(0, time / dur)) : 0)
  if (u.uFrame) gl.uniform1f(u.uFrame, frame)
  if (u.uSeed) gl.uniform1f(u.uSeed, seed)
  for (const spec of effect.paramList) {
    const loc = u[`u_${spec.id}`]
    if (!loc) continue
    const v = uniformValue(spec, paramValue(spec, params?.[spec.id]))
    if (Array.isArray(v)) gl.uniform3f(loc, v[0], v[1], v[2])
    else gl.uniform1f(loc, v)
  }
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return canvas
}

/** Compila un efecto sin dibujar (para detectar errores de GLSL en tests del navegador). */
export function compileEffect(effect) {
  const st = sharedGL()
  if (!st) return false
  program(st, effect)
  return true
}
