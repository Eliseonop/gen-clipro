// Deforma una capa (canvas) con el giro 3D de un texto: un quad a pantalla
// completa en coordenadas homogéneas. La GPU hace la interpolación de la textura
// con perspectiva correcta y recorta lo que queda detrás de la cámara. Es el
// equivalente en vista previa del filtro `perspective` del export (mismas
// esquinas proyectadas: lib/text3d.js ↔ backend/app/text3d.py).
import { planeProject } from '../../../lib/text3d'

let state = null   // { canvas, gl, prog, buf, tex, aPos, aUv }

const VS = `
attribute vec4 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() { gl_Position = a_pos; v_uv = a_uv; }
`
const FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() { gl_FragColor = texture2D(u_tex, v_uv); }
`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader')
  return sh
}

function init() {
  if (state !== null) return state
  state = false
  if (typeof document === 'undefined') return state
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: true })
    if (!gl) return state
    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return state
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    state = {
      canvas, gl, prog, tex,
      buf: gl.createBuffer(),
      aPos: gl.getAttribLocation(prog, 'a_pos'),
      aUv: gl.getAttribLocation(prog, 'a_uv'),
    }
  } catch {
    state = false
  }
  return state
}

/**
 * Devuelve un canvas (mismo tamaño que `src`) con `src` girado en 3D alrededor de
 * (cx, cy) — px de `src` — con la cámara a `f` px, o null si no hay WebGL.
 * Hay que dibujarlo enseguida (drawImage): el canvas se reutiliza en cada llamada.
 */
export function warpLayer(src, cx, cy, rx, ry, f) {
  const s = init()
  if (!s || !src?.width || !src?.height) return null
  const { canvas, gl } = s
  const W = src.width
  const H = src.height
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  // Esquinas de la capa (triangle strip: arriba-izq, arriba-der, abajo-izq, abajo-der).
  const data = new Float32Array(24)
  const corners = [[0, 0], [W, 0], [0, H], [W, H]]
  corners.forEach(([X, Y], i) => {
    const p = planeProject(cx, cy, rx, ry, f, X, Y)
    data.set([(p.hx * 2) / W - p.w, p.w - (p.hy * 2) / H, 0, p.w, X / W, Y / H], i * 6)
  })
  gl.viewport(0, 0, W, H)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(s.prog)
  gl.bindTexture(gl.TEXTURE_2D, s.tex)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
  gl.bindBuffer(gl.ARRAY_BUFFER, s.buf)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
  gl.enableVertexAttribArray(s.aPos)
  gl.vertexAttribPointer(s.aPos, 4, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(s.aUv)
  gl.vertexAttribPointer(s.aUv, 2, gl.FLOAT, false, 24, 16)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return canvas
}
