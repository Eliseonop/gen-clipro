import { clipEnd } from './editorModel.js'

export function clipsOverlap(a, b) {
  if (!a || !b || a.id === b.id) return false
  if (a.track_id !== b.track_id) return false
  const ae = clipEnd(a)
  const be = clipEnd(b)
  if (ae <= a.start || be <= b.start) return false
  return a.start < be && b.start < ae
}

/** `outer` cubre todo el intervalo de `inner` (misma pista). Incluye rangos iguales. */
export function fullyCovers(outer, inner) {
  if (!outer || !inner || outer.id === inner.id) return false
  if (outer.track_id !== inner.track_id) return false
  const oe = clipEnd(outer)
  const ie = clipEnd(inner)
  if (oe <= outer.start || ie <= inner.start) return false
  return outer.start <= inner.start && ie <= oe
}

export const COVER_RATIO = 0.8

function clipWidth(c) {
  return clipEnd(c) - c.start
}

function overlapDur(a, b) {
  const start = Math.max(a.start, b.start)
  const end = Math.min(clipEnd(a), clipEnd(b))
  return Math.max(0, end - start)
}

/** El de encima cubre ≥80% del de debajo (rangos iguales incluidos). */
export function coversMost(cover, hidden) {
  if (!cover || !hidden || cover.id === hidden.id) return false
  if (cover.track_id !== hidden.track_id) return false
  const hw = clipWidth(hidden)
  if (hw <= 0) return false
  return overlapDur(cover, hidden) >= hw * COVER_RATIO
}

/** `cover` está encima (más tarde en el array), no es más estrecho, y tapa ≥80% de `hidden`. */
export function hidesUnder(cover, hidden, clips) {
  if (!cover || !hidden) return false
  if (clipWidth(cover) < clipWidth(hidden)) return false
  if (!coversMost(cover, hidden)) return false
  let last = null
  for (const c of clips || []) {
    if (c.id === cover.id || c.id === hidden.id) last = c.id
  }
  return last === cover.id
}

function clusterKey(ids) {
  return [...ids].sort().join('|')
}

export function overlapClusters(clips, trackId) {
  const row = (clips || []).filter((c) => c.track_id === trackId)
  const n = row.length
  const parent = row.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const unite = (i, j) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[ri] = rj
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hidesUnder(row[i], row[j], clips) || hidesUnder(row[j], row[i], clips)) unite(i, j)
    }
  }
  const buckets = new Map()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!buckets.has(r)) buckets.set(r, [])
    buckets.get(r).push(row[i].id)
  }
  const groups = []
  for (const clipIds of buckets.values()) {
    if (clipIds.length < 2) continue
    groups.push({ id: clusterKey(clipIds), clipIds })
  }
  groups.sort((ga, gb) => {
    const minStart = (ids) => Math.min(...ids.map((id) => row.find((c) => c.id === id).start))
    return minStart(ga.clipIds) - minStart(gb.clipIds)
  })
  return groups
}

export function frontClipId(clusterClipIds, clips) {
  const inCluster = new Set(clusterClipIds || [])
  if (!inCluster.size) return null
  const members = (clips || []).filter((c) => inCluster.has(c.id))
  let lastCover = null
  for (const c of clips || []) {
    if (!inCluster.has(c.id)) continue
    if (members.some((other) => hidesUnder(c, other, clips))) lastCover = c.id
  }
  return lastCover
}

export function peekClipIds(clusterClipIds, clips, frontId) {
  const inCluster = new Set(clusterClipIds || [])
  const hidden = []
  for (const c of clips || []) {
    if (!inCluster.has(c.id) || c.id === frontId) continue
    hidden.push(c.id)
  }
  return hidden.slice(-2)
}

export function packClusterLanes(clips) {
  const list = [...(clips || [])].sort((a, b) => (a.start - b.start) || String(a.id).localeCompare(String(b.id)))
  const laneEnds = []
  const out = new Map()
  for (const c of list) {
    const end = clipEnd(c)
    let placed = false
    for (let i = 0; i < laneEnds.length; i++) {
      if (c.start >= laneEnds[i]) {
        laneEnds[i] = end
        out.set(c.id, i)
        placed = true
        break
      }
    }
    if (!placed) {
      out.set(c.id, laneEnds.length)
      laneEnds.push(end)
    }
  }
  return out
}

export function resolveExpandedClusterId(prevId, clusters) {
  if (!prevId) return null
  const list = clusters || []
  if (list.some((c) => c.id === prevId)) return prevId
  const prevIds = prevId.split('|').filter(Boolean)
  const prevSet = new Set(prevIds)
  const grew = list.find((c) => prevIds.every((id) => c.clipIds.includes(id)))
  if (grew) return grew.id
  const shrunk = list.find((c) => {
    let n = 0
    for (const id of c.clipIds) if (prevSet.has(id)) n += 1
    return n >= 2
  })
  return shrunk ? shrunk.id : null
}

export const STACK_PAD = 5
export const STACK_STEP = 14
export const PEEK_GUTTER = 12
export const PEEK_BAND_H = 8
export const PEEK_LIFT = 4
export const SUB_ROW_GAP = 3
export const PEEK_SPINE = 2

export function subRowHeight(rowH) {
  return Math.max(28, rowH - 6)
}

export function trackLaneHeight(rowH, extraSteps) {
  return (rowH || 0) + (extraSteps > 0 ? STACK_STEP : 0)
}

export function clusterSpan(clipIds, clips) {
  const want = new Set(clipIds || [])
  let start = Infinity
  let end = -Infinity
  for (const c of clips || []) {
    if (!want.has(c.id)) continue
    start = Math.min(start, c.start)
    end = Math.max(end, clipEnd(c))
  }
  if (!Number.isFinite(start)) return { start: 0, end: 0 }
  return { start, end }
}

export function stackViewForTrack(clips, trackId, _selectedIds, _expandedClusterId, rowH) {
  const list = clips || []
  const clusters = overlapClusters(list, trackId)
  const clusterOf = new Map()
  for (const cl of clusters) {
    for (const id of cl.clipIds) clusterOf.set(id, cl)
  }
  const extraSteps = clusters.length ? 1 : 0
  const height = trackLaneHeight(rowH, extraSteps)
  const clipH = rowH - 2 * STACK_PAD
  const layouts = new Map()
  for (const c of list) {
    if (c.track_id !== trackId) continue
    const cl = clusterOf.get(c.id)
    if (!cl) {
      layouts.set(c.id, { variant: 'solo', top: STACK_PAD, height: clipH, clusterId: null, z: 1 })
      continue
    }
    const front = frontClipId(cl.clipIds, list)
    if (c.id === front) {
      layouts.set(c.id, { variant: 'front', top: STACK_PAD, height: clipH, clusterId: cl.id, z: 4 })
    } else {
      layouts.set(c.id, { variant: 'step', top: STACK_PAD + STACK_STEP, height: clipH, clusterId: cl.id, z: 1 })
    }
  }
  return {
    height,
    liveExpandedId: null,
    layouts,
    clusters,
    toggle: null,
  }
}
