// Estilos de texto y dibujo del texto sobre canvas (previsualización).
// Las medidas son relativas al alto de salida: size = fracción de la altura.
// x/y son el centro del texto en coordenadas normalizadas (0-1) de la salida.

import { clipFlip, clipPose } from './clipAnim.js'
import { clipFxAt, typingReveal } from './clipFx.js'
import { activeWordIndex, activeWordIndexFromWords, applyThemeToStyle, hasWordFx, karaokeOn, styleOpacity, wordOpacity } from './textKaraoke.js'
import { themeById } from './subtitleThemes.js'
import { keyframesEnabled, textStyleAt, withTextStyleKf } from './clipKeyframes.js'
import { drawSelectionFrame } from './selectionFrame.js'

export const FONTS = [
  'Arial', 'Arial Black', 'Anton', 'Segoe UI', 'Segoe UI Black', 'Calibri', 'Bahnschrift',
  'Tahoma', 'Impact', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New',
  'Consolas', 'Trebuchet MS',
]

const base = { font: 'Arial', size: 0.009375, color: '#ffffff', bold: true, align: 'center', x: 0.5, y: 0.5, w: 0.8, border_width: 0, border_color: '#000000', shadow: false, shadow_color: '#000000', glow: false, bg: 'none', bg_opacity: 0.55, highlight_color: '#ffe566', word_fx: 'none', block_appear: 'none', inactive_opacity: 1, active_opacity: 1, opacity: 1, max_words: 8 }

// Altura de referencia para convertir px ↔ fracción (resolución máxima 9:16 = 1280)
export const FONT_SIZE_REF = 1280
export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72]

const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const TEXT_PRESETS = [
  { id: 'plain', name: 'Simple', style: { ...base } },
  { id: 'outline', name: 'Contorno', style: { ...base, border_width: 6, border_color: '#000000' } },
  { id: 'shadow', name: 'Sombra', style: { ...base, shadow: true, shadow_color: '#000000' } },
  { id: 'glow', name: 'Brillo', style: { ...base, color: '#ffffff', glow: true, shadow: true, shadow_color: '#28d0ff', border_width: 2, border_color: '#0a6b8c' } },
  { id: 'box', name: 'Fondo', style: { ...base, bg: '#111318', bg_opacity: 0.62 } },
  { id: 'impact', name: 'Impacto', style: { ...base, font: 'Impact', size: 0.11, color: '#ffe14d', border_width: 7, border_color: '#000000' } },
  { id: 'subtitle', name: 'Subtítulo', style: { ...base, size: 0.048, color: '#ffffff', border_width: 3, border_color: '#000000', bg: '#000000', bg_opacity: 0.35, y: 0.86 } },
]

export const defaultTextStyle = () => ({ ...base, preset: 'outline', border_width: 6 })
export const subtitleStyle = () => applyThemeToStyle({}, themeById('classic'))

/** Id de tema de subtítulo activo, o null si es texto común.
 *  Si el id está puesto pero el karaoke del tema fue anulado (word_fx none),
 *  no cuenta como seleccionado: un clic debe aplicar el tema, no quitarlo. */
export function selectedSubtitleThemeId(st) {
  const id = st?.theme || st?.preset
  const theme = themeById(id)
  if (!theme) return null
  if (karaokeOn(theme.style) && !karaokeOn(st)) return null
  return id
}

/** Quita el tema y deja el look de texto común, conservando posición y opacidad. */
export function clearTextTheme(current) {
  const cur = current || {}
  const plain = defaultTextStyle()
  return {
    ...plain,
    x: cur.x ?? plain.x,
    y: cur.y ?? plain.y,
    w: cur.w ?? plain.w,
    size: cur.size ?? plain.size,
    opacity: cur.opacity ?? 1,
    max_words: cur.max_words ?? plain.max_words,
  }
}

/** Clic en un tema: aplica; clic otra vez en el mismo: lo quita. */
export function applyOrClearTheme(current, theme) {
  if (theme && selectedSubtitleThemeId(current) === theme.id) return clearTextTheme(current)
  if (!theme) return clearTextTheme(current)
  return applyThemeToStyle(current, theme)
}

