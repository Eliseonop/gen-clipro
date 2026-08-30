// Tiempos de palabra estimados y aplicación de un tema a un estilo de pista.

export function splitCaptionWords(text) {
  return (text || '').split(/\s+/).filter(Boolean)
}

export function activeWordIndex(wordCount, localT, duration) {
  if (wordCount <= 0) return -1
  if (duration <= 0) return 0
  if (localT < 0) return -1
  if (localT >= duration) return wordCount - 1
  return Math.min(wordCount - 1, Math.floor((localT / duration) * wordCount))
}

export function applyThemeToStyle(current, theme) {
  const cur = current || {}
  const pack = theme?.style || {}
  return {
    ...pack,
    theme: theme.id,
    preset: theme.id,
    x: cur.x ?? pack.x,
    y: cur.y ?? pack.y,
    w: cur.w ?? pack.w,
  }
}
