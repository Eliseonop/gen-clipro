// Una pista NUNCA tiene dos clips en el mismo instante.
//
// Arrastrar y soltar ya colocan sin montar (dropIntent.js), pero hay muchas
// otras vías que ponen o alargan clips: pegar, «+», texto nuevo, velocidad,
// igualar duración… En vez de repetir la regla en cada una, el editor pasa
// cada cambio de clips por `settleClips`, que resuelve lo que se haya montado:
//
//   - un clip que CRECE por la derecha (velocidad, duración) empuja a los de
//     detrás en su pista, como un recorte con arrastre;
//   - un clip nuevo o movido que cae encima de otro sube a la pista libre de
//     al lado o a una nueva (liftTarget), en el mismo instante;
//   - las pistas magnéticas se vuelven a empaquetar (magnetic.js).
//
// Los proyectos viejos pueden traer clips solapados («pilas»): no se tocan
// hasta que el usuario pulsa «Separar solapes» (separateOverlaps).

import { clipDur, clipEnd } from './editorModel.js'
import { liftTarget, slotIndex } from './dropIntent.js'
import { packMagnetic } from './magnetic.js'
import { insertTrack } from './trackStack.js'

/** Solape mínimo que cuenta (s): los redondeos de duración no mueven nada. */
export const SETTLE_EPS = 0.05

const r3 = (v) => +(Number(v) || 0).toFixed(3)
const same = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 1e-6

function overlapOf(a, b) {
  return Math.min(clipEnd(a), clipEnd(b)) - Math.max(a.start, b.start)
}

/** Clips de la misma pista que se solapan con `c` más de `eps` s. */
function collidersOf(clips, c, eps) {
  return (clips || []).filter((x) => x.id !== c.id && x.track_id === c.track_id
    && clipEnd(x) > x.start && overlapOf(c, x) > eps)
}

/** Pares de clips solapados (más de `eps` s) en todas las pistas. */
export function overlapPairs(clips, eps = SETTLE_EPS) {
  const byTrack = new Map()
  for (const c of clips || []) {
    if (!byTrack.has(c.track_id)) byTrack.set(c.track_id, [])
    byTrack.get(c.track_id).push(c)
  }
  const pairs = []
  // Barrido por inicio: cada clip solo se compara con los que empiezan antes de
  // que él acabe (una pista de subtítulos tiene cientos y esto corre en cada cambio).
  for (const row of byTrack.values()) {
    row.sort((a, b) => a.start - b.start)
    for (let i = 0; i < row.length; i++) {
      const end = clipEnd(row[i])
      for (let j = i + 1; j < row.length && row[j].start < end - eps; j++) {
        if (overlapOf(row[i], row[j]) > eps) pairs.push([row[i].id, row[j].id])
      }
    }
  }
  return pairs
}

/** Clips cuyo hueco en la timeline cambió (o que no existían) entre `prev` y `next`. */
export function touchedClipIds(prev, next) {
  const before = new Map((prev || []).map((c) => [c.id, c]))
  const out = new Set()
  for (const c of next || []) {
    const b = before.get(c.id)
    if (!b || b.track_id !== c.track_id || !same(b.start, c.start) || !same(clipEnd(b), clipEnd(c))) out.add(c.id)
  }
  return out
}

/** Sube `clip` a la pista vecina libre o a una nueva (creada con `makeTrack`). */
function lift(clips, tracks, clip, makeTrack) {
  const to = liftTarget(tracks, clips, clip.track_id, clip.start, clipDur(clip), [clip.id])
  if (!to) return null
  if (to.trackId) return { trackId: to.trackId, tracks }
  const src = tracks.find((t) => t.id === clip.track_id)
  if (!src || !makeTrack) return null
  // Un texto conserva el aspecto: la pista nueva copia el estilo de la suya.
  const nt = makeTrack(src.kind, src.kind === 'text' ? src.style : undefined, tracks)
  return { trackId: nt.id, tracks: insertTrack(tracks, nt, slotIndex(tracks, to.slot)) }
}

/**
 * Resuelve los solapes que ha creado el paso `prev` → `next`.
 *
 * Solo mira los clips TOCADOS (nuevos, movidos o con otra duración): un solape
 * que ya estaba antes se queda como estaba. `makeTrack(kind, style, tracks)`
 * crea la pista nueva cuando hace falta (id y nombre los pone el editor).
 *
 * Devuelve `{ clips, tracks, changed }`; si nada cambia, los mismos arrays.
 */
