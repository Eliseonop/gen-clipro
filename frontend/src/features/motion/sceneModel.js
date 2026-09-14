// Modelo puro de "Generar Escena" (brief, presets, beats). Sin React → testeable con node.

export const BEAT_KINDS = [
  { key: 'stick', label: 'Stickman', icon: 'accessibility_new' },
  { key: 'graphic', label: 'Gráfico', icon: 'insights' },
  { key: 'text', label: 'Texto', icon: 'title' },
  { key: 'image', label: 'Imagen', icon: 'image' },
]
export const KIND_BY_KEY = Object.fromEntries(BEAT_KINDS.map((k) => [k.key, k]))

export const MODE_LABEL = { auto: 'Auto', required: 'Obligatorio', off: 'No' }
export const INTENT_LABEL = {
  explicativa: 'Explicativa', narrativa: 'Narrativa', cinematografica: 'Cinematográfica', grafica: 'Gráfica',
}
export const PACE_LABEL = { calmo: 'Calmo', medio: 'Medio', dinamico: 'Dinámico' }
export const DENSITY_LABEL = { minimo: 'Mínimo', medio: 'Medio', alto: 'Alto' }
export const FREEDOM_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' }

// Campos que guarda un preset (nunca idea/guion/duración: son del tramo).
export const PRESET_FIELDS = ['intent', 'direction', 'direction_overrides', 'resources', 'pace',
  'text_density', 'background', 'transitions', 'must_include', 'ai_freedom', 'notes']

export const FALLBACK_BRIEF = {
  idea: '', script: '', duration: 6,
  intent: 'explicativa', direction: 'sketchbook', direction_overrides: {},
  resources: { stick: 'auto', graphic: 'auto', text: 'auto', image: 'auto', video: 'off' },
  pace: 'medio', text_density: 'medio', background: 'opaque', transitions: true,
  must_include: [], ai_freedom: 'alta', notes: '', structure: 'free',
}

export function pickPresetFields(brief) {
  const out = {}
  for (const k of PRESET_FIELDS) if (brief?.[k] !== undefined) out[k] = structuredCloneSafe(brief[k])
  return out
}

// Carga un preset SOBRE el brief actual: conserva idea/guion/duración y todo sigue editable.
export function applyPreset(brief, presetBrief) {
  const next = { ...brief }
  for (const k of PRESET_FIELDS) {
    if (presetBrief?.[k] === undefined) continue
    next[k] = k === 'resources'
      ? { ...brief.resources, ...presetBrief.resources, video: 'off' }
      : structuredCloneSafe(presetBrief[k])
  }
  return next
}

// ¿El brief difiere del preset cargado? (para marcar "modificado").
export function presetDirty(brief, presetBrief) {
  if (!presetBrief) return false
  return PRESET_FIELDS.some((k) => presetBrief[k] !== undefined
    && JSON.stringify(presetBrief[k]) !== JSON.stringify(brief[k]))
}

// Beats del plan → filas editables con duración (el orden manda; start/end se recalculan).
export function beatsToRows(beats) {
  return (beats || []).map((b) => ({ ...b, duration: round2((b.end ?? 0) - (b.start ?? 0)) }))
}

// Filas → beats contiguos. El backend reescala a la duración del tramo.
export function rowsToBeats(rows) {
  let t = 0
  return (rows || []).map((r) => {
    const d = Math.max(0.1, Number(r.duration) || 0)
    const beat = { ...r, start: round2(t), end: round2(t + d) }
    delete beat.duration
    t += d
    return beat
  })
}

export function rowsTotal(rows) {
  return round2((rows || []).reduce((s, r) => s + Math.max(0, Number(r.duration) || 0), 0))
}

export function newBeatId(rows) {
  let n = (rows || []).length + 1
  const ids = new Set((rows || []).map((r) => r.id))
  while (ids.has(`b${n}`)) n++
  return `b${n}`
}

export function moveRow(rows, index, delta) {
  const j = index + delta
  if (j < 0 || j >= rows.length) return rows
  const next = rows.slice()
  const [it] = next.splice(index, 1)
  next.splice(j, 0, it)
  return next
}

// "1,5" / "1.5s" → 1.5 (null si no es número).
export function parseSeconds(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Respuestas {id: valor | [valores]} → [{question, answer}] para el backend.
export function answersPayload(questions, answers) {
  return (questions || []).map((q) => {
    const a = answers?.[q.id]
    const text = Array.isArray(a) ? a.filter(Boolean).join(', ') : String(a ?? '').trim()
    return text ? { question: q.question, answer: text } : null
  }).filter(Boolean)
}

function round2(n) { return Math.round(n * 100) / 100 }
function structuredCloneSafe(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v }
