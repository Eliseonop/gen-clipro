// Último fotograma conocido de cada clip, en pequeño (lado mayor ≤ 480 px).
//
// Con el pool de medios con ventana (mediaWindow.js) un clip lejos del cabezal no
// tiene elemento montado; al saltar hasta él, su <video> tarda unas décimas en
// cargar. Mientras tanto el preview dibuja este póster en vez de negro. Se guarda
// al soltar el elemento (y de las imágenes, en cuanto se ven), en una caché con
// tope en bytes.

import { createLruBytes } from '../../../lib/lruBytes.js'
import { mediaSize } from '../../../lib/clipLayout.js'

const MAX_SIDE = 480
const posters = createLruBytes({ maxBytes: 48 * 1024 * 1024, name: 'posters' })

/** Guarda el fotograma actual de `el` como póster del clip. */
export function rememberPoster(clipId, el) {
  if (!clipId || !el || typeof document === 'undefined') return
  const { w, h } = mediaSize(el)
  if (!w || !h) return
  if (el.tagName === 'VIDEO' && el.readyState < 2) return   // sin fotograma que copiar
  const k = Math.min(1, MAX_SIDE / Math.max(w, h))
  const cw = Math.max(2, Math.round(w * k))
  const ch = Math.max(2, Math.round(h * k))
  let entry = posters.peek(clipId)
  const canvas = entry?.canvas || document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  try {
    canvas.getContext('2d').drawImage(el, 0, 0, cw, ch)
  } catch {
    return
  }
  entry = { canvas, media: { videoWidth: w, videoHeight: h } }
  posters.set(clipId, entry, cw * ch * 4)
}

/** `{ canvas, media }` (media = tamaño real del material) o null. */
export function posterFor(clipId) {
  return posters.get(clipId) || null
}

export function hasPoster(clipId) {
  return posters.has(clipId)
}

export function forgetPosters(aliveIds) {
  posters.purge((id) => aliveIds.has(id))
}
