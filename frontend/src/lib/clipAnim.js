// Pose del clip en un instante: keyframes (snapshots) o pistas `anim` antiguas.
// `t` es tiempo LOCAL del clip (0 = inicio de la barra).

import {
  clipPropsAt, keyframesEnabled, staticProps,
} from './clipKeyframes.js'

export const ANIM_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity']

function num(v, d) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export function normalizeTrack(kfs) {
  return (kfs || [])
    .map((k) => ({
      t: num(k?.t, NaN),
      v: num(k?.v, NaN),
      ease: k?.ease === 'direct' ? 'direct' : 'smooth',
    }))
    .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.v))
    .sort((a, b) => a.t - b.t)
}

/** Valor de una pista en `t`. `ease` del keyframe de llegada (como pan_mode del encuadre). */
export function interpTrack(kfs, t, fallback) {
  const s = normalizeTrack(kfs)
  const fb = num(fallback, 0)
  if (!s.length) return fb
  const time = num(t, 0)
  if (time <= s[0].t) return s[0].v
  const last = s[s.length - 1]
  if (time >= last.t) return last.v
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1]
    if (time >= a.t && time <= b.t) {
      if (b.ease === 'direct') return a.v
      const f = (time - a.t) / ((b.t - a.t) || 1)
      return a.v + (b.v - a.v) * f
    }
  }
  return last.v
}

export function staticPose(clip) {
  const p = staticProps(clip)
  return {
    x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, opacity: p.opacity,
  }
}

function legacyAnimPose(clip, localT, base) {
  const anim = clip?.anim && typeof clip.anim === 'object' && !Array.isArray(clip.anim) ? clip.anim : {}
  return {
    x: interpTrack(anim.x, localT, base.x),
    y: interpTrack(anim.y, localT, base.y),
    scale: interpTrack(anim.scale, localT, base.scale),
    rotation: interpTrack(anim.rotation, localT, base.rotation),
    opacity: interpTrack(anim.opacity, localT, base.opacity),
  }
}

export function clipPose(clip, localT, srcTime) {
  const p = clipPropsAt(clip, localT, srcTime)
  if (keyframesEnabled(clip)) {
    return {
      x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, opacity: p.opacity,
      cx: p.cx, cy: p.cy, zoom: p.zoom,
    }
  }
  const legacy = legacyAnimPose(clip, localT, p)
  return { ...legacy, cx: p.cx, cy: p.cy, zoom: p.zoom }
}

export function posedTransform(clip, localT) {
  const p = clipPose(clip, localT)
  return { x: p.x, y: p.y, scale: p.scale, rotation: p.rotation }
}

export function applyShapePose(st, pose) {
  const scale = num(pose?.scale, 1)
  return {
    ...st,
    x: pose.x,
    y: pose.y,
    rotation: pose.rotation,
    opacity: pose.opacity,
    w: num(st?.w, 0.38) * scale,
    h: num(st?.h, 0.16) * scale,
  }
}
