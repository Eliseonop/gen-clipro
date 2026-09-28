// Dónde cae un clip en la timeline: material soltado desde el panel o un clip
// que se mueve. Una sola regla para los dos, como CapCut:
//
//   ┌──────────────────────────────┐ ← raya entre pistas (BOUNDARY_PX): pista nueva
//   │  cuerpo de la pista          │ ← aquí dentro: ESTA pista, sin más
//   └──────────────────────────────┘ ← raya entre pistas: pista nueva
//
//   - Hueco libre: cae donde está el fantasma (y se pega al vecino si lo roza).
//   - Ocupado: se pega al hueco más cercano solo si está a ≤ STICK_PX en
//     pantalla. Si no, sube a la pista libre de encima (o a una nueva) en el
//     MISMO instante. Nunca se manda lejos ni al final de la pista.
//   - Alt: reemplaza el clip que hay bajo el puntero.
//   - Pista magnética: se inserta en el corte más cercano (magnetic.js).
//
// Solo decide; no toca estado. Quien llama aplica el resultado.

import { clipEnd, clampStartNoOverlap } from './editorModel.js'
import { magneticCut } from './magnetic.js'
import { displayTracks, isStackTrack } from './trackStack.js'

/** Banda a cada lado de la raya entre dos pistas que pide pista nueva (px). */
export const BOUNDARY_PX = 6
/** Distancia máxima en pantalla a la que un clip se deja pegar al hueco libre. */
export const STICK_PX = 48

const r3 = (v) => +(Math.max(0, Number(v) || 0)).toFixed(3)
const toSet = (ids) => (ids instanceof Set ? ids : new Set(ids || []))

/** Clip de la pista que cubre `t` (el último del array = el de encima). */
export function clipAtTime(clips, trackId, t, excludeIds) {
  const skip = toSet(excludeIds)
  let hit = null
  for (const c of clips || []) {
    if (c.track_id !== trackId || skip.has(c.id)) continue
    if (t >= c.start && t < clipEnd(c)) hit = c
  }
  return hit
}

/** Clip de la pista que se solaparía con [start, start+dur).
 *  `excludeIds` deja fuera al clip que se está arrastrando (si no, choca consigo mismo). */
