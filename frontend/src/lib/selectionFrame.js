// Recuadro de selección como CapCut: marco blanco fino, círculos en las esquinas,
// barritas en los laterales, × para borrar (textos) y el giro DEBAJO del recuadro.
// La geometría (frameHandles) es la misma que usa el puntero para acertar.

export const ROT_GAP = 26
export const HANDLE_PAD = 12

const CORNER_R = 5.5
const DEL_R = 8
const ROT_R = 9
const PILL_LONG = 15
const PILL_SHORT = 4.5

/**
 * Tiradores de un recuadro centrado en (cx, cy) de `w`×`h` px girado `rotation`°.
 * `del`: la esquina superior izquierda es la × de borrar (texto, como CapCut).
 * `sides`: barritas izquierda/derecha (ancho); `tb`: arriba/abajo (alto).
 */
export function frameHandles({ cx, cy, w, h, rotation = 0 }, { del = false, sides = false, tb = false } = {}) {
  const a = (Number(rotation) || 0) * Math.PI / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const at = (lx, ly) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c })
  const hw = w / 2
  const hh = h / 2
  return {
    ...(del ? { del: at(-hw, -hh) } : { tl: at(-hw, -hh) }),
    tr: at(hw, -hh),
    bl: at(-hw, hh),
    br: at(hw, hh),
    ...(sides ? { l: at(-hw, 0), r: at(hw, 0) } : {}),
    ...(tb ? { t: at(0, -hh), b: at(0, hh) } : {}),
    rot: at(0, hh + ROT_GAP),
  }
}

/** Primer tirador de `order` que cae bajo el puntero (o null). */
export function handleAt(px, py, handles, order, pad = HANDLE_PAD) {
  if (!handles) return null
  for (const k of order) {
    const h = handles[k]
    if (h && Math.abs(px - h.x) < pad && Math.abs(py - h.y) < pad) return k
  }
  return null
}

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']
// Eje de cada tirador en grados de pantalla (y hacia abajo), sin giro.
const HANDLE_AXIS = { tl: 45, br: 45, tr: 135, bl: 135, l: 0, r: 0, t: 90, b: 90 }

const ROTATE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>"
  + "<g fill='none' stroke-linecap='round' stroke-linejoin='round'>"
  + "<path d='M5.5 12a6.5 6.5 0 1 1 6.5 6.5M11 18.5l2.8-2.7M11 18.5l2.8 2.7' stroke='#fff' stroke-width='4'/>"
  + "<path d='M5.5 12a6.5 6.5 0 1 1 6.5 6.5M11 18.5l2.8-2.7M11 18.5l2.8 2.7' stroke='#111' stroke-width='1.8'/>"
  + '</g></svg>'
export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 12 12, grab`

/** Flecha de redimensionar (↔ ↘ ↕ ↙) más cercana a un eje de `deg` grados. */
export function resizeCursor(deg) {
  const a = (((Number(deg) || 0) % 180) + 180) % 180
  return RESIZE_CURSORS[Math.round(a / 45) % 4]
}

/** Cursor de un tirador del recuadro girado `rotation`° (null si no es un tirador). */
export function handleCursor(key, rotation = 0) {
  if (key === 'rot') return ROTATE_CURSOR
  if (key === 'del') return 'pointer'
  const base = HANDLE_AXIS[key]
  return base == null ? null : resizeCursor(base + (Number(rotation) || 0))
}

/** Recuadro en px a partir de una caja {dx,dy,dw,dh,rotation}. */
export function frameOfDest(d) {
  return { cx: d.dx + d.dw / 2, cy: d.dy + d.dh / 2, w: d.dw, h: d.dh, rotation: d.rotation || 0 }
}

function pill(ctx, x, y, vertical) {
  const w = vertical ? PILL_SHORT : PILL_LONG
  const h = vertical ? PILL_LONG : PILL_SHORT
  const r = PILL_SHORT / 2
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, r)
  else ctx.rect(x - w / 2, y - h / 2, w, h)
  ctx.fill()
}

function dot(ctx, x, y, r) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function deleteButton(ctx, x, y) {
  ctx.fillStyle = '#cfd1d6'
  dot(ctx, x, y, DEL_R)
  ctx.shadowBlur = 0
  const k = DEL_R * 0.42
  ctx.strokeStyle = '#2a2c33'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k)
  ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k)
  ctx.stroke()
}

// Disco blanco con dos flechas en círculo (icono de girar).
function rotateButton(ctx, x, y) {
  ctx.fillStyle = '#fff'
  dot(ctx, x, y, ROT_R)
  ctx.shadowBlur = 0
  const ir = ROT_R - 3.6
  ctx.strokeStyle = '#22242e'
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  for (const a0 of [-Math.PI * 0.95, Math.PI * 0.05]) {
    const a1 = a0 + Math.PI * 0.72
    ctx.beginPath()
    ctx.arc(x, y, ir, a0, a1)
    ctx.stroke()
    const ax = x + ir * Math.cos(a1)
    const ay = y + ir * Math.sin(a1)
    const back = a1 - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax + 2.6 * Math.cos(back - 0.7), ay + 2.6 * Math.sin(back - 0.7))
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax + 2.6 * Math.cos(back + 0.7), ay + 2.6 * Math.sin(back + 0.7))
    ctx.stroke()
  }
}

/** Pinta el recuadro de selección y devuelve sus tiradores (coordenadas de `ctx`). */
export function drawSelectionFrame(ctx, frame, opts = {}) {
  const handles = frameHandles(frame, opts)
  const { cx, cy, w, h } = frame
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((Number(frame.rotation) || 0) * Math.PI / 180)
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 1.2
  ctx.setLineDash([])
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  // Una sombra suave los mantiene visibles sobre fondos claros sin borde de color.
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 3
  ctx.fillStyle = '#fff'
  const corners = [[w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]
  if (!opts.del) corners.push([-w / 2, -h / 2])
  for (const [x, y] of corners) dot(ctx, x, y, CORNER_R)
  if (opts.sides) { pill(ctx, -w / 2, 0, true); pill(ctx, w / 2, 0, true) }
  if (opts.tb) { pill(ctx, 0, -h / 2, false); pill(ctx, 0, h / 2, false) }
  if (opts.del) { ctx.save(); deleteButton(ctx, -w / 2, -h / 2); ctx.restore() }
  ctx.save()
  rotateButton(ctx, 0, h / 2 + ROT_GAP)
  ctx.restore()
  ctx.restore()
  return handles
}
