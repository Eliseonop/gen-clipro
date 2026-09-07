/** Qué hace la rueda sobre el cuerpo de la timeline.
 *
 * El zoom NO se hace con la rueda (se hace arrastrando el tirador ↔ de la barra
 * de herramientas, estilo Filmora). Sobre la regla la rueda desplaza en
 * horizontal; en las pistas, en vertical. ctrl = alto de fila; shift = horizontal.
 */
export function timelineWheelAction(e, { overRuler }) {
  if (e.ctrlKey) return 'rowHeight'
  if (e.shiftKey) return 'scrollX'
  if (overRuler) return 'scrollX'
  return 'scrollY'
}

/** Compensa la barra horizontal de las pistas para que A1/A2 alineen con las cabeceras. */
export function headerScrollPad(offsetHeight, clientHeight) {
  return Math.max(0, offsetHeight - clientHeight)
}
