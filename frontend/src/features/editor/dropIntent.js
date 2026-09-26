// Qué significa soltar un clip en un punto de la timeline.
//
// La pista es una SECUENCIA. Cuando el destino está ocupado no se apila a
// ciegas: se deduce la intención por la POSICIÓN del puntero, como en CapCut.
//
//   ┌──────────────────────────────┐  ← franja superior: pista nueva encima
//   │  clip existente              │     (se dibuja una línea horizontal)
//   └──────────────────────────────┘
//      ↑ casi alineado        ↑ desplazado ≥20%
//        = reemplazar           = colocar detrás
//
// Solo decide; no toca estado. Quien llama aplica la acción (y pide
// confirmación si es 'replace').

import { clipEnd, clipDur, freeStartOnTrack } from './editorModel.js'
import { displayTracks, isStackTrack } from './trackStack.js'

/** Fracción superior de la pista que significa "crear pista nueva encima". */
export const NEW_TRACK_BAND = 0.25
/** Bordes de una pista de SU tipo que, al mover un clip, piden pista nueva:
 *  estrechos para no robarle el "déjalo en esta pista". */
export const INSERT_EDGE = 0.2
/** El mismo borde en px: igual de fácil de acertar en una pista alta que en una baja. */
export const INSERT_EDGE_PX = 9

/** Fracción del alto de una pista de `rowH` px que es borde de inserción. */
export function insertEdge(rowH) {
  const h = Number(rowH)
  return h > 0 ? Math.min(0.3, Math.max(0.12, INSERT_EDGE_PX / h)) : INSERT_EDGE
}
/** Desfase (en fracción de la duración del clip destino) por debajo del cual
 *  se entiende que quieres REEMPLAZARLO y no ponerlo al lado. */
export const REPLACE_TOL = 0.2

/** Clip de la pista que cubre `t` (el último del array = el de encima). */
export function clipAtTime(clips, trackId, t) {
  let hit = null
  for (const c of clips || []) {
    if (c.track_id !== trackId) continue
    if (t >= c.start && t < clipEnd(c)) hit = c
  }
  return hit
}

/** Clip de la pista que se solaparía con [start, start+dur).
 *  `excludeIds` deja fuera al clip que se está arrastrando (si no, choca consigo mismo). */
export function clipCollidingWith(clips, trackId, start, dur, excludeIds) {
  const end = start + Math.max(0, dur || 0)
  const skip = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])
  let hit = null
  for (const c of clips || []) {
    if (c.track_id !== trackId || skip.has(c.id)) continue
    const ce = clipEnd(c)
    if (ce <= c.start) continue
    if (start < ce && c.start < end) hit = c
  }
  return hit
}

/**
 * Intención de soltar en `trackId` a la altura `yRatio` (0 = borde superior de
 * la pista, 1 = inferior) y en el instante `time`.
 *
 * Devuelve `{ action, start, targetId }`:
 *   - `place`    hueco libre: se coloca tal cual en `start`
 *   - `after`    sobre un clip pero desplazado: va justo detrás (`start`)
 *   - `replace`  sobre un clip y casi alineado: sustituirlo (pide confirmación)
 *   - `newTrack` soltado en la franja superior: pista nueva encima
 */
export function dropIntent(clips, trackId, time, dur, yRatio, excludeIds) {
  const span = Math.max(0, Number(dur) || 0)
  const t = Math.max(0, Number(time) || 0)
  const hit = clipCollidingWith(clips, trackId, t, span, excludeIds)
  if (!hit) return { action: 'place', start: +t.toFixed(3), targetId: null }

  const y = Number(yRatio)
  if (Number.isFinite(y) && y < NEW_TRACK_BAND) {
    return { action: 'newTrack', start: +t.toFixed(3), targetId: hit.id }
  }

  const hitDur = clipDur(hit)
  const offset = Math.abs(t - hit.start)
  if (hitDur > 0 && offset < hitDur * REPLACE_TOL) {
    return { action: 'replace', start: +hit.start.toFixed(3), targetId: hit.id }
  }

  // Desplazado: se entiende "ponlo al lado", detrás del clip que estorba.
  return {
    action: 'after',
    start: freeStartOnTrack(clips, trackId, clipEnd(hit), span, { excludeIds }),
    targetId: hit.id,
  }
}

