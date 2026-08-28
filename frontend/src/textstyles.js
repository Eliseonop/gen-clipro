// Estilos de texto y dibujo del texto sobre canvas (previsualización).
// Las medidas son relativas al alto de salida: size = fracción de la altura.
// x/y son el centro del texto en coordenadas normalizadas (0-1) de la salida.

export const FONTS = ['Arial', 'Arial Black', 'Impact', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Trebuchet MS']

const base = { font: 'Arial', size: 0.07, color: '#ffffff', bold: true, align: 'center', x: 0.5, y: 0.5, w: 0.8, border_width: 0, border_color: '#000000', shadow: false, shadow_color: '#000000', glow: false, bg: 'none', bg_opacity: 0.55 }

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
export const subtitleStyle = () => ({ ...TEXT_PRESETS.find((p) => p.id === 'subtitle').style, preset: 'subtitle' })

const FONT_CSS = {
  'Arial': 'Arial, sans-serif',
  'Arial Black': '"Arial Black", Arial, sans-serif',
  'Impact': 'Impact, "Arial Black", sans-serif',
  'Georgia': 'Georgia, serif',
  'Verdana': 'Verdana, sans-serif',
  'Times New Roman': '"Times New Roman", serif',
  'Courier New': '"Courier New", monospace',
  'Comic Sans MS': '"Comic Sans MS", cursive',
  'Trebuchet MS': '"Trebuchet MS", sans-serif',
}
export const cssFont = (name) => FONT_CSS[name] || 'Arial, sans-serif'

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

// Devuelve el texto ajustado a la caja, con saltos '\n' (para el render de export).
export function wrappedText(ctx, clip, outW, outH) {
  const st = clip.style || {}
  const size = Math.max(10, (st.size ?? 0.07) * outH)
  ctx.font = `${st.bold ? 'bold ' : ''}${size}px ${cssFont(st.font)}`
  const maxW = clampN(st.w ?? 0.8, 0.1, 1) * outW - size * 0.4
  return wrapLines(ctx, clip.text || '', maxW).join('\n')
}

// Dibuja el texto (con wrap) en el canvas. Devuelve caja y manijas en píxeles.
export function drawTextClip(ctx, clip, cw, ch, opts = {}) {
  const st = clip.style || {}
  const size = Math.max(10, (st.size ?? 0.07) * ch)
  const align = st.align || 'center'
  ctx.save()
  ctx.font = `${st.bold ? 'bold ' : ''}${size}px ${cssFont(st.font)}`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'

  const boxW = clampN(st.w ?? 0.8, 0.1, 1) * cw
  const maxW = boxW - size * 0.4
  const lines = wrapLines(ctx, clip.text || '', maxW)
  const lineH = size * 1.22
  const blockH = lines.length * lineH
  const cx = (st.x ?? 0.5) * cw
  const cy = (st.y ?? 0.5) * ch
  const boxLeft = cx - boxW / 2
  const boxTop = cy - blockH / 2
  const anchorX = align === 'left' ? boxLeft + size * 0.2 : align === 'right' ? boxLeft + boxW - size * 0.2 : cx

  if (st.bg && st.bg !== 'none') {
    ctx.globalAlpha = st.bg_opacity ?? 0.55
    ctx.fillStyle = st.bg
    ctx.fillRect(boxLeft, boxTop - size * 0.15, boxW, blockH + size * 0.3)
    ctx.globalAlpha = 1
  }

  lines.forEach((ln, i) => {
    const ly = boxTop + lineH * (i + 0.5)
    if (st.shadow || st.glow) {
      ctx.shadowColor = st.shadow_color || 'rgba(0,0,0,0.7)'
      ctx.shadowBlur = st.glow ? size * 0.6 : size * 0.14
      ctx.shadowOffsetX = st.glow ? 0 : 2
      ctx.shadowOffsetY = st.glow ? 0 : 2
    }
    if ((st.border_width || 0) > 0) {
      ctx.lineWidth = st.border_width * 2
      ctx.strokeStyle = st.border_color || '#000'
      ctx.lineJoin = 'round'
      ctx.strokeText(ln, anchorX, ly)
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
    ctx.fillStyle = st.color || '#fff'
    ctx.fillText(ln, anchorX, ly)
  })

  const box = { x: boxLeft, y: boxTop, w: boxW, h: blockH }
  if (opts.selected) {
    ctx.strokeStyle = 'rgba(120,190,255,0.95)'
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5
    ctx.strokeRect(boxLeft, boxTop - 4, boxW, blockH + 8)
    ctx.setLineDash([])
    // manijas: izquierda, derecha (ancho) y esquina inferior derecha (tamaño)
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
