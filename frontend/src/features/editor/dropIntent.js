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

/** Fracción superior de la pista que significa "crear pista nueva encima". */
export const NEW_TRACK_BAND = 0.25
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
 * Índice del array `tracks` donde insertar una pista nueva de `kind`.
 *
 * En pantalla el vídeo va invertido (la última del array se pinta arriba), así
 * que 'above' = detrás del grupo y 'below' = delante. Para audio y texto el
 * orden de pantalla es el del array, así que se invierte la correspondencia.
 */
export function newTrackIndex(tracks, kind, side) {
  const list = tracks || []
  const idx = list.map((t, i) => (t.kind === kind ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return list.length
  const first = idx[0]
  const last = idx[idx.length - 1]
  const toEnd = kind === 'video' ? side !== 'below' : side === 'below'
  return toEnd ? last + 1 : first
}

/** Pista de vídeo/audio inmediatamente superior a `trackId`, si la hay. */
export function trackAbove(tracks, trackId) {
  const t = (tracks || []).find((x) => x.id === trackId)
  if (!t) return null
  const same = (tracks || []).filter((x) => x.kind === t.kind)
  const i = same.findIndex((x) => x.id === trackId)
  return i >= 0 && i < same.length - 1 ? same[i + 1] : null
}

/**
 * A dónde va un 'newTrack': si la pista de encima tiene el hueco libre se
 * reutiliza (no llenamos el timeline de pistas), y si no, hay que crear una.
 */
export function resolveNewTrack(clips, tracks, trackId, start, dur) {
  const up = trackAbove(tracks, trackId)
  if (up && !up.locked && !clipCollidingWith(clips, up.id, start, dur)) {
    return { trackId: up.id, create: false }
  }
  return { trackId: null, create: true }
}
