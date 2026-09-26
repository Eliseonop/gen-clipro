// Copiar / pegar ATRIBUTOS entre clips, eligiendo qué (#13; «Copiar atributos /
// Pegar atributos» de CapCut, Ctrl+Alt+C / Ctrl+Alt+V). Un atributo es un GRUPO
// de propiedades (posición, mezcla, animación, máscara, audio…) que se pega en
// uno o varios clips sin tocar su contenido, su id ni su sitio en la timeline.
// Espejo de backend/app/clip_attrs.py.

import { AUDIO_FX_KEYS, KF_PROP_KEYS, TEXT_STYLE_KF_KEYS, interpItems, kfId, staticProps } from './clipKeyframes.js'
import { MASK_KF_KEYS, maskId } from './clipMask.js'

const VISUAL = ['video', 'image', 'shape', 'text']
const MEDIA = ['video', 'image']
const SOUND = ['video', 'audio']

export const ATTR_GROUPS = [
  { id: 'transform', label: 'Posición, escala y giro', icon: 'open_with', kinds: VISUAL },
  { id: 'flip', label: 'Voltear', icon: 'flip', kinds: VISUAL },
  { id: 'blend', label: 'Opacidad y modo de fusión', icon: 'layers', kinds: VISUAL },
  { id: 'animation', label: 'Animación (keyframes)', icon: 'animation', kinds: VISUAL },
  { id: 'transitions', label: 'Entrada y salida', icon: 'login', kinds: ['video', 'image', 'text'] },
  { id: 'crop', label: 'Recorte y encuadre', icon: 'crop', kinds: MEDIA },
  { id: 'effects', label: 'Filtro, efectos y ajustes', icon: 'auto_fix_high', kinds: [...MEDIA, 'adjustment'] },
  { id: 'mask', label: 'Máscara', icon: 'vignette', kinds: VISUAL },
  { id: 'chroma', label: 'Croma y contorno', icon: 'format_color_reset', kinds: MEDIA },
  { id: 'style', label: 'Estilo', icon: 'palette', kinds: ['text', 'shape'], sameKind: true },
  { id: 'speed', label: 'Velocidad', icon: 'speed', kinds: SOUND },
  { id: 'audio', label: 'Volumen y efectos de audio', icon: 'volume_up', kinds: SOUND },
]
export const ATTR_GROUP_IDS = ATTR_GROUPS.map((g) => g.id)
const GROUP_BY_ID = Object.fromEntries(ATTR_GROUPS.map((g) => [g.id, g]))

// Propiedades animables (keyframes) que lleva cada grupo. Los keyframes son
// instantáneas de TODAS las propiedades, así que pegar la animación no puede
// copiar la lista tal cual: pisaría el volumen o la máscara del destino.
const KF_FAMILIES = {
  animation: ['x', 'y', 'scale', 'rotation', 'opacity', 'rot_x', 'rot_y', 'draw'],
  crop: ['cx', 'cy', 'zoom'],
  mask: [...MASK_KF_KEYS],
  audio: ['volume', ...AUDIO_FX_KEYS],
  style: [...TEXT_STYLE_KF_KEYS],   // Color, Trazo, Fondo y Sombra del texto
}
// Grupos que tocan los keyframes: los de arriba y los que cambian el valor fijo
// de una propiedad animable (posición y opacidad).
const KF_TOUCH = new Set([...Object.keys(KF_FAMILIES), 'transform', 'blend'])
// El encuadre (cx/cy/zoom) sin keyframe sale del paneo de `reframe` en cada
// instante: no hay un valor fijo con que comparar, nunca se da por sobrante.
const CROP_KEYS = new Set(KF_FAMILIES.crop)

const POSE_DEFAULTS = { x: 0.5, y: 0.5, scale: 1, rotation: 0 }
const TEXT_3D_KEYS = ['rot_x', 'rot_y', 'perspective']
// En el estilo de un texto, lo que NO es estilo: su sitio y su opacidad.
const TEXT_KEEP_KEYS = [...Object.keys(POSE_DEFAULTS), ...TEXT_3D_KEYS, 'opacity']
// Estilo de una figura (lo demás es geometría: tipo, tamaño, lados, puntas).
export const SHAPE_STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'cornerRadius', 'dash']

