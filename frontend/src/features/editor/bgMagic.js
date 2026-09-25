// Eliminación personalizada: la SELECCIÓN del fotograma actual en el preview,
// como la enseña CapCut — relleno cian translúcido sobre el objeto.
//
// Se compone AQUÍ, al instante, en el mismo orden que `sam_track.keyframe_mask`
// en el backend (así lo que se ve es el punto de partida exacto del seguimiento):
//   1. selección de SAM de los trazos INTELIGENTES (llega del backend al soltar
//      el trazo, /bg-segment);
//   2. + pincel normal, − borrador normal: se pintan mientras arrastras, sin ir
//      al backend;
//   3. encima, lo que aún no tiene respuesta: la línea de los trazos
//      inteligentes (cian = añadir, rojo = quitar) y el rastro rojo del borrador
//      mientras se arrastra.
//
// Sin geometría propia: el lienzo tiene el aspecto de la FUENTE y canvas.js lo
// dibuja por el mismo camino que el clip (drawReframe / drawOverlayLayer), así
// que sigue el recorte, la pose y la escala del clip.
import { isManualMark, markKey, selectionLayers } from '../../lib/clipBg'
import { paintEdits } from './bgCutout'

const FILL = 'rgba(22, 196, 222, 0.52)'        // selección (cian de CapCut)
const EDGE = 'rgba(165, 243, 252, 0.9)'        // borde fino de la selección
const LINE_KEEP = 'rgba(22, 196, 222, 0.85)'   // trazo inteligente sin respuesta
const ERASE_FILL = 'rgba(239, 68, 68, 0.35)'   // rastro del borrador
const ERASE_EDGE = 'rgba(239, 68, 68, 0.95)'
const EDGE_PX = 2          // grosor del borde, en px del lienzo del overlay
const MAX_SIDE = 960       // lienzo sin selección de SAM (solo pincel normal)

const sam = new Map()      // clipId -> { frame, covered: Set, mask, w, h, ver }
const comp = new Map()     // clipId -> { sig, sel, ring, out, tmp }
let version = 0

function canvasOf(w, h, prev) {
  if (typeof document === 'undefined') return null
  const c = prev || document.createElement('canvas')
  if (c.width !== w || c.height !== h) { c.width = Math.max(1, w); c.height = Math.max(1, h) }
  return c
}

function reset(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.filter = 'none'
}

/**
 * Guarda la selección de SAM de un fotograma (Image con alfa = máscara) y qué
 * trazos inteligentes cubre (`marks`, los que se mandaron en la petición).
 */
export function setMagicMask(clipId, img, { frame, marks }) {
  if (!img || !img.width || typeof document === 'undefined') return
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const mask = canvasOf(w, h)
  mask.getContext('2d').drawImage(img, 0, 0, w, h)
  version += 1
  sam.set(clipId, { frame, covered: new Set((marks || []).map(markKey)), mask, w, h, ver: version })
}

/** True si la selección guardada es la de exactamente estos trazos inteligentes. */
export function magicCovers(clipId, frame, smartMarks) {
  const e = sam.get(clipId)
  if (!e || e.frame !== frame || e.covered.size !== smartMarks.length) return false
  return smartMarks.every((m) => e.covered.has(markKey(m)))
}

export function clearMagic(clipId) {
  if (clipId == null) { sam.clear(); comp.clear() } else { sam.delete(clipId); comp.delete(clipId) }
}

function marksSig(marks) {
  let n = 0
  for (const e of marks) n += e.points.length
  const last = marks[marks.length - 1]
  return `${marks.length}:${n}:${last ? `${last.op}${last.size}` : ''}`
}

// Recorre el trazo (con sus cortes `m`). Un trazo de un solo punto se alarga una
// centésima de píxel para que el extremo redondo pinte el círculo.
function tracePath(ctx, e, w, h) {
  ctx.beginPath()
  let start = true
  for (const p of e.points) {
    if (p.m) start = true
    if (start) { ctx.moveTo(p.x * w, p.y * h); start = false } else { ctx.lineTo(p.x * w, p.y * h) }
  }
  if (e.points.length === 1) ctx.lineTo(e.points[0].x * w + 0.01, e.points[0].y * h)
}

