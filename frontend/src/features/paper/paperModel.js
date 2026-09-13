// Modelo de Paper Animator: estado serializable + operaciones puras.
//
// Viene del `state`/`constants` del motor vanilla (frontend/paper-animator/), pero
// aquí NO hay singleton mutable: el estado vive en React (usePaperComp) y todo lo
// de esta capa son funciones puras sobre ese objeto. Lo no serializable
// (HTMLImageElement, canvas offscreen) vive en refs, nunca en el estado.
//
// Lo que se quedó fuera a propósito respecto del motor original: `language`,
// `displayMode`, `uiSize`, `accentColor`, `debugScreenEnabled` y las preferencias
// en localStorage — eran de la app standalone. `aspectRatio` tampoco está: el
// lienzo usa el formato del proyecto.

// --- Texturas -------------------------------------------------------------
// Servidas desde public/ (antes eran relativas al index.html del iframe).
const TEX = '/paper-animator/assets/texture'

export const OVERLAY_URLS = [0, 1, 2, 3].map((i) => `${TEX}/paper_overlay_${i}.webp`)
export const MASK_URLS = [0, 1, 2, 3, 4, 5].map((i) => `${TEX}/paper_mask_${i}.webp`)
export const LAYER_URLS = [0, 1, 2, 3, 4, 5].map((i) => `${TEX}/paper_fold_${i}.webp`)

// --- Easing ---------------------------------------------------------------
export const EASING = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  backIn: (t) => {
    const s = 1.70158
    return t * t * ((s + 1) * t - s)
  },
  backOut: (t) => {
    const s = 1.70158
    const u = t - 1
    return u * u * ((s + 1) * u + s) + 1
  },
  backInOut: (t) => {
    const s = 1.70158 * 1.525
    let u = t / 0.5
    if (u < 1) return 0.5 * (u * u * ((s + 1) * u - s))
    u -= 2
    return 0.5 * (u * u * ((s + 1) * u + s) + 2)
  },
}

export const EASING_OPTIONS = [
  { value: 'linear', label: 'Lineal' },
  { value: 'easeIn', label: 'Ease in' },
  { value: 'easeOut', label: 'Ease out' },
  { value: 'easeInOut', label: 'Ease in-out' },
  { value: 'instant', label: 'Instantáneo' },
  { value: 'backIn', label: 'Back in' },
  { value: 'backOut', label: 'Back out' },
  { value: 'backInOut', label: 'Back in-out' },
]

export const PAPER_ANIMS = [
  { value: 'none', label: 'Ninguna' },
  { value: 'open', label: 'Abrir' },
  { value: 'close', label: 'Cerrar' },
]

export const BLEND_MODES = [
  { value: 'multiply', label: 'Multiplicar' },
  { value: 'overlay', label: 'Superponer' },
  { value: 'soft-light', label: 'Luz suave' },
  { value: 'hard-light', label: 'Luz fuerte' },
  { value: 'screen', label: 'Trama' },
  { value: 'normal', label: 'Normal' },
]

export const EXPORT_FORMATS = [
  { value: 'webm', label: 'WebM (VP9)' },
  { value: 'mp4', label: 'MP4 (H.264)' },
  { value: 'mov', label: 'MOV' },
  { value: 'mkv', label: 'MKV' },
  { value: 'png', label: 'PNG (un fotograma)' },
  { value: 'jpg', label: 'JPG (un fotograma)' },
]

export const VIDEO_FORMATS = ['mp4', 'mov', 'mkv', 'webm']
export const PREVIEW_SCALES = [
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
  { value: 1, label: '1×' },
]

// --- Límites de los controles (antes vivían en los `min`/`max` del HTML) ----
export const LIMITS = {
  imageSize: { min: 10, max: 200 },
  imageOffset: { min: -150, max: 150 },
  strokeWidth: { min: 0, max: 60 },
  strokeRoughness: { min: 0, max: 100 },
  strokeDetail: { min: 0.005, max: 0.1 },
  shadowOffset: { min: -50, max: 50 },
  shadowBlur: { min: 0, max: 50 },
  shadowOpacity: { min: 0, max: 100 },
  hue: { min: -180, max: 180 },
  saturation: { min: -100, max: 100 },
  brightness: { min: -100, max: 100 },
  movementSpeed: { min: 0, max: 20 },
  movementStrength: { min: 0, max: 20 },
  overlayOpacity: { min: 0, max: 100 },
  overlaySpeed: { min: 0, max: 20 },
  bgSize: { min: 10, max: 300 },
  bgOffset: { min: -100, max: 100 },
  bgBlur: { min: 0, max: 50 },
  vignette: { min: 0, max: 100 },
  kfScale: { min: 10, max: 200 },
  kfOffset: { min: -150, max: 150 },
  brushSize: { min: 5, max: 100 },
  colorTolerance: { min: 0, max: 255 },
  duration: { min: 1, max: 60 },
}