export function settleClips(prev, next, tracks, { makeTrack, eps = SETTLE_EPS } = {}) {
  const before = new Map((prev || []).map((c) => [c.id, c]))
  const touched = touchedClipIds(prev, next)
  let clips = next || []
  let outTracks = tracks || []
  const magnetic = new Set(outTracks.filter((t) => t.magnetic).map((t) => t.id))

  // Pistas magnéticas: siempre empaquetadas (también tras borrar: cierra el hueco).
  for (const id of magnetic) clips = packMagnetic(clips, id, touched)

  const order = clips
    .filter((c) => touched.has(c.id) && !magnetic.has(c.track_id))
    .sort((a, b) => a.start - b.start)
  for (const t of order) {
    const c = clips.find((x) => x.id === t.id)
    if (!c) continue
    const hits = collidersOf(clips, c, eps)
    if (!hits.length) continue
    const b = before.get(c.id)
    // Creció por la derecha y solo pisa a los de detrás: se empujan.
    const grew = b && b.track_id === c.track_id && same(b.start, c.start) && clipEnd(c) > clipEnd(b)
    if (grew && hits.every((h) => h.start >= clipEnd(b) - eps)) {
      const shift = clipEnd(c) - Math.min(...hits.map((h) => h.start))
      const from = clipEnd(b) - eps
      clips = clips.map((x) => (x.track_id === c.track_id && x.id !== c.id && x.start >= from
        ? { ...x, start: r3(x.start + shift) }
        : x))
      continue
    }
    const moved = lift(clips, outTracks, c, makeTrack)
    if (!moved) continue
    outTracks = moved.tracks
    clips = clips.map((x) => (x.id === c.id ? { ...x, track_id: moved.trackId } : x))
  }
  const changed = clips !== next || outTracks !== tracks
  return { clips: changed ? clips : next, tracks: outTracks, changed }
}

/**
 * «Separar solapes» de un proyecto viejo: en cada pista, el clip que queda
 * DELANTE (más tarde en el array) sube a la pista de delante, así la imagen
 * no cambia. Las pistas magnéticas se empaquetan.
 */
export function separateOverlaps(clips, tracks, { makeTrack, eps = SETTLE_EPS } = {}) {
  let out = clips || []
  let outTracks = tracks || []
  let moved = 0
  for (const t of tracks || []) {
    if (t.magnetic) {
      const packed = packMagnetic(out, t.id)
      if (packed !== out) { out = packed; moved++ }
      continue
    }
    const kept = []
    for (const c of out.filter((x) => x.track_id === t.id)) {
      if (!kept.some((k) => overlapOf(k, c) > eps)) { kept.push(c); continue }
      const to = lift(out, outTracks, c, makeTrack)
      if (!to) { kept.push(c); continue }
      outTracks = to.tracks
      out = out.map((x) => (x.id === c.id ? { ...x, track_id: to.trackId } : x))
      moved++
    }
  }
  return { clips: out, tracks: outTracks, moved }
}

/**
 * Desplazamiento `delta` de un grupo de clips acotado para que ninguno se monte
 * sobre los que NO se mueven en su pista: el grupo se para contra el primer
 * vecino, igual que un clip suelto. `origs` = posiciones al empezar el arrastre.
 * Un clip que ya estaba solapado (proyecto viejo) no frena al grupo, y los de
 * pistas magnéticas tampoco (su pista se vuelve a empaquetar sola).
 */
export function clampGroupDelta(clips, origs, delta, tracks) {
  if (!origs?.length) return 0
  const ids = new Set(origs.map((o) => o.id))
  const magnetic = new Set((tracks || []).filter((t) => t.magnetic).map((t) => t.id))
  let lo = -Math.min(...origs.map((o) => Math.max(0, o.start || 0)))
  let hi = Infinity
  for (const o of origs) {
    if (magnetic.has(o.track_id)) continue
    const s = o.start || 0
    const e = clipEnd(o)
    let left = 0
    let right = Infinity
    let clash = false
    for (const c of clips || []) {
      if (ids.has(c.id) || c.track_id !== o.track_id) continue
      const ce = clipEnd(c)
      if (ce <= s + 1e-6) left = Math.max(left, ce)
      else if (c.start >= e - 1e-6) right = Math.min(right, c.start)
      else clash = true
    }
    if (clash) continue
    lo = Math.max(lo, left - s)
    hi = Math.min(hi, right - e)
  }
  const d = Number(delta) || 0
  if (lo > hi) return 0
  return Math.min(hi, Math.max(lo, d))
}
