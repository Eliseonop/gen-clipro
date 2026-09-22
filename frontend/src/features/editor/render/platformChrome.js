// Marcos de plataforma (solo VISTA PREVIA): dibuja la interfaz de TikTok o
// YouTube Shorts encima del recuadro exportable para simular cómo se verá el
// vídeo dentro de esas apps. Es puramente visual —no se exporta— y sirve además
// de guía de zona segura: muestra qué parte del vídeo tapan los botones/textos
// de la plataforma. Vectorial (sin PNG): nítido a cualquier resolución.

export const PLATFORM_OVERLAYS = [
  { id: 'none', label: 'Sin marco' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'shorts', label: 'YouTube Shorts' },
]

export const overlayLabel = (id) =>
  PLATFORM_OVERLAYS.find((o) => o.id === id)?.label || ''

function rrect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); return }
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

// --- Glifos (centrados en cx,cy, tamaño s ≈ mitad del icono) ---
function heart(ctx, cx, cy, s) {
  const t = s * 0.95
  ctx.beginPath()
  ctx.moveTo(cx, cy + t * 0.7)
  ctx.bezierCurveTo(cx - t * 1.35, cy - t * 0.25, cx - t * 0.6, cy - t * 1.15, cx, cy - t * 0.32)
  ctx.bezierCurveTo(cx + t * 0.6, cy - t * 1.15, cx + t * 1.35, cy - t * 0.25, cx, cy + t * 0.7)
  ctx.closePath()
  ctx.fill()
}

function bubble(ctx, cx, cy, s) {
  rrect(ctx, cx - s, cy - s * 0.85, s * 2, s * 1.5, s * 0.5)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.55, cy + s * 0.5)
  ctx.lineTo(cx - s * 0.95, cy + s * 1.05)
  ctx.lineTo(cx - s * 0.1, cy + s * 0.6)
  ctx.closePath()
  ctx.fill()
}

function bookmark(ctx, cx, cy, s) {
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.72, cy - s)
  ctx.lineTo(cx + s * 0.72, cy - s)
  ctx.lineTo(cx + s * 0.72, cy + s)
  ctx.lineTo(cx, cy + s * 0.45)
  ctx.lineTo(cx - s * 0.72, cy + s)
  ctx.closePath()
  ctx.fill()
}

function shareArrow(ctx, cx, cy, s) {
  const lw = ctx.lineWidth
  ctx.beginPath()
  ctx.moveTo(cx - s, cy + s * 0.5)
  ctx.quadraticCurveTo(cx - s, cy - s * 0.5, cx + s * 0.3, cy - s * 0.55)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.1, cy - s)
  ctx.lineTo(cx + s, cy - s * 0.55)
  ctx.lineTo(cx - s * 0.1, cy - s * 0.1)
  ctx.stroke()
  ctx.lineWidth = lw
}

function thumb(ctx, cx, cy, s, down) {
  ctx.save()
  ctx.translate(cx, cy)
  if (down) ctx.rotate(Math.PI)
  rrect(ctx, -s * 0.95, s * 0.05, s * 0.5, s * 0.9, s * 0.08)
  ctx.fill()
  rrect(ctx, -s * 0.38, -s * 0.2, s * 1.15, s * 1.15, s * 0.16)
  ctx.fill()
  rrect(ctx, -s * 0.12, -s * 0.95, s * 0.5, s * 0.85, s * 0.22)
  ctx.fill()
  ctx.restore()
}

function musicNote(ctx, cx, cy, s) {
  const lw = ctx.lineWidth
  ctx.lineWidth = Math.max(1, s * 0.28)
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.35, cy + s * 0.55)
  ctx.lineTo(cx - s * 0.35, cy - s * 0.7)
  ctx.lineTo(cx + s * 0.55, cy - s)
  ctx.lineTo(cx + s * 0.55, cy + s * 0.25)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx - s * 0.6, cy + s * 0.55, s * 0.32, 0, Math.PI * 2)
  ctx.arc(cx + s * 0.3, cy + s * 0.25, s * 0.32, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = lw
}

function disc(ctx, cx, cy, r) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function avatar(ctx, cx, cy, r) {
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill()
  ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = '#fff'; ctx.stroke()
  // silueta
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.28, r * 0.32, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.55, r * 0.55, Math.PI, 0); ctx.fill()
  ctx.restore()
}

