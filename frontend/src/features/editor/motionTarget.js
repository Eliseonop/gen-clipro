// "Generar Motion": a qué tramo de la timeline apunta la petición.
// Funciones puras (sin React) para poder probarlas con node.

export const GENERATE_DEFAULT_DURATION = 5
const MIN_DURATION = 0.5

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
const r3 = (v) => Math.round(v * 1000) / 1000

/** Marca de rango vacía (teclas I / O). */
export const EMPTY_MARK = Object.freeze({ in: null, out: null })

/**
 * Pone la entrada (`which='in'`) o la salida (`'out'`) en `t`. Si la nueva marca
 * deja el rango al revés, se descarta la otra (como en Premiere/Resolve).
 */
export function setMark(mark, which, t) {
  const v = Math.max(0, r3(Number(t) || 0))
  const next = { in: num(mark?.in), out: num(mark?.out), [which]: v }
  if (next.in != null && next.out != null && next.out <= next.in) {
    if (which === 'in') next.out = null
    else next.in = null
  }
  return next
}

/** true si la marca define un rango completo (entrada < salida). */
export function hasMarkRange(mark) {
  const a = num(mark?.in)
  const b = num(mark?.out)
  return a != null && b != null && b > a
}

/**
 * Tramo efectivo para generar: rango I/O si está completo; si solo hay entrada,
 * entrada + duración por defecto; si no, el instante pedido (clic o cursor) +
 * duración por defecto. `explicit` indica que el usuario marcó el rango.
 */
export function resolveGenerateTarget({ mark, time, clip, defaultDuration = GENERATE_DEFAULT_DURATION } = {}) {
  const dur = Math.max(MIN_DURATION, Number(defaultDuration) || GENERATE_DEFAULT_DURATION)
  const playhead = Math.max(0, r3(Number(time) || 0))
  if (hasMarkRange(mark)) {
    return { start: r3(mark.in), end: r3(mark.out), playhead, explicit: true, clipId: clip?.id || null }
  }
  const start = num(mark?.in) != null ? r3(mark.in) : playhead
  return { start, end: r3(start + dur), playhead, explicit: false, clipId: clip?.id || null }
}

/** Cambia la duración manteniendo el inicio (mínimo 0,5 s). */
export function withDuration(target, duration) {
  const d = Math.max(MIN_DURATION, Number(duration) || GENERATE_DEFAULT_DURATION)
  return { ...target, end: r3(target.start + d) }
}

/** Nombre del material: motion_027_032 (segundos enteros de inicio y fin). */
export function motionClipName(start, end) {
  const pad = (v) => String(Math.max(0, Math.floor(Number(v) || 0))).padStart(3, '0')
  return `motion_${pad(start)}_${pad(end)}`
}

/** 27.12 → "00:27.1" (minutos:segundos.décimas). */
export function fmtMoment(t) {
  const v = Math.max(0, Number(t) || 0)
  const m = Math.floor(v / 60)
  const s = v - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}