const EPS = 1e-6
const T_EPS = 1e-4

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)))
const num = (v, d) => {
  const n = Number(v)
  return v != null && Number.isFinite(n) ? n : d
}
const round6 = (v) => +Number(v).toFixed(6)

/** ¿Se puede pegar el grupo `groupId` de `source` en `target`? */
export function groupApplies(groupId, source, target) {
  const g = GROUP_BY_ID[groupId]
  if (!g || !g.kinds.includes(source?.kind) || !g.kinds.includes(target?.kind)) return false
  return !(g.sameKind && source.kind !== target.kind)
}

/** Grupos que ofrece el diálogo al pegar `source` en `targets`: los que valen
 *  al menos para uno, con cuántos destinos los admiten ({...grupo, count, total}). */
export function pasteableGroups(source, targets) {
  const list = (targets || []).filter((t) => t && t.id !== source?.id)
  return ATTR_GROUPS
    .map((g) => ({ ...g, count: list.filter((t) => groupApplies(g.id, source, t)).length, total: list.length }))
    .filter((g) => g.count > 0)
}

/** El portapapeles de atributos: copia profunda del clip de origen. */
export function copyClipAttrs(clip) {
  return clip ? clone(clip) : null
}

// --- Valores fijos ----------------------------------------------------------

function holderKey(clip) {
  if (clip?.kind === 'text') return 'style'
  if (clip?.kind === 'shape') return 'shape'
  return null
}

function poseOf(clip) {
  const h = holderKey(clip)
  const src = (h ? clip[h] : clip.transform) || {}
  const out = {}
  for (const [k, d] of Object.entries(POSE_DEFAULTS)) out[k] = num(src[k], d)
  return out
}

function opacityOf(clip) {
  const h = holderKey(clip)
  return num(h ? clip[h]?.opacity : clip.opacity, 1)
}

function pasteTransform(out, src) {
  const h = holderKey(out)
  const pose = poseOf(src)
  const next = h
    ? { ...out, [h]: { ...(out[h] || {}), ...pose } }
    : { ...out, transform: { ...(out.transform || {}), ...pose } }
  if (out.kind === 'text' && src.kind === 'text') {
    const st = { ...next.style }
    for (const k of TEXT_3D_KEYS) {
      if (src.style?.[k] == null) delete st[k]
      else st[k] = src.style[k]
    }
    next.style = st
  }
  if (MEDIA.includes(out.kind) && MEDIA.includes(src.kind)) {
    if (src.layout) next.layout = src.layout
    if (src.frame) next.frame = src.frame
  }
  return next
}

function pasteBlend(out, src) {
  const h = holderKey(out)
  const o = opacityOf(src)
  const next = h ? { ...out, [h]: { ...(out[h] || {}), opacity: o } } : { ...out, opacity: o }
  next.blend_mode = src.blend_mode || null
  return next
}

function pasteCrop(out, src) {
  if (!src.reframe) return { ...out, reframe: null }
  const rf = clone(src.reframe)
  const fresh = (arr) => (arr || []).map((k) => ({ ...k, id: kfId() }))
  rf.keyframes = fresh(rf.keyframes)
  rf.keyframes2 = fresh(rf.keyframes2)
  // `master` dice cómo está guardado el ARCHIVO del destino (aspecto original),
  // no cómo se ve: es del destino.
  if (out.reframe?.master != null) rf.master = out.reframe.master
  else delete rf.master
  return { ...out, reframe: rf }
}

