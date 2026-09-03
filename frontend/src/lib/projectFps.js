export const FPS_CHOICES = [24, 25, 30, 50, 60]
export const DEFAULT_FPS = 30

export function normalizeFps(fps) {
  const n = Number(fps)
  return FPS_CHOICES.includes(n) ? n : DEFAULT_FPS
}

export function frameDuration(fps) {
  return 1 / normalizeFps(fps)
}

/** Medio cuadro: dos keyframes en cuadros vecinos no se fusionan. */
export function kfSnap(fps) {
  return frameDuration(fps) / 2
}

export function snapToFrame(t, fps) {
  const f = normalizeFps(fps)
  const x = Number(t)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * f) / f
}
