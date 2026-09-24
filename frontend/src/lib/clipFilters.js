// Filtros de color con intensidad, apilables (#18, «Filtros» de CapCut).
// Espejo de backend/app/clip_filters.py.
//
// Cada filtro es una matriz de color AFÍN 3×4 sobre RGB en gamma (sRGB, 0–1):
// out = M·rgb + o. La intensidad k interpola con la identidad (out = (1−k)·rgb +
// k·filtro, exacto porque es lineal) y apilar filtros es componer matrices, así que
// toda la pila es UNA matriz: feColorMatrix en la vista previa y colorchannelmixer
// (+ lutrgb para el desplazamiento) en el export — el mismo resultado.
//
// clip.filters = [{id, amount}] en orden de aplicación. Los proyectos antiguos
// guardaban un único `look`: se lee como [{id: look, amount: 1}].

const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]

// --- Operaciones (en el orden en que se aplican) -----------------------------------
function sat(s) {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0],
  ]
}
function sepia(a) {
  const b = 1 - a
  return [
    [0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b, 0],
    [0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b, 0],
    [0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b, 0],
  ]
}
const contrast = (c) => [[c, 0, 0, 0.5 - 0.5 * c], [0, c, 0, 0.5 - 0.5 * c], [0, 0, c, 0.5 - 0.5 * c]]
const bright = (b) => [[b, 0, 0, 0], [0, b, 0, 0], [0, 0, b, 0]]
const tint = (r, g, b) => [[r, 0, 0, 0], [0, g, 0, 0], [0, 0, b, 0]]
const lift = (o) => [[1 - o, 0, 0, o], [0, 1 - o, 0, o], [0, 0, 1 - o, o]]
const mix = (m) => m.map((row) => [...row, 0])

/** A∘B: primero B, después A. */
export function compose(A, B) {
  return A.map((row) => [
    row[0] * B[0][0] + row[1] * B[1][0] + row[2] * B[2][0],
    row[0] * B[0][1] + row[1] * B[1][1] + row[2] * B[2][1],
    row[0] * B[0][2] + row[1] * B[1][2] + row[2] * B[2][2],
    row[0] * B[0][3] + row[1] * B[1][3] + row[2] * B[2][3] + row[3],
  ])
}
const chain = (...ops) => ops.reduce((acc, op) => compose(op, acc), I)

// --- Catálogo -------------------------------------------------------------------------
export const FILTERS = [
  { id: 'bw', label: 'Blanco y negro', group: 'bn', matrix: chain(sat(0)) },
  { id: 'noir', label: 'Noir', group: 'bn', matrix: chain(sat(0), contrast(1.5), bright(0.9)) },
  { id: 'sepia', label: 'Sepia', group: 'retro', matrix: chain(sepia(1)) },
  { id: 'vintage', label: 'Vintage', group: 'retro', matrix: chain(sepia(0.45), contrast(1.1), sat(0.8)) },
  { id: 'faded', label: 'Desvaído', group: 'retro', matrix: chain(sat(0.8), contrast(0.9), lift(0.12)) },
  { id: 'matte', label: 'Mate', group: 'retro', matrix: chain(contrast(0.95), lift(0.08)) },
  { id: 'cinematic', label: 'Cine', group: 'cine', matrix: chain(contrast(1.15), sat(0.85), bright(0.92)) },
  {
    id: 'teal_orange', label: 'Naranja y turquesa', group: 'cine',
    matrix: chain(mix([[1.12, -0.08, -0.04], [-0.04, 1.04, 0], [-0.14, 0.06, 1.08]]), contrast(1.08)),
  },
  { id: 'night', label: 'Noche', group: 'cine', matrix: chain(tint(0.75, 0.85, 1.1), bright(0.85), sat(0.7)) },
  { id: 'matrix', label: 'Verde Matrix', group: 'cine', matrix: chain(tint(0.85, 1.1, 0.85), contrast(1.1)) },
  { id: 'contrast', label: 'Alto contraste', group: 'color', matrix: chain(contrast(1.35), sat(1.1)) },
  { id: 'saturated', label: 'Vivo', group: 'color', matrix: chain(sat(1.55), contrast(1.08)) },
  { id: 'warm', label: 'Cálido', group: 'color', matrix: chain(tint(1.08, 1, 0.88), sat(1.1)) },
  { id: 'golden', label: 'Hora dorada', group: 'color', matrix: chain(tint(1.12, 1, 0.8), sat(1.2)) },
  { id: 'cool', label: 'Frío', group: 'color', matrix: chain(tint(0.9, 1, 1.1), sat(0.9)) },
]
export const FILTER_GROUPS = [
  { id: 'color', label: 'Color' },
  { id: 'cine', label: 'Cine' },
  { id: 'retro', label: 'Retro' },
  { id: 'bn', label: 'Blanco y negro' },
]
export const FILTER_IDS = FILTERS.map((f) => f.id)
const BY_ID = Object.fromEntries(FILTERS.map((f) => [f.id, f]))

