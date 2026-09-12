// Keyframes de clip: snapshots de propiedades animables + interpolación.
// `t` es tiempo LOCAL del clip (0 = inicio de la barra).

import { frameAt } from './panning.js'
import { MASK_KF_KEYS, maskStaticProps } from './clipMask.js'
import { DEFAULT_FPS, kfSnap, snapToFrame } from './projectFps.js'

export const KF_SNAP = kfSnap(DEFAULT_FPS)
export const KF_INTERPS = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Ease In' },
  { id: 'ease-out', label: 'Ease Out' },
  { id: 'ease-in-out', label: 'Ease In-Out' },
  { id: 'hold', label: 'Hold' },
]
export const AUDIO_FX_KEYS = ['eq', 'compressor', 'reverb', 'echo', 'denoise', 'distortion']
export const VOL_MIN = 0
export const VOL_MAX = 2

// Propiedades animables. Para añadir volumen, blur, color, etc. basta con
// incluir la clave aquí y guardarla en cada snapshot; interpItems la interpolará.
export const KF_PROP_KEYS = [
  'x', 'y', 'scale', 'rotation', 'opacity', 'cx', 'cy', 'zoom',
  ...MASK_KF_KEYS,
  'volume', ...AUDIO_FX_KEYS,
]

let _kfUid = 1
export function kfId() {
  return `k${Date.now().toString(36)}${(_kfUid++).toString(36)}`
}

function num(v, d) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export function clampVolume(v) {
  return Math.min(VOL_MAX, Math.max(VOL_MIN, num(v, 1)))
}

function audioStatic(clip) {
  const fx = clip?.audio_fx && typeof clip.audio_fx === 'object' ? clip.audio_fx : {}
  const out = { volume: clampVolume(clip?.volume ?? 1) }
  for (const key of AUDIO_FX_KEYS) {
    const v = fx[key]
    if (v === true) out[key] = 1
    else if (v === false || v == null) out[key] = 0
    else out[key] = Math.min(1, Math.max(0, num(v, 0)))
  }
  return out
}

export function canKeyframe(clip) {
  const k = clip?.kind
  return k === 'video' || k === 'image' || k === 'shape' || k === 'text' || k === 'audio'
}

/** Al seleccionar un clip animable (incluido audio) se abre Efectos. */
export function opensEffectsOnSelect(clip) {
  return canKeyframe(clip)
}

