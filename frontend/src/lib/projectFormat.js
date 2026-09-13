// Formato de salida del proyecto: relación de aspecto × resolución (lado corto).
// Espejo en backend: timeline_ops.ASPECTS / RESOLUTIONS / size_for.

export const ASPECTS = [
  { id: '16:9', rw: 16, rh: 9 },
  { id: '9:16', rw: 9, rh: 16 },
  { id: '1:1', rw: 1, rh: 1 },
  { id: '4:3', rw: 4, rh: 3 },
  { id: '3:4', rw: 3, rh: 4 },
  { id: '4:5', rw: 4, rh: 5 },
]

// id = píxeles del lado corto.
export const RESOLUTIONS = [
  { id: 480, label: '480p' },
  { id: 720, label: '720p' },
  { id: 1080, label: '1080p' },
  { id: 2160, label: '4K' },
]

export const DIM_MIN = 144
export const DIM_MAX = 4096
const RATIO_TOL = 0.01

// H.264/yuv420p exige dimensiones pares.
export function evenDim(n) {
  const x = Math.round(Number(n) || 0)
  const c = Math.min(DIM_MAX, Math.max(DIM_MIN, x))
  return Math.round(c / 2) * 2
}

/** Tamaño para una proporción rw:rh con `shortSide` px en el lado corto (el largo se limita a DIM_MAX). */
export function sizeForRatio(rw, rh, shortSide) {
  const r = Number(rw) / Number(rh)
  if (!(r > 0) || !Number.isFinite(r)) return { w: evenDim(shortSide), h: evenDim(shortSide) }
  let s = Math.max(DIM_MIN, Number(shortSide) || 0)
  const k = r >= 1 ? r : 1 / r
  if (s * k > DIM_MAX) s = DIM_MAX / k
  const long = s * k
  return r >= 1 ? { w: evenDim(long), h: evenDim(s) } : { w: evenDim(s), h: evenDim(long) }
}

export function aspectOf(w, h) {
  if (!(w > 0 && h > 0)) return 'custom'
  const r = w / h
  return ASPECTS.find((a) => Math.abs(r - a.rw / a.rh) / (a.rw / a.rh) < RATIO_TOL)?.id || 'custom'
}

export function resolutionOf(w, h) {
  const s = Math.min(w, h)
  return RESOLUTIONS.find((r) => r.id === s)?.id ?? 'custom'
}

/** Cambia la proporción conservando el lado corto actual. */
export function withAspect(aspectId, w, h) {
  const a = ASPECTS.find((x) => x.id === aspectId)
  if (!a) return { w, h }
  return sizeForRatio(a.rw, a.rh, Math.min(w, h))
}

/** Cambia la resolución (lado corto) conservando la proporción actual. */
export function withResolution(shortSide, w, h) {
  const a = ASPECTS.find((x) => x.id === aspectOf(w, h))
  return a ? sizeForRatio(a.rw, a.rh, shortSide) : sizeForRatio(w, h, shortSide)
}

/** "Original": proporción del medio (mw×mh) con el lado corto actual. */
export function withMediaAspect(mw, mh, w, h) {
  if (!(mw > 0 && mh > 0)) return { w, h }
  return sizeForRatio(mw, mh, Math.min(w, h))
}
