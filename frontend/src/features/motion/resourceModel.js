// "Generar recurso": lógica pura del modal (sin React, testeable con node).

/** Icono por tipo de recurso. Debe ir en paralelo con KIND_ICONS de resource_ai.py. */
export const KIND_ICON = {
  timeline: 'timeline',
  compare: 'compare_arrows',
  list: 'format_list_bulleted',
  grid: 'grid_view',
  diagram: 'account_tree',
  flow: 'linear_scale',
  data: 'show_chart',
  stat: 'tag',
  image: 'image',
  annotate: 'my_location',
  concept: 'bubble_chart',
  text: 'title',
  custom: 'auto_awesome',
}

export const iconOf = (s) => KIND_ICON[s?.kind] || KIND_ICON.custom

/** Una sugerencia que no lleve plantilla la compone la IA desde cero. */
export const isCustom = (s) => !s?.template

/**
 * Deduplica por plantilla conservando el orden (la IA va primero, las
 * heurísticas rellenan). Dos propuestas con la misma plantilla se ven igual en
 * el modal, así que la segunda no aporta nada.
 */
export function dedupe(suggestions) {
  const seen = new Set()
  const out = []
  for (const s of suggestions || []) {
    if (!s) continue
    const key = s.template || `custom:${s.label || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/**
 * Qué construir tras una instrucción escrita (§16): la mejor propuesta de la IA
 * para ESA petición, que normalmente es una plantilla rellena; si la IA decidió
 * que ninguna encaja, trae un `concept` y se compone desde cero. Sin respuesta de
 * la IA (caída o lenta) devuelve null: el modal enseña las propuestas del guion
 * en vez de lanzar una composición libre que tampoco podría hacerse.
 */
export function bestForHint(result) {
  const rows = result?.suggestions || []
  return rows.find((s) => s?.source === 'ai' && (s.template || s.concept)) || null
}

/**
 * Chips de tipo para acotar la petición sin escribir ("Diagrama", "Timeline"…).
 * Al pulsar uno se re-pregunta a la IA con ese sesgo, no se genera directamente:
 * el usuario dice QUÉ tipo quiere y la IA decide el contenido con el contexto.
 */
export const TYPE_HINTS = [
  { id: 'diagram', label: 'Diagrama', icon: 'account_tree', hint: 'un diagrama que explique el mecanismo' },
  { id: 'timeline', label: 'Timeline', icon: 'timeline', hint: 'una línea temporal con los hitos' },
  { id: 'compare', label: 'Comparación', icon: 'compare_arrows', hint: 'una comparación visual entre dos cosas' },
  { id: 'list', label: 'Lista', icon: 'format_list_bulleted', hint: 'una lista animada de elementos' },
  { id: 'data', label: 'Gráfico', icon: 'show_chart', hint: 'un gráfico con los datos del guion' },
  { id: 'image', label: 'Imágenes', icon: 'image', hint: 'una composición con las imágenes del material' },
  { id: 'annotate', label: 'Señalar', icon: 'my_location', hint: 'una anotación sobre lo que ya se ve en pantalla' },
]

/** Resumen de una línea de lo que la IA sabe del tramo (§1: sin muros de texto). */
export function contextLine(ctx) {
  if (!ctx) return ''
  const said = (ctx.scriptContext?.current || '').trim()
  if (said) return said
  const on = ctx.timelineContext?.existingElements || []
  const withNote = on.find((e) => e.note)
  if (withNote) return withNote.note
  if (on.length) return `En pantalla: ${on.map((e) => e.name || e.kind).slice(0, 3).join(', ')}`
  return 'Nadie habla en este tramo.'
}

/** Cuántas señales de contexto tiene la IA (para el indicador del modal). */
export function contextStats(ctx) {
  const on = ctx?.timelineContext?.existingElements || []
  return {
    hasScript: !!(ctx?.scriptContext?.current || '').trim(),
    notes: on.filter((e) => e.note).length,
    elements: on.length,
    images: (ctx?.availableAssets || []).filter((a) => a.kind === 'image').length,
  }
}
