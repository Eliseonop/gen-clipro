// Beats automáticos y marcadores (#12).
//
// - Beats: los detecta el backend (backend/app/beats.py) sobre el ARCHIVO de un
//   clip de audio o vídeo y se guardan en `clip.beats = { times, bpm, every }`
//   (segundos del archivo). Aquí se pasan a tiempo de timeline con la velocidad y
//   el recorte del clip, y `every` (1, 2 o 4) deja uno de cada N, contando desde el
//   primer beat del tema: así no cambian al recortar el clip.
// - Marcadores: `timeline.markers = [{ id, t, label?, color? }]` (s de timeline).
// Beats y marcadores son puntos de imán al mover o recortar clips.
import { sourceToTimeline, uid } from '../features/editor/editorModel.js'

export const BEAT_EVERY = [1, 2, 4]
export const MARKER_COLORS = ['#38bdf8', '#f59e0b', '#22c55e', '#f43f5e', '#a78bfa']

export function clipBeats(clip) {
  const b = clip?.beats
  if (!b || !Array.isArray(b.times) || !b.times.length) return null
  const every = BEAT_EVERY.includes(Number(b.every)) ? Number(b.every) : 1
  return { times: b.times.map(Number).filter(Number.isFinite), bpm: Number(b.bpm) || 0, every }
}

/** Beats visibles del clip, en segundos de TIMELINE (dentro de su recorte). */
export function clipBeatTimes(clip) {
  const b = clipBeats(clip)
  if (!b) return []
  const out = []
  b.times.forEach((src, i) => {
    if (i % b.every) return
    if (src < clip.in_point - 1e-6 || src > clip.out_point + 1e-6) return
    out.push(+sourceToTimeline(clip, src).toFixed(3))
  })
  return out.sort((a, c) => a - c)
}

export function normalizeMarkers(list) {
  return (Array.isArray(list) ? list : [])
    .map((m) => ({
      id: String(m?.id || uid('m')),
      t: +Math.max(0, Number(m?.t) || 0).toFixed(3),
      ...(m?.label ? { label: String(m.label).slice(0, 60) } : {}),
      ...(m?.color ? { color: String(m.color) } : {}),
    }))
    .sort((a, b) => a.t - b.t)
}

/** Añade un marcador en `t`, o lo quita si ya hay uno a menos de un fotograma. */
export function toggleMarkerAt(markers, t, fps = 30) {
  const list = normalizeMarkers(markers)
  const tol = 0.5 / (Number(fps) || 30) + 1e-6
  const hit = list.find((m) => Math.abs(m.t - t) <= tol)
  if (hit) return list.filter((m) => m.id !== hit.id)
  return normalizeMarkers([...list, { id: uid('m'), t }])
}

/**
 * Puntos de imán para la timeline (formato de timelineAlign: pseudo-clips de
 * duración cero en una pista propia, así valen para cualquier pista). Los beats de
 * los clips que se están moviendo no cuentan (se moverían con ellos).
 */
export function snapTargets(markers, clips, excludeIds) {
  const skip = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])
  const out = []
  for (const m of normalizeMarkers(markers)) out.push({ id: `mk:${m.id}`, trackId: '__markers__', start: m.t, end: m.t })
  for (const c of clips || []) {
    if (skip.has(c.id) || c.disabled) continue
    for (const t of clipBeatTimes(c)) out.push({ id: `bt:${c.id}:${t}`, trackId: '__beats__', start: t, end: t })
  }
  return out
}

/** Siguiente / anterior marcador o beat desde `t` (para saltar con el teclado). */
export function nextSnapTime(markers, clips, t, dir = 1) {
  const times = snapTargets(markers, clips).map((p) => p.start)
  const eps = 1e-3
  const cand = dir > 0 ? times.filter((x) => x > t + eps) : times.filter((x) => x < t - eps)
  if (!cand.length) return null
  return dir > 0 ? Math.min(...cand) : Math.max(...cand)
}
