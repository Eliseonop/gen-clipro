// Pipeline de la imagen que Paper Animator anima.
// Portado de paper-animator/modules/image-handler.js, con dos cambios:
//   · devuelve una promesa en vez de mutar un singleton y llamar a updateUIFromState()
//   · admite una URL (las imágenes del material del proyecto), no solo un File
//
// El objeto que se anima se prepara en tres pasos, y el orden importa:
//   1. Re-muestreo a ≤800 px  — el render trabaja sobre esta copia, no sobre el
//      original, para que el filtro SVG del borde rasgado no cueste una eternidad.
//   2. Padding del 25 % por lado — el borde rasgado DILATA la silueta; sin margen
//      se recortaría contra el borde del bitmap.
//   3. Decodificado a un Image nuevo, que es lo que consume el renderer.
//
// `original` se guarda aparte: es la fuente de verdad para restablecer la imagen
// y para el matte de Eliminar fondo (que se calcula sobre la geometría del
// archivo, sin el margen). El recorte NO pasa por aquí: es una propiedad del
// estado de la que se deriva una vista (`cropView`), no una imagen nueva.

const MAX_PREVIEW_SIZE = 800
const PAD_RATIO = 0.25

function decode(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo decodificar la imagen.'))
    img.src = src
  })
}

function canvasOf(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function fitInto(w, h, max) {
  if (w <= max && h <= max) return { w, h }
  const ratio = w / h
  return ratio > 1 ? { w: max, h: max / ratio } : { w: max * ratio, h: max }
}

/** Re-muestrea a ≤800 px y añade el 25 % de margen. Devuelve un Image listo. */
export async function buildPaperImage(sourceImg) {
  const { w, h } = fitInto(sourceImg.naturalWidth || sourceImg.width, sourceImg.naturalHeight || sourceImg.height, MAX_PREVIEW_SIZE)

  const resample = canvasOf(w, h)
  resample.getContext('2d').drawImage(sourceImg, 0, 0, resample.width, resample.height)

  const padX = resample.width * PAD_RATIO
  const padY = resample.height * PAD_RATIO
  const padded = canvasOf(resample.width + padX * 2, resample.height + padY * 2)
  padded.getContext('2d').drawImage(resample, padX, padY)

  return decode(padded.toDataURL())
}

/** Lee un File como data URL (el SVG necesita pasar por aquí para decodificar). */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Carga la imagen del objeto desde un File o una URL.
 * Devuelve `{ original, element, name }`: `original` para reeditar, `element`
 * (re-muestreado + con margen) para el render.
 */
export async function loadObjectImage(source, name) {
  let src
  let label = name || ''
  if (source instanceof Blob) {
    src = await readFile(source)
    label = label || source.name || 'imagen'
  } else {
    src = String(source)
    label = label || src.split('/').pop().split('?')[0] || 'imagen'
  }
  const original = await decode(src)
  const element = await buildPaperImage(original)
  return { original, element, name: label }
}

/** Igual que arriba pero para el fondo: sin margen ni re-muestreo agresivo. */
export async function loadBackgroundImage(source) {
  const src = source instanceof Blob ? await readFile(source) : String(source)
  return decode(src)
}

/**
 * Región útil del `element`: el rectángulo SIN el margen transparente.
 *
 * El margen es el 25 % del contenido por lado, así que sobre el total ocupa
 * 1/6 (contenido = total/1.5 → margen = total/6). La capa de edición trabaja
 * solo aquí: pintar o recortar sobre el margen no tendría sentido.
 */
export function contentRect(element) {
  const mx = Math.round(element.width / 6)
  const my = Math.round(element.height / 6)
  return { x: mx, y: my, w: element.width - mx * 2, h: element.height - my * 2 }
}

/**
 * Multiplica el alfa de `alphaSource` sobre la REGIÓN ÚTIL del element.
 *
 * Lo usa "quitar fondo": el matte se calcula sobre el archivo (sin margen), y la
 * región útil del element es exactamente ese archivo re-muestreado, así que
 * estirarlo ahí lo deja alineado al píxel.
 *
 * `destination-in` multiplica alfas, no los sustituye: lo que ya estuviera
 * borrado a pincel sigue borrado. Por eso el fondo se compone con las ediciones
 * anteriores en vez de descartarlas, y no hace falta rehacer el pipeline (que
 * volvería a re-muestrear y perdería nitidez).
 */
export function applyAlphaToContent(element, alphaSource) {
  const out = canvasOf(element.width, element.height)
  const ctx = out.getContext('2d')
  ctx.drawImage(element, 0, 0)
  const cr = contentRect(element)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(alphaSource, cr.x, cr.y, cr.w, cr.h)
  ctx.globalCompositeOperation = 'source-over'
  return out
}

/** Canvas → Image decodificado (todas las ediciones pasan por aquí). */
export async function decodeCanvas(canvas) {
  return decode(canvas.toDataURL())
}

/**
 * VISTA recortada del element: la región que marca `crop` (rect normalizado
 * 0-1 sobre la región útil) con su margen del 25 % rehecho.
 *
 * NO sustituye la imagen: `imgRef` sigue siendo el element entero y esto se
 * deriva de él cada vez que cambia el recorte, así que "restablecer recorte" es
 * volver a poner `crop: null`. Devuelve un canvas, que el renderer dibuja igual
 * que un Image (mismo contrato: `.width`, `.height` y drawImage).
 */
export function cropView(element, crop) {
  if (!element || !crop) return element || null
  const cr = contentRect(element)
  const sx = clampPx(cr.x + crop.x * cr.w, cr.x, cr.x + cr.w)
  const sy = clampPx(cr.y + crop.y * cr.h, cr.y, cr.y + cr.h)
  const sw = Math.max(1, Math.round(Math.min(crop.w * cr.w, cr.x + cr.w - sx)))
  const sh = Math.max(1, Math.round(Math.min(crop.h * cr.h, cr.y + cr.h - sy)))

  const padX = Math.round(sw * PAD_RATIO)
  const padY = Math.round(sh * PAD_RATIO)
  const padded = canvasOf(sw + padX * 2, sh + padY * 2)
  padded.getContext('2d').drawImage(element, sx, sy, sw, sh, padX, padY, sw, sh)
  return padded
}

function clampPx(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

/** Rect del recorte en PÍXELES del element (para pintar los tiradores). */
export function cropToPixels(element, crop) {
  const cr = contentRect(element)
  if (!crop) return { ...cr }
  return {
    x: cr.x + crop.x * cr.w,
    y: cr.y + crop.y * cr.h,
    w: crop.w * cr.w,
    h: crop.h * cr.h,
  }
}

/** Inverso de `cropToPixels`: píxeles del element → rect normalizado. */
export function cropFromPixels(element, rect) {
  const cr = contentRect(element)
  if (!rect || cr.w <= 0 || cr.h <= 0) return null
  return {
    x: (rect.x - cr.x) / cr.w,
    y: (rect.y - cr.y) / cr.h,
    w: rect.w / cr.w,
    h: rect.h / cr.h,
  }
}
