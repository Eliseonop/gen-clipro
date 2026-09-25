// Pila de capas de la timeline (como CapCut).
//
// Las pistas de VÍDEO y de TEXTO forman UNA sola pila, en el orden del array
// `tracks`: índice 0 = fondo, la última = delante. El audio no pinta nada, así
// que queda fuera de la pila. Preview y export componen por este orden, así que
// un texto puede quedar DETRÁS de un vídeo (texto detrás de una persona).
//
// En pantalla la pila va invertida (la de delante arriba) y el audio debajo, en
// su orden de array.

// Versión del formato del timeline que habla el editor (= CURRENT_SCHEMA_VERSION
// de backend/app/migrations.py). Va en todo lo que se envía: sin ella el backend
// lo trata como legado y lo migra, y la migración v4→v5 volvería a subir los
// textos por encima del vídeo, deshaciendo el orden de capas del usuario.
export const TIMELINE_SCHEMA_VERSION = 5

export const isStackTrack = (t) => t?.kind === 'video' || t?.kind === 'text'

export function displayTracks(tracks) {
  const list = tracks || []
  return [...list.filter(isStackTrack).reverse(), ...list.filter((t) => !isStackTrack(t))]
}

/** track_id → capa (0 = fondo). Las pistas de audio no aparecen. */
export function stackLayers(tracks) {
  const layers = new Map()
  let i = 0
  for (const t of tracks || []) if (isStackTrack(t)) layers.set(t.id, i++)
  return layers
}

/**
 * Índice del array para una pista nueva de `kind` sin cambiar lo que se ve:
 * el vídeo va encima del vídeo más alto (los textos que hubiera delante siguen
 * delante); texto y audio al final (el texto queda arriba del todo de la pila:
 * el audio no cuenta en ella).
 */
export function defaultTrackIndex(tracks, kind) {
  const list = tracks || []
  if (kind === 'video') return list.findLastIndex((t) => t.kind === 'video') + 1
  return list.length
}

export function insertTrack(tracks, track, index) {
  const list = [...(tracks || [])]
  const at = Number.isInteger(index) ? Math.max(0, Math.min(list.length, index)) : defaultTrackIndex(list, track.kind)
  list.splice(at, 0, track)
  return list
}

// Pantalla → array: la pila vuelve a su orden (fondo primero) y el audio detrás.
function fromDisplay(rows) {
  return [...rows.filter(isStackTrack).reverse(), ...rows.filter((t) => !isStackTrack(t))]
}

/**
 * Coloca `trackId` justo encima (`above`) o debajo (`below`) de `targetId` tal
 * como se ven en pantalla. Solo dentro de su grupo: la pila (vídeo + texto) o el
 * audio. Devuelve el mismo array si no hay nada que mover.
 */
export function reorderTrack(tracks, trackId, targetId, place) {
  const rows = displayTracks(tracks)
  const moving = rows.find((t) => t.id === trackId)
  const target = rows.find((t) => t.id === targetId)
  if (!moving || !target || moving === target || isStackTrack(moving) !== isStackTrack(target)) return tracks
  const rest = rows.filter((t) => t !== moving)
  rest.splice(rest.indexOf(target) + (place === 'below' ? 1 : 0), 0, moving)
  const next = fromDisplay(rest)
  return next.every((t, i) => t === tracks[i]) ? tracks : next
}

/** Vecina en pantalla dentro del grupo: dir -1 = la de arriba, 1 = la de abajo. */
export function trackNeighbor(tracks, trackId, dir) {
  const rows = displayTracks(tracks)
  const i = rows.findIndex((t) => t.id === trackId)
  const n = rows[i + dir]
  return i >= 0 && n && isStackTrack(n) === isStackTrack(rows[i]) ? n : null
}

/** Sube (dir -1) o baja (dir 1) una pista un puesto en pantalla. */
export function stepTrack(tracks, trackId, dir) {
  const n = trackNeighbor(tracks, trackId, dir)
  return n ? reorderTrack(tracks, trackId, n.id, dir < 0 ? 'above' : 'below') : tracks
}
