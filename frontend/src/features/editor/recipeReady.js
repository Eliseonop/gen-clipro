// ¿Se puede aplicar la receta (#21) con lo seleccionado? Mismo criterio que
// recipes._need del backend: `needs` = null | 'text' | 'video' | 'media2'.
export function recipeReady(recipe, selected) {
  const sel = selected || []
  const count = (kinds) => sel.filter((c) => kinds.includes(c.kind)).length
  if (recipe.needs === 'text') return count(['text']) ? { ok: true } : { ok: false, why: 'selecciona un texto' }
  if (recipe.needs === 'video') return count(['video']) ? { ok: true } : { ok: false, why: 'selecciona un vídeo' }
  if (recipe.needs === 'media2') {
    return count(['video', 'image']) >= 2 ? { ok: true } : { ok: false, why: 'selecciona 2 o más vídeos o imágenes' }
  }
  return { ok: true }
}
