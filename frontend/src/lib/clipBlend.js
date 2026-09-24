// Modos de fusión (#8): cómo se mezcla un clip con lo que tiene debajo.
// Preview: globalCompositeOperation del canvas (fórmulas W3C). Export: filtro
// `blend` de FFmpeg con las mismas fórmulas (backend/app/clip_blend.py).

export const BLEND_MODES = [
  { id: 'normal', label: 'Normal', op: 'source-over' },
  { id: 'darken', label: 'Oscurecer', op: 'darken' },
  { id: 'multiply', label: 'Multiplicar', op: 'multiply' },
  { id: 'color_burn', label: 'Subexponer color', op: 'color-burn' },
  { id: 'lighten', label: 'Aclarar', op: 'lighten' },
  { id: 'screen', label: 'Trama', op: 'screen' },
  { id: 'color_dodge', label: 'Sobreexponer color', op: 'color-dodge' },
  { id: 'overlay', label: 'Superponer', op: 'overlay' },
  { id: 'soft_light', label: 'Luz suave', op: 'soft-light' },
  { id: 'hard_light', label: 'Luz fuerte', op: 'hard-light' },
  { id: 'difference', label: 'Diferencia', op: 'difference' },
  { id: 'exclusion', label: 'Exclusión', op: 'exclusion' },
]

const BY_ID = new Map(BLEND_MODES.map((m) => [m.id, m]))

export function normalizeBlend(v) {
  return BY_ID.has(v) ? v : 'normal'
}

/** Modo de fusión del clip ('normal' si no tiene o no es válido). */
export function clipBlend(clip) {
  return normalizeBlend(clip?.blend_mode)
}

/** Operación de canvas del clip, o null si es normal (se pinta directo). */
export function blendOp(clip) {
  const id = clipBlend(clip)
  return id === 'normal' ? null : BY_ID.get(id).op
}
