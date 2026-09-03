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
