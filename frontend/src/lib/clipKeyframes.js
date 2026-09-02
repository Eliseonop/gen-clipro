// Keyframes de clip: snapshots de propiedades animables + interpolación.
// `t` es tiempo LOCAL del clip (0 = inicio de la barra).

import { frameAt } from './panning.js'

export const KF_SNAP = 0.06
export const KF_INTERPS = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Ease In' },
  { id: 'ease-out', label: 'Ease Out' },
  { id: 'ease-in-out', label: 'Ease In-Out' },
  { id: 'hold', label: 'Hold' },
]
// Propiedades animables. Para añadir volumen, blur, color, etc. basta con
// incluir la clave aquí y guardarla en cada snapshot; interpItems la interpolará.
export const KF_PROP_KEYS = ['x', 'y', 'scale', 'rotation', 'opacity', 'cx', 'cy', 'zoom']

let _kfUid = 1
export function kfId() {
  return `k${Date.now().toString(36)}${(_kfUid++).toString(36)}`
}

function num(v, d) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export function canKeyframe(clip) {
  const k = clip?.kind
  return k === 'video' || k === 'image' || k === 'shape' || k === 'text'
}

export function keyframesOn(clip) {
  return !!(clip?.keyframes?.enabled && (clip.keyframes.items || []).length)
}

export function keyframesEnabled(clip) {
  return !!clip?.keyframes?.enabled
}

export function normalizeInterp(v) {
  if (v === 'ease-in' || v === 'ease-out' || v === 'ease-in-out' || v === 'hold') return v
  if (v === 'direct' || v === 'step') return 'hold'
  if (v === 'smooth') return 'linear'
  return 'linear'
}

export function easeT(u, type) {
  const t = Math.min(1, Math.max(0, num(u, 0)))
  const kind = normalizeInterp(type)
  if (kind === 'hold') return 0
  if (kind === 'ease-in') return t * t
  if (kind === 'ease-out') return 1 - (1 - t) * (1 - t)
  if (kind === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
  return t
}

export function normalizeItems(items) {
  return (items || [])
    .map((k) => ({
      id: k?.id || kfId(),
      t: num(k?.t, NaN),
      interpolation: normalizeInterp(k?.interpolation || k?.ease),
      props: { ...(k?.props || {}) },
    }))
    .filter((k) => Number.isFinite(k.t))
    .sort((a, b) => a.t - b.t)
}

export function staticProps(clip) {
  if (clip?.kind === 'shape') {
    const st = clip.shape || {}
    return {
      x: num(st.x, 0.5),
      y: num(st.y, 0.5),
      scale: num(st.scale, 1),
      rotation: num(st.rotation, 0),
      opacity: num(st.opacity, 1),
      cx: 0.5,
      cy: 0.5,
      zoom: 1,
    }
  }
  if (clip?.kind === 'text') {
    const st = clip.style || {}
    return {
      x: num(st.x, 0.5),
      y: num(st.y, 0.5),
      scale: num(st.scale, 1),
      rotation: num(st.rotation, 0),
      opacity: num(st.opacity, 1),
      cx: 0.5,
      cy: 0.5,
      zoom: 1,
    }
  }
  const tr = clip?.transform || {}
  const rf = clip?.reframe || {}
  return {
    x: num(tr.x, 0.5),
    y: num(tr.y, 0.5),
    scale: num(tr.scale, 1),
    rotation: num(tr.rotation, 0),
    opacity: clip?.opacity == null ? 1 : num(clip.opacity, 1),
    cx: 0.5,
    cy: 0.5,
    zoom: num(rf.zoom, 1),
  }
}

export function snapshotProps(clip, localT, srcTime) {
  const base = staticProps(clip)
  const rf = clip?.reframe
  if (!rf) return base
  const fr = frameAt(rf.keyframes, srcTime ?? (num(clip?.in_point, 0) + num(localT, 0)), rf.zoom ?? 1, rf.pan_mode || 'smooth')
  return { ...base, cx: num(fr.cx, 0.5), cy: num(fr.cy, 0.5), zoom: num(fr.zoom, rf.zoom ?? 1) }
}

function mergeProps(base, extra) {
  const out = { ...base }
  for (const key of KF_PROP_KEYS) {
    if (extra && extra[key] != null && Number.isFinite(Number(extra[key]))) out[key] = Number(extra[key])
  }
  return out
}

export function interpItems(items, t, fallback) {
  const s = normalizeItems(items)
  const fb = mergeProps(staticProps({}), fallback)
  if (!s.length) return fb
  const time = num(t, 0)
  const propsAt = (k) => mergeProps(fb, k.props)
  if (time <= s[0].t) return propsAt(s[0])
  const last = s[s.length - 1]
  if (time >= last.t) return propsAt(last)
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1]
    if (time >= a.t && time <= b.t) {
      const pa = propsAt(a)
      const pb = propsAt(b)
      if (normalizeInterp(b.interpolation) === 'hold') return pa
      const u = easeT((time - a.t) / ((b.t - a.t) || 1), b.interpolation)
      const out = {}
      for (const key of KF_PROP_KEYS) out[key] = pa[key] + (pb[key] - pa[key]) * u
      return out
    }
  }
  return propsAt(last)
}

