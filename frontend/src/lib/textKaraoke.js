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

/** Palabra activa usando el timing REAL de words[] (relativo al clip).
 *  Cada palabra queda activa desde su ``start`` hasta que empieza la siguiente
 *  (mismo criterio de ventanas que el export). Antes de la primera: la primera. */
export function activeWordIndexFromWords(words, localT) {
  if (!Array.isArray(words) || !words.length) return -1
  let idx = 0
  for (let i = 0; i < words.length; i++) {
    if ((words[i]?.start ?? 0) <= localT) idx = i
    else break
  }
  return idx
}

const WORD_FX = ['highlight', 'glow', 'pop']

export function wordFxList(fx) {
  if (Array.isArray(fx)) return WORD_FX.filter((x) => fx.includes(x))
  if (!fx || fx === 'none') return []
  return WORD_FX.includes(fx) ? [fx] : []
}

export function hasWordFx(st, name) {
  return wordFxList(st?.word_fx).includes(name)
}

export function karaokeOn(st) {
  return wordFxList(st?.word_fx).length > 0
}

export function toggleWordFx(current, name) {
  const on = new Set(wordFxList(current))
  if (on.has(name)) on.delete(name)
  else if (WORD_FX.includes(name)) on.add(name)
  const next = WORD_FX.filter((x) => on.has(x))
  return next.length ? next : 'none'
}

export function chunkCaptionText(text, maxWords) {
  const words = splitCaptionWords(text)
  if (!words.length) return []
  const n = Math.floor(Number(maxWords))
  if (!Number.isFinite(n) || n < 1) return [words.join(' ')]
  const out = []
  for (let i = 0; i < words.length; i += n) out.push(words.slice(i, i + n).join(' '))
  return out
}

export function styleOpacity(st) {
  const n = Number(st?.opacity)
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

function clamp01(n, fallback = 1) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0, v))
}

/** Opacidad de una palabra: activa vs inactiva. Sin karaoke, todas usan la activa. */
export function wordOpacity(st, isActive) {
  if (isActive || !karaokeOn(st)) return clamp01(st?.active_opacity, 1)
  return clamp01(st?.inactive_opacity, 1)
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
    max_words: cur.max_words ?? pack.max_words,
  }
}
