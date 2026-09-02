// Guías de alineación en la timeline: inicios/finales de clips en pistas distintas.
import { clipEnd, trimClipPatch } from './editorModel.js'

export const ALIGN_SNAP_PX = 8

export function alignThresholdSec(pps, px = ALIGN_SNAP_PX) {
  const p = Number(pps)
  if (!Number.isFinite(p) || p <= 0) return 0.12
  return px / p
}

export function asAlignClip(clip) {
  const start = Number(clip?.start) || 0
  return {
    id: clip?.id,
    trackId: clip?.track_id,
    start,
    end: clipEnd(clip),
  }
}

export function alignOthers(clips, excludeIds) {
  const skip = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])
  return (clips || []).filter((c) => !skip.has(c?.id)).map(asAlignClip)
}

function movingEdges(clip, which) {
  if (which === 'start') return [clip.start]
  if (which === 'end') return [clip.end]
  return [clip.start, clip.end]
}

function uniqueTimes(times) {
  const sorted = [...new Set((times || []).map((t) => +Number(t).toFixed(3)).filter(Number.isFinite))].sort((a, b) => a - b)
  const out = []
  for (const t of sorted) {
    if (!out.length || t - out[out.length - 1] > 0.008) out.push(t)
  }
  return out
}

/** Tiempos donde un borde del clip en movimiento coincide con un borde de otra pista. */
export function timelineAlignHits(moving, others, threshold, which = 'both') {
  const thresh = Number(threshold)
  if (!Number.isFinite(thresh) || thresh < 0) return []
  const times = []
  for (const m of moving || []) {
    if (!m) continue
    for (const o of others || []) {
      if (!o || o.trackId === m.trackId) continue
      if (o.id != null && m.id != null && o.id === m.id) continue
      for (const me of movingEdges(m, which)) {
        if (!Number.isFinite(me)) continue
        for (const oe of [o.start, o.end]) {
          if (!Number.isFinite(oe)) continue
          if (Math.abs(me - oe) <= thresh + 1e-9) times.push(oe)
        }
      }
    }
  }
  return uniqueTimes(times)
}

export function nearestAlignTime(time, trackId, others, threshold) {
  const t = Number(time)
  const thresh = Number(threshold)
  if (!Number.isFinite(t) || !Number.isFinite(thresh) || thresh < 0) return null
  let best = null
  let bestD = thresh
  for (const o of others || []) {
    if (!o || o.trackId === trackId) continue
    for (const oe of [o.start, o.end]) {
      if (!Number.isFinite(oe)) continue
      const d = Math.abs(t - oe)
      if (d <= bestD + 1e-9) {
        bestD = d
        best = oe
      }
    }
  }
  return best
}

/** Delta extra (segundos) para anclar el grupo/clip al borde más cercano de otra pista. */
export function snapGroupDelta(moving, others, threshold) {
  const thresh = Number(threshold)
  if (!Number.isFinite(thresh) || thresh < 0) return { delta: 0, times: [] }
  let bestAbs = thresh
  let bestDelta = null
  for (const m of moving || []) {
    if (!m) continue
    for (const o of others || []) {
      if (!o || o.trackId === m.trackId) continue
      if (o.id != null && m.id != null && o.id === m.id) continue
      for (const me of [m.start, m.end]) {
        if (!Number.isFinite(me)) continue
        for (const oe of [o.start, o.end]) {
          if (!Number.isFinite(oe)) continue
          const delta = oe - me
          const a = Math.abs(delta)
          if (a <= bestAbs + 1e-9 && (bestDelta == null || a < bestAbs - 1e-9)) {
            bestAbs = a
            bestDelta = delta
          }
        }
      }
    }
  }
  if (bestDelta == null) return { delta: 0, times: [] }
  const moved = (moving || []).map((m) => ({
    ...m,
    start: m.start + bestDelta,
    end: m.end + bestDelta,
  }))
  return { delta: bestDelta, times: timelineAlignHits(moved, others, thresh) }
}

export function snapClipMove(orig, deltaT, others, threshold, trackId) {
  const dur = Math.max(0, clipEnd(orig) - (Number(orig?.start) || 0))
  const ns = Math.max(0, (Number(orig?.start) || 0) + (Number(deltaT) || 0))
  const tid = trackId || orig?.track_id
  const proposed = { id: orig?.id, trackId: tid, start: ns, end: ns + dur }
  const snap = snapGroupDelta([proposed], others, threshold)
  const start = Math.max(0, ns + snap.delta)
  const final = { ...proposed, start, end: start + dur }
  return { start: +start.toFixed(3), times: timelineAlignHits([final], others, threshold) }
}

export function snapClipTrim(orig, mode, deltaT, others, threshold) {
  const base = trimClipPatch(orig, mode, deltaT)
  if (!base) return { patch: null, times: [], deltaT }
  const which = mode === 'trim-left' ? 'start' : 'end'
  const next = asAlignClip({ ...orig, ...base })
  const edge = which === 'start' ? next.start : next.end
  const hit = nearestAlignTime(edge, next.trackId, others, threshold)
  let patch = base
  let used = Number(deltaT) || 0
  if (hit != null) {
    const extra = hit - edge
    const snapped = trimClipPatch(orig, mode, used + extra)
    if (snapped) {
      patch = snapped
      used += extra
    }
  }
  const aligned = asAlignClip({ ...orig, ...patch })
  return { patch, times: timelineAlignHits([aligned], others, threshold, which), deltaT: used }
}

export function snapClipGroup(origs, deltaT, others, threshold) {
  if (!origs?.length) return { deltaT: 0, times: [] }
  const minStart = Math.min(...origs.map((o) => o.start ?? 0))
  const raw = Math.max(-minStart, Number(deltaT) || 0)
  const proposed = origs.map((o) => asAlignClip({ ...o, start: o.start + raw }))
  const snap = snapGroupDelta(proposed, others, threshold)
  const d = Math.max(-minStart, raw + snap.delta)
  const final = origs.map((o) => asAlignClip({ ...o, start: o.start + d }))
  return { deltaT: d, times: timelineAlignHits(final, others, threshold) }
}
