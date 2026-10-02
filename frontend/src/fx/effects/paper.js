// «Papel recortado»: el motor de Paper Animator como efecto de cualquier clip.
//
// Portado de features/paper/paperRender.js (drawStamp/drawItem): borde blanco
// rasgado (filtro SVG: dilatar la silueta + ruido fractal que la desplaza),
// textura de arrugas que cambia a saltos, sombra, vibración «stop-motion» y el
// pliegue de apertura/cierre con las mismas texturas. Diferencias con el modo
// Paper: no hay caché de siluetas en base64 (se calcula en cada fotograma, en
// GPU, ~1 ms), las medidas son relativas al tamaño del contenido y el tiempo es
// el del efecto dentro del clip.

import { defineEffect } from '../core/define.js'
import { fxImage } from '../core/assets.js'
import { rand } from '../core/rand.js'

const TEX = 'paper-animator/assets/texture'
export const PAPER_ASSETS = [
  ...[0, 1, 2, 3].map((i) => `${TEX}/paper_overlay_${i}.webp`),
  ...[0, 1, 2, 3, 4, 5].map((i) => `${TEX}/paper_mask_${i}.webp`),
  ...[0, 1, 2, 3, 4, 5].map((i) => `${TEX}/paper_fold_${i}.webp`),
]
const TORN_SEEDS = [20, 30, 40, 10]
const FOLD_FRAMES = 6
const FOLD_DUR = 1          // s que dura abrir/cerrar
const REF = 1080            // las medidas del borde son «px a 1080», como en Paper

const FILTER_ID = 'vy-paper-torn'
let filterNodes = null

function tornFilter() {
  if (filterNodes && filterNodes.root.isConnected) return filterNodes
  if (typeof document === 'undefined') return null
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.position = 'absolute'
  svg.innerHTML = `
    <filter id="${FILTER_ID}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
      <feMorphology id="${FILTER_ID}-dilate" in="SourceGraphic" operator="dilate" radius="10" result="dilated"/>
      <feTurbulence id="${FILTER_ID}-turb" type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise"/>
      <feDisplacementMap id="${FILTER_ID}-disp" in="dilated" in2="noise" scale="15" xChannelSelector="R" yChannelSelector="G" result="torn"/>
      <feFlood flood-color="#FFFFFF" result="white"/>
      <feComposite in="white" in2="torn" operator="in" result="coloredTorn"/>
      <feMerge><feMergeNode in="coloredTorn"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`
  document.body.appendChild(svg)
  filterNodes = {
    root: svg,
    dilate: svg.querySelector(`#${FILTER_ID}-dilate`),
    turb: svg.querySelector(`#${FILTER_ID}-turb`),
    disp: svg.querySelector(`#${FILTER_ID}-disp`),
  }
  return filterNodes
}

// Canvas de trabajo compartidos (el render es síncrono: nadie los usa a la vez).
const scratch = {}
function work(name, w, h) {
  let c = scratch[name]
  if (!c) {
    c = document.createElement('canvas')
    scratch[name] = c
  }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  const g = c.getContext('2d')
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.filter = 'none'
  g.clearRect(0, 0, w, h)
  return { c, g }
}

// Textura de arrugas aclarada hacia blanco según la opacidad (en multiply el
// blanco es neutro), memoizada por índice y fuerza como en Paper.
const whitened = new Map()
function whitenedOverlay(img, index, strengthPct) {
  const strength = (100 - strengthPct) / 100
  const key = `${index}:${strength.toFixed(3)}`
  const hit = whitened.get(key)
  if (hit && hit.img === img) return hit.canvas
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    px[i] += (255 - px[i]) * strength
    px[i + 1] += (255 - px[i + 1]) * strength
    px[i + 2] += (255 - px[i + 2]) * strength
  }
  ctx.putImageData(data, 0, 0)
  if (whitened.size > 12) whitened.delete(whitened.keys().next().value)
  whitened.set(key, { img, canvas })
  return canvas
}