const FONT_CSS = {
  'Arial': 'Arial, sans-serif',
  'Arial Black': '"Arial Black", Arial, sans-serif',
  'Anton': 'Anton, sans-serif',
  'Segoe UI': '"Segoe UI", sans-serif',
  'Segoe UI Black': '"Segoe UI Black", "Arial Black", sans-serif',
  'Calibri': 'Calibri, "Segoe UI", sans-serif',
  'Bahnschrift': 'Bahnschrift, "Segoe UI", sans-serif',
  'Tahoma': 'Tahoma, sans-serif',
  'Impact': 'Impact, "Arial Black", sans-serif',
  'Georgia': 'Georgia, serif',
  'Verdana': 'Verdana, sans-serif',
  'Times New Roman': '"Times New Roman", serif',
  'Courier New': '"Courier New", monospace',
  'Consolas': 'Consolas, monospace',
  'Trebuchet MS': '"Trebuchet MS", sans-serif',
}
export const cssFont = (name) => FONT_CSS[name] || 'Arial, sans-serif'

/** `font` del canvas con Diseño (B / I) de CapCut. */
export const fontString = (st, px) => `${st?.italic ? 'italic ' : ''}${st?.bold ? 'bold ' : ''}${px}px ${cssFont(st?.font)}`

/** May./min. de CapCut (TT, tt, Tt): solo cambia cómo se ve. Espejo de
 *  apply_text_case (backend/app/text_ass.py). */
export function applyTextCase(text, mode) {
  const t = text || ''
  if (mode === 'upper') return t.toUpperCase()
  if (mode === 'lower') return t.toLowerCase()
  if (mode === 'title') return t.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  return t
}

// Estilo preestablecido (la rejilla "Aa" de CapCut): solo el aspecto (color,
// trazo, fondo, sombra, brillo); no toca tamaño, fuente ni posición.
export const LOOK_KEYS = ['color', 'border_width', 'border_color', 'bg', 'bg_opacity', 'shadow', 'shadow_color', 'glow', 'glow_color']
const LOOK_BASE = {
  color: '#ffffff', border_width: 0, border_color: '#000000', bg: 'none', bg_opacity: 1,
  shadow: false, shadow_color: '#000000', glow: false, glow_color: '#ffffff',
}
const look = (id, patch) => ({ id, style: { ...LOOK_BASE, ...patch } })
export const TEXT_LOOKS = [
  look('white-black', { border_width: 5 }),
  look('black-white', { color: '#000000', border_width: 5, border_color: '#ffffff' }),
  look('white-shadow', { shadow: true }),
  look('white-bold-shadow', { border_width: 4, shadow: true }),
  look('yellow-black', { color: '#ffe600', border_width: 5 }),
  look('red-white', { color: '#ff2d2d', border_width: 5, border_color: '#ffffff' }),
  look('orange-white', { color: '#ff8a00', border_width: 5, border_color: '#ffffff' }),
  look('blue-white', { color: '#2d8cff', border_width: 5, border_color: '#ffffff' }),
  look('green-black', { color: '#33ff33', border_width: 5 }),
  look('black-grey', { color: '#000000', bg: '#9a9a9a' }),
  look('white-grey', { bg: '#9a9a9a' }),
  look('black-yellow', { color: '#000000', bg: '#ffd400' }),
  look('white-purple', { bg: '#7b2ff7' }),
  look('purple-white', { color: '#7b2ff7', bg: '#ffffff' }),
  look('black-white-box', { color: '#000000', bg: '#ffffff' }),
  look('white-black-box', { bg: '#000000' }),
  look('green-black-box', { color: '#33ff33', bg: '#000000' }),
  look('black-green-glow', { color: '#000000', glow: true, glow_color: '#33ff33' }),
  look('orange-glow', { color: '#ffb000', border_width: 3, border_color: '#7a2d00' }),
  look('pink-white', { color: '#ff3d7f', border_width: 5, border_color: '#ffffff' }),
  look('white-yellow-glow', { glow: true, glow_color: '#ffd400' }),
  look('white-green-glow', { glow: true, glow_color: '#33ff66' }),
]

/** Patch que aplica un estilo preestablecido (o null = "Ninguno": texto liso). */
export function lookPatch(lk) {
  return { ...LOOK_BASE, ...(lk?.style || {}) }
}

