// Bitmaps del texto de Paper Animator (la parte con DOM de paperText.js).
//
// Cada elemento de texto se convierte en un canvas con la MISMA forma que la
// imagen que prepara paperImage.buildPaperImage: el contenido centrado con un
// 25 % de margen por lado (el borde rasgado dilata la silueta). A partir de ahí
// el renderer lo trata exactamente como a una imagen.

import { elementSlot, isDrawable } from './paperText.js'

const MAX_SIDE = 1600 // lado máximo del bitmap: acota el coste del filtro SVG
const PAD_RATIO = 0.25

/** Carga (una vez) los PNG que usan los glyphs. Resuelve cuando están todos. */
export function loadGlyphImages(glyphs, cache, urlOf) {
  const files = [...new Set((glyphs || []).filter(isDrawable).map((g) => g.file))]
  return Promise.all(files.map((file) => {
    const hit = cache.get(file)
    if (hit) return hit.ready
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const ready = new Promise((resolve) => {
      img.onload = () => resolve(img)
      img.onerror = () => {
        console.error(`Paper Animator: no se pudo cargar la letra ${file}`)
        resolve(null)
      }
    })
    img.src = urlOf(file)
    cache.set(file, { img, ready })
    return ready
  }))
}

/** Firma del bitmap de un elemento: qué letras y en qué rango. */
export function elementBitmapSig(glyphs, el) {
  return `${el.from}-${el.to}:${(glyphs || []).slice(el.from, el.to + 1).map((g) => g.file || g.ch).join(',')}`
}

/**
 * Compone el bitmap de un elemento a partir del layout de la frase.
 * Devuelve `{ canvas, slot }` o null si el rango no tiene letras (o faltan PNG).
 */
export function buildElementBitmap(layout, glyphs, el, cache) {
  const slot = elementSlot(layout, el)
  if (!slot) return null
  const { box } = slot
  const r = Math.min(1, MAX_SIDE / (Math.max(box.w, box.h) * (1 + PAD_RATIO * 2)))
  const padX = box.w * PAD_RATIO
  const padY = box.h * PAD_RATIO

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((box.w + padX * 2) * r))
  canvas.height = Math.max(1, Math.round((box.h + padY * 2) * r))
  const ctx = canvas.getContext('2d')

  for (let i = el.from; i <= el.to; i += 1) {
    const s = layout.slots[i]
    const img = s && cache.get(glyphs[i].file)?.img
    if (!s || !img?.complete || !img.naturalWidth) continue
    ctx.drawImage(img, (s.x - box.x + padX) * r, (s.y - box.y + padY) * r, s.w * r, s.h * r)
  }
  return { canvas, slot }
}
