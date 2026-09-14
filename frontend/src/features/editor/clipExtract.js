// Extractor de segmentos del Clip Editor: Z / X marcan inicio y fin sobre la
// timeline del clip, las marcas se arrastran, y "Crear clip" guarda el tramo en
// Materiales POR REFERENCIA (mismo archivo + in/out, sin render).
// Funciones puras (sin React) para poder probarlas con node.
import { clipEnd, timelineToSource } from './editorModel.js'

export const MIN_SEGMENT = 0.3

const r3 = (v) => Math.round(v * 1000) / 1000
const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * Arrastre de una marca: a diferencia de `setMark` (teclas), NUNCA descarta la
 * otra; se para a `MIN_SEGMENT` de ella para que el rango no se invierta.
 */
export function dragMark(mark, which, t, duration = Infinity) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity
  let v = Math.min(max, Math.max(0, Number(t) || 0))
  const a = num(mark?.in)
  const b = num(mark?.out)
  if (which === 'in' && b != null) v = Math.min(v, b - MIN_SEGMENT)
  if (which === 'out' && a != null) v = Math.max(v, a + MIN_SEGMENT)
  return { in: a, out: b, [which]: r3(Math.max(0, v)) }
}

/**
 * Traduce la marca (tiempo de TIMELINE del Clip Editor) a tiempo del ARCHIVO del
 * vídeo. La timeline del clip puede tener cortes/recortes: ambos extremos deben
 * caer en el mismo clip de vídeo. Devuelve `{ clip, start, end }` o `{ error }`.
 */
export function markToSourceRange(clips, mark) {
  const a = num(mark?.in)
  const b = num(mark?.out)
  if (a == null || b == null || b - a < MIN_SEGMENT) {
    return { error: 'Marca inicio (Z) y fin (X) para crear el clip.' }
  }
  const videos = (clips || []).filter((c) => c.kind === 'video')
  if (!videos.length) return { error: 'No hay vídeo en la timeline.' }
  const eps = 0.02
  const covers = (c, t) => t >= c.start - eps && t <= clipEnd(c) + eps
  const clip = videos.find((c) => covers(c, a) && covers(c, b))
  if (!clip) return { error: 'El rango cruza un corte de la timeline: ajústalo a un solo tramo.' }
  const s1 = timelineToSource(clip, Math.max(a, clip.start))
  const s2 = timelineToSource(clip, Math.min(b, clipEnd(clip)))
  const start = Math.max(clip.in_point || 0, Math.min(s1, s2))
  const end = Math.min(clip.out_point, Math.max(s1, s2))
  if (end - start < MIN_SEGMENT) return { error: 'El rango es demasiado corto.' }
  return { clip, start: r3(start), end: r3(end) }
}

/** Rango [in, out] (segundos del archivo) de un material por referencia, o null. */
export function segmentRange(item) {
  const a = num(item?.in_point)
  const b = num(item?.out_point)
  return a != null && b != null && b > a ? { in: a, out: b } : null
}

/** Duración del material: el tramo si es un segmento, si no end − start. */
export function materialDuration(item) {
  const seg = segmentRange(item)
  if (seg) return seg.out - seg.in
  if (item?.end != null && item?.start != null) return Math.max(0, item.end - item.start)
  return Number(item?.duration) || 0
}

/** ¿El material trae un seguimiento de caras reutilizable? */
export function hasFaceTrack(item) {
  return !!(item?.face_track && item?.reframe?.keyframes?.length)
}

/**
 * Nombre por defecto de un clip extraído: "<título> · 1:05–1:12".
 */
export function segmentLabel(title, start, end) {
  const mmss = (s) => {
    const n = Math.max(0, Math.round(s))
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
  }
  const base = String(title || 'Clip').trim() || 'Clip'
  return `${base} · ${mmss(start)}–${mmss(end)}`
}

// Modal "Crear clip": qué descripción lleva el clip nuevo.
export const DESC_MODES = [
  { id: 'manual', label: 'Escribir una descripción' },
  { id: 'source', label: 'Usar la del vídeo original' },
  { id: 'none', label: 'Sin descripción' },
]

/** Descripción final según el modo elegido en el modal. */
export function segmentDescription(ask) {
  if (!ask) return ''
  if (ask.descMode === 'none') return ''
  if (ask.descMode === 'source') return String(ask.sourceDescription || '').trim()
  return String(ask.description || '').trim()
}
