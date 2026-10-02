// GENERADORES (categoría Superposiciones): pintan sus propios píxeles con alfa,
// sin fuente, en un clip propio (`kind: 'vfx'`) que se coloca encima de lo demás.
//
// Todo es función pura del tiempo: la posición de cada partícula sale de
// (semilla, índice, t), nunca de un estado que avanza fotograma a fotograma, así
// que el export puede pedir los fotogramas en cualquier orden. Las medidas van en
// fracción del lado menor del cuadro.

import { defineEffect } from '../core/define.js'
import { rand } from '../core/rand.js'

const PALETTES = {
  party: ['#ff3b5c', '#ffd23f', '#3bceac', '#0ead69', '#5f6caf', '#ff8a3d', '#ee4266'],
  gold: ['#ffd700', '#f5c542', '#fff1a8', '#e6b422', '#ffffff'],
  pastel: ['#ffb3c6', '#bde0fe', '#caffbf', '#fdffb6', '#ffc6ff', '#a0c4ff'],
  mono: ['#ffffff', '#f1f1f1', '#dcdcdc'],
}
const PALETTE_OPTIONS = [
  { id: 'party', label: 'Fiesta' },
  { id: 'gold', label: 'Dorado' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'mono', label: 'Blanco' },
]
const seed = { type: 'seed', def: 1, label: 'Variación' }
const TAU = Math.PI * 2

function wrap(v) {
  return ((v % 1) + 1) % 1
}

function count(n, w, h) {
  // Más partículas en cuadros grandes, las mismas en 9:16 y 16:9.
  return Math.max(1, Math.round(n * Math.sqrt((w * h) / (1080 * 1920))))
}

