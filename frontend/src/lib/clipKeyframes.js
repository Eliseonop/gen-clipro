// Keyframes de clip: snapshots de propiedades animables + interpolación.
// `t` es tiempo LOCAL del clip (0 = inicio de la barra).

import { frameAt } from './panning.js'
import { MASK_KF_KEYS, maskStaticProps } from './clipMask.js'
import { kfSnap, snapToFrame } from './projectFps.js'

export const KF_INTERPS = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Ease In' },
  { id: 'ease-out', label: 'Ease Out' },
  { id: 'ease-in-out', label: 'Ease In-Out' },
  { id: 'cubic-in', label: 'Cúbica In' },
  { id: 'cubic-out', label: 'Cúbica Out' },
  { id: 'cubic-in-out', label: 'Cúbica In-Out' },
  { id: 'back-out', label: 'Rebote' },
  { id: 'bezier', label: 'Personalizada' },
  { id: 'hold', label: 'Hold' },
]
const INTERP_IDS = new Set(KF_INTERPS.map((o) => o.id))

// Curva por defecto de "Personalizada" (la ease-in-out de CSS) y la de "Rebote".
// Espejo de BEZIER_DEFAULT / BACK_OUT en backend/app/clip_keyframes.py.
export const BEZIER_DEFAULT = [0.42, 0, 0.58, 1]
export const BACK_OUT = [0.34, 1.56, 0.64, 1]

// Puntos de control con que arranca "Personalizada" al partir de un preset
// (aproximaciones cubic-bezier estándar de cada curva).
export const INTERP_BEZIER = {
  linear: [0.25, 0.25, 0.75, 0.75],
  'ease-in': [0.55, 0.085, 0.68, 0.53],
  'ease-out': [0.25, 0.46, 0.45, 0.94],
  'ease-in-out': [0.455, 0.03, 0.515, 0.955],
  'cubic-in': [0.55, 0.055, 0.675, 0.19],
  'cubic-out': [0.215, 0.61, 0.355, 1],
  'cubic-in-out': [0.645, 0.045, 0.355, 1],
  'back-out': BACK_OUT,
}
// Espejo de AUDIO_FX_IDS (lib/audioFx.js; #16: filtros de sonido al final).
export const AUDIO_FX_KEYS = ['eq', 'compressor', 'reverb', 'echo', 'denoise', 'distortion',
  'underwater', 'telephone', 'radio', 'megaphone', 'muffled']
export const VOL_MIN = 0
export const VOL_MAX = 2

// Propiedades animables. Para añadir volumen, blur, color, etc. basta con
// incluir la clave aquí y guardarla en cada snapshot; interpItems la interpolará.
export const KF_PROP_KEYS = [
  'x', 'y', 'scale', 'rotation', 'opacity', 'cx', 'cy', 'zoom',
  'rot_x', 'rot_y', // giro 3D (solo textos; ver lib/text3d.js)
  'draw',           // trazo dibujado 0–1 (solo figuras; «dibujar trazo», #14)
  ...MASK_KF_KEYS,
  'volume', ...AUDIO_FX_KEYS,
]

// Estilo del texto animable, como CapCut: Color, Trazo, Fondo y Sombra (los
// rombos de esas secciones). A diferencia de la pose, cada propiedad lleva sus
// propios keyframes (un item puede tener solo algunas): si ninguno la tiene,
// manda su valor fijo del estilo. Fuente, tamaño, B/U/I, espaciado y alineación
// no se animan (tampoco en CapCut).
export const TEXT_STYLE_KF_KEYS = [
  'color', 'border_color', 'border_width', 'bg', 'bg_opacity',
  'bg_radius', 'bg_pad_x', 'bg_pad_y', 'bg_dx', 'bg_dy',
  'shadow_color', 'shadow_opacity', 'shadow_blur', 'shadow_distance', 'shadow_angle',
  'glow_color', 'glow_intensity', 'glow_range', 'glow_dx', 'glow_dy',
  'curve', 'stretch_x', 'stretch_y',
]
export const TEXT_KF_SECTIONS = {
  color: ['color'],
  stroke: ['border_color', 'border_width'],
  bg: ['bg', 'bg_opacity', 'bg_radius', 'bg_pad_x', 'bg_pad_y', 'bg_dx', 'bg_dy'],
  glow: ['glow_color', 'glow_intensity', 'glow_range', 'glow_dx', 'glow_dy'],
  curve: ['curve'],
  stretch: ['stretch_x', 'stretch_y'],
  shadow: ['shadow_color', 'shadow_opacity', 'shadow_blur', 'shadow_distance', 'shadow_angle'],
}
const COLOR_KF_KEYS = new Set(['color', 'border_color', 'bg', 'shadow_color', 'glow_color'])