function label(ctx, text, cx, cy, size, weight = 600) {
  ctx.save()
  ctx.font = `${weight} ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fff'
  ctx.fillText(text, cx, cy)
  ctx.restore()
}

function scrim(ctx, X, Y, W, H) {
  const g = ctx.createLinearGradient(0, Y(0.62), 0, Y(1))
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = g
  ctx.fillRect(X(0), Y(0.62), W, H * 0.38)
}

function drawTikTok(ctx, frame) {
  const { x, y, w: W, h: H } = frame
  const X = (f) => x + f * W
  const Y = (f) => y + f * H
  const R = W * 0.052
  ctx.lineWidth = Math.max(1.5, W * 0.008)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = W * 0.02
  scrim(ctx, X, Y, W, H)

  const cnt = W * 0.031
  // Barra superior: Siguiendo · Para ti
  label(ctx, 'Siguiendo', X(0.36), Y(0.045), W * 0.036, 500)
  label(ctx, 'Para ti', X(0.62), Y(0.045), W * 0.04, 800)
  ctx.beginPath(); ctx.moveTo(X(0.585), Y(0.088)); ctx.lineTo(X(0.655), Y(0.088)); ctx.stroke()

  // Rail derecho
  const rx = X(0.9)
  avatar(ctx, rx, Y(0.5), R)
  // badge +
  ctx.save(); ctx.shadowBlur = 0
  ctx.fillStyle = '#FE2C55'
  ctx.beginPath(); ctx.arc(rx, Y(0.5) + R, R * 0.42, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, R * 0.12)
  const p = R * 0.22
  ctx.beginPath(); ctx.moveTo(rx - p, Y(0.5) + R); ctx.lineTo(rx + p, Y(0.5) + R)
  ctx.moveTo(rx, Y(0.5) + R - p); ctx.lineTo(rx, Y(0.5) + R + p); ctx.stroke()
  ctx.restore()

  ctx.fillStyle = '#fff'
  heart(ctx, rx, Y(0.62), R * 0.9); label(ctx, '328,5 K', rx, Y(0.62) + R, cnt)
  bubble(ctx, rx, Y(0.73), R * 0.85); label(ctx, '1204', rx, Y(0.73) + R, cnt)
  bookmark(ctx, rx, Y(0.82), R * 0.82); label(ctx, '5342', rx, Y(0.82) + R, cnt)
  shareArrow(ctx, rx, Y(0.905), R * 0.85); label(ctx, 'Compartir', rx, Y(0.905) + R, cnt)

  // Disco de música girando (abajo derecha)
  ctx.save(); ctx.fillStyle = 'rgba(30,30,30,0.9)'; disc(ctx, rx, Y(0.965), R * 0.9); ctx.restore()
  musicNote(ctx, rx, Y(0.965), R * 0.5)

  // Texto inferior izquierdo
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${W * 0.042}px system-ui, sans-serif`
  ctx.fillText('@usuario', X(0.04), Y(0.9))
  ctx.font = `500 ${W * 0.036}px system-ui, sans-serif`
  ctx.fillText('Descripción del vídeo #fyp #viral', X(0.04), Y(0.945))
  musicNote(ctx, X(0.06), Y(0.978), W * 0.02)
  ctx.font = `500 ${W * 0.032}px system-ui, sans-serif`
  ctx.fillText('sonido original - usuario', X(0.1), Y(0.983))
}