/** Vibración «stop-motion» (modo simple de Paper), función pura del tiempo. */
export function paperJitter(tMs, speedK, strengthK, seed) {
  const rotSpeed = 4 * speedK
  const rotStrength = 0.5 * strengthK
  let rotation = 0
  if (rotSpeed > 0 && rotStrength > 0) {
    const cycle = Math.floor(tMs / (1000 / rotSpeed))
    rotation = cycle % 2 === 0 ? rotStrength : -rotStrength
  }
  const sx = 2 * speedK
  const sy = 4 * speedK
  const ox = sx > 0 ? (rand(seed, 1, Math.floor(tMs / (1000 / sx))) - 0.5) * 1 * strengthK : 0
  const oy = sy > 0 ? (rand(seed, 2, Math.floor(tMs / (1000 / sy))) - 0.5) * 5 * strengthK : 0
  return { rotation, offsetX: ox, offsetY: oy }
}

/** Fotograma del pliegue (0–5) o -1 si no se está plegando en `t`. */
export function foldFrameAt(mode, t, dur) {
  const fd = Math.min(FOLD_DUR, dur / 2)
  const step = fd / FOLD_FRAMES
  if ((mode === 'open' || mode === 'both') && t < fd) return Math.min(FOLD_FRAMES - 1, Math.floor(t / step))
  if ((mode === 'close' || mode === 'both') && t > dur - fd) {
    return FOLD_FRAMES - 1 - Math.min(FOLD_FRAMES - 1, Math.floor((t - (dur - fd)) / step))
  }
  return -1
}

const BLENDS = [
  { id: 'multiply', label: 'Multiplicar' },
  { id: 'overlay', label: 'Superponer' },
  { id: 'soft-light', label: 'Luz suave' },
  { id: 'hard-light', label: 'Luz fuerte' },
  { id: 'screen', label: 'Trama' },
  { id: 'normal', label: 'Normal' },
]

function hexRgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export const paperCutout = defineEffect({
  id: 'paper_cutout',
  name: 'Papel recortado',
  description: 'Recorte de papel con borde rasgado, arrugas, sombra y vibración stop-motion; puede abrirse y cerrarse plegándose.',
  category: 'style',
  engine: 'canvas',
  pad: 0.2,
  tags: ['papel', 'recorte', 'collage', 'stop motion', 'paper', 'manualidad'],
  assets: PAPER_ASSETS,
  params: {
    border: { type: 'toggle', def: true, label: 'Borde rasgado' },
    width: { type: 'range', min: 0, max: 80, step: 1, def: 25, label: 'Grosor del borde' },
    roughness: { type: 'range', min: 0, max: 80, step: 1, def: 25, label: 'Rugosidad' },
    detail: { type: 'range', min: 0.005, max: 0.08, step: 0.001, def: 0.02, label: 'Detalle' },
    wrinkles: { type: 'range', min: 0, max: 100, step: 1, def: 75, label: 'Arrugas' },
    wrinkleSpeed: { type: 'range', min: 0, max: 12, step: 0.5, def: 4, label: 'Cambio de arrugas (por s)' },
    blend: { type: 'select', options: BLENDS, def: 'multiply', label: 'Fusión de arrugas' },
    shadow: { type: 'toggle', def: true, label: 'Sombra' },
    shadowX: { type: 'range', min: -40, max: 40, step: 1, def: 5, label: 'Sombra X' },
    shadowY: { type: 'range', min: -40, max: 40, step: 1, def: -5, label: 'Sombra Y' },
    shadowBlur: { type: 'range', min: 0, max: 40, step: 1, def: 5, label: 'Sombra: difuminado' },
    shadowColor: { type: 'color', def: '#000000', label: 'Sombra: color' },
    shadowOpacity: { type: 'range', min: 0, max: 100, step: 1, def: 50, label: 'Sombra: opacidad' },
    jitter: { type: 'toggle', def: true, label: 'Vibración stop-motion' },
    jitterSpeed: { type: 'range', min: 0, max: 3, step: 0.05, def: 1, label: 'Vibración: velocidad' },
    jitterStrength: { type: 'range', min: 0, max: 3, step: 0.05, def: 1, label: 'Vibración: fuerza' },
    fold: {
      type: 'select',
      label: 'Pliegue',
      def: 'none',
      options: [
        { id: 'none', label: 'Ninguno' },
        { id: 'open', label: 'Abrir al empezar' },
        { id: 'close', label: 'Cerrar al acabar' },
        { id: 'both', label: 'Abrir y cerrar' },
      ],
    },
    seed: { type: 'seed', def: 1, label: 'Variación' },
  },
  render({ ctx, src, srcRect, content, cw, ch, t, dur, params: p, seed }) {
    const big = Math.max(content.w, content.h)
    const k = big / REF
    const tMs = t * 1000
    const foldIdx = p.wrinkleSpeed > 0 ? Math.floor(tMs / (1000 / p.wrinkleSpeed)) % 4 : 0
    const foldFrame = foldFrameAt(p.fold, t, dur)
    const cx = content.x + content.w / 2
    const cy = content.y + content.h / 2

    // 1. Contenido: la imagen + la textura de arrugas (que también pinta el borde
    //    de papel, fuera de la imagen) + la sombra del pliegue.
    const C = work('content', cw, ch)
    C.g.drawImage(src, srcRect.x, srcRect.y, srcRect.w, srcRect.h, content.x, content.y, content.w, content.h)
    const overlay = fxImage(`${TEX}/paper_overlay_${foldIdx}.webp`)
    const paperW = content.w + 2 * (p.width + p.roughness) * k
    const paperH = content.h + 2 * (p.width + p.roughness) * k
    if (overlay) {
      C.g.save()
      C.g.globalCompositeOperation = p.blend === 'normal' ? 'source-over' : p.blend
      C.g.drawImage(whitenedOverlay(overlay, foldIdx, p.wrinkles), cx - paperW / 2, cy - paperH / 2, paperW, paperH)
      C.g.restore()
    } else {
      // Sin textura (aún cargando): papel blanco liso bajo la imagen.
      C.g.save()
      C.g.globalCompositeOperation = 'destination-over'
      C.g.fillStyle = '#ffffff'
      C.g.fillRect(cx - paperW / 2, cy - paperH / 2, paperW, paperH)
      C.g.restore()
    }
    const S = Math.max(paperW, paperH)
    if (foldFrame >= 0) {
      const layer = fxImage(`${TEX}/paper_fold_${foldFrame}.webp`)
      if (layer) C.g.drawImage(layer, cx - S / 2, cy - S / 2, S, S)
    }

    // 2. Silueta rasgada (la imagen engordada y desplazada por ruido) como alfa.
    const O = work('silhouette', cw, ch)
    const f = p.border && p.width > 0 ? tornFilter() : null
    if (f) {
      f.dilate.setAttribute('radius', String(p.width * k))
      f.disp.setAttribute('scale', String(p.roughness * k))
      f.turb.setAttribute('baseFrequency', String(p.detail / Math.max(1e-3, k)))
      f.turb.setAttribute('seed', String(TORN_SEEDS[foldIdx] + (seed - 1) * 7))
      O.g.filter = `url(#${FILTER_ID})`
    }
    O.g.drawImage(src, srcRect.x, srcRect.y, srcRect.w, srcRect.h, content.x, content.y, content.w, content.h)
    O.g.filter = 'none'
    C.g.globalCompositeOperation = 'destination-in'
    C.g.drawImage(O.c, 0, 0)
    C.g.globalCompositeOperation = 'source-over'

    // 3. Pliegue: la máscara del fotograma recorta el papel.
    let stamp = C.c
    if (foldFrame >= 0) {
      const mask = fxImage(`${TEX}/paper_mask_${foldFrame}.webp`)
      if (mask) {
        const F = work('fold', cw, ch)
        F.g.drawImage(mask, cx - S / 2, cy - S / 2, S, S)
        F.g.globalCompositeOperation = 'source-in'
        F.g.drawImage(C.c, 0, 0)
        stamp = F.c
      }
    }

    // 4. Al lienzo, con sombra y vibración.
    const j = p.jitter ? paperJitter(tMs, p.jitterSpeed, p.jitterStrength, seed) : { rotation: 0, offsetX: 0, offsetY: 0 }
    const jk = big / 1000
    ctx.save()
    if (p.shadow) {
      ctx.shadowColor = hexRgba(p.shadowColor, p.shadowOpacity / 100)
      ctx.shadowBlur = p.shadowBlur * jk
      ctx.shadowOffsetX = p.shadowX * jk
      ctx.shadowOffsetY = -p.shadowY * jk
    }
    ctx.translate(cx + j.offsetX * jk, cy - j.offsetY * jk)
    if (j.rotation) ctx.rotate((j.rotation * Math.PI) / 180)
    ctx.drawImage(stamp, -cx, -cy)
    ctx.restore()
  },
})

export default [paperCutout]