export function hexRgb(v) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? '').trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function rgbHex(rgb) {
  return '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')
}

function validKfValue(key, v) {
  return COLOR_KF_KEYS.has(key) ? !!hexRgb(v) : v != null && v !== '' && Number.isFinite(Number(v))
}

function mixKfValue(key, a, b, u) {
  if (COLOR_KF_KEYS.has(key)) {
    const ca = hexRgb(a)
    const cb = hexRgb(b)
    return rgbHex(ca.map((c, i) => c + (cb[i] - c) * u))
  }
  return Number(a) + (Number(b) - Number(a)) * u
}

// Valor de `key` en `time` entre los items (ordenados) que la tienen; null si ninguno.
function interpKey(s, key, time) {
  const ks = s.filter((k) => validKfValue(key, k.props[key]))
  if (!ks.length) return null
  const val = (k) => (COLOR_KF_KEYS.has(key) ? rgbHex(hexRgb(k.props[key])) : Number(k.props[key]))
  if (time <= ks[0].t) return val(ks[0])
  const last = ks[ks.length - 1]
  if (time >= last.t) return val(last)
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1]
    if (time >= a.t && time <= b.t) {
      if (normalizeInterp(b.interpolation) === 'hold') return val(a)
      return mixKfValue(key, val(a), val(b), easeT((time - a.t) / ((b.t - a.t) || 1), b.interpolation, b.bezier))
    }
  }
  return val(last)
}

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
  if (v !== 'linear' && INTERP_IDS.has(v)) return v
  if (v === 'direct' || v === 'step') return 'hold'
  return 'linear'
}

/** [x1, y1, x2, y2] de una curva cúbica (como cubic-bezier de CSS) o null.
 *  x se limita a 0–1 (la curva debe avanzar en el tiempo); y admite −1…2 para
 *  curvas que se pasan y vuelven. Espejo de normalize_bezier. */
export function normalizeBezier(v) {
  if (!Array.isArray(v) || v.length !== 4) return null
  const n = v.map((x) => Number(x))
  if (!n.every(Number.isFinite)) return null
  const c = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
  return [c(n[0], 0, 1), c(n[1], -1, 2), c(n[2], 0, 1), c(n[3], -1, 2)]
}

