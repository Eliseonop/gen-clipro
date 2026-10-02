// Evaluador de las ANIMACIONES de clip (`clip.animations`). Espejo exacto de
// backend/app/fx_anims.py: mismas curvas, mismas ventanas, mismos deltas (un test
// compara los dos lenguajes con los mismos casos).
//
// `clip.animations = { in: {id, dur}, out: {id, dur}, loop: {id, dur}, combo: {id} }`
// (cualquiera puede faltar). OJO: `clip.anim` es otra cosa (pistas antiguas).

import { ANIMS } from '../anims.js'

const BY_ID = new Map(ANIMS.map((a) => [a.id, a]))
export const ANIM_SAMPLE_FPS = 30
const SLOTS = ['in', 'out', 'loop', 'combo']

export function getAnim(id) {
  return BY_ID.get(String(id || '')) || null
}

const c1 = 1.70158
const c3 = c1 + 1
const c4 = (2 * Math.PI) / 3

function bounceOut(x) {
  const n1 = 7.5625
  const d1 = 2.75
  if (x < 1 / d1) return n1 * x * x
  if (x < 2 / d1) { const y = x - 1.5 / d1; return n1 * y * y + 0.75 }
  if (x < 2.5 / d1) { const y = x - 2.25 / d1; return n1 * y * y + 0.9375 }
  const y = x - 2.625 / d1
  return n1 * y * y + 0.984375
}

export const EASES = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  inBack: (x) => c3 * x * x * x - c1 * x * x,
  outBack: (x) => 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2,
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1),
  outBounce: bounceOut,
  hold: (x) => (x >= 1 ? 1 : 0),
}

/** Valor de una pista `[[u, v, curva], …]` en `u` (0–1). */
export function evalTrack(keys, u) {
  if (!keys?.length) return null
  if (u <= keys[0][0]) return keys[0][1]
  const last = keys[keys.length - 1]
  if (u >= last[0]) return last[1]
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (u >= a[0] && u <= b[0]) {
      const span = b[0] - a[0]
      const f = span > 0 ? (u - a[0]) / span : 1
      const ease = EASES[b[2] || 'linear'] || EASES.linear
      return a[1] + (b[1] - a[1]) * ease(f)
    }
  }
  return last[1]
}

export const IDENTITY = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })

function animDeltaAt(anim, u) {
  const t = anim.tracks || {}
  const v = (k, d) => {
    const r = evalTrack(t[k], u)
    return r == null ? d : r
  }
  return { x: v('x', 0), y: v('y', 0), scale: v('scale', 1), rotation: v('rotation', 0), opacity: v('opacity', 1) }
}

function combine(a, b) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    scale: a.scale * b.scale,
    rotation: a.rotation + b.rotation,
    opacity: a.opacity * b.opacity,
  }
}

/** Animaciones válidas del clip con sus duraciones efectivas (s). */
export function clipAnimations(clip, clipDur) {
  const raw = clip?.animations
  if (!raw || typeof raw !== 'object') return []
  const D = Math.max(0, Number(clipDur) || 0)
  const out = []
  for (const slot of SLOTS) {
    const entry = raw[slot]
    const anim = entry && getAnim(entry.id)
    if (!anim || anim.slot !== slot) continue
    let dur = Number(entry.dur)
    if (!Number.isFinite(dur) || dur <= 0) dur = anim.dur
    if (slot === 'combo') dur = D
    out.push({ slot, anim, dur: Math.max(0.05, dur) })
  }
  // Entrada + salida no pueden pasar del clip: se reparten.
  const inn = out.find((a) => a.slot === 'in')
  const outt = out.find((a) => a.slot === 'out')
  const sum = (inn?.dur || 0) + (outt?.dur || 0)
  if (D > 0 && sum > D) {
    const k = D / sum
    if (inn) inn.dur *= k
    if (outt) outt.dur *= k
  }
  return out
}

// Duración del clip en la timeline, igual que clip_speed.clip_timeline_duration
// (redondeada a ms, como en Python, para que las ventanas coincidan).
const NO_SPEED = new Set(['text', 'image', 'shape', 'adjustment'])
export function animClipDur(clip) {
  const src = Math.max(0, (Number(clip?.out_point) || 0) - (Number(clip?.in_point) || 0))
  let s = Number(clip?.speed)
  if (NO_SPEED.has(clip?.kind) || !Number.isFinite(s) || s <= 0) s = 1
  s = Math.min(10, Math.max(0.1, s))
  return Math.max(0, Math.round((src / s) * 1000) / 1000)
}

export function hasAnimations(clip) {
  return clipAnimations(clip, 1).length > 0
}

/** Delta de pose de las animaciones del clip en `t` (tiempo local). */
export function animationDelta(clip, t, clipDur) {
  const list = clipAnimations(clip, clipDur)
  if (!list.length) return IDENTITY
  const D = Math.max(0, Number(clipDur) || 0)
  let d = IDENTITY
  for (const a of list) {
    let u
    if (a.slot === 'in') u = Math.min(1, Math.max(0, t / a.dur))
    else if (a.slot === 'out') u = Math.min(1, Math.max(0, (t - (D - a.dur)) / a.dur))
    else if (a.slot === 'loop') u = ((t / a.dur) % 1 + 1) % 1
    else u = D > 0 ? Math.min(1, Math.max(0, t / D)) : 0
    d = combine(d, animDeltaAt(a.anim, u))
  }
  return d
}

/** Pose con el delta aplicado (x/y en fracción del cuadro). */
export function applyAnimDelta(pose, d) {
  if (d === IDENTITY) return pose
  return {
    ...pose,
    x: (Number(pose.x) || 0) + d.x,
    y: (Number(pose.y) || 0) + d.y,
    scale: (Number(pose.scale ?? 1)) * d.scale,
    rotation: (Number(pose.rotation) || 0) + d.rotation,
    opacity: (Number(pose.opacity ?? 1)) * d.opacity,
  }
}

/**
 * Instantes donde el export muestrea la pose por culpa de las animaciones: a
 * 30 fps dentro de cada ventana (bucle y combo: todo el clip), con los bordes.
 */
export function animationSampleTimes(clip, clipDur) {
  const list = clipAnimations(clip, clipDur)
  const D = Math.max(0, Number(clipDur) || 0)
  const times = new Set()
  const step = 1 / ANIM_SAMPLE_FPS
  const add = (a, b) => {
    const n = Math.max(1, Math.ceil((b - a) / step - 1e-9))
    for (let i = 0; i <= n; i++) times.add(+(a + (b - a) * i / n).toFixed(6))
  }
  for (const a of list) {
    if (a.slot === 'in') add(0, Math.min(D, a.dur))
    else if (a.slot === 'out') add(Math.max(0, D - a.dur), D)
    else add(0, D)
  }
  return [...times].sort((x, y) => x - y)
}