/** Id del estilo preestablecido que coincide con el texto ('none' = liso), o null. */
export function activeLookId(st) {
  const s = st || {}
  const same = (ref) => LOOK_KEYS.every((k) => {
    const a = s[k] ?? LOOK_BASE[k]
    const b = ref[k]
    if (k === 'bg') return (a || 'none') === (b || 'none')
    if (k === 'bg_opacity' && (ref.bg || 'none') === 'none') return true
    if (k === 'shadow_color' && !ref.shadow) return true
    if (k === 'glow_color') return !ref.glow || glowColor(s).toLowerCase() === String(b).toLowerCase()
    return typeof b === 'string' ? String(a).toLowerCase() === b.toLowerCase() : Number(a) === Number(b) || a === b
  })
  if (same(LOOK_BASE)) return 'none'
  return TEXT_LOOKS.find((lk) => same(lk.style))?.id || null
}

/** Estilo CSS de la miniatura "Aa" de un estilo preestablecido. */
export function lookPreviewStyle(lk) {
  const s = lk?.style || LOOK_BASE
  const hasBg = s.bg && s.bg !== 'none'
  const stroke = s.border_width ? `${Math.min(2, s.border_width / 2.5)}px ${s.border_color}` : undefined
  return {
    color: s.color,
    background: hasBg ? s.bg : undefined,
    WebkitTextStroke: stroke,
    paintOrder: 'stroke fill',
    textShadow: s.glow ? `0 0 6px ${glowColor(s)}, 0 0 10px ${glowColor(s)}` : s.shadow ? '2px 2px 2px rgba(0,0,0,0.85)' : undefined,
  }
}

/** Estilo CSS de la miniatura "Aa" de un tema de subtítulos (tarjetas de temas y favoritos). */
export function themePreviewStyle(theme) {
  const s = theme.style || {}
  return {
    fontFamily: cssFont(s.font),
    fontWeight: s.bold ? 800 : 600,
    color: s.color,
    background: s.bg && s.bg !== 'none' ? s.bg : 'transparent',
    textShadow: s.glow
      ? `0 0 8px ${glowColor(s)}`
      : s.border_width
        ? `0 1px 0 ${s.border_color || '#000'}, 0 -1px 0 ${s.border_color || '#000'}, 1px 0 0 ${s.border_color || '#000'}, -1px 0 0 ${s.border_color || '#000'}`
        : 'none',
  }
}

/** Estilo efectivo de un text clip: la pista aporta la base y el clip la
 *  sobre-escribe campo a campo. Espejo de effective_text_style (backend).
 *  Cubre apariencia, opacidad, word_fx y max_words de forma uniforme. */
export function effectiveTextStyle(trackStyle, clipStyle) {
  return { ...(trackStyle || {}), ...(clipStyle || {}) }
}

const CUSTOM_FONTS = ['Anton']

/** Carga las fuentes embebidas para que el canvas las pinte de verdad (no un sustituto). */
export function ensureEditorFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve()
  return Promise.all(CUSTOM_FONTS.map((f) => document.fonts.load(`64px "${f}"`)))
}