export function clipCollidingWith(clips, trackId, start, dur, excludeIds) {
  const end = start + Math.max(0, dur || 0)
  const skip = toSet(excludeIds)
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
 * Zona de la timeline bajo el puntero para un clip de `kind`.
 *
 * `geo` es la geometría real de las filas en pantalla: `[{ id, top, bottom }]`
 * en px del contenido, en el orden en que se ven. `y` va en esas mismas px.
 *
 * Devuelve `{ trackId }` (entra en esa pista) o `{ slot, lineY }` (pista nueva
 * en ese hueco; `lineY` = dónde se dibuja la raya). Pista nueva cuando:
 *   - el puntero está en la raya entre dos pistas (±BOUNDARY_PX),
 *   - fuera de las pistas de su bloque (encima, debajo o sobre el otro bloque),
 *   - sobre una pista de su bloque pero de otro tipo o bloqueada (por mitades).
 *
 * `originAlone`: el clip que se mueve es el único de su pista (`originId`); una
 * pista nueva pegada a ella no cambiaría nada, así que se queda en la suya.
 */
export function zoneAt(tracks, geo, kind, y, { boundaryPx = BOUNDARY_PX, originId = null, originAlone = false } = {}) {
  const byId = new Map((tracks || []).map((t) => [t.id, t]))
  const rows = (geo || []).map((g) => ({ ...g, track: byId.get(g.id) })).filter((r) => r.track)
  const stack = kind === 'video' || kind === 'text'
  const group = rows.filter((r) => isStackTrack(r.track) === stack)
  if (!group.length) {
    // Primera pista de su bloque: la pila arriba del todo, el audio al final.
    const lineY = stack ? (rows[0]?.top ?? 0) : (rows[rows.length - 1]?.bottom ?? 0)
    return { slot: { targetId: null, place: stack ? 'above' : 'below' }, lineY }
  }
  const slot = (r, place) => ({ slot: { targetId: r.id, place }, lineY: place === 'above' ? r.top : r.bottom })
  const first = group[0]
  const last = group[group.length - 1]
  const Y = Number(y) || 0
  const row = group.find((r) => Y >= r.top && Y < r.bottom)

  let zone
  if (!row) {
    // Fuera de su bloque: el borde más cercano (el audio va debajo de la pila).
    zone = Y < first.top ? slot(first, 'above') : slot(last, 'below')
  } else {
    const h = row.bottom - row.top
    const band = Math.min(boundaryPx, h / 4)
    if (Y < row.top + band) zone = slot(row, 'above')
    else if (Y >= row.bottom - band) zone = slot(row, 'below')
    else if (row.track.kind === kind && !row.track.locked) zone = { trackId: row.id }
    else zone = slot(row, Y < row.top + h / 2 ? 'above' : 'below')
  }

  if (zone.slot && originAlone && originId) {
    const b = rows.findIndex((r) => r.id === zone.slot.targetId) + (zone.slot.place === 'below' ? 1 : 0)
    const o = rows.findIndex((r) => r.id === originId)
    if (o >= 0 && (b === o || b === o + 1)) return { trackId: originId }
  }
  return zone
}

/** Inicio pegado al vecino de la misma pista si el hueco que queda es menor que `snapSec`. */
function stickToNeighbors(clips, trackId, start, span, excludeIds, snapSec) {
  if (!(snapSec > 0)) return start
  const skip = toSet(excludeIds)
  let prevEnd = -Infinity
  let nextStart = Infinity
  for (const c of clips || []) {
    if (c.track_id !== trackId || skip.has(c.id)) continue
    const ce = clipEnd(c)
    if (ce <= start + 1e-9) prevEnd = Math.max(prevEnd, ce)
    else if (c.start >= start + span - 1e-9) nextStart = Math.min(nextStart, c.start)
  }
  if (start - prevEnd <= snapSec) return prevEnd
  if (nextStart - (start + span) <= snapSec && nextStart - span >= Math.max(0, prevEnd)) return nextStart - span
  return start
}

/**
 * Inicio en la pista `trackId` para un clip de `dur` s que se quiere en `desired`.
 * Libre: ahí (pegado al vecino si queda a menos de `snapSec`). Ocupado: el hueco
 * más cercano que lo admita, solo si está a ≤ `stickSec`. Si no, null: no cabe
 * cerca y quien llama lo sube de pista (liftTarget).
 */
export function placeOnTrack(clips, trackId, desired, dur, { excludeIds, stickSec = 0, snapSec = 0 } = {}) {
  const span = Math.max(0.001, Number(dur) || 0)
  const want = r3(desired)
  if (!clipCollidingWith(clips, trackId, want, span, excludeIds)) {
    return { start: r3(stickToNeighbors(clips, trackId, want, span, excludeIds, snapSec)) }
  }
  const cand = clampStartNoOverlap(clips, trackId, want, span, { excludeIds })
  if (Math.abs(cand - want) <= stickSec + 1e-9) return { start: r3(cand) }
  return null
}

/**
 * Pista a la que sube un clip que no cabe en `fromId` en [start, start+dur):
 * la vecina de su tipo (encima en la pila, debajo en el audio) si está libre
 * ahí, visible y sin bloquear; si no, una pista nueva pegada a `fromId`.
 * Devuelve `{ trackId }` o `{ slot }`.
 */
export function liftTarget(tracks, clips, fromId, start, dur, excludeIds) {
  const rows = displayTracks(tracks)
  const i = rows.findIndex((t) => t.id === fromId)
  const from = rows[i]
  if (!from) return null
  // La pila crece hacia arriba (delante del vídeo); el audio, hacia abajo.
  const up = isStackTrack(from)
  const next = rows[i + (up ? -1 : 1)]
  if (next && next.kind === from.kind && !next.locked && !next.hidden
    && !clipCollidingWith(clips, next.id, start, dur, excludeIds)) {
    return { trackId: next.id }
  }
  return { slot: { targetId: fromId, place: up ? 'above' : 'below' } }
}

function lineYFor(geo, slot) {
  const g = (geo || []).find((r) => r.id === slot?.targetId)
  if (!g) return 0
  return slot.place === 'below' ? g.bottom : g.top
}

/**
 * Dónde cae un clip de `kind` y `dur` s arrastrado con el fantasma empezando en
 * `time` y el puntero a la altura `y` (px del contenido, ver zoneAt).
 *
 * Opciones: `pointerTime` (instante bajo el puntero: elige el clip a reemplazar
 * y el corte magnético), `excludeIds` (los clips que se mueven), `originId` y
 * `originAlone` (ver zoneAt), `replace` (Alt), `pps` (px/s: pasa STICK_PX a
 * segundos) y `snapSec` (imán con el vecino de la misma pista).
 *
 * Devuelve `{ trackId, start }` o `{ slot, lineY, start }`, más:
 *   - `replaceId`: sustituye ese clip (Alt),
 *   - `insert`: pista magnética, entra en ese corte y empuja lo de detrás,
 *   - `lifted`: no cabía donde se soltó y sube de pista.
 */
export function dropTarget({
  tracks, clips, geo, kind, y, time, dur,
  pointerTime, excludeIds, originId, originAlone, replace = false, pps = 60, snapSec = 0,
}) {
  const zone = zoneAt(tracks, geo, kind, y, { originId, originAlone })
  const start = r3(time)
  if (zone.slot) return { slot: zone.slot, lineY: zone.lineY, start }
  const track = (tracks || []).find((t) => t.id === zone.trackId)
  if (!track) return null
  const span = Math.max(0.001, Number(dur) || 0)
  const at = Number.isFinite(Number(pointerTime)) ? Number(pointerTime) : start
  if (replace) {
    const hit = clipAtTime(clips, track.id, at, excludeIds)
    if (hit) return { trackId: track.id, start: r3(hit.start), replaceId: hit.id }
  }
  if (track.magnetic) {
    return { trackId: track.id, start: magneticCut(clips, track.id, at, excludeIds).start, insert: true }
  }
  const stickSec = STICK_PX / Math.max(1, Number(pps) || 60)
  const placed = placeOnTrack(clips, track.id, start, span, { excludeIds, stickSec, snapSec })
  if (placed) return { trackId: track.id, start: placed.start }
  const lift = liftTarget(tracks, clips, track.id, start, span, excludeIds)
  if (lift?.trackId) return { trackId: lift.trackId, start, lifted: true }
  return { slot: lift.slot, lineY: lineYFor(geo, lift.slot), start, lifted: true }
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

/** Hueco entre filas de un slot tal como se ve: 0 = encima de la primera fila.
 *  Dos slots con el mismo hueco (debajo de A = encima de B) son la misma pista nueva. */
export function slotBoundary(tracks, slot) {
  const rows = displayTracks(tracks)
  const i = rows.findIndex((t) => t.id === slot?.targetId)
  if (i < 0) return -1
  return i + (slot.place === 'below' ? 1 : 0)
}

/** Índice del array `tracks` para una pista nueva en `slot` (ver zoneAt).
 *  La pila se ve invertida (la última del array, arriba); el audio, en orden. */
export function slotIndex(tracks, slot) {
  const list = tracks || []
  const i = list.findIndex((t) => t.id === slot?.targetId)
  if (i < 0) return list.length
  const onTop = isStackTrack(list[i]) ? slot.place === 'above' : slot.place === 'below'
  return onTop ? i + 1 : i
}
