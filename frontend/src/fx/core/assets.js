// Imágenes que usan los efectos (texturas de papel…). Rutas relativas a la raíz
// pública: en el editor se sirven desde `/`; en la página del export, desde la
// base que fije `setFxAssetBase`. El export precarga con `preloadFxAssets` antes
// de pintar ningún fotograma (si no, los primeros saldrían sin textura).

const images = new Map()   // ruta -> HTMLImageElement
let base = '/'

export function setFxAssetBase(url) {
  base = url.endsWith('/') ? url : `${url}/`
}

function load(path) {
  let img = images.get(path)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = base + path.replace(/^\//, '')
    images.set(path, img)
  }
  return img
}

/** La imagen si ya está lista; si no, empieza a cargarla y devuelve null. */
export function fxImage(path) {
  if (typeof Image === 'undefined') return null
  const img = load(path)
  return img.complete && img.naturalWidth > 0 ? img : null
}

export function preloadFxAssets(paths) {
  if (typeof Image === 'undefined') return Promise.resolve()
  return Promise.all((paths || []).map((p) => {
    const img = load(p)
    return img.decode().catch(() => null)
  }))
}