// --- Herramientas del lienzo ----------------------------------------------
// Sustituyen al antiguo `edit.open` + `edit.mode`: cada herramienta se abre
// directamente desde el panel (no hay un "Editar imagen" genérico que las
// esconda) y `transform` es el estado normal, sin capa encima.
export const TOOL = {
  none: 'none',
  crop: 'crop',
  brush: 'brush',
  color: 'color',
}

/** Herramientas que se pintan como capa sobre el lienzo. */
export const OVERLAY_TOOLS = [TOOL.crop, TOOL.brush, TOOL.color]

export function isOverlayTool(tool) {
  return OVERLAY_TOOLS.includes(tool)
}

// --- Estado por defecto ---------------------------------------------------
export const DEFAULT_OBJECT = {
  // `crop` es NO destructivo: un rect normalizado (0-1) sobre la región útil del
  // element, del que se deriva la vista que se dibuja. Nunca sustituye la imagen,
  // así que `crop: null` la devuelve entera (ver paperImage.cropView).
  image: { size: 80, offset: { x: 0, y: 0 }, rotation: 0, crop: null },
  stroke: { enabled: true, width: 25, roughness: 25, detail: 0.02 },
  shadow: { enabled: true, offsetX: 5, offsetY: -5, blur: 5, color: '#000000', opacity: 50 },
  color: { enabled: false, hue: 0, saturation: 0, brightness: 0, colorize: false },
  movement: {
    enabled: true,
    mode: 'simpel',
    simpelSpeed: 1,
    simpelStrength: 1,
    rotationSpeed: 4,
    rotationStrength: 0.5,
    positionSpeed: { x: 2, y: 4 },
    positionStrength: { x: 1, y: 5 },
  },
  paperFoldOverlay: { enabled: true, opacity: 75, speed: 4, blendMode: 'multiply' },
  animation: {
    mode: 'simple',
    simple: { open: false, close: false },
    activeKeyframeId: null,
    keyframes: [
      { id: 'kf1', time: 0, x: 0, y: 0, scale: 50, rotation: 0, easing: 'linear', paperAnim: 'none' },
      { id: 'kf2', time: 1, x: 0, y: 0, scale: 80, rotation: 0, easing: 'linear', paperAnim: 'none' },
    ],
  },
}

export const DEFAULT_BACKGROUND = {
  color: '#00ff00',
  hasImage: false,
  transform: { enabled: true, mode: 'fill', size: 100, rotation: 0, offset: { x: 0, y: 0 } },
  effects: {
    colorCorrection: { enabled: false, hue: 0, saturation: 0, brightness: 0, colorize: false },
    blur: { enabled: false, intensity: 10 },
    vignette: { enabled: false, opacity: 100, radius: 50, feather: 100, color: '#000000' },
  },
}

// Texto hecho con letras recortadas (ver paperText.js). Sus elementos llevan cada
// uno un `object` con la MISMA forma que `DEFAULT_OBJECT`.
export const DEFAULT_TEXT = {
  content: '',
  assign: 'style', // 'style' | 'random'
  style: '',       // estilo elegido en modo 'style' ('' = el primero disponible)
  seed: 1,         // semilla de la elección de variantes: mismo seed → mismas letras
  mode: 'letters', // 'letters' | 'phrase'
  // Resultado CONGELADO de la resolución: el render nunca vuelve a sortear, así que
  // el preview, el export y el undo ven siempre las mismas letras.
  //   { ch, file, style, w, h }  letra con asset
  //   { ch, space: true }        espacio (conserva el hueco)
  //   { ch, br: true }           salto de línea
  //   { ch, missing: true }      carácter sin asset: hueco del ancho de un espacio
  glyphs: [],
  elements: [], // [{ id, from, to, object }] — rangos disjuntos, ordenados
  stash: null,  // elementos del OTRO modo, para volver sin perder lo configurado
}

export const DEFAULT_PAPER_STATE = {
  previewScale: 0.75,
  imageName: '',
  imageSig: 0, // cambia al cargar/editar la imagen; el render lo usa para invalidar cachés
  hasImage: false,
  erased: false,     // pincel / borrado por color (destructivo sobre los píxeles)
  bgRemoved: false,  // matte de IA aplicado (mismo motor que Eliminar fondo del editor)
  background: DEFAULT_BACKGROUND,
  // filename vacío = nombre automático (`paperExportName`): `paper-animation` +
  // la imagen/texto que representa. El usuario puede escribir uno propio.
  export: { duration: 5, fps: 24, filename: '', format: 'webm', jpgQuality: 95, transparentBackground: true },
  // Herramienta activa del lienzo. No entra en el historial (son ajustes de
  // herramienta: deshacer no debe cambiarle el pincel al usuario).
  edit: { tool: TOOL.none, brushSize: 20, colorTolerance: 32, bgProvider: 'u2net' },
  object: DEFAULT_OBJECT,
  text: DEFAULT_TEXT,
  // Qué se está editando: 'image' o el id de un elemento de texto. El inspector,
  // el marco del lienzo y la timeline trabajan sobre el object seleccionado.
  selected: 'image',
}