export const confetti = defineEffect({
  id: 'confetti',
  name: 'Confeti',
  description: 'Lluvia de confeti de colores que gira al caer.',
  category: 'overlay',
  engine: 'generator',
  tags: ['confeti', 'fiesta', 'celebración', 'cumpleaños'],
  defaultDur: 4,
  params: {
    amount: { type: 'range', min: 20, max: 400, step: 5, def: 140, label: 'Cantidad' },
    speed: { type: 'range', min: 0.2, max: 3, step: 0.1, def: 1, label: 'Velocidad' },
    size: { type: 'range', min: 0.005, max: 0.04, step: 0.001, def: 0.016, label: 'Tamaño' },
    palette: { type: 'select', options: PALETTE_OPTIONS, def: 'party', label: 'Colores' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const S = Math.min(w, h)
    const colors = PALETTES[p.palette] || PALETTES.party
    const n = count(p.amount, w, h)
    const size = p.size * S
    for (let i = 0; i < n; i++) {
      const vy = (0.12 + 0.22 * rand(s, i, 3)) * p.speed
      const y = (wrap(rand(s, i, 2) + vy * t) * 1.2 - 0.1) * h
      const amp = (0.01 + 0.03 * rand(s, i, 4)) * w
      const f = 0.4 + rand(s, i, 5)
      const x = rand(s, i, 1) * w + amp * Math.sin(TAU * (f * t + rand(s, i, 6)))
      const rot = (rand(s, i, 7) - 0.5) * 10 * t + rand(s, i, 8) * TAU
      const flip = Math.cos(TAU * (0.6 + rand(s, i, 9)) * t * p.speed)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.scale(1, flip)
      ctx.fillStyle = colors[Math.floor(rand(s, i, 10) * colors.length)]
      ctx.fillRect(-size / 2, -size * 0.3, size, size * 0.6)
      ctx.restore()
    }
  },
})

export const snow = defineEffect({
  id: 'snow',
  name: 'Nieve',
  description: 'Copos que caen despacio, meciéndose con el viento.',
  category: 'overlay',
  engine: 'generator',
  tags: ['nieve', 'invierno', 'navidad', 'frío'],
  defaultDur: 6,
  params: {
    amount: { type: 'range', min: 20, max: 600, step: 10, def: 220, label: 'Cantidad' },
    speed: { type: 'range', min: 0.2, max: 3, step: 0.1, def: 1, label: 'Velocidad' },
    size: { type: 'range', min: 0.002, max: 0.015, step: 0.0005, def: 0.005, label: 'Tamaño' },
    wind: { type: 'range', min: -1, max: 1, step: 0.05, def: 0.2, label: 'Viento' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const S = Math.min(w, h)
    const n = count(p.amount, w, h)
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < n; i++) {
      const depth = 0.4 + 0.6 * rand(s, i, 1)
      const vy = (0.04 + 0.08 * depth) * p.speed
      const y = (wrap(rand(s, i, 2) + vy * t) * 1.1 - 0.05) * h
      const x = wrap(rand(s, i, 3) + p.wind * 0.05 * t * depth) * w
        + Math.sin(TAU * (0.2 + 0.3 * rand(s, i, 4)) * t + rand(s, i, 5) * TAU) * 0.015 * w
      ctx.globalAlpha = 0.45 + 0.55 * depth
      ctx.beginPath()
      ctx.arc(x, y, p.size * S * depth, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  },
})

export const rain = defineEffect({
  id: 'rain',
  name: 'Lluvia',
  description: 'Gotas finas y rápidas en diagonal.',
  category: 'overlay',
  engine: 'generator',
  tags: ['lluvia', 'tormenta', 'triste', 'agua'],
  defaultDur: 6,
  params: {
    amount: { type: 'range', min: 20, max: 600, step: 10, def: 260, label: 'Cantidad' },
    speed: { type: 'range', min: 0.5, max: 3, step: 0.1, def: 1.4, label: 'Velocidad' },
    angle: { type: 'range', min: -30, max: 30, step: 1, def: 12, label: 'Inclinación (°)' },
    opacity: { type: 'range', min: 0.1, max: 1, step: 0.05, def: 0.45, label: 'Opacidad' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const S = Math.min(w, h)
    const n = count(p.amount, w, h)
    const a = (p.angle * Math.PI) / 180
    const dx = Math.sin(a)
    const dy = Math.cos(a)
    ctx.strokeStyle = '#cfe8ff'
    ctx.lineWidth = Math.max(1, S * 0.0018)
    ctx.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const v = (1.2 + 0.8 * rand(s, i, 1)) * p.speed
      const len = (0.03 + 0.04 * rand(s, i, 2)) * S
      const y = (wrap(rand(s, i, 3) + v * t) * 1.2 - 0.1) * h
      const x = wrap(rand(s, i, 4) + dx * v * t * (h / w)) * w
      ctx.globalAlpha = p.opacity * (0.5 + 0.5 * rand(s, i, 5))
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - dx * len, y - dy * len)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },
})

function star4(ctx, x, y, r) {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fill()
}

export const sparkles = defineEffect({
  id: 'sparkles',
  name: 'Destellos',
  description: 'Estrellitas que aparecen y se apagan por todo el cuadro.',
  category: 'overlay',
  engine: 'generator',
  tags: ['brillo', 'destellos', 'estrellas', 'magia', 'glitter'],
  defaultDur: 4,
  params: {
    amount: { type: 'range', min: 5, max: 200, step: 5, def: 50, label: 'Cantidad' },
    size: { type: 'range', min: 0.01, max: 0.08, step: 0.002, def: 0.03, label: 'Tamaño' },
    speed: { type: 'range', min: 0.2, max: 4, step: 0.1, def: 1, label: 'Ritmo' },
    color: { type: 'color', def: '#fff6c9', label: 'Color' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const S = Math.min(w, h)
    const n = count(p.amount, w, h)
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = S * 0.01
    for (let i = 0; i < n; i++) {
      const phase = rand(s, i, 3)
      const f = (0.4 + 0.8 * rand(s, i, 4)) * p.speed
      const k = Math.max(0, Math.sin(TAU * (f * t + phase))) ** 3
      if (k < 0.02) continue
      const x = rand(s, i, 1) * w
      const y = rand(s, i, 2) * h
      ctx.globalAlpha = k
      star4(ctx, x, y, p.size * S * (0.4 + 0.6 * rand(s, i, 5)) * (0.6 + 0.4 * k))
    }
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  },
})

export const bubbles = defineEffect({
  id: 'bubbles',
  name: 'Burbujas',
  description: 'Pompas de jabón que suben tambaleándose.',
  category: 'overlay',
  engine: 'generator',
  tags: ['burbujas', 'pompas', 'agua', 'infantil'],
  defaultDur: 5,
  params: {
    amount: { type: 'range', min: 5, max: 120, step: 1, def: 30, label: 'Cantidad' },
    speed: { type: 'range', min: 0.2, max: 3, step: 0.1, def: 1, label: 'Velocidad' },
    size: { type: 'range', min: 0.01, max: 0.1, step: 0.002, def: 0.04, label: 'Tamaño' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const S = Math.min(w, h)
    const n = count(p.amount, w, h)
    ctx.lineWidth = Math.max(1, S * 0.002)
    for (let i = 0; i < n; i++) {
      const r = p.size * S * (0.4 + 0.6 * rand(s, i, 1))
      const v = (0.06 + 0.1 * rand(s, i, 2)) * p.speed
      const y = h + r - wrap(rand(s, i, 3) + v * t) * (h + 2 * r)
      const x = rand(s, i, 4) * w + Math.sin(TAU * (0.3 + 0.4 * rand(s, i, 5)) * t + rand(s, i, 6) * TAU) * 0.03 * w
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,0.35)')
      g.addColorStop(0.7, 'rgba(180,220,255,0.08)')
      g.addColorStop(1, 'rgba(200,240,255,0.45)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.stroke()
    }
  },
})

function heartPath(ctx, x, y, r) {
  ctx.beginPath()
  ctx.moveTo(x, y + r * 0.9)
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5)
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9)
  ctx.fill()
}

export const hearts = defineEffect({
  id: 'hearts',
  name: 'Corazones',
  description: 'Corazones que suben y se desvanecen.',
  category: 'overlay',
  engine: 'generator',
  tags: ['corazones', 'amor', 'like', 'san valentín'],
  defaultDur: 4,
  params: {
    amount: { type: 'range', min: 3, max: 80, step: 1, def: 18, label: 'Cantidad' },
    speed: { type: 'range', min: 0.2, max: 3, step: 0.1, def: 1, label: 'Velocidad' },
    size: { type: 'range', min: 0.01, max: 0.08, step: 0.002, def: 0.035, label: 'Tamaño' },
    color: { type: 'color', def: '#ff3b6b', label: 'Color' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const S = Math.min(w, h)
    const n = count(p.amount, w, h)
    ctx.fillStyle = p.color
    for (let i = 0; i < n; i++) {
      const v = (0.1 + 0.12 * rand(s, i, 2)) * p.speed
      const u = wrap(rand(s, i, 3) + v * t)          // 0 abajo → 1 arriba
      const y = h * (1.05 - u * 1.1)
      const x = (0.1 + 0.8 * rand(s, i, 4)) * w + Math.sin(TAU * (0.5 * t + rand(s, i, 5))) * 0.03 * w
      const r = p.size * S * (0.6 + 0.4 * rand(s, i, 1)) * (1 + 0.08 * Math.sin(TAU * 2 * t + i))
      ctx.globalAlpha = Math.min(1, u * 5) * Math.min(1, (1 - u) * 2.5)
      heartPath(ctx, x, y, r)
    }
    ctx.globalAlpha = 1
  },
})

export const lightRays = defineEffect({
  id: 'light_rays',
  name: 'Rayos de luz',
  description: 'Haces de luz desde una esquina que se mueven despacio (usa fusión Trama).',
  category: 'overlay',
  engine: 'generator',
  tags: ['rayos', 'luz', 'sol', 'divino', 'god rays'],
  defaultDur: 6,
  params: {
    intensity: { type: 'range', min: 0.1, max: 1, step: 0.05, def: 0.55, label: 'Intensidad' },
    rays: { type: 'range', min: 3, max: 24, step: 1, def: 10, label: 'Rayos' },
    speed: { type: 'range', min: 0, max: 2, step: 0.05, def: 0.3, label: 'Movimiento' },
    origin: {
      type: 'select',
      label: 'Origen',
      def: 'tl',
      options: [{ id: 'tl', label: 'Arriba izquierda' }, { id: 't', label: 'Arriba' }, { id: 'tr', label: 'Arriba derecha' }],
    },
    color: { type: 'color', def: '#fff2cc', label: 'Color' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const ox = p.origin === 'tl' ? -0.05 * w : p.origin === 'tr' ? 1.05 * w : 0.5 * w
    const oy = -0.08 * h
    const base = p.origin === 'tl' ? Math.PI * 0.3 : p.origin === 'tr' ? Math.PI * 0.7 : Math.PI * 0.5
    const L = Math.hypot(w, h) * 1.2
    const n = Math.round(p.rays)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const spread = (rand(s, i, 1) - 0.5) * Math.PI * 0.55
      const ang = base + spread + Math.sin(TAU * (0.05 + 0.08 * rand(s, i, 2)) * t * p.speed * 3 + i) * 0.05
      const wdt = (0.01 + 0.04 * rand(s, i, 3)) * Math.PI
      const flick = 0.6 + 0.4 * Math.sin(TAU * (0.1 + 0.3 * rand(s, i, 4)) * t * (0.5 + p.speed) + i * 1.7)
      const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(ang) * L, oy + Math.sin(ang) * L)
      const c = p.color
      g.addColorStop(0, `${c}${Math.round(255 * p.intensity * 0.5 * flick).toString(16).padStart(2, '0')}`)
      g.addColorStop(1, `${c}00`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ox + Math.cos(ang - wdt) * L, oy + Math.sin(ang - wdt) * L)
      ctx.lineTo(ox + Math.cos(ang + wdt) * L, oy + Math.sin(ang + wdt) * L)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  },
})

export const bokeh = defineEffect({
  id: 'bokeh',
  name: 'Bokeh',
  description: 'Círculos de luz desenfocados que flotan despacio.',
  category: 'overlay',
  engine: 'generator',
  tags: ['bokeh', 'luces', 'desenfoque', 'romántico', 'noche'],
  defaultDur: 6,
  params: {
    amount: { type: 'range', min: 5, max: 80, step: 1, def: 24, label: 'Cantidad' },
    size: { type: 'range', min: 0.03, max: 0.2, step: 0.005, def: 0.08, label: 'Tamaño' },
    speed: { type: 'range', min: 0, max: 2, step: 0.05, def: 0.4, label: 'Movimiento' },
    palette: { type: 'select', options: PALETTE_OPTIONS, def: 'gold', label: 'Colores' },
    seed,
  },
  render({ ctx, w, h, t, params: p, seed: s }) {
    const S = Math.min(w, h)
    const colors = PALETTES[p.palette] || PALETTES.gold
    const n = count(p.amount, w, h)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const r = p.size * S * (0.5 + rand(s, i, 1))
      const x = wrap(rand(s, i, 2) + (rand(s, i, 3) - 0.5) * 0.05 * t * p.speed) * w
      const y = wrap(rand(s, i, 4) - 0.02 * t * p.speed * (0.5 + rand(s, i, 5))) * h
      const a = 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(TAU * (0.1 + 0.2 * rand(s, i, 6)) * t + i))
      const c = colors[Math.floor(rand(s, i, 7) * colors.length)]
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      const hex = Math.round(255 * a).toString(16).padStart(2, '0')
      g.addColorStop(0, `${c}${hex}`)
      g.addColorStop(0.75, `${c}${hex}`)
      g.addColorStop(1, `${c}00`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  },
})

export const dust = defineEffect({
  id: 'film_dust',
  name: 'Polvo y rayas',
  description: 'Capa de película vieja: motas, pelos y rayas que parpadean (fusión Multiplicar o Trama).',
  category: 'overlay',
  engine: 'generator',
  tags: ['polvo', 'rayas', 'película', 'vintage', 'grano'],
  defaultDur: 5,
  params: {
    amount: { type: 'range', min: 0, max: 1, step: 0.05, def: 0.6, label: 'Cantidad' },
    light: { type: 'toggle', def: false, label: 'Motas claras' },
    seed,
  },
  render({ ctx, w, h, frame, params: p, seed: s }) {
    const S = Math.min(w, h)
    const f = Math.floor(frame / 2)   // 15 cambios por segundo, como un proyector
    ctx.fillStyle = p.light ? '#f5f0e6' : '#141414'
    ctx.strokeStyle = ctx.fillStyle
    const specks = Math.round(40 * p.amount)
    for (let i = 0; i < specks; i++) {
      if (rand(s, f, i, 1) > 0.5) continue
      ctx.globalAlpha = 0.4 + 0.5 * rand(s, f, i, 2)
      ctx.beginPath()
      ctx.arc(rand(s, f, i, 3) * w, rand(s, f, i, 4) * h, S * (0.001 + 0.004 * rand(s, f, i, 5)), 0, TAU)
      ctx.fill()
    }
    // Pelos: curvas cortas.
    ctx.lineWidth = Math.max(1, S * 0.0015)
    for (let i = 0; i < Math.round(3 * p.amount); i++) {
      if (rand(s, f, 99, i) > 0.35) continue
      const x = rand(s, f, i, 6) * w
      const y = rand(s, f, i, 7) * h
      const l = S * (0.02 + 0.05 * rand(s, f, i, 8))
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + l * (rand(s, f, i, 9) - 0.5), y + l * 0.5, x + l * (rand(s, f, i, 10) - 0.5), y + l)
      ctx.stroke()
    }
    // Rayas verticales.
    for (let i = 0; i < 2; i++) {
      if (rand(s, f, 200, i) > 0.5 * p.amount) continue
      ctx.globalAlpha = 0.35
      ctx.fillRect(rand(s, f, 201, i) * w, 0, Math.max(1, S * 0.0012), h)
    }
    ctx.globalAlpha = 1
  },
})

function pad2(n) {
  return String(Math.floor(n)).padStart(2, '0')
}

export const recFrame = defineEffect({
  id: 'rec_frame',
  name: 'Cámara grabando',
  description: 'Visor de cámara: esquinas, REC parpadeando, código de tiempo y batería.',
  category: 'overlay',
  engine: 'generator',
  tags: ['rec', 'cámara', 'visor', 'vlog', 'grabando'],
  defaultDur: 5,
  params: {
    color: { type: 'color', def: '#ffffff', label: 'Color' },
    timecode: { type: 'toggle', def: true, label: 'Código de tiempo' },
    battery: { type: 'toggle', def: true, label: 'Batería' },
  },
  render({ ctx, w, h, t, params: p }) {
    const S = Math.min(w, h)
    const m = S * 0.06
    const L = S * 0.08
    ctx.strokeStyle = p.color
    ctx.fillStyle = p.color
    ctx.lineWidth = Math.max(2, S * 0.006)
    ctx.lineCap = 'square'
    const corners = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath()
      ctx.moveTo(x, y + sy * L)
      ctx.lineTo(x, y)
      ctx.lineTo(x + sx * L, y)
      ctx.stroke()
    }
    const fs = Math.round(S * 0.045)
    ctx.font = `700 ${fs}px Arial, Helvetica, sans-serif`
    ctx.textBaseline = 'middle'
    const ty = m + L * 0.6
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#ff2d2d'
      ctx.beginPath()
      ctx.arc(m + L * 0.55, ty, fs * 0.32, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = p.color
    ctx.fillText('REC', m + L * 0.55 + fs * 0.55, ty)
    if (p.timecode) {
      const fr = Math.floor((t % 1) * 30)
      const tc = `${pad2(t / 3600)}:${pad2((t / 60) % 60)}:${pad2(t % 60)}:${pad2(fr)}`
      ctx.textAlign = 'right'
      ctx.fillText(tc, w - m - L * 0.3, ty)
      ctx.textAlign = 'left'
    }
    if (p.battery) {
      const bw = fs * 1.6
      const bh = fs * 0.8
      const bx = w - m - L * 0.3 - bw
      const by = h - m - L * 0.6 - bh / 2
      ctx.lineWidth = Math.max(1.5, S * 0.003)
      ctx.strokeRect(bx, by, bw, bh)
      ctx.fillRect(bx + bw, by + bh * 0.3, bw * 0.08, bh * 0.4)
      ctx.fillRect(bx + bw * 0.1, by + bh * 0.2, bw * 0.6, bh * 0.6)
    }
    // Cruz central.
    const c = S * 0.03
    ctx.lineWidth = Math.max(1, S * 0.003)
    ctx.beginPath()
    ctx.moveTo(w / 2 - c, h / 2)
    ctx.lineTo(w / 2 + c, h / 2)
    ctx.moveTo(w / 2, h / 2 - c)
    ctx.lineTo(w / 2, h / 2 + c)
    ctx.stroke()
  },
})

export const countdown = defineEffect({
  id: 'countdown',
  name: 'Cuenta atrás',
  description: 'Números grandes que bajan hasta 1 con un anillo que se vacía.',
  category: 'overlay',
  engine: 'generator',
  tags: ['cuenta atrás', 'números', 'temporizador', 'countdown'],
  defaultDur: 3,
  params: {
    from: { type: 'range', min: 1, max: 10, step: 1, def: 3, label: 'Desde' },
    color: { type: 'color', def: '#ffffff', label: 'Color' },
    ring: { type: 'toggle', def: true, label: 'Anillo' },
  },
  render({ ctx, w, h, t, dur, params: p }) {
    const S = Math.min(w, h)
    const n = Math.max(1, Math.round(p.from))
    const step = Math.max(0.05, dur / n)
    const k = Math.min(n - 1, Math.floor(t / step))
    const u = (t - k * step) / step
    const num = n - k
    const cx = w / 2
    const cy = h / 2
    const r = S * 0.22
    if (p.ring) {
      ctx.strokeStyle = p.color
      ctx.globalAlpha = 0.25
      ctx.lineWidth = S * 0.02
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - u))
      ctx.stroke()
    }
    const pop = 1 + 0.25 * Math.max(0, 1 - u * 5)
    ctx.fillStyle = p.color
    ctx.font = `800 ${Math.round(S * 0.24 * pop)}px Arial, Helvetica, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = Math.min(1, (1 - u) * 4)
    ctx.fillText(String(num), cx, cy + S * 0.01)
    ctx.globalAlpha = 1
  },
})

export default [confetti, snow, rain, sparkles, bubbles, hearts, lightRays, bokeh, dust, recFrame, countdown]
