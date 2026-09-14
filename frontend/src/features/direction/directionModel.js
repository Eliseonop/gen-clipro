// Modelo puro de "Dirección de escena" (escaleta de tramos). Sin React → testeable con node.

export const MODE_META = {
  propose: { icon: 'lightbulb', tone: 'propose', hint: 'La IA decide la mejor forma visual.' },
  explain: { icon: 'school', tone: 'explain', hint: 'Que se entienda lo que dice la voz: mecanismo, causa, dato.' },
  represent: { icon: 'palette', tone: 'represent', hint: 'Una imagen o metáfora de la idea, sin explicarla con texto.' },
  reinforce: { icon: 'replay', tone: 'reinforce', hint: 'Volver a la escena de otro tramo para insistir en la idea.' },
  material: { icon: 'movie', tone: 'material', hint: 'Un clip o imagen concreta es el protagonista.' },
}

export const STATUS_META = {
  empty: { icon: 'radio_button_unchecked', label: 'Sin dirección' },
  ready: { icon: 'edit_note', label: 'Dirigido' },
  generated: { icon: 'movie_filter', label: 'Escena generada' },
  placed: { icon: 'check_circle', label: 'En la timeline' },
}

export const SOURCE_LABEL = {
  captions: 'subtítulos',
  transcript: 'transcripción del material',
  audio_text_estimate: 'texto del audio (tiempos estimados)',
  none: 'sin guion con tiempos',
}

const r3 = (n) => Math.round(Number(n) * 1000) / 1000

export function sortSegments(segments) {
  return (segments || []).slice().sort((a, b) => a.start - b.start || a.end - b.end)
}

export function newSegmentId() {
  return `sd_${Math.random().toString(36).slice(2, 10)}`
}

/** Texto del guion que cae en [start, end) (por el centro de cada frase). */
export function textInRange(units, start, end) {
  return (units || [])
    .filter((u) => { const mid = (u.start + u.end) / 2; return mid >= start - 1e-3 && mid < end })
    .map((u) => u.text).join(' ')
}

export function makeSegment({ start, end }, units, source = 'none') {
  const s = r3(Math.max(0, Math.min(start, end)))
  const e = r3(Math.max(start, end))
  return {
    id: newSegmentId(), start: s, end: e, text: textInRange(units, s, e), text_source: source,
    mode: null, instruction: '', strict: false, materials: [], reference_id: null, status: 'empty',
    composition_id: null, placed_clip_id: null,
  }
}

/** Tramo que contiene el instante t (o null). */
export function segmentAt(segments, t) {
  return (segments || []).find((s) => t >= s.start - 1e-3 && t < s.end) || null
}

/** Tramos con los que se solapa `seg` (para avisar, no para bloquear). */
export function overlapsOf(segments, seg) {
  return (segments || []).filter((s) => s.id !== seg.id && Math.min(s.end, seg.end) - Math.max(s.start, seg.start) > 0.05)
}

export function patchSegment(segments, id, patch) {
  return sortSegments((segments || []).map((s) => {
    if (s.id !== id) return s
    const next = { ...s, ...patch }
    if (next.status === 'empty' && (next.mode || (next.instruction || '').trim())) next.status = 'ready'
    return next
  }))
}

/** Cambia el rango y refresca el texto del guion del tramo. */
export function retimeSegment(segments, id, { start, end }, units) {
  const seg = (segments || []).find((s) => s.id === id)
  if (!seg) return segments
  const s = r3(Math.max(0, start ?? seg.start))
  const e = r3(Math.max(s + 0.2, end ?? seg.end))
  return patchSegment(segments, id, { start: s, end: e, text: textInRange(units, s, e) || seg.text })
}

export function removeSegment(segments, id) {
  return (segments || []).filter((s) => s.id !== id)
    .map((s) => (s.reference_id === id ? { ...s, reference_id: null } : s))
}

export const materialKey = (m) => `${m.scope || 'project'}:${m.kind}:${m.id}`

export function hasMaterial(seg, m) {
  return (seg?.materials || []).some((x) => materialKey(x) === materialKey(m))
}

export function toggleMaterial(seg, m) {
  const ref = { kind: m.kind, id: String(m.id), scope: m.scope || 'project' }
  const list = seg.materials || []
  return hasMaterial(seg, m) ? list.filter((x) => materialKey(x) !== materialKey(m)) : [...list, ref]
}

export function directedCount(segments) {
  return (segments || []).filter((s) => s.mode || (s.instruction || '').trim()).length
}

/** Materiales filtrados por texto (título + descripción) y tipo; sin descripción al final. */
export function filterMaterials(catalog, { q = '', kind = 'all' } = {}) {
  const needle = q.trim().toLowerCase()
  return (catalog || [])
    .filter((m) => kind === 'all' || m.kind === kind)
    .filter((m) => !needle || `${m.title} ${m.description}`.toLowerCase().includes(needle))
    .sort((a, b) => (a.description ? 0 : 1) - (b.description ? 0 : 1))
}

/** Acción principal sugerida para el tramo (lo que la app puede hacer sin IA primero). */
export function primaryAction(seg, segments) {
  if (!seg) return null
  if (seg.mode === 'material') {
    const first = (seg.materials || [])[0]
    if (first) return { id: 'place', label: first.kind === 'clips' ? 'Colocar clip en el tramo' : 'Colocar imagen en el tramo' }
  }
  if (seg.mode === 'reinforce') {
    const ref = (segments || []).find((s) => s.id === seg.reference_id)
    if (ref?.composition_id) return { id: 'reuse', label: 'Reutilizar escena del tramo de referencia' }
  }
  return { id: 'generate', label: 'Generar escena' }
}

export function fmtTime(t) {
  const v = Math.max(0, Number(t) || 0)
  const m = Math.floor(v / 60)
  const s = v - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
