// Registro de efectos: todos los efectos disponibles, por id.
// Añadir un efecto = añadirlo al array de su archivo de categoría (o importar un
// archivo nuevo aquí). `npm run fx:build` actualiza el catálogo del backend.

import { FX_CATEGORIES } from './core/define.js'
import glitch from './effects/glitch.js'
import retro from './effects/retro.js'
import distort from './effects/distort.js'
import light from './effects/light.js'
import lens from './effects/lens.js'
import motion from './effects/motion.js'
import style from './effects/style.js'
import color from './effects/color.js'
import paper from './effects/paper.js'

export const EFFECTS = [...glitch, ...retro, ...distort, ...light, ...lens, ...motion, ...style, ...color, ...paper]

const byId = new Map()
for (const e of EFFECTS) {
  if (byId.has(e.id)) throw new Error(`Efecto duplicado: ${e.id}`)
  byId.set(e.id, e)
}

export { FX_CATEGORIES }

export function getEffect(id) {
  return byId.get(String(id || '')) || null
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Efectos filtrados por categoría y/o texto (nombre, etiquetas, descripción). */
export function listEffects({ category = null, query = '', engine = null } = {}) {
  const q = norm(query).trim()
  return EFFECTS.filter((e) => {
    if (category && e.category !== category) return false
    if (engine && e.engine !== engine) return false
    if (!q) return true
    const hay = norm([e.id, e.name, e.description, ...e.tags].join(' '))
    return q.split(/\s+/).every((w) => hay.includes(w))
  })
}
