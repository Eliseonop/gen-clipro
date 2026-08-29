// Layout de receta (1–2 pistas) independiente del recorte de fuente.
// split_layout auto: retrato apila, horizontal pone las pistas al lado.

export function isMasterReframe(reframe) {
  return !!(reframe && reframe.master === true)
}

export function splitOrientationFor(outAspect, reframe) {
  const layout = reframe?.split_layout
  if (layout === 'vertical' || layout === 'horizontal') return layout
  if (layout !== 'auto' && (reframe?.split_orientation === 'vertical' || reframe?.split_orientation === 'horizontal')) {
    return reframe.split_orientation
  }
  return outAspect < 1 ? 'vertical' : 'horizontal'
}

export function syncedDualSlots(outAspect, reframe) {
  return splitOrientationFor(outAspect, reframe) === 'vertical' ? ['top', 'bottom'] : ['left', 'right']
}

/** Destino letterbox del fotograma completo dentro de un hueco (origen 0,0). */
export function containDest(slotW, slotH, srcW, srcH) {
  const scale = Math.min(slotW / Math.max(1, srcW), slotH / Math.max(1, srcH))
  const dw = srcW * scale
  const dh = srcH * scale
  return { dx: (slotW - dw) / 2, dy: (slotH - dh) / 2, dw, dh }
}
