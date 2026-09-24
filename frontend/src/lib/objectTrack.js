// Seguimiento de objetos (#15, «Tracking» de CapCut): del recorrido de un objeto
// en un vídeo (backend/app/object_track.py: tiempo de ARCHIVO, 0–1 de la fuente,
// escala y giro relativos) a keyframes de pose de otro clip para que lo acompañe
// en pantalla. Espejo de follow_keys en object_track.py.

import { sourcePointToOutput } from './clipLayout.js'
import { clipPose } from './clipAnim.js'
import { upsertKeyframeAt } from './clipKeyframes.js'
import { clipDur, clipSpeed } from '../features/editor/editorModel.js'

export const FOLLOW_MODES = [
  { id: 'position', label: 'Posición' },
  { id: 'position_scale', label: 'Posición y escala' },
  { id: 'position_scale_rotation', label: 'Posición, escala y giro' },
]
const MODE_IDS = new Set(FOLLOW_MODES.map((m) => m.id))
const KF_SNAP = 0.06   // = clip_keyframes.KF_SNAP

const r = (v, n) => +Number(v).toFixed(n)

/** Tiempo de timeline de un punto del recorrido (tiempo de archivo) en ese vídeo. */
function tlTime(video, p) {
  const rel = video.reverse ? video.out_point - p.t : p.t - video.in_point
  return video.start + rel / clipSpeed(video)
}

/** Centro del objeto y extremo de su eje horizontal, en px de salida. */
function objScreen(video, p, w0, dims) {
  const { srcW, srcH, outW, outH } = dims
  const local = (video.reverse ? video.out_point - p.t : p.t - video.in_point) / clipSpeed(video)
  const a = ((p.rot || 0) * Math.PI) / 180
  const rad = (w0 / 2) * (p.s ?? 1)
  const ex = p.cx + (rad * Math.cos(a)) / srcW
  const ey = p.cy + (rad * Math.sin(a)) / srcH
  const c = sourcePointToOutput(video, p.cx, p.cy, srcW, srcH, outW, outH, outW / outH, p.t, local)
  const e = sourcePointToOutput(video, ex, ey, srcW, srcH, outW, outH, outW / outH, p.t, local)
  return [[c.x * outW, c.y * outH], [e.x * outW, e.y * outH]]
}

/**
 * Keyframes ({t local del seguidor, x, y[, scale][, rotation]}) para que `follower`
 * acompañe al objeto: en `anchorT` (s de timeline, cuando se marcó) conserva su pose
 * y después se mueve, escala y gira lo mismo que el objeto en pantalla.
 * `dims` = {srcW, srcH, outW, outH}; `boxW` = ancho del recuadro en 0–1 de la fuente.
 */
export function followObjectKeys(video, follower, track, dims, boxW, anchorT, mode = 'position_scale', minGap = 0.1) {
  const m = MODE_IDS.has(mode) ? mode : 'position_scale'
  const pts = (track || [])
    .filter((p) => p.t >= video.in_point - 1e-6 && p.t <= video.out_point + 1e-6)
    .sort((a, b) => a.t - b.t)
  if (!pts.length) return []
  const w0 = boxW * dims.srcW
  const ref = pts.reduce((best, p) => (Math.abs(tlTime(video, p) - anchorT) < Math.abs(tlTime(video, best) - anchorT) ? p : best), pts[0])
  const [c0, e0] = objScreen(video, ref, w0, dims)
  const len0 = Math.hypot(e0[0] - c0[0], e0[1] - c0[1]) || 1
  const ang0 = Math.atan2(e0[1] - c0[1], e0[0] - c0[0])
  const base = clipPose(follower, Math.max(0, anchorT - follower.start))
  const fDur = clipDur(follower)
  const out = []
  for (const p of [...pts].sort((a, b) => tlTime(video, a) - tlTime(video, b))) {
    const lt = tlTime(video, p) - follower.start
    if (lt < -1e-6 || lt > fDur + 1e-6) continue
    if (out.length && lt - out[out.length - 1].t < minGap - 1e-9) continue
    const [c, e] = objScreen(video, p, w0, dims)
    const k = {
      t: r(Math.max(0, lt), 4),
      x: r(base.x + (c[0] - c0[0]) / dims.outW, 5),
      y: r(base.y + (c[1] - c0[1]) / dims.outH, 5),
    }
    const vx = e[0] - c[0]
    const vy = e[1] - c[1]
    if (m !== 'position') k.scale = r(base.scale * (Math.hypot(vx, vy) / len0), 5)
    if (m === 'position_scale_rotation') {
      const d = ((Math.atan2(vy, vx) - ang0) * 180) / Math.PI
      k.rotation = r(base.rotation + ((((d + 180) % 360) + 360) % 360) - 180, 3)
    }
    out.push(k)
  }
  return out
}

/** Escribe los keyframes del seguimiento (lineales) y quita los que había en ese tramo. */
export function applyFollowKeys(clip, keys, fps) {
  if (!keys?.length) return clip
  const lo = keys[0].t - KF_SNAP
  const hi = keys[keys.length - 1].t + KF_SNAP
  let next = clip
  if (clip.keyframes?.enabled) {
    next = { ...clip, keyframes: { ...clip.keyframes, items: (clip.keyframes.items || []).filter((k) => !(k.t >= lo && k.t <= hi)) } }
  }
  for (const k of keys) {
    const patch = { x: k.x, y: k.y }
    if (k.scale != null) patch.scale = k.scale
    if (k.rotation != null) patch.rotation = k.rotation
    next = upsertKeyframeAt(next, k.t, patch, 'linear', fps)
  }
  return next
}
