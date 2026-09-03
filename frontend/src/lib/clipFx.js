// Efectos de clip (aparición, salida, filtro visual).
// `localT` es el tiempo desde el inicio del clip en la timeline (0 = primer fotograma).
// tx/ty son fracción del destino (+x derecha, +y abajo).

export const FX_DUR = 0.4
export const ZOOM_FROM = 1.18
export const POP_FROM = 0.72

export const APPEAR_OPTIONS = [
  { id: 'none', label: 'Ninguno' },
  { id: 'fade', label: 'Fade' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'slide_up', label: 'Slide up' },
  { id: 'slide_left', label: 'Slide left' },
  { id: 'pop', label: 'Pop' },
]

export const EXIT_OPTIONS = [
  { id: 'none', label: 'Ninguno' },
  { id: 'fade', label: 'Fade' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'slide_down', label: 'Slide down' },
  { id: 'slide_right', label: 'Slide right' },
  { id: 'pop', label: 'Pop' },
]

export const VIDEO_FX_TOGGLES = [
  { id: 'blur', label: 'Desenfoque', icon: 'blur_on', kind: 'range', min: 0, max: 8, step: 0.5, def: 2 },
  { id: 'sharpen', label: 'Enfoque', icon: 'details', kind: 'range', min: 0, max: 5, step: 0.5, def: 1.5 },
  { id: 'glow', label: 'Glow', icon: 'light_mode', kind: 'range', min: 0, max: 12, step: 1, def: 6 },
  { id: 'grayscale', label: 'Grayscale', icon: 'filter_b_and_w', kind: 'toggle' },
  { id: 'sepia', label: 'Sepia', icon: 'filter_vintage', kind: 'toggle' },
  { id: 'pixelate', label: 'Pixelate', icon: 'grid_on', kind: 'range', min: 0, max: 24, step: 1, def: 8 },
  { id: 'vhs', label: 'VHS', icon: 'videocam', kind: 'toggle' },
  { id: 'grain', label: 'Grain', icon: 'grain', kind: 'range', min: 0, max: 40, step: 1, def: 12 },
]

export const COLOR_FX = [
  { id: 'brightness', label: 'Brillo', min: -0.5, max: 0.5, step: 0.05 },
  { id: 'contrast', label: 'Contraste', min: -0.5, max: 0.5, step: 0.05 },
  { id: 'saturation', label: 'Saturación', min: -1, max: 1, step: 0.05 },
]

export const AUDIO_FX_TOGGLES = [
  { id: 'eq', label: 'Equalizer', icon: 'equalizer', kind: 'range', min: 0, max: 1, step: 0.05, def: 1 },
  { id: 'compressor', label: 'Compressor', icon: 'compress', kind: 'range', min: 0, max: 1, step: 0.05, def: 1 },
  { id: 'reverb', label: 'Reverb', icon: 'waves', kind: 'range', min: 0, max: 1, step: 0.05, def: 1 },
  { id: 'echo', label: 'Echo', icon: 'record_voice_over', kind: 'range', min: 0, max: 1, step: 0.05, def: 1 },
  { id: 'denoise', label: 'Noise reduction', icon: 'hearing', kind: 'range', min: 0, max: 1, step: 0.05, def: 1 },
  { id: 'distortion', label: 'Distortion', icon: 'speaker', kind: 'range', min: 0, max: 1, step: 0.05, def: 1 },
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

function fxNum(e, id) {
  const v = e?.[id]
  if (v === true) return 1
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function fxOn(e, id) {
  const v = e?.[id]
  if (v === true) return true
  if (v === false || v == null) return false
  return Number(v) > 0
}

export function effectsCss(clip) {
  const parts = []
  const look = lookCss(clip?.look)
  if (look && look !== 'none') parts.push(look)
  const e = clip?.effects || {}
  const blur = fxNum(e, 'blur')
  if (blur > 0) parts.push(`blur(${blur}px)`)
  const sharpen = fxNum(e, 'sharpen')
  if (sharpen > 0) parts.push(`contrast(${1 + sharpen * 0.12})`)
  const glow = fxNum(e, 'glow')
  if (glow > 0) parts.push(`drop-shadow(0 0 ${glow}px rgba(255,255,255,0.8))`)
  const gs = fxNum(e, 'grayscale')
  if (gs > 0) parts.push(`grayscale(${Math.min(1, gs)})`)
  const sepia = fxNum(e, 'sepia')
  if (sepia > 0) parts.push(`sepia(${Math.min(1, sepia)})`)
  if (fxOn(e, 'vhs')) parts.push('contrast(1.35) saturate(0.65) hue-rotate(-12deg) blur(0.35px)')
  const b = fxNum(e, 'brightness')
  if (b) parts.push(`brightness(${1 + b})`)
  const c = fxNum(e, 'contrast')
  if (c) parts.push(`contrast(${1 + c})`)
  const s = fxNum(e, 'saturation')
  if (s) parts.push(`saturate(${Math.max(0, 1 + s)})`)
  return parts.length ? parts.join(' ') : 'none'
}

export { fxOn, fxNum }

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

  const fadeIn = appear === 'fade' || appear === 'dissolve' || appear === 'pop'
  const fadeOut = exit === 'fade' || exit === 'dissolve' || exit === 'pop'
  if (fadeIn) opacity *= ap
  if (fadeOut) opacity *= ep

  if (appear === 'zoom') scale *= lerp(ZOOM_FROM, 1, ap)
  if (exit === 'zoom') scale *= lerp(1, ZOOM_FROM, 1 - ep)
  if (appear === 'pop') scale *= lerp(POP_FROM, 1, ap)
  if (exit === 'pop') scale *= lerp(1, POP_FROM, 1 - ep)

  if (appear === 'slide_left') tx += lerp(1, 0, ap)
  if (appear === 'slide_up') ty += lerp(1, 0, ap)
  if (exit === 'slide_right') tx += lerp(0, 1, 1 - ep)
  if (exit === 'slide_down') ty += lerp(0, 1, 1 - ep)

  let wipe = 1
  if (appear === 'wipe') wipe = Math.min(wipe, ap)
  if (exit === 'wipe') wipe = Math.min(wipe, ep)

  return {
    opacity,
    scale,
    tx,
    ty,
    wipe,
    cssFilter: effectsCss(clip),
  }
}

export function applyCanvasFx(ctx, fx, w, h) {
  if (fx.wipe != null && fx.wipe < 1) {
    ctx.beginPath()
    ctx.rect(0, 0, w * Math.max(0, fx.wipe), h)
    ctx.clip()
  }
  if (fx.cssFilter && fx.cssFilter !== 'none') ctx.filter = fx.cssFilter
  ctx.globalAlpha = fx.opacity
  ctx.translate(w / 2 + fx.tx * w, h / 2 + fx.ty * h)
  ctx.scale(fx.scale, fx.scale)
  ctx.translate(-w / 2, -h / 2)
}