/**
 * Índice del array `tracks` donde insertar una pista nueva de `kind` al sacar
 * un clip por encima ('above') o por debajo ('below') de su grupo.
 *
 * Vídeo y texto comparten grupo (la pila, ver trackStack.js) y en pantalla va
 * invertida (la última del array arriba): 'above' = detrás de la pila y 'below'
 * = delante. El audio se pinta en el orden del array: se invierte.
 */
export function newTrackIndex(tracks, kind, side) {
  const list = tracks || []
  const stack = kind === 'video' || kind === 'text'
  const idx = list.map((t, i) => ((stack ? isStackTrack(t) : t.kind === kind) ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return list.length
  const first = idx[0]
  const last = idx[idx.length - 1]
  const toEnd = stack ? side !== 'below' : side === 'below'
  return toEnd ? last + 1 : first
}

/**
 * Pista nueva al arrastrar un clip de `kind` sobre la pista `hoverId`, con el
 * puntero a `yRatio` de su alto (0 = borde superior). Como CapCut: sobre una
 * pista que no es de su tipo (un texto sobre un vídeo) se señala SIEMPRE una
 * pista nueva, encima o debajo según la mitad; sobre una de su tipo, en sus
 * bordes (`edge`, fracción del alto), sea cual sea la pista de al lado. Fuera
 * de su bloque (un texto sobre el audio), en el borde del bloque más cercano.
 *
 * `originAlone`: el clip es el único de su pista (`originId`). Una pista nueva
 * pegada a ella no cambiaría nada (la suya se quita al quedar vacía), así que
 * ahí se queda donde está.
 *
 * Devuelve `{ targetId, place }` ('above' | 'below' tal como se ve) o null si
 * el clip entra en esa pista.
 */
export function insertSlot(tracks, kind, hoverId, yRatio, originId, { edge = INSERT_EDGE, originAlone = false } = {}) {
  const rows = displayTracks(tracks)
  const hover = rows.find((t) => t.id === hoverId)
  if (!hover) return null
  const stack = kind === 'video' || kind === 'text'
  let slot = null
  if (isStackTrack(hover) !== stack) {
    const group = rows.filter((t) => isStackTrack(t) === stack)
    if (!group.length) return null
    slot = stack ? { targetId: group[group.length - 1].id, place: 'below' } : { targetId: group[0].id, place: 'above' }
  } else {
    const y = Number.isFinite(Number(yRatio)) ? Number(yRatio) : 0.5
    if (hover.kind !== kind || hover.locked) slot = { targetId: hover.id, place: y < 0.5 ? 'above' : 'below' }
    else if (y < edge) slot = { targetId: hover.id, place: 'above' }
    else if (y > 1 - edge) slot = { targetId: hover.id, place: 'below' }
  }
  if (!slot) return null
  if (originAlone && originId) {
    const b = slotBoundary(tracks, slot)
    const o = rows.findIndex((t) => t.id === originId)
    if (o >= 0 && (b === o || b === o + 1)) return null
  }
  return slot
}

/** Hueco entre filas de un slot tal como se ve: 0 = encima de la primera fila.
 *  Dos slots con el mismo hueco (debajo de A = encima de B) son la misma pista nueva. */
export function slotBoundary(tracks, slot) {
  const rows = displayTracks(tracks)
  const i = rows.findIndex((t) => t.id === slot?.targetId)
  if (i < 0) return -1
  return i + (slot.place === 'below' ? 1 : 0)
}

/** Índice del array `tracks` para una pista nueva en `slot` (ver insertSlot).
 *  La pila se ve invertida (la última del array, arriba); el audio, en orden. */
export function slotIndex(tracks, slot) {
  const list = tracks || []
  const i = list.findIndex((t) => t.id === slot?.targetId)
  if (i < 0) return list.length
  const onTop = isStackTrack(list[i]) ? slot.place === 'above' : slot.place === 'below'
  return onTop ? i + 1 : i
}