export function newPaperState() {
  return structuredClone(DEFAULT_PAPER_STATE)
}

// --- Selección: qué object editan los paneles ----------------------------------
// La imagen vive en `st.object` y cada elemento de texto en
// `st.text.elements[i].object`. Todo lo que ya sabía editar `st.object` (paths
// 'object.stroke.width', addKeyframe, patchKeyframe, resetPath…) se reutiliza tal
// cual sobre una VISTA del estado cuyo `object` es el seleccionado.

export function hasText(st) {
  return !!st?.text?.elements?.length
}

/** Hay algo que animar: imagen, texto o ambos. */
export function hasContent(st) {
  return !!st?.hasImage || hasText(st)
}

/** Prefijo fijo de todo Paper Animation exportado; lo hace reconocible de un vistazo. */
export const PAPER_EXPORT_PREFIX = 'paper-animation'
const PAPER_NAME_MAXLEN = 48

/**
 * La parte del nombre que dice QUÉ representa el Paper Animation: el nombre de la
 * imagen (sin extensión) o, si no hay imagen, el texto de la frase. '' si no hay
 * ninguno de los dos (entonces `paperExportName` cae en una marca de tiempo).
 */
export function paperExportDescriptor(st) {
  if (st?.hasImage) {
    const name = String(st.imageName || '').replace(/\.[^.]+$/, '').trim()
    if (name) return name.slice(0, PAPER_NAME_MAXLEN).trim()
  }
  if (hasText(st)) {
    const text = String(st?.text?.content || '').replace(/\s+/g, ' ').trim()
    if (text) return text.slice(0, PAPER_NAME_MAXLEN).trim()
  }
  return ''
}

