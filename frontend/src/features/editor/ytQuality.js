// Calidades para «Agregar vídeo completo» desde YouTube. La calidad es la
// etiqueta de YouTube (lado corto en px): 720, 1080, 2160…

const TAGS = { 4320: '8K', 2160: '4K', 1440: '2K', 1080: 'Full HD', 720: 'HD' }

// Nombre corto para el botón: «4K» / «8K», el resto «1080p».
export function qualityShort(q) {
  if (q >= 4320) return '8K'
  if (q >= 2160) return '4K'
  return `${q}p`
}

export function qualityTag(q) {
  return TAGS[q] || ''
}

export function fmtBytes(n) {
  const b = Number(n) || 0
  if (b <= 0) return ''
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(b / 1024 ** 2))} MB`
}

// «60 fps · 1.3 GB» (solo lo que se sepa).
export function qualityMeta(item) {
  const parts = []
  if (item?.fps && item.fps > 30) parts.push(`${item.fps} fps`)
  const size = fmtBytes(item?.size)
  if (size) parts.push(`≈ ${size}`)
  return parts.join(' · ')
}

// Lista de mejor a peor tal como llega de /api/analyze (video.qualities).
export function videoQualities(result) {
  const list = result?.video?.qualities
  if (!Array.isArray(list)) return []
  return list
    .filter((x) => x && Number(x.quality) > 0)
    .sort((a, b) => b.quality - a.quality)
}

// «Subir calidad»: versiones de menos calidad del mismo vídeo que la timeline
// usa y se pueden cambiar (de GET …/versions o del job de descarga).
export function usedUpgrades(list) {
  return (Array.isArray(list) ? list : [])
    .filter((v) => v && v.compatible !== false && Number(v.timeline_uses) > 0)
}

export function upgradeMessage(versions, newQuality) {
  const list = usedUpgrades(versions)
  const total = list.reduce((n, v) => n + Number(v.timeline_uses), 0)
  const clips = `${total} clip${total === 1 ? '' : 's'}`
  const target = newQuality ? `la versión ${qualityShort(newQuality)}` : 'esta versión'
  const head = list.length === 1
    ? `La timeline usa «${list[0].label}»${list[0].quality ? ` en ${list[0].quality}p` : ''} en ${clips}.`
    : `La timeline usa ${list.length} versiones de menos calidad de este vídeo en ${clips}.`
  return `${head} ¿Cambiarlos por ${target}? Se conservan los cortes, el encuadre y las animaciones (se puede deshacer).`
}
