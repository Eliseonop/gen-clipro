// Definición de un efecto (el «SDK»): un archivo = un efecto. Todo lo demás
// (panel de propiedades, validación, MCP, catálogo del backend) sale de aquí.
// Ver docs/EFECTOS_ANIMADOS.md §6.

import { normalizeParamSpec } from './params.js'

export const FX_CATEGORIES = [
  { id: 'basic', label: 'Básicos', icon: 'auto_awesome' },
  { id: 'glitch', label: 'Glitch', icon: 'broken_image' },
  { id: 'retro', label: 'Retro', icon: 'videocam' },
  { id: 'distort', label: 'Distorsión', icon: 'waves' },
  { id: 'light', label: 'Luz', icon: 'flare' },
  { id: 'lens', label: 'Lente', icon: 'camera' },
  { id: 'motion', label: 'Movimiento', icon: 'vibration' },
  { id: 'style', label: 'Estilo', icon: 'brush' },
  { id: 'color', label: 'Color', icon: 'palette' },
]

// shader: GLSL por píxel · canvas: Canvas 2D (p. ej. el papel) · generator: pinta
// sus propios píxeles sin fuente (partículas, marcos…), en un clip propio.
export const FX_ENGINES = ['shader', 'canvas', 'generator']

const ID_RE = /^[a-z][a-z0-9_]*$/

export function defineEffect(spec) {
  if (!spec || !ID_RE.test(spec.id || '')) throw new Error(`Efecto con id inválido: ${spec?.id}`)
  if (!FX_ENGINES.includes(spec.engine)) throw new Error(`${spec.id}: motor desconocido ${spec.engine}`)
  if (!FX_CATEGORIES.some((c) => c.id === spec.category)) throw new Error(`${spec.id}: categoría desconocida ${spec.category}`)
  if (spec.engine === 'shader' && typeof spec.frag !== 'string') throw new Error(`${spec.id}: falta frag`)
  if (spec.engine !== 'shader' && typeof spec.render !== 'function') throw new Error(`${spec.id}: falta render`)
  const paramList = Object.entries(spec.params || {}).map(([id, p]) => normalizeParamSpec(id, p))
  return Object.freeze({
    ...spec,
    v: Math.max(1, Math.round(Number(spec.v) || 1)),
    name: String(spec.name || spec.id),
    description: String(spec.description || ''),
    tags: [...(spec.tags || [])],
    pad: Math.min(0.5, Math.max(0, Number(spec.pad) || 0)),
    // Duración por defecto al añadirlo (null = todo el clip).
    defaultDur: spec.defaultDur == null ? null : Math.max(0.1, Number(spec.defaultDur)),
    paramList,
    params: Object.fromEntries(paramList.map((p) => [p.id, p])),
  })
}

/** Lo serializable de un efecto (catálogo del backend / MCP). */
export function effectManifest(fx) {
  return {
    id: fx.id,
    v: fx.v,
    name: fx.name,
    description: fx.description,
    category: fx.category,
    engine: fx.engine,
    tags: fx.tags,
    pad: fx.pad,
    default_dur: fx.defaultDur,
    // Miniatura de la biblioteca: instante y parámetros que mejor lo enseñan.
    thumb: fx.thumb || null,
    params: fx.paramList.map((p) => {
      const out = { id: p.id, type: p.type, label: p.label, def: p.def }
      if (p.type === 'range') Object.assign(out, { min: p.min, max: p.max, step: p.step })
      if (p.type === 'select') out.options = p.options
      return out
    }),
  }
}
