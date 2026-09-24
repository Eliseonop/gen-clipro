// Ajustes de color (Exposición, Blancos, Temperatura, Tono) y máscara de ajuste.
// Espejo de `backend/app/clip_adjust.py`: MISMA matriz 3×3 sobre RGB en gamma.
//
//   M = Tono · diag(temperatura) · k        k = exposición · blancos
//
// Preview: filtro SVG `feColorMatrix` (color-interpolation-filters="sRGB") que el
// canvas usa vía `ctx.filter = 'url(#id)'`. Export: `colorchannelmixer` con los
// mismos coeficientes. Los dos recortan a [0, 1].
//
// Máscara de ajuste: máscaras con target 'adjust' limitan los ajustes de color a su
// interior. El clip se pinta en dos pasadas (base sin ajustes + fantasma con ajustes
// recortado por esas máscaras), igual que hace el export.
import { clipMasks } from './clipMask.js'

export const ADJUST_RANGES = {
  exposure: [-1, 1],
  whites: [-1, 1],
  temperature: [-1, 1],
  hue: [-180, 180],
}
export const ADJUST_KEYS = Object.keys(ADJUST_RANGES)
export const COLOR_KEYS = ['brightness', 'contrast', 'saturation', ...ADJUST_KEYS]

const num = (v) => {
  if (v === true) return 1
  const n = Number(v || 0)
  return Number.isFinite(n) ? n : 0
}

export function adjustValue(effects, key) {
  const [lo, hi] = ADJUST_RANGES[key]
  return Math.min(hi, Math.max(lo, num(effects?.[key])))
}

function gain(exposure, whites) {
  const k = 2 ** exposure
  return whites > 0 ? k / (1 - 0.6 * whites) : k * (1 + 0.4 * whites)
}

function hueMatrix(deg) {
  const a = Math.cos(deg * Math.PI / 180)
  const b = Math.sin(deg * Math.PI / 180)
  return [
    [0.213 + 0.787 * a - 0.213 * b, 0.715 - 0.715 * a - 0.715 * b, 0.072 - 0.072 * a + 0.928 * b],
    [0.213 - 0.213 * a + 0.143 * b, 0.715 + 0.285 * a + 0.140 * b, 0.072 - 0.072 * a - 0.283 * b],
    [0.213 - 0.213 * a - 0.787 * b, 0.715 - 0.715 * a + 0.715 * b, 0.072 + 0.928 * a + 0.072 * b],
  ]
}

/** Matriz 3×3 de los ajustes, o null si no hay ninguno activo. */
export function colorMatrix(effects) {
  const [ex, wh, te, hu] = ADJUST_KEYS.map((k) => adjustValue(effects, k))
  if (!(ex || wh || te || hu)) return null
  const k = gain(ex, wh)
  const diag = [k * (1 + 0.18 * te), k, k * (1 - 0.18 * te)]
  const h = hueMatrix(hu)
  return h.map((row) => row.map((v, c) => v * diag[c]))
}

// --- Filtro SVG para el canvas ------------------------------------------------
// Un <filter> por matriz distinta (clave redondeada), en un <svg> oculto del DOM.
const _filters = new Map()
let _svg = null

export function matrixFilterUrl(m) {
  if (!m || typeof document === 'undefined') return ''
  // Filas de 3 (ajustes) o de 4 (filtros #18: la 4.ª columna es el desplazamiento).
  const row = (r) => [r[0], r[1], r[2], 0, r.length > 3 ? r[3] : 0]
  const values = [...row(m[0]), ...row(m[1]), ...row(m[2]), 0, 0, 0, 1, 0]
    .map((v) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(5)))
  const key = values.join(' ')
  let id = _filters.get(key)
  if (!id) {
    if (!_svg) {
      _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      _svg.setAttribute('width', '0')
      _svg.setAttribute('height', '0')
      _svg.setAttribute('aria-hidden', 'true')
      _svg.style.position = 'absolute'
      document.body.appendChild(_svg)
    }
    id = `vy-adj-${_filters.size}`
    const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
    f.setAttribute('id', id)
    f.setAttribute('color-interpolation-filters', 'sRGB')
    const cm = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix')
    cm.setAttribute('type', 'matrix')
    cm.setAttribute('values', key)
    f.appendChild(cm)
    _svg.appendChild(f)
    _filters.set(key, id)
  }
  return `url(#${id})`
}

// --- Máscara de ajuste -------------------------------------------------------

export function hasColorAdjust(clip) {
  const e = clip?.effects || {}
  return COLOR_KEYS.some((k) => num(e[k]))
}

export function hasAdjustMask(clip) {
  return clipMasks(clip).some((m) => m.enabled && m.target === 'adjust')
}

export function stripColor(effects) {
  const out = {}
  for (const [k, v] of Object.entries(effects || {})) if (!COLOR_KEYS.includes(k)) out[k] = v
  return out
}

/**
 * Pasadas de dibujo de un clip: [{ clip, ghost }]. Con máscara de ajuste y algún
 * ajuste de color → base sin ajustes + fantasma con ajustes cuyas máscaras de ajuste
 * pasan a recortar (intersección con las del clip). Mismo id: comparten el medio.
 */
export function adjustPasses(clip) {
  if (!['video', 'image', 'shape'].includes(clip?.kind) || !hasAdjustMask(clip) || !hasColorAdjust(clip)) {
    return [{ clip, ghost: false }]
  }
  const base = { ...clip, effects: stripColor(clip.effects) }
  const ghost = { ...clip, masks: clipMasks(clip).map((m) => ({ ...m, target: 'clip' })) }
  return [{ clip: base, ghost: false }, { clip: ghost, ghost: true }]
}