function strokeLine(ctx, e, w, h, color, extra = 0) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, e.size * h) + extra
  ctx.strokeStyle = color
  tracePath(ctx, e, w, h)
  ctx.stroke()
}

// Rastro del borrador (CapCut): interior rojo translúcido con borde rojo.
function eraseTrail(ctx, tmp, e, w, h) {
  const t = tmp.getContext('2d')
  reset(t)
  t.clearRect(0, 0, w, h)
  strokeLine(t, e, w, h, ERASE_EDGE, EDGE_PX * 2)
  t.globalCompositeOperation = 'destination-out'
  strokeLine(t, e, w, h, '#000')
  t.globalCompositeOperation = 'source-over'
  strokeLine(t, e, w, h, ERASE_FILL)
  ctx.drawImage(tmp, 0, 0)
}

/**
 * Lienzo del overlay (aspecto de la fuente) para el fotograma que se edita, o
 * null si no hay nada que enseñar. `view` = `{ frame, marks, live }`: `marks` son
 * las marcas de ese fotograma y `live` indica que hay un trazo en curso.
 */
export function magicOverlayCanvas(clipId, view, srcW, srcH) {
  if (!view || !srcW || !srcH || typeof document === 'undefined') return null
  const marks = view.marks || []
  const hit = sam.get(clipId)
  const mask = hit && hit.frame === view.frame ? hit : null
  const { manual, pending } = selectionLayers(marks, mask?.covered)
  const last = marks[marks.length - 1]
  const trail = view.live && isManualMark(last) && last.op === 'erase' ? last : null
  if (!mask && !manual.length && !pending.length) return null

  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH))
  const w = mask ? mask.w : Math.max(2, Math.round(srcW * scale))
  const h = mask ? mask.h : Math.max(2, Math.round(srcH * scale))
  const sig = [mask?.ver || 0, view.frame, marksSig(marks), trail ? 1 : 0, `${w}x${h}`].join('|')
  let c = comp.get(clipId)
  if (c && c.sig === sig) return c.out
  c = {
    sig,
    sel: canvasOf(w, h, c?.sel),
    ring: canvasOf(w, h, c?.ring),
    out: canvasOf(w, h, c?.out),
    tmp: canvasOf(w, h, c?.tmp),
  }
  comp.set(clipId, c)

  // 1-2. Selección = SAM ∪ pincel − borrador (alfa blanco).
  const s = c.sel.getContext('2d')
  reset(s)
  s.clearRect(0, 0, w, h)
  if (mask) s.drawImage(mask.mask, 0, 0)
  if (manual.length) paintEdits(s, manual, w, h)

  // Relleno cian dentro de la selección.
  const o = c.out.getContext('2d')
  reset(o)
  o.clearRect(0, 0, w, h)
  o.fillStyle = FILL
  o.fillRect(0, 0, w, h)
  o.globalCompositeOperation = 'destination-in'
  o.drawImage(c.sel, 0, 0)

  // Borde fino: selección − selección erosionada, en su color.
  const r = c.ring.getContext('2d')
  reset(r)
  r.clearRect(0, 0, w, h)
  r.drawImage(c.sel, 0, 0)
  r.globalCompositeOperation = 'destination-in'
  for (const [dx, dy] of [[-EDGE_PX, 0], [EDGE_PX, 0], [0, -EDGE_PX], [0, EDGE_PX]]) r.drawImage(c.sel, dx, dy)
  const t = c.tmp.getContext('2d')
  reset(t)
  t.clearRect(0, 0, w, h)
  t.drawImage(c.sel, 0, 0)
  t.globalCompositeOperation = 'destination-out'
  t.drawImage(c.ring, 0, 0)
  t.globalCompositeOperation = 'source-in'
  t.fillStyle = EDGE
  t.fillRect(0, 0, w, h)
  o.globalCompositeOperation = 'source-over'
  o.drawImage(c.tmp, 0, 0)

  // 3. Lo que aún no tiene respuesta de SAM, y el rastro del borrador.
  for (const e of pending) {
    if (e.op === 'erase') eraseTrail(o, c.tmp, e, w, h)
    else strokeLine(o, e, w, h, LINE_KEEP)
  }
  if (trail) eraseTrail(o, c.tmp, trail, w, h)
  return c.out
}
