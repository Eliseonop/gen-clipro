// Pista magnética (la principal de CapCut): una secuencia SIN huecos.
//
// Los clips van uno tras otro desde 0. Soltar en ella no busca hueco: se
// inserta en el corte más cercano al puntero y lo de detrás se empuja. Borrar,
// recortar o cambiar la velocidad cierra o abre sitio solo, porque tras cada
// cambio la pista se vuelve a empaquetar (packMagnetic).
//
// Solo decide y reordena; quién llama guarda el resultado.

import { clipDur, clipEnd } from './editorModel.js'

const r3 = (v) => +(Number(v) || 0).toFixed(3)

/** Clips de la pista en orden de tiempo, sin los que se arrastran. */
function rowOf(clips, trackId, excludeIds) {
  const skip = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])
  return (clips || [])
    .filter((c) => c.track_id === trackId && !skip.has(c.id))
    .sort((a, b) => a.start - b.start)
}

/**
 * Corte donde entra un clip soltado a `time`: delante del primer clip cuya
 * MITAD queda a la derecha del puntero (como CapCut); si no hay, al final.
 * Devuelve `{ start, index }` (index = posición en la secuencia).
 */
export function magneticCut(clips, trackId, time, excludeIds) {
  const row = rowOf(clips, trackId, excludeIds)
  const t = Number(time) || 0
  for (let i = 0; i < row.length; i++) {
    const c = row[i]
    if (t < c.start + clipDur(c) / 2) return { start: r3(c.start), index: i }
  }
  const last = row[row.length - 1]
  return { start: last ? r3(clipEnd(last)) : 0, index: row.length }
}

/**
 * Empaqueta la pista: orden por `start` y cada clip pegado al anterior desde 0.
 *
 * `priorityIds` = clips recién soltados/movidos. En un empate de `start` van
 * DELANTE: soltar un clip en el corte de otro lo inserta antes que él.
 * Devuelve el mismo array si nada cambia (sirve para saber si hubo cambio).
 */
export function packMagnetic(clips, trackId, priorityIds) {
  const list = clips || []
  const pri = priorityIds instanceof Set ? priorityIds : new Set(priorityIds || [])
  const row = list.map((c, i) => ({ c, i })).filter(({ c }) => c.track_id === trackId)
  if (!row.length) return list
  row.sort((a, b) => {
    const d = a.c.start - b.c.start
    if (Math.abs(d) > 1e-4) return d
    const p = (pri.has(b.c.id) ? 1 : 0) - (pri.has(a.c.id) ? 1 : 0)
    return p || a.i - b.i
  })
  const starts = new Map()
  let cursor = 0
  for (const { c } of row) {
    starts.set(c.id, r3(cursor))
    cursor += clipDur(c)
  }
  let changed = false
  const out = list.map((c) => {
    if (!starts.has(c.id)) return c
    const s = starts.get(c.id)
    if (Math.abs(s - (Number(c.start) || 0)) < 1e-6) return c
    changed = true
    return { ...c, start: s }
  })
  return changed ? out : list
}

/** Pista principal: la de vídeo del fondo de la pila (la primera del array). */
export function mainTrackOf(tracks) {
  return (tracks || []).find((t) => t.kind === 'video') || null
}
