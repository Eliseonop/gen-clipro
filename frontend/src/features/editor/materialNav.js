// Pestañas de Material. `short` = nombre que se ve bajo el icono (cabe en el
// ancho del botón); `label` = nombre completo del tooltip / aria-label.
export const MAT_NAV = [
  { id: 'video', icon: 'movie', label: 'Video', short: 'Video' },
  { id: 'image', icon: 'image', label: 'Imagen', short: 'Imagen' },
  { id: 'audio', icon: 'mic', label: 'Audio', short: 'Audio' },
  { id: 'sfx', icon: 'graphic_eq', label: 'SFX', short: 'SFX' },
  { id: 'library', icon: 'collections_bookmark', label: 'Biblioteca', short: 'Biblio', sep: true },
  { id: 'effects', icon: 'auto_awesome', label: 'Efectos', short: 'Efectos', sep: true },
  { id: 'shapes', icon: 'category', label: 'Figuras', short: 'Figuras' },
  { id: 'text', icon: 'title', label: 'Texto', short: 'Texto' },
  { id: 'transitions', icon: 'animation', label: 'Transiciones', short: 'Trans.' },
  { id: 'motion', icon: 'animation', label: 'Motion', short: 'Motion', sep: true },
  { id: 'paper', icon: 'draw', label: 'Paper', short: 'Paper' },
  { id: 'ai', icon: 'smart_toy', label: 'IA', short: 'IA', sep: true },
  { id: 'settings', icon: 'settings', label: 'Configuración', short: 'Config', sep: true },
  { id: 'chat', icon: 'forum', label: 'Chat IA', short: 'Chat' },
]

// Medidas de la barra (en sintonía con .ed-mat-nav* / .ed-material de editor.css).
export const MAT_NAV_METRICS = { btn: 36, gap: 1, sep: 5, chrome: 18 }

/** Ancho del panel Material para que quepan todas las pestañas sin desplazar. */
export function matNavWidth(items = MAT_NAV, m = MAT_NAV_METRICS) {
  const seps = items.filter((x) => x.sep).length
  const children = items.length + seps
  return items.length * m.btn + seps * m.sep + Math.max(0, children - 1) * m.gap + m.chrome
}

export const MAT_NAV_WIDTH = matNavWidth()

export function scopeTabsFor(tab) {
  if (tab === 'video' || tab === 'audio') return ['all', 'saved', 'cargar']
  if (tab === 'image') return ['all', 'saved', 'explore']
  return []
}

export function digitTabIndex(code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(String(code || ''))
  return m ? Number(m[1]) - 1 : -1
}

/** Shift+1/2/3… para no pisar números al escribir en un input. */
export function scopeShortcutIndex(e) {
  if (!e || !e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return -1
  return digitTabIndex(e.code)
}

export function stepNavId(ids, current, dir) {
  if (!ids?.length) return current
  const i = ids.indexOf(current)
  const from = i < 0 ? 0 : i
  const next = from + (dir < 0 ? -1 : 1)
  if (next < 0 || next >= ids.length) return current
  return ids[next]
}

export function wheelStepDir(deltaX, deltaY) {
  const dx = Number(deltaX) || 0
  const dy = Number(deltaY) || 0
  const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx
  if (!delta) return 0
  return delta > 0 ? 1 : -1
}

export function isTypingTarget(el) {
  if (!el) return false
  const tag = (el.tagName || '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return !!el.isContentEditable
}
