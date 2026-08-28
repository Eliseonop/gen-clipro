// Formatea segundos como m:ss (o h:mm:ss si pasa de una hora).
export function fmt(s) {
  s = Math.max(0, Math.floor(s || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const ss = String(sec).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

// Convierte "m:ss", "h:mm:ss" (o segundos sueltos) a segundos. null si no es válido.
export function parseTime(str) {
  if (str == null) return null
  str = String(str).trim()
  if (str === '') return null
  if (!str.includes(':')) {
    const n = Number(str)
    return Number.isNaN(n) ? null : n
  }
  const parts = str.split(':').map((p) => Number(p))
  if (parts.some((p) => Number.isNaN(p))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

// Extrae el id de vídeo de una URL de YouTube.
export function ytId(url) {
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : null
}
