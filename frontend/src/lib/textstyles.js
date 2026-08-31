// Estilos de texto y dibujo del texto sobre canvas (previsualización).
// Las medidas son relativas al alto de salida: size = fracción de la altura.
// x/y son el centro del texto en coordenadas normalizadas (0-1) de la salida.

import { clipFxAt } from './clipFx.js'
import { activeWordIndex, activeWordIndexFromWords, applyThemeToStyle, hasWordFx, karaokeOn, wordOpacity } from './textKaraoke.js'
import { themeById } from './subtitleThemes.js'
import { isCaptionText } from './textRole.js'

export const FONTS = [
  'Arial', 'Arial Black', 'Anton', 'Segoe UI', 'Segoe UI Black', 'Calibri', 'Bahnschrift',
  'Tahoma', 'Impact', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New',
  'Consolas', 'Trebuchet MS',
]

const base = { font: 'Arial', size: 0.009375, color: '#ffffff', bold: true, align: 'center', x: 0.5, y: 0.5, w: 0.8, border_width: 0, border_color: '#000000', shadow: false, shadow_color: '#000000', glow: false, bg: 'none', bg_opacity: 0.55, highlight_color: '#ffe566', word_fx: 'none', block_appear: 'none', inactive_opacity: 1, active_opacity: 1, max_words: 8 }

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
  const maxW = clampN(st.w ?? 0.8, 0.1, 1) * outW - size * 0.4
  return wrapLines(ctx, clip.text || '', maxW).join('\n')
}

function reduceMotionOn() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

function paintWord(ctx, word, x, y, size, st, active, motionOff) {
  const w = ctx.measureText(word).width
  const cx = x + w / 2
  const pop = active && hasWordFx(st, 'pop') && !motionOff
  ctx.save()
  if (pop) {
    ctx.translate(cx, y)
    ctx.scale(1.14, 1.14)
    ctx.translate(-cx, -y)
  }
  ctx.globalAlpha *= wordOpacity(st, active)
  const glowWord = active && hasWordFx(st, 'glow')
  if (st.shadow || st.glow || glowWord) {
    ctx.shadowColor = (active && st.highlight_color) || st.shadow_color || 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = (st.glow || glowWord) ? size * 0.7 : size * 0.14
    ctx.shadowOffsetX = (st.glow || glowWord) ? 0 : 2
    ctx.shadowOffsetY = (st.glow || glowWord) ? 0 : 2
  }
  if ((st.border_width || 0) > 0) {
    ctx.lineWidth = st.border_width * 2
    ctx.strokeStyle = st.border_color || '#000'
    ctx.lineJoin = 'round'
    ctx.strokeText(word, x, y)
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
  ctx.fillStyle = (active && karaokeOn(st) && st.highlight_color) || st.color || '#fff'
  ctx.fillText(word, x, y)
  ctx.restore()
  return w
}

// Dibuja el texto (con wrap) en el canvas. Devuelve caja y manijas en píxeles.
export function drawTextClip(ctx, clip, cw, ch, opts = {}) {
  // Con opts.trackStyle, el estilo hereda de la pista (clip = override); si no,
  // usa el estilo del clip tal cual (retrocompatible).
  const st = opts.trackStyle ? effectiveTextStyle(opts.trackStyle, clip.style) : (clip.style || {})
  const size = Math.max(10, (st.size ?? 0.07) * ch)
  const align = st.align || 'center'
  const dur = Math.max(0.01, (clip.out_point ?? 0) - (clip.in_point ?? 0))
  const localT = opts.time == null ? 0 : opts.time - (clip.start || 0)
  const motionOff = opts.reduceMotion ?? reduceMotionOn()
  const skipBlock = motionOff || opts.selected
  const karaoke = isCaptionText(clip) && karaokeOn(st)

  ctx.save()
  ctx.font = `${st.bold ? 'bold ' : ''}${size}px ${cssFont(st.font)}`
  ctx.textBaseline = 'middle'

  const boxW = clampN(st.w ?? 0.8, 0.1, 1) * cw
  const maxW = boxW - size * 0.4
  const rows = wrapWordRows(ctx, clip.text || '', maxW)
  const lineH = size * 1.22
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
  ctx.scale(blockFx.scale, blockFx.scale)
  ctx.translate(blockFx.tx * size * 2.2, blockFx.ty * size * 2.6)
  ctx.translate(-cx, -cy)

  if (st.bg && st.bg !== 'none') {
    ctx.save()
    ctx.globalAlpha *= st.bg_opacity ?? 0.55
    ctx.fillStyle = st.bg
    ctx.fillRect(boxLeft, boxTop - size * 0.15, boxW, blockH + size * 0.3)
    ctx.restore()
  }

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
  rows.forEach((row, i) => {
    const ly = boxTop + lineH * (i + 0.5)
    const total = row.reduce((acc, w, n) => acc + ctx.measureText(w).width + (n ? space : 0), 0)
    let x = align === 'left' ? boxLeft + size * 0.2 : align === 'right' ? boxLeft + boxW - size * 0.2 - total : cx - total / 2
    row.forEach((w) => {
      const isA = karaoke && gi === active
      const ww = paintWord(ctx, w, x, ly, size, st, isA, motionOff)
      x += ww + space
      gi += 1
    })
  })

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