export function clipPropsAt(clip, localT, srcTime) {
  const base = snapshotProps(clip, localT, srcTime)
  if (!keyframesEnabled(clip)) return base
  const items = clip.keyframes?.items
  if (!items?.length) return base
  return interpItems(items, localT, base)
}

export function enableKeyframes(clip, localT, srcTime) {
  const prev = clip?.keyframes || {}
  if (prev.enabled && (prev.items || []).length) {
    return { ...clip, keyframes: { ...prev, enabled: true, items: normalizeItems(prev.items) } }
  }
  const items = normalizeItems(prev.items)
  if (!items.length) {
    items.push({
      id: kfId(),
      t: +num(localT, 0).toFixed(3),
      interpolation: 'linear',
      props: snapshotProps(clip, localT, srcTime),
    })
  }
  return { ...clip, keyframes: { enabled: true, items } }
}

export function disableKeyframes(clip) {
  const prev = clip?.keyframes || {}
  return { ...clip, keyframes: { ...prev, enabled: false, items: normalizeItems(prev.items) } }
}

export function upsertKeyframeAt(clip, localT, propPatch = {}, interpolation) {
  const t = +num(localT, 0).toFixed(3)
  const enabledClip = { ...clip, keyframes: { ...(clip.keyframes || {}), enabled: true } }
  const items = normalizeItems(clip.keyframes?.items)
  const j = items.findIndex((k) => Math.abs(k.t - t) < KF_SNAP)
  const current = clipPropsAt({ ...enabledClip, keyframes: { enabled: true, items } }, t)
  const props = mergeProps(current, propPatch)
  if (j >= 0) {
    items[j] = {
      ...items[j],
      t,
      props,
      interpolation: interpolation ? normalizeInterp(interpolation) : items[j].interpolation,
    }
  } else {
    items.push({
      id: kfId(),
      t,
      interpolation: normalizeInterp(interpolation || items[items.length - 1]?.interpolation || 'linear'),
      props,
    })
  }
  items.sort((a, b) => a.t - b.t)
  return { ...clip, keyframes: { enabled: true, items } }
}

export function patchKeyframe(clip, kfIdOrT, patch) {
  const items = normalizeItems(clip.keyframes?.items).map((k) => {
    if (k.id !== kfIdOrT && k.t !== kfIdOrT) return k
    return {
      ...k,
      ...(patch.t != null ? { t: +num(patch.t, k.t).toFixed(3) } : {}),
      ...(patch.interpolation ? { interpolation: normalizeInterp(patch.interpolation) } : {}),
      props: mergeProps(k.props, patch.props),
    }
  }).sort((a, b) => a.t - b.t)
  return { ...clip, keyframes: { ...(clip.keyframes || {}), items } }
}

export function deleteKeyframeItem(clip, id) {
  const items = normalizeItems(clip.keyframes?.items).filter((k) => k.id !== id)
  const enabled = items.length ? !!clip.keyframes?.enabled : false
  return { ...clip, keyframes: { enabled, items } }
}

export function poseFromProps(props) {
  const p = props || {}
  return {
    x: num(p.x, 0.5),
    y: num(p.y, 0.5),
    scale: num(p.scale, 1),
    rotation: num(p.rotation, 0),
    opacity: num(p.opacity, 1),
    cx: num(p.cx, 0.5),
    cy: num(p.cy, 0.5),
    zoom: num(p.zoom, 1),
  }
}

export function flattenPatch(patch, kind) {
  if (!patch || typeof patch !== 'object') return {}
  const out = {}
  if (kind === 'shape' || kind === 'text' || kind === 'transform') {
    for (const key of ['x', 'y', 'scale', 'rotation', 'opacity']) {
      if (patch[key] != null && Number.isFinite(Number(patch[key]))) out[key] = Number(patch[key])
    }
  }
  if (patch.cx != null) out.cx = Number(patch.cx)
  if (patch.cy != null) out.cy = Number(patch.cy)
  if (patch.zoom != null) out.zoom = Number(patch.zoom)
  return out
}

/** Keyframe cuya interpolación describe cómo se llega a ese encuadre. */
export function targetInterpItem(clip, selKfId, localT) {
  const items = normalizeItems(clip?.keyframes?.items)
  if (!items.length) return null
  const sel = selKfId ? items.find((k) => k.id === selKfId) : null
  if (sel) return sel
  const t = num(localT, 0)
  return items.find((k) => k.t > t + KF_SNAP / 2) || items[items.length - 1]
}