function paperTimeStamp(now) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} `
    + `${p(now.getHours())}${p(now.getMinutes())}`
}

/**
 * Nombre descriptivo del vídeo/imagen que exporta un Paper Animation. Siempre
 * empieza por `paper-animation` y añade de qué imagen (o texto) se trata, para
 * poder identificarlo en el material y la timeline —antes todos se llamaban
 * "paper" y eran indistinguibles—. Si no hay imagen con nombre ni texto, usa una
 * marca de tiempo para que el elemento siga siendo único e identificable.
 */
export function paperExportName(st, now = new Date()) {
  const descriptor = paperExportDescriptor(st) || paperTimeStamp(now)
  return `${PAPER_EXPORT_PREFIX} ${descriptor}`.trim()
}

/** Índice del elemento de texto seleccionado, o -1 si es la imagen. */
export function selectedElementIndex(st) {
  if (!st?.selected || st.selected === 'image') return -1
  return (st.text?.elements || []).findIndex((e) => e.id === st.selected)
}

export function selectedObjectPath(st) {
  const i = selectedElementIndex(st)
  return i >= 0 ? `text.elements.${i}.object` : 'object'
}

export function selectedObject(st) {
  return getPath(st, selectedObjectPath(st))
}

/** El estado visto desde el object seleccionado (`view.object`). */
export function viewOf(st) {
  const path = selectedObjectPath(st)
  return path === 'object' ? st : { ...st, object: getPath(st, path) }
}

/**
 * Aplica `fn` —cualquier operación pensada para `st.object`— al object
 * seleccionado y lo escribe de vuelta en su sitio. Lo demás que toque `fn`
 * (p. ej. `export.duration` al estirar por un keyframe) se conserva.
 */
export function withSelectedObject(st, fn) {
  const path = selectedObjectPath(st)
  if (path === 'object') return fn(st)
  const view = { ...st, object: getPath(st, path) }
  const out = fn(view)
  if (out === view) return st
  return setPath({ ...out, object: st.object, text: st.text }, path, out.object)
}

/** ¿`path` es del object (y por tanto del seleccionado)? */
export function isObjectPath(path) {
  return path === 'object' || String(path).startsWith('object.')
}

// --- Utilidades de estado -------------------------------------------------

/** Copia inmutable con `path` ('object.stroke.width') puesto a `value`. */
export function setPath(obj, path, value) {
  const keys = String(path).split('.')
  const out = Array.isArray(obj) ? [...obj] : { ...obj }
  let cur = out
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i]
    const child = cur[k]
    cur[k] = Array.isArray(child) ? [...child] : { ...child }
    cur = cur[k]
  }
  cur[keys[keys.length - 1]] = value
  return out
}

export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

/** Aplica varios `{path: value}` de una vez (un solo objeto nuevo). */
export function setPaths(obj, patch) {
  return Object.entries(patch).reduce((acc, [p, v]) => setPath(acc, p, v), obj)
}

/** Restablece una rama del estado a su valor por defecto. */
export function resetPath(st, path) {
  return setPath(st, path, structuredClone(getPath(DEFAULT_PAPER_STATE, path)))
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

// --- Recorte --------------------------------------------------------------

/** Lado mínimo de un recorte, en fracción de la región útil. */
export const CROP_MIN_SIDE = 0.02

/** Rect normalizado válido (dentro de 0-1 y con lados mínimos), o null. */
export function normalizeCrop(rect, minSide = CROP_MIN_SIDE) {
  if (!rect) return null
  const x = clamp(Number(rect.x) || 0, 0, 1)
  const y = clamp(Number(rect.y) || 0, 0, 1)
  const w = clamp(Number(rect.w) || 0, 0, 1 - x)
  const h = clamp(Number(rect.h) || 0, 0, 1 - y)
  if (w < minSide || h < minSide) return null
  // El recorte completo equivale a no recortar: así `hasCrop` no se queda en true
  // tras arrastrar los tiradores hasta los bordes.
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return null
  return { x: +x.toFixed(5), y: +y.toFixed(5), w: +w.toFixed(5), h: +h.toFixed(5) }
}

export function hasCrop(st) {
  return !!st?.object?.image?.crop
}

/** Firma del recorte: el render la usa para invalidar la vista derivada. */
export function cropSig(crop) {
  return crop ? `${crop.x},${crop.y},${crop.w},${crop.h}` : ''
}

/** ¿La imagen tiene ediciones que `resetImage` pueda deshacer? */
export function imageEdited(st) {
  return !!(st?.erased || st?.bgRemoved)
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function hexToRgba(hex, opacity) {
  let r = 0
  let g = 0
  let b = 0
  if (typeof hex === 'string' && hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16)
    g = parseInt(hex.substring(3, 5), 16)
    b = parseInt(hex.substring(5, 7), 16)
  }
  return `rgba(${r},${g},${b},${opacity})`
}

export function seededRandom(seed) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// --- Keyframes ------------------------------------------------------------
let kfSeq = 0
export function newKfId() {
  kfSeq += 1
  return `pk${Date.now().toString(36)}${kfSeq.toString(36)}`
}

export function sortedKeyframes(st) {
  return [...(st.object.animation.keyframes || [])].sort((a, b) => a.time - b.time)
}

export function activeKeyframe(st) {
  const id = st.object.animation.activeKeyframeId
  return (st.object.animation.keyframes || []).find((k) => k.id === id) || null
}

/** Nuevo keyframe clonando el último, 1 s después. Extiende la duración si hace falta. */
export function addKeyframe(st) {
  const list = sortedKeyframes(st)
  const last = list[list.length - 1] || DEFAULT_OBJECT.animation.keyframes[0]
  const kf = {
    ...structuredClone(last),
    id: newKfId(),
    time: Math.round((last.time + 1) * 10) / 10,
    easing: 'linear',
    paperAnim: 'none',
  }
  let next = setPath(st, 'object.animation.keyframes', [...st.object.animation.keyframes, kf])
  next = setPath(next, 'object.animation.activeKeyframeId', kf.id)
  return extendDuration(next, kf.time)
}

export function removeKeyframe(st, id) {
  const left = st.object.animation.keyframes.filter((k) => k.id !== id)
  if (!left.length) return st // siempre queda al menos uno
  let next = setPath(st, 'object.animation.keyframes', left)
  if (st.object.animation.activeKeyframeId === id) {
    next = setPath(next, 'object.animation.activeKeyframeId', null)
  }
  return next
}

export function patchKeyframe(st, id, patch) {
  const items = st.object.animation.keyframes.map((k) => (k.id === id ? { ...k, ...patch } : k))
  const next = setPath(st, 'object.animation.keyframes', items)
  return patch.time != null ? extendDuration(next, patch.time) : next
}

/** Si un keyframe se sale de la duración, la estira (como `checkAndExtendDuration`). */
export function extendDuration(st, time) {
  if (time <= st.export.duration) return st
  return setPath(st, 'export.duration', Math.min(LIMITS.duration.max, Math.ceil(time * 2) / 2))
}

export function setDuration(st, value) {
  const d = clamp(Number(value) || 1, LIMITS.duration.min, LIMITS.duration.max)
  return setPath(st, 'export.duration', +d.toFixed(2))
}

export const KF_COPY_KEYS = ['x', 'y', 'scale', 'rotation']

export function keyframeClipboardOf(kf) {
  if (!kf) return null
  return KF_COPY_KEYS.reduce((o, k) => ({ ...o, [k]: kf[k] }), {})
}