function pasteChroma(out, src) {
  const sb = src.bg_removal && typeof src.bg_removal === 'object' ? src.bg_removal : null
  const tb = out.bg_removal && typeof out.bg_removal === 'object' ? out.bg_removal : null
  if (!sb && !tb) return out
  // El recorte IA (auto) es del archivo del destino: nunca se pega.
  const next = { ...(tb || {}) }
  for (const k of ['chroma', 'outline']) {
    if (sb?.[k]) next[k] = clone(sb[k])
    else delete next[k]
  }
  if (!tb) {
    next.enabled = sb.enabled !== false
    if (sb.mode) next.mode = sb.mode
  } else if (sb?.chroma?.enabled) {
    next.enabled = true
  }
  if (!next.chroma && !next.outline && !next.auto) return { ...out, bg_removal: null }
  return { ...out, bg_removal: next }
}

function pasteStyle(out, src) {
  if (out.kind === 'text') {
    const st = clone(src.style || {})
    for (const k of TEXT_KEEP_KEYS) {
      if (out.style?.[k] == null) delete st[k]
      else st[k] = out.style[k]
    }
    return { ...out, style: st }
  }
  const shape = { ...(out.shape || {}) }
  for (const k of SHAPE_STYLE_KEYS) {
    if (src.shape?.[k] == null) delete shape[k]
    else shape[k] = src.shape[k]
  }
  return { ...out, shape }
}

const APPLY = {
  transform: pasteTransform,
  flip: (out, src) => ({ ...out, flip_h: !!src.flip_h, flip_v: !!src.flip_v }),
  blend: pasteBlend,
  animation: (out, src) => ({ ...out, anim: clone(src.anim) ?? null }),  // pistas `anim` antiguas
  transitions: (out, src) => ({ ...out, appear: src.appear || 'none', exit: src.exit || 'none' }),
  crop: pasteCrop,
  effects: (out, src) => ({ ...out, effects: clone(src.effects) || {}, look: src.look || 'none', filters: clone(src.filters) ?? null }),
  mask: (out, src) => ({ ...out, masks: (src.masks || []).map((m) => ({ ...clone(m), id: maskId() })) }),
  chroma: pasteChroma,
  style: pasteStyle,
  speed: (out, src) => ({
    ...out,
    speed: num(src.speed, 1),
    keep_pitch: src.keep_pitch !== false,
    reverse: !!src.reverse,
  }),
  audio: (out, src) => ({
    ...out,
    volume: num(src.volume, 1),
    muted: !!src.muted,
    audio_fx: clone(src.audio_fx) || {},
  }),
}

// --- Keyframes --------------------------------------------------------------

function itemsOf(clip) {
  const kf = clip?.keyframes
  if (!kf?.enabled || !Array.isArray(kf.items)) return []
  return kf.items
    .filter((k) => k && Number.isFinite(Number(k.t)))
    .map((k) => ({ ...k, t: Number(k.t), props: { ...(k.props || {}) } }))
    .sort((a, b) => a.t - b.t)
}

/** Deja en los keyframes solo las propiedades `keys` que cambian algo: fuera las
 *  que valen lo mismo que el valor fijo del clip en TODOS (sin ellas el clip se
 *  ve igual). Quita los keyframes que se quedan vacíos. */
function restrictItems(items, keys, base) {
  const keep = keys.filter((key) => items.some((k) => k.props[key] != null) && (
    CROP_KEYS.has(key)
    || !items.every((k) => k.props[key] == null || Math.abs(Number(k.props[key]) - base[key]) < EPS)
  ))
  return items
    .map((k) => {
      const props = {}
      for (const key of keep) if (k.props[key] != null) props[key] = Number(k.props[key])
      return { ...k, props }
    })
    .filter((k) => Object.keys(k.props).length)
}

/** {prop: valor} si cada propiedad vale lo mismo en todos los keyframes; si no, null. */
function constantProps(items) {
  const out = {}
  const keys = new Set(items.flatMap((k) => Object.keys(k.props)))
  for (const key of keys) {
    const v0 = items[0].props[key]
    if (v0 == null || items.some((k) => k.props[key] == null || Math.abs(k.props[key] - v0) > EPS)) return null
    out[key] = v0
  }
  return out
}

function keysOf(items) {
  return [...new Set(items.flatMap((k) => Object.keys(k.props)))]
}