function drawShorts(ctx, frame) {
  const { x, y, w: W, h: H } = frame
  const X = (f) => x + f * W
  const Y = (f) => y + f * H
  const R = W * 0.05
  ctx.lineWidth = Math.max(1.5, W * 0.008)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = W * 0.02
  scrim(ctx, X, Y, W, H)

  const cnt = W * 0.03
  // Superior: ← ... Shorts ... 🔍 ⋮
  ctx.beginPath()
  ctx.moveTo(X(0.1), Y(0.05)); ctx.lineTo(X(0.05), Y(0.05))
  ctx.moveTo(X(0.07), Y(0.035)); ctx.lineTo(X(0.05), Y(0.05)); ctx.lineTo(X(0.07), Y(0.065)); ctx.stroke()
  ctx.save(); ctx.shadowBlur = 0
  ctx.fillStyle = '#FF0033'
  rrect(ctx, X(0.12), Y(0.03), W * 0.05, W * 0.05, W * 0.012); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = `800 ${W * 0.036}px system-ui, sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('Shorts', X(0.185), Y(0.055))
  ctx.restore()
  // buscar + kebab
  ctx.save(); ctx.shadowBlur = W * 0.02; ctx.strokeStyle = '#fff'
  ctx.beginPath(); ctx.arc(X(0.86), Y(0.05), W * 0.022, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(X(0.878), Y(0.068)); ctx.lineTo(X(0.9), Y(0.088)); ctx.stroke()
  ctx.fillStyle = '#fff'
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(X(0.95), Y(0.038) + i * W * 0.024, W * 0.007, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()

  // Rail derecho
  const rx = X(0.91)
  ctx.fillStyle = '#fff'
  thumb(ctx, rx, Y(0.5), R * 0.95, false); label(ctx, '45 K', rx, Y(0.5) + R, cnt)
  thumb(ctx, rx, Y(0.61), R * 0.95, true); label(ctx, 'No me gusta', rx, Y(0.61) + R, cnt)
  bubble(ctx, rx, Y(0.72), R * 0.85); label(ctx, '890', rx, Y(0.72) + R, cnt)
  shareArrow(ctx, rx, Y(0.82), R * 0.85); label(ctx, 'Compartir', rx, Y(0.82) + R, cnt)
  // remezclar (dos flechas)
  ctx.save()
  ctx.beginPath(); ctx.arc(rx, Y(0.9), R * 0.7, 0.2, Math.PI - 0.2); ctx.stroke()
  ctx.beginPath(); ctx.arc(rx, Y(0.9), R * 0.7, Math.PI + 0.2, -0.2); ctx.stroke()
  ctx.restore()
  label(ctx, 'Remezclar', rx, Y(0.9) + R * 0.9, cnt)
  // álbum/sonido (cuadrado girado)
  ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(30,30,30,0.92)'
  rrect(ctx, rx - R * 0.55, Y(0.965) - R * 0.55, R * 1.1, R * 1.1, R * 0.2); ctx.fill(); ctx.restore()
  musicNote(ctx, rx, Y(0.965), R * 0.45)

  // Inferior izquierdo: avatar + @canal + Suscribirse
  ctx.save()
  avatar(ctx, X(0.07), Y(0.9), W * 0.032)
  ctx.shadowBlur = W * 0.02
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'; ctx.font = `700 ${W * 0.036}px system-ui, sans-serif`
  ctx.fillText('@canal', X(0.12), Y(0.9))
  // botón Suscribirse (pastilla blanca)
  ctx.shadowBlur = 0
  const bw = W * 0.24, bh = W * 0.055, byy = Y(0.9) - bh / 2, bxx = X(0.28)
  ctx.fillStyle = '#fff'; rrect(ctx, bxx, byy, bw, bh, bh / 2); ctx.fill()
  ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.font = `700 ${W * 0.03}px system-ui, sans-serif`
  ctx.fillText('Suscribirse', bxx + bw / 2, Y(0.9))
  ctx.restore()

  ctx.save(); ctx.shadowBlur = W * 0.02; ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.font = `500 ${W * 0.034}px system-ui, sans-serif`
  ctx.fillText('Título del short #shorts', X(0.04), Y(0.96))
  musicNote(ctx, X(0.06), Y(0.988), W * 0.018)
  ctx.font = `500 ${W * 0.03}px system-ui, sans-serif`
  ctx.fillText('Sonido original', X(0.1), Y(0.992))
  ctx.restore()
}

// Dibuja el marco de plataforma dentro del recuadro exportable `frame`
// (coordenadas en píxeles del canvas). No hace nada si `kind` no es válido.
export function drawPlatformChrome(ctx, frame, kind) {
  if (!kind || kind === 'none' || !frame || !(frame.w > 0)) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(frame.x, frame.y, frame.w, frame.h)
  ctx.clip()
  if (kind === 'tiktok') drawTikTok(ctx, frame)
  else if (kind === 'shorts') drawShorts(ctx, frame)
  ctx.restore()
}