// Divide el texto en líneas ajustadas al ancho máximo (respeta saltos del usuario).
export function wrapLines(ctx, text, maxW) {
  const out = []
  for (const para of (text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { out.push(''); continue }
    let line = words[0]
    for (let i = 1; i < words.length; i++) {
      if (ctx.measureText(`${line} ${words[i]}`).width <= maxW) line += ` ${words[i]}`
      else { out.push(line); line = words[i] }
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

function wrapWordRows(ctx, text, maxW) {
  const rows = []
  for (const para of (text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { rows.push([]); continue }
    let row = [words[0]]
    for (let i = 1; i < words.length; i++) {
      if (ctx.measureText(`${row.join(' ')} ${words[i]}`).width <= maxW) row.push(words[i])
      else { rows.push(row); row = [words[i]] }
    }
    rows.push(row)
  }
  return rows.length ? rows : [[]]
}

// Devuelve el texto ajustado a la caja, con saltos '\n' (para el render de export).
export function wrappedText(ctx, clip, outW, outH) {
  const st = clip.style || {}
  const size = Math.max(10, (st.size ?? 0.07) * outH)
  ctx.font = fontString(st, size)
  applyLetterSpacing(ctx, st, size)
  const maxW = clampN(st.w ?? 0.8, 0.1, 1) * outW - size * 0.4
  return wrapLines(ctx, applyTextCase(clip.text, st.text_case), maxW).join('\n')
}

function reduceMotionOn() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// Espaciado entre letras (em) e interlineado (× tamaño de letra), #6. Espejo de
// LETTER_SPACING_RANGE / LINE_HEIGHT_* en backend/app/text_ass.py.
export const LETTER_SPACING_RANGE = [-0.5, 1]
export const LINE_HEIGHT_DEFAULT = 1.22
export const LINE_HEIGHT_RANGE = [0.6, 3]

export function letterSpacingPx(st, size) {
  const v = Number(st?.letter_spacing)
  return clampN(Number.isFinite(v) ? v : 0, LETTER_SPACING_RANGE[0], LETTER_SPACING_RANGE[1]) * size
}

export function lineHeightOf(st) {
  const v = Number(st?.line_height)
  return clampN(Number.isFinite(v) ? v : LINE_HEIGHT_DEFAULT, LINE_HEIGHT_RANGE[0], LINE_HEIGHT_RANGE[1])
}

// `letterSpacing` del canvas (Chrome 99+): también cuenta en measureText, así que
// el reparto en líneas lo tiene en cuenta (como el export).
function applyLetterSpacing(ctx, st, size) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacingPx(st, size)}px`
}

// Sombra paralela del texto (estilo CapCut). Distancia y desenfoque en "em"
// (fracción del tamaño de letra), ángulo en grados: 0 = derecha, 90 = abajo.
export const SHADOW_DEFAULTS = { opacity: 0.6, blur: 0.05, distance: 0.06, angle: 45 }

/** Parámetros de la sombra para un tamaño de letra en px, o null si no hay.
 *  El "Brillo" (glow) usa el mismo color y tiene su propio dibujo, así que con
 *  glow no hay sombra paralela. Espejo de text_shadow (backend/app/text_ass.py). */
// Brillo (CapCut): halo = silueta desenfocada DEBAJO del texto, en su color.
// Espejo de GLOW_DEFAULTS / text_glow (backend/app/text_ass.py).
export const GLOW_DEFAULTS = { intensity: 0.9, range: 0.5 }
const GLOW_SIGMA_MAX = 0.5
const GLOW_SPREAD = 0.08

/** Color del Brillo: el suyo; si no, el de la sombra (textos anteriores). */
export function glowColor(st) {
  return st?.glow_color || st?.shadow_color || '#ffffff'
}

export function textGlow(st, fontPx) {
  if (!st?.glow) return null
  const n = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d)
  const opacity = clampN(n(st.glow_intensity, GLOW_DEFAULTS.intensity), 0, 1)
  if (opacity <= 0) return null
  return {
    color: glowColor(st),
    opacity,
    dx: clampN(n(st.glow_dx, 0), -1, 1) * fontPx,
    dy: -clampN(n(st.glow_dy, 0), -1, 1) * fontPx || 0,
    sigma: clampN(n(st.glow_range, GLOW_DEFAULTS.range), 0, 1) * GLOW_SIGMA_MAX * fontPx,
    spread: st.glow_style === 'strong' ? GLOW_SPREAD * fontPx : 0,
  }
}

export function textShadow(st, fontPx) {
  if (st?.glow) return textGlow(st, fontPx)
  if (!st?.shadow) return null
  const n = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d)
  const opacity = clampN(n(st.shadow_opacity, SHADOW_DEFAULTS.opacity), 0, 1)
  if (opacity <= 0) return null
  const dist = clampN(n(st.shadow_distance, SHADOW_DEFAULTS.distance), 0, 1) * fontPx
  const ang = (n(st.shadow_angle, SHADOW_DEFAULTS.angle) * Math.PI) / 180
  return {
    color: st.shadow_color || '#000000',
    opacity,
    dx: Math.cos(ang) * dist,
    dy: Math.sin(ang) * dist,
    sigma: clampN(n(st.shadow_blur, SHADOW_DEFAULTS.blur), 0, 1) * fontPx,
  }
}

let _shadowLayer = null
function shadowLayer(w, h) {
  if (typeof document === 'undefined' || !w || !h) return null
  if (!_shadowLayer) _shadowLayer = document.createElement('canvas')
  if (_shadowLayer.width !== w) _shadowLayer.width = w
  if (_shadowLayer.height !== h) _shadowLayer.height = h
  return _shadowLayer
}

// Silueta del texto (relleno + borde) en el color de la sombra, en una capa
// aparte para que borde y relleno no se sumen, y luego desenfocada y desplazada.
// Desplazamiento y desenfoque van en espacio de PANTALLA (como libass en el
// export): pasan por la transformación de ENTRADA (encuadre/zoom del lienzo),
// no por el giro del texto.
function drawTextShadow(ctx, entry, placed, st, sh) {
  const layer = shadowLayer(ctx.canvas?.width, ctx.canvas?.height)
  if (!layer || !entry) return
  const l = layer.getContext('2d')
  l.setTransform(1, 0, 0, 1, 0, 0)
  l.clearRect(0, 0, layer.width, layer.height)
  l.setTransform(ctx.getTransform())
  l.font = ctx.font
  if ('letterSpacing' in ctx) l.letterSpacing = ctx.letterSpacing
  l.textBaseline = 'middle'
  l.textAlign = 'left'
  l.fillStyle = sh.color
  l.strokeStyle = sh.color
  l.lineJoin = 'round'
  const bw = (st.border_width || 0) + (sh.spread || 0)
  for (const p of placed) {
    if (bw > 0) { l.lineWidth = bw * 2; textRun(l, p.w, p.x, p.y, p.glyphs, true) }
    textRun(l, p.w, p.x, p.y, p.glyphs, false)
    if (p.ul) l.fillRect(p.x, p.y + p.ul.dy, p.ul.w, p.ul.h)
  }
  const dx = entry.a * sh.dx + entry.c * sh.dy
  const dy = entry.b * sh.dx + entry.d * sh.dy
  const k = Math.sqrt(Math.abs(entry.a * entry.d - entry.b * entry.c)) || 1
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha *= sh.opacity
  ctx.filter = sh.sigma * k > 0.3 ? `blur(${(sh.sigma * k).toFixed(2)}px)` : 'none'
  ctx.drawImage(layer, dx, dy)
  ctx.restore()
}

// Subrayado (Diseño U): bajo la palabra y el espacio que la sigue en su línea,
// del color de la palabra, como libass (el espacio es del mismo tramo de texto).
// Posición y grosor de la línea de Arial: 0,106 y 0,073 em bajo la línea base.
function underlineOf(ctx, st, size) {
  if (!st.underline) return null
  const base = -(ctx.measureText('H').alphabeticBaseline ?? -0.28 * size)
  const h = Math.max(1, size * 0.073)
  return { dy: base + size * 0.106 - h / 2, h }
}

// Curva (CapCut): Fuerza −1…1 (−100…100); positivo hacia arriba (∩), negativo hacia
// abajo (∪). Las líneas van en arcos concéntricos; la central, de radio tal que la
// línea más ancha ocupa |fuerza| · π. Con Fondo no hay curva. Espejo de
// text_ass.curve_of / curve_glyphs.
export const CURVE_MAX_ANGLE = Math.PI

/** Escala X / Y del texto sobre su Escala (Escala uniforme apagada). Espejo de text_ass.stretch_of. */
export function stretchOf(st) {
  if (!st?.scale_split) return [1, 1]
  const n = (v) => clampN(Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 1, 0.01, 100)
  return [n(st.stretch_x), n(st.stretch_y)]
}

export function curveOf(st) {
  if (!st?.curve_on || (st.bg && st.bg !== 'none')) return 0
  const k = clampN(Number(st.curve) || 0, -1, 1)
  return Math.abs(k) < 0.005 ? 0 : k
}

/** Letras de cada palabra sobre su arco: añade `glyphs` [{ch, w, x, y, rot}] a `placed`. */
export function bendPlaced(ctx, placed, k, widest, cy) {
  const R = Math.max(1, widest) / (Math.max(Math.abs(k), 0.005) * CURVE_MAX_ANGLE)
  const sign = k >= 0 ? 1 : -1
  for (const p of placed) {
    const r = Math.max(1, R - sign * (p.y - cy))
    let cur = p.x
    p.glyphs = [...p.w].map((ch) => {
      const a = ctx.measureText(ch).width
      const phi = (cur + a / 2 - p.mid) / r
      cur += a
      return { ch, w: a, x: p.mid + r * Math.sin(phi), y: cy + sign * R - sign * r * Math.cos(phi), rot: sign * phi }
    })
    p.ul = null
  }
}

// Palabra recta (strokeText / fillText) o letra a letra sobre la curva.
function textRun(ctx, word, x, y, glyphs, stroke) {
  if (!glyphs) {
    if (stroke) ctx.strokeText(word, x, y)
    else ctx.fillText(word, x, y)
    return
  }
  for (const g of glyphs) {
    ctx.save()
    ctx.translate(g.x, g.y)
    ctx.rotate(g.rot)
    if (stroke) ctx.strokeText(g.ch, -g.w / 2, 0)
    else ctx.fillText(g.ch, -g.w / 2, 0)
    ctx.restore()
  }
}

function paintWord(ctx, word, x, y, size, st, active, motionOff, ul, glyphs) {
  const w = ctx.measureText(word).width
  const cx = x + w / 2
  const pop = active && hasWordFx(st, 'pop') && !motionOff
  const wo = wordOpacity(st, active)
  ctx.save()
  ctx.globalAlpha *= wo
  if (pop) {
    ctx.translate(cx, y)
    ctx.scale(1.14, 1.14)
    ctx.translate(-cx, -y)
  }
  const fill = (active && karaokeOn(st) && st.highlight_color) || st.color || '#fff'
  const glowWord = active && hasWordFx(st, 'glow')
  // Sombra y Brillo van en su propia pasada (drawTextShadow); aquí solo el brillo
  // de la palabra activa (karaoke).
  if (glowWord) {
    ctx.shadowColor = st.highlight_color || glowColor(st)
    ctx.shadowBlur = size * 0.7
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
  if ((st.border_width || 0) > 0) {
    ctx.lineWidth = st.border_width * 2
    ctx.strokeStyle = st.border_color || '#000'
    ctx.lineJoin = 'round'
    textRun(ctx, word, x, y, glyphs, true)
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
  ctx.fillStyle = fill
  textRun(ctx, word, x, y, glyphs, false)
  if (ul) ctx.fillRect(x, y + ul.dy, ul.w, ul.h)
  ctx.restore()
  return w
}

// Fondo completo (CapCut): Alto / Ancho = margen extra en em; Desplazamiento en em.
export const BG_PAD_MAX = 1
export const BG_SHIFT_MAX = 1
const numOr = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d)

/**
 * Cajas de Fondo (espejo de text_ass.box_rects). `rows` = [{x: inicio, w, y: centro}]
 * de cada línea; `lineBox` = alto de la fuente (ascendente + descendente). Una caja
 * por línea o una para el bloque, más el contorno (como libass), el margen de Alto /
 * Ancho y el desplazamiento (Y hacia arriba, como CapCut).
 */
export function bgRects(rows, st, size, lineBox) {
  let rects = rows.filter((r) => r.w > 0).map((r) => ({ x: r.x, y: r.y - lineBox / 2, w: r.w, h: lineBox }))
  if (!rects.length) return []
  if (st.bg_style === 'block') {
    const x0 = Math.min(...rects.map((r) => r.x))
    const x1 = Math.max(...rects.map((r) => r.x + r.w))
    const y0 = Math.min(...rects.map((r) => r.y))
    const y1 = Math.max(...rects.map((r) => r.y + r.h))
    rects = [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }]
  }
  const pad0 = Math.max(0, numOr(st.border_width, 0))
  const px = pad0 + clampN(numOr(st.bg_pad_x, 0), 0, BG_PAD_MAX) * size
  const py = pad0 + clampN(numOr(st.bg_pad_y, 0), 0, BG_PAD_MAX) * size
  const dx = clampN(numOr(st.bg_dx, 0), -BG_SHIFT_MAX, BG_SHIFT_MAX) * size
  const dy = -clampN(numOr(st.bg_dy, 0), -BG_SHIFT_MAX, BG_SHIFT_MAX) * size
  return rects.map((r) => ({ x: r.x - px + dx, y: r.y - py + dy, w: r.w + 2 * px, h: r.h + 2 * py }))
}

function drawRowBoxes(ctx, rows, st, size) {
  const m = ctx.measureText('Hg')
  const lineBox = (m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? 0)
    + (m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 0)
  const radius = clampN(numOr(st.bg_radius, 0), 0, 1)
  ctx.save()
  ctx.globalAlpha *= st.bg_opacity ?? 0.55
  ctx.fillStyle = st.bg
  for (const r of bgRects(rows, st, size, lineBox)) {
    const rad = radius * Math.min(r.w, r.h) / 2
    ctx.beginPath()
    if (rad > 0 && ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, rad)
    else ctx.rect(r.x, r.y, r.w, r.h)
    ctx.fill()
  }
  ctx.restore()
}

// Dibuja el texto (con wrap) en el canvas. Devuelve caja y manijas en píxeles.
export function drawTextClip(ctx, clip, cw, ch, opts = {}) {
  // Con opts.trackStyle, el estilo hereda de la pista (clip = override); si no,
  // usa el estilo del clip tal cual (retrocompatible).
  const st0 = opts.trackStyle ? effectiveTextStyle(opts.trackStyle, clip.style) : (clip.style || {})
  const entry = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  const localT = opts.time == null ? 0 : opts.time - (clip.start || 0)
  const pose = clipPose(clip, localT)
  // Color, Trazo, Fondo y Sombra con keyframes (espejo de text_ass._posed_style).
  const st = {
    ...withTextStyleKf(st0, textStyleAt(clip, localT)),
    x: pose.x,
    y: pose.y,
    opacity: keyframesEnabled(clip) ? pose.opacity : styleOpacity(st0),
    size: (st0.size ?? 0.07) * (pose.scale || 1),
    rotation: pose.rotation,
  }
  const size = Math.max(10, (st.size ?? 0.07) * ch)
  const align = st.align || 'center'
  const dur = Math.max(0.01, (clip.out_point ?? 0) - (clip.in_point ?? 0))
  const motionOff = opts.reduceMotion ?? reduceMotionOn()
  const skipBlock = motionOff || opts.selected
  // "Typing": revela el texto carácter a carácter durante todo el clip. Al
  // estar seleccionado o con reduce-motion se muestra completo (skipBlock).
  const typing = st.block_appear === 'typing' && !skipBlock
  const fullText = applyTextCase(clip.text, st.text_case)
  const shownText = typing ? typingReveal(fullText, Math.max(0, localT) / dur) : fullText
  const karaoke = karaokeOn(st) && !typing

  ctx.save()
  ctx.globalAlpha *= styleOpacity(st)
  ctx.font = fontString(st, size)
  applyLetterSpacing(ctx, st, size)
  ctx.textBaseline = 'middle'

  // La escala agranda el texto ENTERO, caja de ajuste incluida (como CapCut): al
  // escalar no cambia el reparto en líneas. Espejo de text_ass._rows (export).
  const boxW = clampN(st.w ?? 0.8, 0.1, 1) * cw * (pose.scale || 1)
  const maxW = boxW - size * 0.4
  const rows = wrapWordRows(ctx, shownText, maxW)
  const lineH = size * lineHeightOf(st)
  const blockH = Math.max(lineH, rows.length * lineH)
  const cx = (st.x ?? 0.5) * cw
  const cy = (st.y ?? 0.5) * ch
  const boxLeft = cx - boxW / 2
  const boxTop = cy - blockH / 2

  const blockFx = skipBlock
    ? { opacity: 1, scale: 1, tx: 0, ty: 0 }
    : clipFxAt({ appear: st.block_appear || 'none', exit: 'none' }, Math.max(0, localT), dur)
  ctx.globalAlpha *= blockFx.opacity
  ctx.translate(cx, cy)
  if (st.rotation) ctx.rotate((Number(st.rotation) || 0) * Math.PI / 180)
  // Escala X / Y (Escala uniforme apagada): estira el texto en sus ejes.
  const [sx, sy] = stretchOf(st)
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
  ctx.scale(blockFx.scale, blockFx.scale)
  ctx.translate(blockFx.tx * size * 2.2, blockFx.ty * size * 2.6)
  ctx.translate(-cx, -cy)

  const words = rows.flat()
  // Con words[] reales alineadas al texto, el karaoke usa esas marcas (igual que
  // el export); si no, cae al reparto uniforme por posición.
  const realWords = Array.isArray(clip.words) && clip.words.length === words.length
  const active = karaoke
    ? (realWords ? activeWordIndexFromWords(clip.words, localT) : activeWordIndex(words.length, localT, dur))
    : -1

  ctx.textAlign = 'left'
  let gi = 0
  const space = ctx.measureText(' ').width
  const underline = underlineOf(ctx, st, size)
  const placed = []
  const rowBoxes = []
  let widest = 0
  rows.forEach((row, i) => {
    const ly = boxTop + lineH * (i + 0.5)
    const total = row.reduce((acc, w, n) => acc + ctx.measureText(w).width + (n ? space : 0), 0)
    widest = Math.max(widest, total)
    let x = align === 'left' ? boxLeft + size * 0.2 : align === 'right' ? boxLeft + boxW - size * 0.2 - total : cx - total / 2
    rowBoxes.push({ x, w: total, y: ly })
    const mid = x + total / 2
    row.forEach((w, n) => {
      const ww = ctx.measureText(w).width
      const ul = underline && { ...underline, w: ww + (n < row.length - 1 ? space : 0) }
      placed.push({ w, x, y: ly, mid, active: karaoke && gi === active, ul })
      x += ww + space
      gi += 1
    })
  })
  const bend = curveOf(st)
  if (bend) bendPlaced(ctx, placed, bend, widest, cy)
  // Voltear (#7): espejo alrededor del centro del bloque, en sus ejes (después del
  // giro). Solo el dibujo: la caja de selección y los tiradores no se voltean.
  const flip = clipFlip(clip)
  const flipped = flip.h || flip.v
  if (flipped) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(flip.h ? -1 : 1, flip.v ? -1 : 1)
    ctx.translate(-cx, -cy)
  }
  // Orden como en el export: sombra (evento de capa inferior), caja y texto.
  // `selectionOnly`: solo la caja de selección (el texto va en una capa aparte).
  if (!opts.selectionOnly) {
    const shadow = textShadow(st, size)
    if (shadow) drawTextShadow(ctx, entry, placed, st, shadow)
    if (st.bg && st.bg !== 'none') drawRowBoxes(ctx, rowBoxes, st, size)
    for (const p of placed) paintWord(ctx, p.w, p.x, p.y, size, st, p.active, motionOff, p.ul, p.glyphs)
  }
  if (flipped) ctx.restore()

  // Como CapCut, el recuadro se ciñe al texto; alineado a un lado es la caja de ajuste
  // (la alineación se ve respecto a ella).
  const frameW = align === 'center' ? Math.min(boxW, widest + size * 0.4) : boxW
  // Con Curva el recuadro crece (simétrico, para girar con el texto) hasta cubrir el arco.
  const bent = bend ? placed.flatMap((p) => p.glyphs.map((g) => Math.abs(g.y - cy))) : []
  const frameH = Math.max(blockH, bent.length ? 2 * Math.max(...bent) + lineH : 0)
  const box = { x: cx - frameW * sx / 2, y: cy - frameH * sy / 2, w: frameW * sx, h: frameH * sy, rotation: Number(st.rotation) || 0 }
  ctx.restore()
  // `frame: false`: seleccionado (texto completo) pero el recuadro lo pinta quien llama.
  if (opts.selected && opts.frame !== false) {
    // Recuadro de CapCut: × borra, esquinas escalan, laterales cambian el ancho, giro debajo.
    const handles = drawSelectionFrame(ctx, { cx, cy, w: frameW * sx, h: frameH * sy + 8, rotation: box.rotation }, { del: true, sides: true })
    return { box, handles }
  }
  return { box, handles: null }
}
