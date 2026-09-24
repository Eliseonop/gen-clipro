// Estilos de texto y dibujo del texto sobre canvas (previsualización).
// Las medidas son relativas al alto de salida: size = fracción de la altura.
// x/y son el centro del texto en coordenadas normalizadas (0-1) de la salida.

import { clipFlip, clipPose } from './clipAnim.js'
import { clipFxAt, typingReveal } from './clipFx.js'
import { activeWordIndex, activeWordIndexFromWords, applyThemeToStyle, hasWordFx, karaokeOn, styleOpacity, wordOpacity } from './textKaraoke.js'
import { themeById } from './subtitleThemes.js'
import { keyframesEnabled } from './clipKeyframes.js'

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

/** Estilo CSS de la miniatura "Aa" de un tema de subtítulos (tarjetas de temas y favoritos). */
export function themePreviewStyle(theme) {
  const s = theme.style || {}
  return {
    fontFamily: cssFont(s.font),
    fontWeight: s.bold ? 800 : 600,
    color: s.color,
    background: s.bg && s.bg !== 'none' ? s.bg : 'transparent',
    textShadow: s.glow
      ? `0 0 8px ${s.shadow_color || s.highlight_color}`
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
  ctx.font = `${st.bold ? 'bold ' : ''}${size}px ${cssFont(st.font)}`
  applyLetterSpacing(ctx, st, size)
  const maxW = clampN(st.w ?? 0.8, 0.1, 1) * outW - size * 0.4
  return wrapLines(ctx, clip.text || '', maxW).join('\n')
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
export function textShadow(st, fontPx) {
  if (!st?.shadow || st?.glow) return null
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
  const bw = st.border_width || 0
  for (const p of placed) {
    if (bw > 0) { l.lineWidth = bw * 2; l.strokeText(p.w, p.x, p.y) }
    l.fillText(p.w, p.x, p.y)
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

function paintWord(ctx, word, x, y, size, st, active, motionOff) {
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
  // La sombra paralela va en su propia pasada (drawTextShadow); aquí solo el brillo.
  if (st.glow || glowWord) {
    ctx.shadowColor = (active && st.highlight_color) || st.shadow_color || '#000000'
    ctx.shadowBlur = size * 0.7
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
  if ((st.border_width || 0) > 0) {
    ctx.lineWidth = st.border_width * 2
    ctx.strokeStyle = st.border_color || '#000'
    ctx.lineJoin = 'round'
    ctx.strokeText(word, x, y)
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
  ctx.fillStyle = fill
  ctx.fillText(word, x, y)
  ctx.restore()
  return w
}

// Dibuja el texto (con wrap) en el canvas. Devuelve caja y manijas en píxeles.
export function drawTextClip(ctx, clip, cw, ch, opts = {}) {
  // Con opts.trackStyle, el estilo hereda de la pista (clip = override); si no,
  // usa el estilo del clip tal cual (retrocompatible).
  const st0 = opts.trackStyle ? effectiveTextStyle(opts.trackStyle, clip.style) : (clip.style || {})
  const entry = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  const localT = opts.time == null ? 0 : opts.time - (clip.start || 0)
  const pose = clipPose(clip, localT)
  const st = {
    ...st0,
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
  const shownText = typing ? typingReveal(clip.text || '', Math.max(0, localT) / dur) : (clip.text || '')
  const karaoke = karaokeOn(st) && !typing

  ctx.save()
  ctx.globalAlpha *= styleOpacity(st)
  ctx.font = `${st.bold ? 'bold ' : ''}${size}px ${cssFont(st.font)}`
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
  const placed = []
  rows.forEach((row, i) => {
    const ly = boxTop + lineH * (i + 0.5)
    const total = row.reduce((acc, w, n) => acc + ctx.measureText(w).width + (n ? space : 0), 0)
    let x = align === 'left' ? boxLeft + size * 0.2 : align === 'right' ? boxLeft + boxW - size * 0.2 - total : cx - total / 2
    row.forEach((w) => {
      placed.push({ w, x, y: ly, active: karaoke && gi === active })
      x += ctx.measureText(w).width + space
      gi += 1
    })
  })
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
    if (st.bg && st.bg !== 'none') {
      ctx.save()
      ctx.globalAlpha *= st.bg_opacity ?? 0.55
      ctx.fillStyle = st.bg
      ctx.fillRect(boxLeft, boxTop - size * 0.15, boxW, blockH + size * 0.3)
      ctx.restore()
    }
    for (const p of placed) paintWord(ctx, p.w, p.x, p.y, size, st, p.active, motionOff)
  }
  if (flipped) ctx.restore()

  const box = { x: boxLeft, y: boxTop, w: boxW, h: blockH }
  if (opts.selected) {
    ctx.strokeStyle = 'rgba(120,190,255,0.95)'
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5
    ctx.strokeRect(boxLeft, boxTop - 4, boxW, blockH + 8)
    ctx.setLineDash([])
    const hs = 5
    ctx.fillStyle = '#8cbeff'
    const handles = {
      l: { x: boxLeft, y: cy },
      r: { x: boxLeft + boxW, y: cy },
      br: { x: boxLeft + boxW, y: boxTop + blockH + 4 },
    }
    for (const h of Object.values(handles)) { ctx.fillRect(h.x - hs, h.y - hs, hs * 2, hs * 2) }
    ctx.restore()
    return { box, handles }
  }
  ctx.restore()
  return { box, handles: null }
}
