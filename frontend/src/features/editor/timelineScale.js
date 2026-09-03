import { frameDuration, normalizeFps } from '../../lib/projectFps.js'

export const PPS_FLOOR = 0.08
export const PPS_SHORT_MIN = 8

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

/** Un cuadro ~80 px al máximo zoom, con tope para no inflar timelines de 2 h. */
export function maxPps(fps, duration = 12) {
  const byFrame = 80 / frameDuration(fps)
  const cap = 16_000_000 / Math.max(Number(duration) || 12, 12)
  return Math.min(byFrame, Math.max(600, cap))
}

/** Lo bastante pequeño para meter un vídeo de ~2 h en el ancho visible. */
export function minPps(duration, viewW = 900) {
  const span = Math.max(Number(duration) || 0, 12)
  const fit = Math.max(80, Number(viewW) || 900) / span
  return Math.min(PPS_SHORT_MIN, Math.max(PPS_FLOOR, fit))
}

export function clampPps(pps, duration, viewW, fps) {
  return clamp(Number(pps) || minPps(duration, viewW), minPps(duration, viewW), maxPps(fps, duration))
}

export function tickSteps(fps) {
  const frame = frameDuration(fps)
  const raw = [
    frame, 2 * frame, 5 * frame, 10 * frame,
    0.5, 1, 2, 5, 10, 15, 30, 60,
    120, 300, 600, 900, 1800, 3600,
  ]
  const out = []
  for (const s of [...raw].sort((a, b) => a - b)) {
    if (!out.length || s - out[out.length - 1] > frame * 0.35) out.push(s)
  }
  return out
}

export function tickStep(pps, fps, dense = false) {
  const targetPx = dense ? 48 : 72
  const rawStep = targetPx / Math.max(Number(pps) || 1, 0.001)
  const steps = tickSteps(fps)
  return steps.find((s) => s >= rawStep) || steps[steps.length - 1] * 2
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** m:ss, h:mm:ss, o m:ss:ff (cuadros) cuando el paso es menor de 1 s. */
export function fmtRuler(seconds, opts = {}) {
  const t = Math.max(0, Number(seconds) || 0)
  const fps = normalizeFps(opts.fps)
  const step = opts.step
  const long = !!opts.long
  const showFrames = step != null && step < 0.999
  let whole = Math.floor(t)
  let frames = 0
  if (showFrames) {
    const totalF = Math.round(t * fps)
    whole = Math.floor(totalF / fps)
    frames = totalF % fps
  }
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const sec = whole % 60
  let core
  if (showFrames) {
    core = h > 0
      ? `${h}:${pad2(m)}:${pad2(sec)}:${pad2(frames)}`
      : `${m}:${pad2(sec)}:${pad2(frames)}`
  } else if (long || h > 0) {
    core = `${h}:${pad2(m)}:${pad2(sec)}`
  } else {
    core = `${m}:${pad2(sec)}`
  }
  return core
}

export function buildTicks(maxT, pps, opts = {}) {
  const fps = opts.fps
  const dense = !!opts.dense
  const scrollX = Math.max(0, Number(opts.scrollX) || 0)
  const viewW = Math.max(200, Number(opts.viewW) || 1200)
  const step = tickStep(pps, fps, dense)
  const frame = frameDuration(fps)
  const max = Math.max(0, Number(maxT) || 0)
  const p = Math.max(Number(pps) || 1, 0.001)
  const viewStart = scrollX / p
  const viewEnd = viewStart + viewW / p
  const pad = (viewW * 0.35) / p
  const a = Math.max(0, viewStart - pad)
  const b = Math.min(max, viewEnd + pad)
  const ticks = []
  const seen = new Set()
  const push = (t, major, minor) => {
    const n = +Number(t).toFixed(6)
    if (n < -1e-9 || n > max + 1e-9) return
    const key = n.toFixed(6)
    if (seen.has(key)) return
    seen.add(key)
    ticks.push({ t: n, major, minor: !!minor, step })
  }
  const t0 = Math.floor(a / step) * step
  for (let t = t0; t <= b + step * 0.01; t += step) push(t, true, false)
  const minorStep = step >= 1 ? step / 5 : (step > frame * 1.5 ? frame : 0)
  if (minorStep > 1e-9 && ticks.length < 250) {
    const m0 = Math.floor(a / minorStep) * minorStep
    for (let t = m0; t <= b + minorStep * 0.01; t += minorStep) {
      push(t, false, true)
    }
  }
  return ticks
}