/** Progreso y de la curva en el instante u (0–1). Espejo de bezier_y. */
export function bezierY(bez, u) {
  const [x1, y1, x2, y2] = normalizeBezier(bez) || BEZIER_DEFAULT
  if (u <= 0) return 0
  if (u >= 1) return 1
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const xAt = (s) => ((ax * s + bx) * s + cx) * s
  let s = u
  let ok = false
  for (let i = 0; i < 8; i++) {
    const err = xAt(s) - u
    if (Math.abs(err) < 1e-7) { ok = true; break }
    const d = (3 * ax * s + 2 * bx) * s + cx
    if (Math.abs(d) < 1e-6) break
    s -= err / d
  }
  if (!ok && !(s >= 0 && s <= 1 && Math.abs(xAt(s) - u) < 1e-5)) {
    let lo = 0
    let hi = 1
    s = u
    for (let i = 0; i < 40; i++) {
      const x = xAt(s)
      if (Math.abs(x - u) < 1e-7) break
      if (x < u) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
  }
  return ((ay * s + by) * s + cy) * s
}

export function easeT(u, type, bezier) {
  const t = Math.min(1, Math.max(0, num(u, 0)))
  const kind = normalizeInterp(type)
  if (kind === 'hold') return 0
  if (kind === 'ease-in') return t * t
  if (kind === 'ease-out') return 1 - (1 - t) * (1 - t)
  if (kind === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
  if (kind === 'cubic-in') return t * t * t
  if (kind === 'cubic-out') return 1 - (1 - t) ** 3
  if (kind === 'cubic-in-out') return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
  if (kind === 'back-out') return bezierY(BACK_OUT, t)
  if (kind === 'bezier') return bezierY(bezier, t)
  return t
}

/** Curva de un keyframe lista para dibujar/editar: sus puntos si es
 *  "Personalizada" o la aproximación del preset. */
export function interpBezier(item) {
  const kind = normalizeInterp(item?.interpolation)
  if (kind === 'bezier') return normalizeBezier(item?.bezier) || [...BEZIER_DEFAULT]
  return [...(INTERP_BEZIER[kind] || INTERP_BEZIER.linear)]
}

export function normalizeItems(items) {
  return (items || [])
    .map((k) => {
      const bez = normalizeBezier(k?.bezier)
      return {
        id: k?.id || kfId(),
        t: num(k?.t, NaN),
        interpolation: normalizeInterp(k?.interpolation || k?.ease),
        ...(bez ? { bezier: bez } : {}),
        props: { ...(k?.props || {}) },
      }
    })
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
      rot_x: 0,
      rot_y: 0,
      draw: Math.min(1, Math.max(0, num(st.draw, 1))),
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
      rot_x: num(st.rot_x, 0),
      rot_y: num(st.rot_y, 0),
      draw: 1,
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
    rot_x: 0,
    rot_y: 0,
    draw: 1,
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

// Cada propiedad se interpola entre los items que la tienen (los de solo estilo
// de texto no cuentan para la pose); sin ninguno, su valor de `fallback`.
export function interpItems(items, t, fallback) {
  const s = normalizeItems(items)
  const out = mergeProps(staticProps({}), fallback)
  if (!s.length) return out
  const time = num(t, 0)
  for (const key of KF_PROP_KEYS) {
    const v = interpKey(s, key, time)
    if (v != null) out[key] = v
  }
  return out
}

export function clipPropsAt(clip, localT, srcTime) {
  const base = snapshotProps(clip, localT, srcTime)
  if (!keyframesEnabled(clip)) return base
  const items = clip.keyframes?.items
  if (!items?.length) return base
  return interpItems(items, localT, base)
}

/** Estilo animado del texto en `localT`: solo las propiedades con keyframes. */
export function textStyleAt(clip, localT) {
  if (!keyframesEnabled(clip)) return {}
  const s = normalizeItems(clip.keyframes.items)
  const out = {}
  for (const key of TEXT_STYLE_KF_KEYS) {
    const v = interpKey(s, key, num(localT, 0))
    if (v != null) out[key] = v
  }
  return out
}

/**
 * Estilo con sus keyframes aplicados. Las casillas mandan (como CapCut): sin
 * Fondo o sin Trazo en el estilo, sus valores animados no hacen nada.
 */
export function withTextStyleKf(st, anim) {
  const out = { ...(st || {}), ...(anim || {}) }
  if (!st?.bg || st.bg === 'none') out.bg = st?.bg ?? 'none'
  if (!(Number(st?.border_width) > 0)) out.border_width = st?.border_width ?? 0
  // Con Escala uniforme (interruptor encendido) no hay Escala X / Y.
  if (!st?.scale_split) { delete out.stretch_x; delete out.stretch_y }
  return out
}

/** Propiedades de estilo con keyframes en el clip. */
export function textStyleKfKeys(clip) {
  const keys = new Set()
  for (const k of normalizeItems(clip?.keyframes?.items)) {
    for (const key of TEXT_STYLE_KF_KEYS) if (validKfValue(key, k.props[key])) keys.add(key)
  }
  return keys
}

/** Rombo de un grupo de estilo (`keys`): 'on' | 'empty' | 'off', como kfState. */
export function styleKfState(clip, localT, keys, fps) {
  if (!keyframesEnabled(clip)) return 'off'
  const animated = textStyleKfKeys(clip)
  if (!keys.some((k) => animated.has(k))) return 'off'
  const t = +snapToFrame(localT, fps).toFixed(6)
  const item = normalizeItems(clip.keyframes.items).find((k) => Math.abs(k.t - t) < kfSnap(fps))
  return item && keys.some((k) => validKfValue(k, item.props[k])) ? 'on' : 'empty'
}

/** Pone (o actualiza) en el keyframe de `localT` las propiedades de estilo de `patch`. */
export function upsertStyleKf(clip, localT, patch, fps) {
  const vals = {}
  for (const key of TEXT_STYLE_KF_KEYS) if (validKfValue(key, patch?.[key])) vals[key] = patch[key]
  if (!Object.keys(vals).length) return clip
  const t = +snapToFrame(localT, fps).toFixed(6)
  const items = normalizeItems(clip?.keyframes?.items)
  const j = items.findIndex((k) => Math.abs(k.t - t) < kfSnap(fps))
  if (j >= 0) items[j] = { ...items[j], props: { ...items[j].props, ...vals } }
  else {
    const prev = [...items].reverse().find((k) => k.t < t) || items[0]
    items.push({ id: kfId(), t, interpolation: normalizeInterp(prev?.interpolation || 'linear'), props: vals })
  }
  items.sort((a, b) => a.t - b.t)
  return { ...clip, keyframes: { ...(clip.keyframes || {}), enabled: true, items } }
}

/** Quita `keys` del keyframe de `localT` (y el keyframe, si se queda vacío). */
export function removeStyleKfAt(clip, localT, keys, fps) {
  const t = +snapToFrame(localT, fps).toFixed(6)
  const items = []
  for (const k of normalizeItems(clip?.keyframes?.items)) {
    if (Math.abs(k.t - t) >= kfSnap(fps)) { items.push(k); continue }
    const props = { ...k.props }
    for (const key of keys) delete props[key]
    if (Object.keys(props).length) items.push({ ...k, props })
  }
  return { ...clip, keyframes: { ...(clip.keyframes || {}), enabled: items.length > 0, items } }
}

/** Valores de estilo guardados en el keyframe `item` (para copiar / duplicar). */
function styleKfValues(item) {
  const out = {}
  for (const key of TEXT_STYLE_KF_KEYS) if (validKfValue(key, item?.props?.[key])) out[key] = item.props[key]
  return out
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
      // Conserva lo que el keyframe ya tenía (el estilo del texto va por propiedad).
      props: { ...items[j].props, ...props },
      interpolation: interpolation ? normalizeInterp(interpolation) : items[j].interpolation,
    }
  } else {
    const prev = items[items.length - 1]
    // Un keyframe nuevo hereda también la curva personalizada del anterior.
    const bez = !interpolation && prev?.bezier ? { bezier: [...prev.bezier] } : {}
    items.push({
      id: kfId(),
      t,
      interpolation: normalizeInterp(interpolation || prev?.interpolation || 'linear'),
      ...bez,
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
  if (keyframesEnabled(clip) && poseKeyframed(clip)) return true
  return CROP_KEYS.some((k) => patch?.[k] != null)
}

/**
 * Estado del rombo de una propiedad, como en After Effects / CapCut:
 *  - 'off'   la propiedad NO está animada; moverla solo cambia su valor estático.
 *  - 'empty' está animada pero no hay keyframe en el cabezal.
 *  - 'on'    hay keyframe en el cabezal (modificarla lo actualiza, no duplica).
 */
export function kfState(clip, localT, fps) {
  // Solo cuentan los keyframes de pose: los de estilo del texto tienen sus rombos.
  const t = +snapToFrame(localT, fps).toFixed(6)
  const snap = kfSnap(fps)
  const posed = normalizeItems(clip?.keyframes?.items).filter(hasPoseProps)
  if (posed.some((k) => Math.abs(k.t - t) < snap)) return 'on'
  if ((clip?.reframe?.keyframes || []).some((k) => Math.abs(k.t - t) < snap)) return 'on'
  if (!keyframesEnabled(clip)) return 'off'
  return posed.length || !textStyleKfKeys(clip).size ? 'empty' : 'off'
}

function hasPoseProps(k) {
  return KF_PROP_KEYS.some((key) => k.props[key] != null && Number.isFinite(Number(k.props[key])))
}

/** ¿Tiene el clip keyframes de pose? (Solo de estilo del texto no cuenta.) */
export function poseKeyframed(clip) {
  return normalizeItems(clip?.keyframes?.items).some(hasPoseProps)
}

/** Quita la pose del keyframe `id` y deja su estilo (o lo borra si no tenía). */
export function removePoseKf(clip, id) {
  const items = []
  for (const k of normalizeItems(clip?.keyframes?.items)) {
    if (k.id !== id) { items.push(k); continue }
    const style = styleKfValues(k)
    if (Object.keys(style).length) items.push({ ...k, props: style })
  }
  return { ...clip, keyframes: { ...(clip.keyframes || {}), items } }
}

/** Instante local del keyframe anterior (dir < 0) o siguiente (dir > 0) al
 *  cabezal, para las flechas ‹ › del rombo; null si no hay. El que está bajo
 *  el cabezal no cuenta. */
export function kfNeighborT(clip, localT, dir, fps) {
  if (!keyframesEnabled(clip)) return null
  const t = num(localT, 0)
  const snap = kfSnap(fps)
  const ts = normalizeItems(clip.keyframes.items).map((k) => k.t)
  if (dir < 0) return ts.filter((x) => x < t - snap).at(-1) ?? null
  return ts.find((x) => x > t + snap) ?? null
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
      ...(normalizeBezier(patch.bezier) ? { bezier: normalizeBezier(patch.bezier) } : {}),
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
  { id: 'transform', label: 'Transformación', keys: ['x', 'y', 'scale', 'rotation', 'opacity', 'rot_x', 'rot_y'] },
  { id: 'crop', label: 'Encuadre', keys: ['cx', 'cy', 'zoom'] },
  { id: 'mask', label: 'Máscara', keys: [...MASK_KF_KEYS] },
  { id: 'audio', label: 'Audio', keys: ['volume', ...AUDIO_FX_KEYS] },
  { id: 'text_style', label: 'Estilo del texto', keys: [...TEXT_STYLE_KF_KEYS] },
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
  for (const key of TEXT_STYLE_KF_KEYS) {
    if (keys.has(key) && validKfValue(key, props?.[key])) out[key] = props[key]
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
    props: { ...clipPropsAt(clip, item.t), ...styleKfValues(item) },
    interpolation: normalizeInterp(item.interpolation),
    bezier: item.bezier || null,
    srcKind: clip?.kind || null,
  }
}

/** Pega el portapapeles en `localT`. Si ya hay keyframe ahí, lo actualiza. */
export function pasteKeyframeAt(clip, localT, board, groupIds, fps) {
  if (!board || board.type !== 'keyframe') return clip
  const props = pickProps(board.props, groupIds)
  if (!Object.keys(props).length) return clip
  const style = styleKfValues({ props })
  const pose = Object.fromEntries(Object.entries(props).filter(([k]) => !(k in style)))
  const next = Object.keys(pose).length ? upsertKeyframeAt(clip, localT, pose, board.interpolation, fps) : clip
  return withBezierAt(upsertStyleKf(next, localT, style, fps), localT, board.bezier, fps)
}

/** Copia un keyframe existente a otro instante conservando todos sus valores. */
export function duplicateKeyframeAt(clip, id, targetT, fps) {
  const item = normalizeItems(clip?.keyframes?.items).find((k) => k.id === id)
  if (!item) return clip
  const props = { ...clipPropsAt(clip, item.t) }
  const next = upsertStyleKf(upsertKeyframeAt(clip, targetT, props, item.interpolation, fps), targetT, styleKfValues(item), fps)
  return withBezierAt(next, targetT, item.bezier, fps)
}

/** Lleva la curva personalizada al keyframe que hay en `localT` (pegar/duplicar). */
function withBezierAt(clip, localT, bezier, fps) {
  const bez = normalizeBezier(bezier)
  const id = bez ? keyframeIdAt(clip, localT, fps) : null
  return id ? patchKeyframe(clip, id, { bezier: bez }, fps) : clip
}
