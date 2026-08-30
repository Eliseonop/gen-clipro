/** Qué hace la rueda sobre el cuerpo de la timeline. */
export function timelineWheelAction(e, { overRuler }) {
  if (e.ctrlKey) return 'rowHeight'
  if (e.shiftKey) return 'scrollX'
  if (overRuler) return 'zoom'
  return 'scrollY'
}

/** Compensa la barra horizontal de las pistas para que A1/A2 alineen con las cabeceras. */
export function headerScrollPad(offsetHeight, clientHeight) {
  return Math.max(0, offsetHeight - clientHeight)
}
