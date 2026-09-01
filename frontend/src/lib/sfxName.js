import { FAV_CAT } from './favorites.js'

/** Nombre visible de un SFX: el stem del archivo, sin ruta ni extensión. */
export function sfxNameFromFile(filename) {
  const base = String(filename || '').replace(/^.*[\\/]/, '')
  const i = base.lastIndexOf('.')
  return (i > 0 ? base.slice(0, i) : base).trim()
}

export function realSfxCategories(categories) {
  return (categories || []).filter((c) => c && c.id && c.id !== FAV_CAT)
}

export function upsertSfxCategory(cats, cat) {
  if (!cat?.id || cat.id === FAV_CAT) return realSfxCategories(cats)
  const next = realSfxCategories(cats).filter((c) => c.id !== cat.id)
  next.push({ id: cat.id, label: cat.label || cat.id, count: cat.count ?? 0 })
  return next
}

export function matchSfxCategory(text, categories) {
  const t = String(text || '').trim()
  if (!t) return { categoryId: '', newCategory: '' }
  const tl = t.toLowerCase()
  const hit = (categories || []).find((c) => {
    const label = String(c.label || c.id || '').toLowerCase()
    const id = String(c.id || '').toLowerCase()
    return label === tl || id === tl
  })
  if (hit) return { categoryId: hit.id, newCategory: '' }
  return { categoryId: '', newCategory: t }
}

export function sfxDraftFromFile(file, defaults = {}) {
  return {
    file: file || null,
    sfxId: null,
    previewUrl: '',
    name: sfxNameFromFile(file?.name),
    categoryId: defaults.categoryId || '',
    categoryLabel: defaults.categoryLabel || '',
    uso: defaults.uso || '',
    saved: false,
  }
}

export function sfxDraftFromSaved(sfx) {
  return {
    file: null,
    sfxId: sfx?.id || null,
    previewUrl: sfx?.url || '',
    name: sfx?.name || '',
    categoryId: sfx?.folder || '',
    categoryLabel: sfx?.category || '',
    uso: sfx?.uso || '',
    saved: false,
  }
}

export function sfxSavePayload(row, categories) {
  const name = String(row?.name || '').trim()
  const uso = String(row?.uso || '').trim()
  const id = String(row?.categoryId || '').trim()
  if (id) return { name, categoryId: id, newCategory: '', uso }
  const { categoryId, newCategory } = matchSfxCategory(row?.categoryLabel, categories)
  return { name, categoryId, newCategory, uso }
}