const clamp01 = (v) => Math.min(1, Math.max(0, v))

/** Pila de filtros del clip ([{id, amount}]), con los `look` antiguos convertidos. */
export function clipFilters(clip) {
  if (Array.isArray(clip?.filters)) {
    return clip.filters
      .filter((f) => BY_ID[f?.id])
      .map((f) => ({ id: f.id, amount: clamp01(Number(f.amount ?? 1)) }))
  }
  const look = clip?.look
  return look && look !== 'none' && BY_ID[look] ? [{ id: look, amount: 1 }] : []
}

/** Matriz de un filtro a la intensidad k: I + k·(M − I). */
export function filterMatrix(id, k = 1) {
  const m = BY_ID[id]?.matrix || I
  const a = clamp01(Number(k))
  return m.map((row, r) => row.map((v, c) => I[r][c] + a * (v - I[r][c])))
}

/** Matriz de toda la pila (o null si no hay filtros que hagan algo). */
export function stackMatrix(filters) {
  let m = null
  for (const f of filters || []) {
    if (!(f.amount > 1e-4)) continue
    const fm = filterMatrix(f.id, f.amount)
    m = m ? compose(fm, m) : fm
  }
  return m
}

/** Muestra de colores (piel, cielo, vegetación, gris) filtrada: vista en miniatura. */
export const SWATCH = [[0.87, 0.64, 0.52], [0.36, 0.62, 0.9], [0.3, 0.55, 0.25], [0.5, 0.5, 0.5]]
export function applyMatrix(m, rgb) {
  return m.map((row) => clamp01(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2] + row[3]))
}

// --- Capa de ajuste (#19) ----------------------------------------------------------
// Afecta a todo lo que tiene debajo. Solo lleva operaciones de matriz para que la
// vista previa y el export coincidan: su pila de filtros, luego brillo, contraste y
// saturación (como los filtros CSS) y los ajustes de color (clipAdjust), y la
// intensidad (clip.opacity) interpola toda la matriz con la identidad.
const ADJ_RANGE = { brightness: [-0.5, 0.5], contrast: [-0.5, 0.5], saturation: [-1, 1] }
const fx = (e, k) => {
  const [lo, hi] = ADJ_RANGE[k]
  const n = Number(e?.[k] ?? 0)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0
}

/** Matriz 3×4 de una capa de ajuste (null si no hace nada). `adjust3` = la 3×3 de
 *  exposición/blancos/temperatura/tono (clipAdjust.colorMatrix). */
export function adjustmentMatrix(clip, adjust3) {
  const e = clip?.effects || {}
  let m = stackMatrix(clipFilters(clip)) || I
  const b = fx(e, 'brightness'), c = fx(e, 'contrast'), s = fx(e, 'saturation')
  if (b) m = compose(bright(1 + b), m)
  if (c) m = compose(contrast(1 + c), m)
  if (s) m = compose(sat(1 + s), m)
  if (adjust3) m = compose(mix(adjust3), m)
  const k = clamp01(Number(clip?.opacity ?? 1))
  const out = m.map((row, r) => row.map((v, col) => I[r][col] + k * (v - I[r][col])))
  return out.every((row, r) => row.every((v, col) => Math.abs(v - I[r][col]) < 1e-9)) ? null : out
}
