// Pool de medios con VENTANA (docs/OPTIMIZACION_MEMORIA.md, Fase 2).
//
// Antes cada clip de la timeline tenía su <video>/<audio>/<img> montado siempre:
// con 40–60 clips eran 40–60 decodificadores y búferes vivos. Ahora solo se
// montan los clips cerca del cabezal (un poco por detrás, bastante por delante:
// en reproducción se precargan antes de llegar), los fijados (selección, modal de
// recorte…) y, con histéresis, los que ya estaban montados y siguen cerca, para
// que un elemento no se monte y desmonte en bucle en el borde de la ventana.

import { clipDur } from './editorModel.js'

const MEDIA_KINDS = new Set(['video', 'audio', 'image', 'motion'])

export const POOL = Object.freeze({
  behind: 3,       // s por detrás del cabezal que entran en la ventana
  ahead: 12,       // s por delante (precarga en reproducción)
  keepBehind: 10,  // histéresis: los ya montados se quedan hasta aquí
  keepAhead: 25,
  max: 16,         // tope de elementos (los fijados no cuentan para el tope)
})

export function isPoolMedia(c) {
  return !!c && MEDIA_KINDS.has(c.kind)
}

/** Distancia (s) del clip al cabezal: 0 si lo contiene. */
export function distanceToHead(c, head) {
  const start = Number(c.start) || 0
  const end = start + clipDur(c)
  if (head < start) return start - head
  if (head > end) return head - end
  return 0
}

/**
 * Ids de los clips cuyo medio debe estar montado.
 * - `head`: cabezal (s); `pinned`: ids que siempre se montan; `prev`: los
 *   montados hasta ahora (para la histéresis).
 */
export function mediaWindow(clips, head, { pinned = new Set(), prev = new Set(), opts = POOL } = {}) {
  const out = new Set()
  const ranked = []
  for (const c of clips || []) {
    if (!isPoolMedia(c)) continue
    if (pinned.has(c.id)) { out.add(c.id); continue }
    const start = Number(c.start) || 0
    const end = start + clipDur(c)
    const inWindow = end >= head - opts.behind && start <= head + opts.ahead
    const kept = prev.has(c.id) && end >= head - opts.keepBehind && start <= head + opts.keepAhead
    if (inWindow || kept) ranked.push([distanceToHead(c, head), c.id])
  }
  ranked.sort((a, b) => a[0] - b[0])
  for (const [, id] of ranked.slice(0, opts.max)) out.add(id)
  return out
}

/** El mismo conjunto (para no re-renderizar si la ventana no cambió). */
export function sameIds(a, b) {
  if (a === b) return true
  if (!a || !b || a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}
