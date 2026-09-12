// Carga de las 16 texturas de papel (overlay de arrugas, máscaras y capas de
// pliegue). En el motor vanilla esto vivía en el bootstrap de scripts.js; aquí es
// un singleton perezoso: se descarga una vez por sesión y se comparte entre
// montajes del tab (entrar y salir de Paper Animator no vuelve a pedirlas).

import { LAYER_URLS, MASK_URLS, OVERLAY_URLS } from './paperModel.js'

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      console.error(`Paper Animator: no se pudo cargar la textura ${url}`)
      resolve(null)
    }
    img.src = url
  })
}

let pending = null

/**
 * `{ overlays, masks, layers }` con los HTMLImageElement ya decodificados.
 * Las posiciones que fallen quedan a `null` y el render las ignora.
 */
export function loadPaperAssets() {
  if (!pending) {
    pending = Promise.all([
      Promise.all(OVERLAY_URLS.map(loadImage)),
      Promise.all(MASK_URLS.map(loadImage)),
      Promise.all(LAYER_URLS.map(loadImage)),
    ]).then(([overlays, masks, layers]) => ({ overlays, masks, layers }))
  }
  return pending
}

export const EMPTY_ASSETS = { overlays: [], masks: [], layers: [] }
