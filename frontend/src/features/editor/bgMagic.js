// "Lápiz mágico": overlay de la SELECCIÓN inteligente (SAM) en el preview.
//
// El motor de segmentación es el MISMO SAM que ya usa Eliminar fondo: el clic
// coloca puntos (auto.edits) y el backend devuelve una máscara del fotograma
// actual (endpoint /bg-segment). Aquí solo se DIBUJA esa máscara como un overlay
// de selección con borde animado tipo "marching ants", alineado con el clip.
//
// No hay geometría propia: canvas.js dibuja el canvas que devuelve
// `magicOverlayCanvas` por el MISMO camino que la fuente del clip (drawReframe /
// drawOverlayLayer), así que la selección sigue el recorte, la pose y la escala
// del clip sin duplicar el transform.

const store = new Map()   // clipId -> { w, h, mask, ring, out, tmp }

const FILL = 'rgba(34, 211, 238, 0.22)'   // relleno translúcido (cian)
const ERODE = 3                            // px de anillo (en resolución de máscara)
const STRIPE = 8                           // periodo de las franjas de las hormigas

function scratch(w, h) {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = Math.max(1, w); c.height = Math.max(1, h)
  return c
}

/** Anillo (borde) de la máscara = máscara − máscara erosionada. */
function buildRing(mask) {
  const w = mask.width, h = mask.height
  const eroded = scratch(w, h)
  const ec = eroded.getContext('2d')
  ec.drawImage(mask, 0, 0)
  ec.globalCompositeOperation = 'destination-in'
  for (const [dx, dy] of [[-ERODE, 0], [ERODE, 0], [0, -ERODE], [0, ERODE]]) ec.drawImage(mask, dx, dy)
  const ring = scratch(w, h)
  const rc = ring.getContext('2d')
  rc.drawImage(mask, 0, 0)
  rc.globalCompositeOperation = 'destination-out'
  rc.drawImage(eroded, 0, 0)
  return ring
}

// Baldosa de franjas diagonales (blanco/negro) para las hormigas. Se desplaza con
// el tiempo para dar el efecto de marcha.
let stripeTile = null
function stripe() {
  if (stripeTile || typeof document === 'undefined') return stripeTile
  const t = scratch(STRIPE, STRIPE)
  const c = t.getContext('2d')
  c.fillStyle = '#0b1220'; c.fillRect(0, 0, STRIPE, STRIPE)
  c.strokeStyle = '#e6f6ff'; c.lineWidth = STRIPE / 2
  c.beginPath()
  for (let x = -STRIPE; x < STRIPE * 2; x += STRIPE) {
    c.moveTo(x, STRIPE); c.lineTo(x + STRIPE, 0)
  }
  c.stroke()
  stripeTile = t
  return t
}

/** Guarda la máscara segmentada de un clip (Image RGBA con alfa = máscara). */
export function setMagicMask(clipId, img) {
  if (!img || !img.width || typeof document === 'undefined') return
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const mask = scratch(w, h)
  mask.getContext('2d').drawImage(img, 0, 0, w, h)
  store.set(clipId, { w, h, mask, ring: buildRing(mask), out: scratch(w, h), tmp: scratch(w, h) })
}

export function hasMagic(clipId) {
  return store.has(clipId)
}

export function clearMagic(clipId) {
  if (clipId == null) store.clear()
  else store.delete(clipId)
}

/**
 * Canvas (del TAMAÑO de la máscara, mismo aspecto que la fuente) con el relleno
 * translúcido + el borde de hormigas animado en `phaseMs`. canvas.js lo dibuja
 * con la geometría del clip. Devuelve null si no hay máscara.
 */
export function magicOverlayCanvas(clipId, phaseMs = 0) {
  const e = store.get(clipId)
  if (!e) return null
  const { w, h, mask, ring, out, tmp } = e
  const ctx = out.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, w, h)

  // Relleno translúcido dentro de la máscara.
  ctx.fillStyle = FILL
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)

  // Borde de hormigas: franjas móviles recortadas al anillo.
  const tile = stripe()
  if (tile) {
    const tc = tmp.getContext('2d')
    tc.setTransform(1, 0, 0, 1, 0, 0)
    tc.globalCompositeOperation = 'source-over'
    tc.globalAlpha = 1
    tc.clearRect(0, 0, w, h)
    const pat = tc.createPattern(tile, 'repeat')
    const off = (phaseMs / 45) % STRIPE
    try { pat.setTransform(new DOMMatrix().translateSelf(off, 0)) } catch { /* sin setTransform: franjas fijas */ }
    tc.fillStyle = pat
    tc.fillRect(0, 0, w, h)
    tc.globalCompositeOperation = 'destination-in'
    tc.drawImage(ring, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(tmp, 0, 0)
  }
  return out
}