export function hasVolumeControls(clip) {
  return clip?.kind === 'audio' || clip?.kind === 'video'
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
      ...maskStaticProps(clip),
      ...audioStatic(clip),
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
      ...maskStaticProps(clip),
      ...audioStatic(clip),
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
    ...maskStaticProps(clip),
    ...audioStatic(clip),
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
      t: +snapToFrame(localT, undefined).toFixed(6),
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

export function upsertKeyframeAt(clip, localT, propPatch = {}, interpolation, fps) {
  const t = +snapToFrame(localT, fps).toFixed(6)
  const snap = kfSnap(fps)
  const enabledClip = { ...clip, keyframes: { ...(clip.keyframes || {}), enabled: true } }
  const items = normalizeItems(clip.keyframes?.items)
  const j = items.findIndex((k) => Math.abs(k.t - t) < snap)
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

// El encuadre no tiene campo estático: sus keyframes SON el almacenamiento
// (ver `snapshotProps` → `frameAt`). Mover el recorte escribe keyframe siempre.
export const CROP_KEYS = ['cx', 'cy']

/**
 * Regla "mover ≠ animar": un cambio de propiedad solo aterriza como keyframe si
 * el clip YA está animado. Si devuelve false el llamante escribe únicamente el
 * valor estático, y la animación queda para cuando el usuario la active.
 */
export function shouldKeyframe(clip, patch) {
  if (keyframesEnabled(clip)) return true
  return CROP_KEYS.some((k) => patch?.[k] != null)
}

/**
 * Estado del rombo de una propiedad, como en After Effects / CapCut:
 *  - 'off'   la propiedad NO está animada; moverla solo cambia su valor estático.
 *  - 'empty' está animada pero no hay keyframe en el cabezal.
 *  - 'on'    hay keyframe en el cabezal (modificarla lo actualiza, no duplica).
 */
export function kfState(clip, localT, fps) {
  const here = !!keyframeIdAt(clip, localT, fps)
  if (here) return 'on'
  return keyframesEnabled(clip) ? 'empty' : 'off'
}

export function keyframeIdAt(clip, localT, fps) {
  const t = +snapToFrame(localT, fps).toFixed(6)
  const snap = kfSnap(fps)
  const item = normalizeItems(clip?.keyframes?.items).find((k) => Math.abs(k.t - t) < snap)
  if (item) return item.id
  const rf = (clip?.reframe?.keyframes || []).find((k) => Math.abs(k.t - t) < snap)
  return rf?.id || null
}

export function patchKeyframe(clip, kfIdOrT, patch, fps) {
  const items = normalizeItems(clip.keyframes?.items).map((k) => {
    if (k.id !== kfIdOrT && k.t !== kfIdOrT) return k
    return {
      ...k,
      ...(patch.t != null ? { t: +snapToFrame(patch.t, fps).toFixed(6) } : {}),
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
    volume: clampVolume(p.volume),
  }
}

export function clipVolumeAt(clip, localT, srcTime) {
  return clampVolume(clipPropsAt(clip, localT, srcTime).volume)
}

export function sampleVolumeCurve(clip, duration, steps = 48) {
  const dur = Math.max(1e-6, num(duration, 0))
  const n = Math.max(8, Math.round(num(steps, 48)))
  const times = new Set()
  for (let i = 0; i <= n; i++) times.add((i / n) * dur)
  if (keyframesEnabled(clip)) {
    for (const k of normalizeItems(clip.keyframes?.items)) {
      if (k.t >= 0 && k.t <= dur) times.add(k.t)
    }
  }
  return [...times].sort((a, b) => a - b).map((t) => ({ t, v: clipVolumeAt(clip, t) }))
}

/** Fade in/out de volumen con keyframes (no destructivo). `duration` es la del clip en la timeline. */
export function applyVolumeFade(clip, duration, side, fadeDur = 0.5) {
  const dur = Math.max(0.05, num(duration, 0))
  const window = Math.min(Math.max(0.05, num(fadeDur, 0.5)), dur / 2)
  const peak = clampVolume(clip?.volume ?? 1)
  const target = peak > 0.001 ? peak : 1
  let next = { ...clip, volume: target }
  if (side === 'in') {
    next = upsertKeyframeAt(next, 0, { volume: 0 }, 'ease-out')
    next = upsertKeyframeAt(next, window, { volume: target }, 'ease-out')
  } else {
    next = upsertKeyframeAt(next, Math.max(0, dur - window), { volume: target }, 'ease-in')
    next = upsertKeyframeAt(next, dur, { volume: 0 }, 'ease-in')
  }
  return next
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
export function targetInterpItem(clip, selKfId, localT, fps) {
  const items = normalizeItems(clip?.keyframes?.items)
  if (!items.length) return null
  const sel = selKfId ? items.find((k) => k.id === selKfId) : null
  if (sel) return sel
  const t = num(localT, 0)
  return items.find((k) => k.t > t + kfSnap(fps) / 2) || items[items.length - 1]
}

// --- Portapapeles de keyframes ---------------------------------------------
// Copiar / pegar / duplicar keyframes, con selección por grupo de propiedades
// para poder llevarse solo la Transformación, solo el Audio, etc.

export const KF_GROUPS = [
  { id: 'transform', label: 'Transformación', keys: ['x', 'y', 'scale', 'rotation', 'opacity'] },
  { id: 'crop', label: 'Encuadre', keys: ['cx', 'cy', 'zoom'] },
  { id: 'mask', label: 'Máscara', keys: [...MASK_KF_KEYS] },
  { id: 'audio', label: 'Audio', keys: ['volume', ...AUDIO_FX_KEYS] },
]

export const KF_GROUP_IDS = KF_GROUPS.map((g) => g.id)

/** Subconjunto de `props` que pertenece a los grupos dados. */
export function pickProps(props, groupIds) {
  // `null`/ausente = todos los grupos; lista vacía = ninguno (el usuario los
  // desmarcó todos y pegar no debe tocar nada).
  const ids = groupIds == null ? KF_GROUP_IDS : groupIds
  const keys = new Set(KF_GROUPS.filter((g) => ids.includes(g.id)).flatMap((g) => g.keys))
  const out = {}
  for (const key of KF_PROP_KEYS) {
    if (keys.has(key) && props?.[key] != null && Number.isFinite(Number(props[key]))) {
      out[key] = Number(props[key])
    }
  }
  return out
}

/** Contenido del portapapeles a partir del keyframe que hay en `localT`. */
export function copyKeyframeAt(clip, localT, fps) {
  const t = +snapToFrame(localT, fps).toFixed(6)
  const item = normalizeItems(clip?.keyframes?.items).find((k) => Math.abs(k.t - t) < kfSnap(fps))
  if (!item) return null
  return {
    type: 'keyframe',
    props: { ...clipPropsAt(clip, item.t) },
    interpolation: normalizeInterp(item.interpolation),
    srcKind: clip?.kind || null,
  }
}

/** Pega el portapapeles en `localT`. Si ya hay keyframe ahí, lo actualiza. */
export function pasteKeyframeAt(clip, localT, board, groupIds, fps) {
  if (!board || board.type !== 'keyframe') return clip
  const props = pickProps(board.props, groupIds)
  if (!Object.keys(props).length) return clip
  return upsertKeyframeAt(clip, localT, props, board.interpolation, fps)
}

/** Copia un keyframe existente a otro instante conservando todos sus valores. */
export function duplicateKeyframeAt(clip, id, targetT, fps) {
  const item = normalizeItems(clip?.keyframes?.items).find((k) => k.id === id)
  if (!item) return clip
  const props = { ...clipPropsAt(clip, item.t) }
  return upsertKeyframeAt(clip, targetT, props, item.interpolation, fps)
}
