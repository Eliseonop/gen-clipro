// Parámetros de un efecto: esquema → valores por defecto, validación y uniforms.
//
// Tipos:
//   range  { min, max, step, def }  número (uniform float)
//   toggle { def }                  sí/no (uniform float 0/1)
//   color  { def: '#rrggbb' }       color (uniform vec3 0–1)
//   select { options: [{id,label}], def }  opción (uniform float = índice)
//   seed   { def }                  variación del azar (uniform float)
//
// Las magnitudes de tamaño NO van en píxeles: van en fracción del lado menor de
// la imagen, para que el efecto se vea igual en el preview (reducido) y en el
// export (resolución completa).

export const PARAM_TYPES = ['range', 'toggle', 'color', 'select', 'seed']

function num(v, d) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export function hexToRgb01(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return [1, 1, 1]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Normaliza la definición de un parámetro (lanza si es inválida). */
export function normalizeParamSpec(id, raw) {
  const p = { ...raw, id }
  if (!PARAM_TYPES.includes(p.type)) throw new Error(`Parámetro ${id}: tipo desconocido ${p.type}`)
  p.label = String(p.label || id)
  if (p.type === 'range') {
    p.min = num(p.min, 0)
    p.max = num(p.max, 1)
    p.step = num(p.step, (p.max - p.min) / 100)
    p.def = Math.min(p.max, Math.max(p.min, num(p.def, p.min)))
  } else if (p.type === 'toggle') {
    p.def = !!p.def
  } else if (p.type === 'color') {
    p.def = /^#[0-9a-f]{6}$/i.test(p.def || '') ? p.def.toLowerCase() : '#ffffff'
  } else if (p.type === 'select') {
    p.options = (p.options || []).map((o) => (typeof o === 'string' ? { id: o, label: o } : { id: String(o.id), label: String(o.label || o.id) }))
    if (!p.options.length) throw new Error(`Parámetro ${id}: select sin opciones`)
    p.def = p.options.some((o) => o.id === p.def) ? p.def : p.options[0].id
  } else if (p.type === 'seed') {
    p.def = Math.round(num(p.def, 1))
  }
  return p
}

/** Valor válido de un parámetro (el valor por defecto si no lo es). */
export function paramValue(p, v) {
  if (v === undefined || v === null) return p.def
  if (p.type === 'range') {
    const n = num(v, p.def)
    return Math.min(p.max, Math.max(p.min, n))
  }
  if (p.type === 'toggle') return v === true || v === 1 || v === 'true'
  if (p.type === 'color') return /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : p.def
  if (p.type === 'select') return p.options.some((o) => o.id === String(v)) ? String(v) : p.def
  if (p.type === 'seed') return Math.round(num(v, p.def))
  return p.def
}

/** Todos los parámetros resueltos: los que faltan toman su valor por defecto. */
export function resolveParams(effect, raw) {
  const out = {}
  for (const p of effect.paramList) out[p.id] = paramValue(p, raw?.[p.id])
  return out
}

export function paramDefaults(effect) {
  return resolveParams(effect, {})
}

/** Valor de un parámetro como uniform de GLSL (número o vec3). */
export function uniformValue(p, v) {
  if (p.type === 'color') return hexToRgb01(v)
  if (p.type === 'toggle') return v ? 1 : 0
  if (p.type === 'select') return Math.max(0, p.options.findIndex((o) => o.id === v))
  return Number(v) || 0
}
