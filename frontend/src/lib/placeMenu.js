// Coloca un menú flotante dentro del viewport: abajo si cabe, si no arriba.

const PAD = 8
const GAP = 4

export function placeMenu(x, y, menuW, menuH, vw, vh, pad = PAD) {
  let left = x
  if (left + menuW > vw - pad) left = vw - pad - menuW
  if (left < pad) left = pad

  let top = y
  if (y + menuH > vh - pad) top = y - menuH
  if (top < pad) top = pad
  if (top + menuH > vh - pad) top = Math.max(pad, vh - pad - menuH)
  return { left, top }
}

export function placeAnchoredMenu(anchor, menuW, menuH, vw, vh, pad = PAD) {
  let left = anchor.left
  if (left + menuW > vw - pad) left = vw - pad - menuW
  if (left < pad) left = pad

  const spaceBelow = vh - pad - (anchor.bottom + GAP)
  if (spaceBelow >= menuH) {
    return { left, top: anchor.bottom + GAP, placement: 'down' }
  }
  return { left, top: Math.max(pad, anchor.top - GAP - menuH), placement: 'up' }
}
