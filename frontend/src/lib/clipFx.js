// Efectos de clip (aparición, salida, filtro visual).
// `localT` es el tiempo desde el inicio del clip en la timeline (0 = primer fotograma).
// tx/ty son fracción del destino (+x derecha, +y abajo).

export const FX_DUR = 0.4
export const ZOOM_FROM = 1.18
export const POP_FROM = 0.72

export const APPEAR_OPTIONS = [
  { id: 'none', label: 'Ninguno' },
  { id: 'fade', label: 'Fade in' },
  { id: 'zoom', label: 'Zoom in' },
  { id: 'slide_up', label: 'Slide up' },
  { id: 'slide_left', label: 'Slide left' },
  { id: 'pop', label: 'Pop' },
]

export const EXIT_OPTIONS = [
  { id: 'none', label: 'Ninguno' },
  { id: 'fade', label: 'Fade out' },
  { id: 'zoom', label: 'Zoom out' },
  { id: 'slide_down', label: 'Slide down' },
  { id: 'slide_right', label: 'Slide right' },
  { id: 'pop', label: 'Pop out' },
]

export const LOOK_OPTIONS = [
  { id: 'none', label: 'Ninguno' },
  { id: 'bw', label: 'Blanco y negro' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'contrast', label: 'Alto contraste' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'saturated', label: 'Saturado' },
]

const LOOK_CSS = {
  none: 'none',
  bw: 'grayscale(1)',
  cinematic: 'contrast(1.15) saturate(0.85) brightness(0.92)',
  vintage: 'sepia(0.45) contrast(1.1) saturate(0.8)',
  contrast: 'contrast(1.35) saturate(1.1)',
  warm: 'sepia(0.25) saturate(1.15) hue-rotate(-10deg)',
  cool: 'hue-rotate(15deg) saturate(0.9) brightness(1.05)',
  saturated: 'saturate(1.55) contrast(1.08)',
}

export function lookCss(look) {
  return LOOK_CSS[look] || 'none'
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function fxWindows(duration) {
  const d = Math.min(FX_DUR, Math.max(0, duration) / 2)
  return { appear: d, exit: d }
}

export function clipFxAt(clip, localT, duration) {
  const appear = clip?.appear || 'none'
  const exit = clip?.exit || 'none'
  const { appear: ad, exit: ed } = fxWindows(duration)
  const ap = ad > 0 ? clamp01(localT / ad) : 1
  const ep = ed > 0 ? clamp01((duration - localT) / ed) : 1

  let opacity = 1
  let scale = 1
  let tx = 0
  let ty = 0

  if (appear === 'fade' || appear === 'pop') opacity *= ap
  if (exit === 'fade' || exit === 'pop') opacity *= ep

  if (appear === 'zoom') scale *= lerp(ZOOM_FROM, 1, ap)
  if (exit === 'zoom') scale *= lerp(1, ZOOM_FROM, 1 - ep)
  if (appear === 'pop') scale *= lerp(POP_FROM, 1, ap)
  if (exit === 'pop') scale *= lerp(1, POP_FROM, 1 - ep)

  if (appear === 'slide_left') tx += lerp(1, 0, ap)
  if (appear === 'slide_up') ty += lerp(1, 0, ap)
  if (exit === 'slide_right') tx += lerp(0, 1, 1 - ep)
  if (exit === 'slide_down') ty += lerp(0, 1, 1 - ep)

  return {
    opacity,
    scale,
    tx,
    ty,
    cssFilter: lookCss(clip?.look),
  }
}

export function applyCanvasFx(ctx, fx, w, h) {
  if (fx.cssFilter && fx.cssFilter !== 'none') ctx.filter = fx.cssFilter
  ctx.globalAlpha = fx.opacity
  ctx.translate(w / 2 + fx.tx * w, h / 2 + fx.ty * h)
  ctx.scale(fx.scale, fx.scale)
  ctx.translate(-w / 2, -h / 2)
}