/** Los dos lados animan: keyframes en la unión de instantes, cada lado
 *  interpolado con sus curvas. Entre instantes nuevos la curva es aproximada. */
function resample(s, t, base) {
  const times = [...s, ...t].map((k) => k.t).sort((a, b) => a - b)
    .filter((v, i, arr) => i === 0 || v - arr[i - 1] > T_EPS)
  const sKeys = keysOf(s)
  const tKeys = keysOf(t)
  return times.map((time) => {
    const own = s.find((k) => Math.abs(k.t - time) <= T_EPS) || t.find((k) => Math.abs(k.t - time) <= T_EPS)
    const ps = interpItems(s, time, base)
    const pt = interpItems(t, time, base)
    const props = {}
    for (const key of tKeys) props[key] = round6(pt[key])
    for (const key of sKeys) props[key] = round6(ps[key])
    return { t: time, interpolation: own.interpolation || 'linear', ...(own.bezier ? { bezier: own.bezier } : {}), props }
  })
}

// Keyframes del estilo del texto (van por propiedad): se llevan tal cual.
function styleItemsOf(clip) {
  return itemsOf(clip)
    .map((k) => {
      const props = {}
      for (const key of TEXT_STYLE_KF_KEYS) if (k.props[key] != null && k.props[key] !== '') props[key] = k.props[key]
      return { ...k, props }
    })
    .filter((k) => Object.keys(k.props).length)
}

function withStyleItems(items, style) {
  const out = items.map((k) => ({ ...k, props: { ...k.props } }))
  for (const st of style) {
    const hit = out.find((k) => Math.abs(k.t - st.t) <= T_EPS)
    if (hit) Object.assign(hit.props, st.props)
    else out.push(st)
  }
  return out.sort((a, b) => a.t - b.t)
}

/** Keyframes del destino tras pegar las familias `keys` del origen: las del
 *  origen sustituyen a las del destino (si el origen no las anima, el destino
 *  deja de animarlas) y el resto del destino se conserva. */
export function mergeKeyframes(target, source, keys) {
  const pasted = new Set(keys)
  const s = restrictItems(itemsOf(source), KF_PROP_KEYS.filter((k) => pasted.has(k)), staticProps(source))
  const t = restrictItems(itemsOf(target), KF_PROP_KEYS.filter((k) => !pasted.has(k)), staticProps(target))
  // El estilo animado del texto viene del origen si se pega el Estilo; si no, se queda el del destino.
  const style = styleItemsOf(TEXT_STYLE_KF_KEYS.some((k) => pasted.has(k)) ? source : target)
  if (!s.length && !style.length && !target?.keyframes?.enabled) return target?.keyframes ?? null
  let items
  if (!s.length) items = t
  else if (!t.length) items = s
  else {
    const ct = constantProps(t)
    const cs = ct ? null : constantProps(s)
    if (ct) items = s.map((k) => ({ ...k, props: { ...k.props, ...ct } }))
    else if (cs) items = t.map((k) => ({ ...k, props: { ...k.props, ...cs } }))
    else items = resample(s, t, staticProps(target))
  }
  items = withStyleItems(items, style)
  if (!items.length) return null
  return { enabled: true, items: items.map((k) => ({ ...k, id: kfId() })) }
}

/** Devuelve `target` con los grupos `groups` de `source` pegados (puro). Los
 *  grupos que no valen para ese par de clips se ignoran. */
export function pasteClipAttrs(target, source, groups) {
  if (!target || !source || target.id === source.id) return target
  const ids = ATTR_GROUP_IDS.filter((id) => (groups || []).includes(id) && groupApplies(id, source, target))
  if (!ids.length) return target
  let out = { ...target }
  for (const id of ids) out = APPLY[id](out, source)
  if (ids.some((id) => KF_TOUCH.has(id))) {
    out.keyframes = mergeKeyframes(target, source, ids.flatMap((id) => KF_FAMILIES[id] || []))
  }
  return out
}
