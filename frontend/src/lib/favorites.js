// Favoritos de SFX, audios del proyecto y estilos de texto (ajustes globales).

export const FAV_CAT = 'favoritos'
export const FONT_SIZE_REF = 1280

export function emptyFavorites() {
  return { sfx: [], audios: [], textStyles: [] }
}

export function normalizeFavorites(raw) {
  const d = emptyFavorites()
  if (!raw || typeof raw !== 'object') return d
  return {
    sfx: Array.isArray(raw.sfx) ? raw.sfx.map(String) : [],
    audios: Array.isArray(raw.audios) ? raw.audios.map(String) : [],
    textStyles: Array.isArray(raw.textStyles) ? raw.textStyles.filter((x) => x && x.style) : [],
  }
}

export function toggleId(list, id) {
  const key = String(id)
  const next = (list || []).map(String)
  const i = next.indexOf(key)
  if (i >= 0) next.splice(i, 1)
  else next.push(key)
  return next
}

export function audioFavKey(projectId, audioId) {
  return `${projectId}:${audioId}`
}

/** Referencia de favorito de un clip de timeline (audio o sfx). */
export function clipFavRef(projectId, clip) {
  if (!clip) return null
  if (clip.asset_kind === 'sfx') return { bucket: 'sfx', id: String(clip.filename || clip.asset_id || '') }
  return null
}

export function snapshotTextStyle(style) {
  return { ...(style || {}) }
}

export function nameTextStyleFavorite(style, existing) {
  const theme = style?.theme || style?.preset || 'Estilo'
  const px = Math.round((style?.size ?? 0.05) * FONT_SIZE_REF)
  const base = `${theme} · ${px}px`
  const names = new Set((existing || []).map((f) => f.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} (${i})`)) i += 1
  return `${base} (${i})`
}

export function makeTextStyleFavorite(style, existing) {
  return {
    id: `tf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: nameTextStyleFavorite(style, existing),
    style: snapshotTextStyle(style),
  }
}
