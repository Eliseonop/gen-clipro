// Altura de las filas del timeline.
//
// El usuario la ajusta con Ctrl+rueda sobre las pistas y se conserva entre
// sesiones (localStorage), igual que el reparto de paneles de panelLayout.js.
//
// No todas las pistas miden lo mismo: una pista de TEXTO solo enseña una
// etiqueta, así que ocupa ~la mitad que una de vídeo. Vídeo y audio usan la
// altura completa (el audio necesita sitio para la onda y la curva de volumen).

export const ROW_H_KEY = 'vy:timeline-row-h'
export const ROW_H_MIN = 34
export const ROW_H_MAX = 120
export const ROW_H_DEFAULT = 52

/** Proporción de la pista de texto respecto a la de vídeo. */
export const TEXT_ROW_RATIO = 0.55
/** Por debajo de esto el clip de texto no deja leer su etiqueta. */
export const TEXT_ROW_MIN = 28

export function clampRowHeight(raw) {
  // Ojo: Number(null) y Number('') son 0, no NaN. Sin este descarte previo un
  // valor ausente se colaría como "0" y saldría clavado en el mínimo.
  if (raw == null || raw === '') return ROW_H_DEFAULT
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return ROW_H_DEFAULT
  return Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, n))
}

/** Alto de una pista concreta a partir del alto base. */
export function trackRowHeight(kind, rowH) {
  const base = clampRowHeight(rowH)
  if (kind !== 'text') return base
  return Math.max(TEXT_ROW_MIN, Math.min(base, Math.round(base * TEXT_ROW_RATIO)))
}

/** Siguiente alto al hacer Ctrl+rueda (arriba agranda, abajo encoge). */
export function stepRowHeight(rowH, deltaY) {
  return clampRowHeight(clampRowHeight(rowH) * (deltaY < 0 ? 1.1 : 0.9))
}

export function readRowHeight(storage) {
  try {
    const raw = storage?.getItem?.(ROW_H_KEY)
    if (raw == null || raw === '') return ROW_H_DEFAULT
    return clampRowHeight(raw)
  } catch {
    return ROW_H_DEFAULT
  }
}

export function writeRowHeight(storage, rowH) {
  try {
    storage?.setItem?.(ROW_H_KEY, String(clampRowHeight(rowH)))
  } catch { /* quota / modo privado */ }
}
