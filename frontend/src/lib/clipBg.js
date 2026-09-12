// Eliminar fondo: modelo del clip, matte derivado y chroma key.
//
// Espejo de `backend/app/clip_bg.py`; ambos deben dar el MISMO alfa.
// Es la CAPA DE FUENTE del clip: decide qué píxeles del material original son
// opacos ANTES del recorte/pose/efectos. No toca el archivo: todo vive en
// `clip.bg_removal`.
//
// Se compone con clipMask sin solaparse — son dos etapas distintas:
//
//   fuente ─► [clipBg: chroma + matte IA] ─► crop/pose/fx ─► compuesto
//                                                              └─► [clipMask]
//     espacio FUENTE                                        espacio SALIDA
//
// Coordenadas del pincel de corrección (independientes de la resolución):
//   x, y  → fracción del ancho/alto de la FUENTE (0-1).
//   size  → diámetro en fracción del ALTO de la fuente (sale redondo).
//
// Orden de derivación del matte (fijo; preview y export deben coincidir):
//   1. niveles (threshold/softness)  2. pluma  3. invertir  4. correcciones

const num = (v, d) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const BG_PROVIDERS = [
  { id: 'u2net', label: 'U²-Net (automático)', hint: 'Detecta el sujeto solo. Mejor borde.' },
  { id: 'u2netp', label: 'U²-Net lite (rápido)', hint: 'Modelo de 4,7 MB, más rápido.' },
  { id: 'sam21_base_plus', label: 'SAM 2.1 (asistido)', hint: 'Marca el sujeto con puntos. Calidad alta.', interactive: true },
  { id: 'sam21_large', label: 'SAM 2.1 large', hint: 'Asistido, máxima calidad (más lento).', interactive: true },
  { id: 'sam21_tiny', label: 'SAM 2.1 tiny', hint: 'Asistido y ligero.', interactive: true },
]
export const BG_PROVIDER_IDS = BG_PROVIDERS.map((p) => p.id)
export const SAM_PROVIDER_IDS = BG_PROVIDERS.filter((p) => p.interactive).map((p) => p.id)
export const DEFAULT_PROVIDER = 'u2net'

/** True para proveedores asistidos por puntos (SAM): el pincel = prompt. */
export function isInteractiveProvider(id) {
  return String(id || '').startsWith('sam')
}

export const BG_MODES = ['auto', 'chroma']
export const BG_KIND_OK = ['video', 'image']

export const MATTE_FEATHER_MAX = 0.15
export const MATTE_EXPAND_MAX = 0.06
export const CHROMA_EDGE_MAX = 0.03
export const MASK_FPS_MIN = 1
export const MASK_FPS_MAX = 60
export const MASK_HEIGHT_MIN = 128
export const MASK_HEIGHT_MAX = 1080
export const DEFAULT_MASK_FPS = 15
export const DEFAULT_MASK_HEIGHT = 512

export const EDIT_OPS = ['keep', 'erase']
export const BG_STATUS = ['idle', 'running', 'ready', 'error']

// Presets de color habituales del croma (el selector permite cualquiera).
export const CHROMA_PRESETS = [
  { id: 'green', label: 'Verde', color: '#00FF00' },
  { id: 'blue', label: 'Azul', color: '#0000FF' },
  { id: 'cyan', label: 'Cian', color: '#00FFFF' },
  { id: 'magenta', label: 'Magenta', color: '#FF00FF' },
]

// --- Modelo -----------------------------------------------------------------

export function normalizeHex(raw, fallback = '#00FF00') {
  let text = String(raw ?? '').trim()
  if (text.startsWith('0x') || text.startsWith('0X')) text = `#${text.slice(2)}`
  if (!text.startsWith('#')) text = `#${text}`
  let body = text.slice(1)
  if (body.length === 3) body = body.split('').map((c) => c + c).join('')
  if (body.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(body)) return fallback
  return `#${body.toUpperCase()}`
}

export function hexRgb(color) {
  const h = normalizeHex(color).slice(1)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function normalizeEdit(raw) {
  const e = raw && typeof raw === 'object' ? raw : {}
  const op = EDIT_OPS.includes(e.op) ? e.op : 'erase'
  const pts = (Array.isArray(e.points) ? e.points : [])
    .map((p) => ({ x: num(p?.x, NaN), y: num(p?.y, NaN), ...(p?.m ? { m: 1 } : {}) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!pts.length) return null
  return { op, size: clamp(num(e.size, 0.08), 0.002, 1), points: pts }
}

export function normalizeAuto(raw) {
  const a = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: !!a.enabled,
    provider: BG_PROVIDER_IDS.includes(a.provider) ? a.provider : DEFAULT_PROVIDER,
    model_version: String(a.model_version || ''),
    base_key: String(a.base_key || ''),
    status: BG_STATUS.includes(a.status) ? a.status : 'idle',
    error: a.error ? String(a.error) : null,
    mask_fps: Math.round(clamp(num(a.mask_fps, DEFAULT_MASK_FPS), MASK_FPS_MIN, MASK_FPS_MAX)),
    mask_height: Math.round(clamp(num(a.mask_height, DEFAULT_MASK_HEIGHT), MASK_HEIGHT_MIN, MASK_HEIGHT_MAX)),
    // stabilize: suavizado temporal (anti-parpadeo), propiedad del nivel 1.
    stabilize: clamp(num(a.stabilize, 0), 0, 1),
    threshold: clamp(num(a.threshold, 0.5), 0, 1),
    softness: clamp(num(a.softness, 0.25), 0, 1),
    feather: clamp(num(a.feather, 0), 0, MATTE_FEATHER_MAX),
    // expansion: >0 dilata el sujeto (crece), <0 lo contrae (encoge).
    expansion: clamp(num(a.expansion, 0), -1, 1),
    // opacity: opacidad del sujeto conservado (1 = opaco, 0 = transparente).
    opacity: clamp(num(a.opacity, 1), 0, 1),
    invert: !!a.invert,
    edits: (Array.isArray(a.edits) ? a.edits : []).map(normalizeEdit).filter(Boolean),
  }
}

export function normalizeChroma(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: !!c.enabled,
    color: normalizeHex(c.color),
    // Mismos nombres que FFmpeg para que no haya traducción que fallar.
    similarity: clamp(num(c.similarity, 0.20), 1e-5, 1),
    blend: clamp(num(c.blend, 0.10), 0, 1),
    spill: clamp(num(c.spill, 0), 0, 1),
    // edge: limpieza de bordes (contrae el alfa para quitar residuos finos).
    edge: clamp(num(c.edge, 0), 0, 1),
    // shrink: expansión (>0) / contracción (<0) del alfa del croma.
    shrink: clamp(num(c.shrink, 0), -1, 1),
  }
}

export function normalizeBg(raw) {
  if (!raw || typeof raw !== 'object' || !Object.keys(raw).length) return null
  return {
    enabled: raw.enabled !== false,
    mode: BG_MODES.includes(raw.mode) ? raw.mode : 'auto',
    auto: normalizeAuto(raw.auto),
    chroma: normalizeChroma(raw.chroma),
  }
}

export function clipBg(clip) {
  return normalizeBg(clip?.bg_removal)
}

/** ¿El clip admite eliminar fondo? Vídeo e imagen (incluye GIF). */
export function bgCapable(clip) {
  return BG_KIND_OK.includes(clip?.kind)
}

export function autoActive(bg) {
  if (!bg?.enabled) return false
  return !!(bg.auto.enabled && bg.auto.base_key && bg.auto.status === 'ready')
}

export function chromaActive(bg) {
  if (!bg?.enabled) return false
  return !!bg.chroma.enabled
}

/** True si el clip debe llevar alfa de fuente en preview y export. */
export function bgActive(clip) {
  if (!bgCapable(clip)) return false
  const bg = clipBg(clip)
  return autoActive(bg) || chromaActive(bg)
}

/** El usuario pidió eliminación automática (aunque aún no haya matte). */
export function autoRequested(clip) {
  const bg = clipBg(clip)
  return !!(bg?.enabled && bg.auto.enabled)
}

export function defaultBg() {
  return normalizeBg({ enabled: true, mode: 'auto', auto: {}, chroma: {} })
}

// --- Índice de fotograma del matte ------------------------------------------

/** Fotograma del matte para un instante ABSOLUTO de la fuente (0-based).
 *
 * Indexar por tiempo de fuente (y no por el recorte del clip) es lo que hace
 * que cortar, mover o duplicar el clip NO invalide la caché.
 * `floor(t*fps + 0.5)` iguala el redondeo del filtro `fps` de FFmpeg.
 */
export function matteFrameIndex(srcT, maskFps) {
  const fps = Math.max(MASK_FPS_MIN, Math.round(maskFps || DEFAULT_MASK_FPS))
  return Math.max(0, Math.floor(Math.max(0, num(srcT, 0)) * fps + 0.5))
}

export function matteFrameTime(index, maskFps) {
  const fps = Math.max(MASK_FPS_MIN, Math.round(maskFps || DEFAULT_MASK_FPS))
  return Math.max(0, Math.round(index)) / fps
}

/**
 * Fotograma del matte que toca, ACOTADO al rango disponible en la caché.
 *
 * Espejo de `read_matte_frame` en el backend, que acota igual. De ahí salen dos
 * comportamientos que el preview y el export comparten:
 *   - una imagen fija tiene un solo fotograma → siempre se usa el 0;
 *   - un clip más largo que lo ya procesado repite el último fotograma, igual
 *     que el `eof_action=repeat` del overlay.
 * `loopDur` > 0 (GIF animado) hace que el tiempo dé la vuelta, como su propio
 * reproductor.
 */
export function matteIndexFor(meta, srcTime, loopDur = 0) {
  const fps = meta?.mask_fps || DEFAULT_MASK_FPS
  let t = Math.max(0, num(srcTime, 0))
  if (loopDur > 0.02 && t > loopDur) t %= loopDur
  const idx = matteFrameIndex(t, fps)
  const lo = meta?.range?.[0] ?? 0
  const hi = meta?.range?.[1] ?? 0
  return Math.max(lo, Math.min(hi, idx))
}

// --- Derivación del matte (espejo exacto de Python) -------------------------

/** Remapeo de niveles: ventana `softness` centrada en `threshold`. */
export function matteLevels(a, threshold, softness) {
  const half = Math.max(0.002, softness * 0.5)
  const lo = threshold - half
  const hi = threshold + half
  return clamp((a - lo) / (hi - lo), 0, 1)
}

/** Aplica niveles + invertir a un buffer de alfa (Uint8ClampedArray, en sitio). */
export function applyMatteLevels(alpha, auto) {
  const { threshold, softness, invert } = auto
  const half = Math.max(0.002, softness * 0.5)
  const lo = threshold - half
  const span = (threshold + half) - lo
  // LUT de 256 entradas: una pasada por píxel sin divisiones.
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let v = clamp((i / 255 - lo) / span, 0, 1)
    if (invert) v = 1 - v
    lut[i] = Math.min(255, Math.floor(v * 255 + 0.5))
  }
  for (let i = 0; i < alpha.length; i++) alpha[i] = lut[alpha[i]]
  return alpha
}

// --- Chroma key (espejo bit a bit de FFmpeg) --------------------------------

// Coeficientes de punto fijo de swscale para RGB → U/V (BT.601 rango limitado).
// Son los que usa FFmpeg al pasar el material a `yuva444p`. Con coma flotante el
// resultado se desvía 1 LSB en algunos colores y el alfa del croma dejaría de
// coincidir con el export; verificado con 3000 colores en test_clip_bg.py.
const SW_SHIFT = 15
const SW_OFFSET = 4210943
const SW_RU = -4865; const SW_GU = -9528; const SW_BU = 14392
const SW_RV = 14392; const SW_GV = -12061; const SW_BV = -2332

/** U,V del FOTOGRAMA: BT.601 rango LIMITADO, con la aritmética de swscale. */
export function frameUv(r, g, b) {
  const u = (SW_RU * r + SW_GU * g + SW_BU * b + SW_OFFSET) >> SW_SHIFT
  const v = (SW_RV * r + SW_GV * g + SW_BV * b + SW_OFFSET) >> SW_SHIFT
  return [clamp(u, 0, 255), clamp(v, 0, 255)]
}

/** U,V de la CLAVE: BT.601 rango COMPLETO (JPEG), como hace `chromakey`.
 *
 * Sí, la clave y el fotograma usan rangos distintos. Es una peculiaridad de
 * FFmpeg, pero el export la tiene, así que el preview la reproduce.
 */
export function chromaKeyUv(color) {
  const [r, g, b] = hexRgb(color)
  const u = Math.round(-0.168736 * r - 0.331264 * g + 0.5 * b + 128)
  const v = Math.round(0.5 * r - 0.418688 * g - 0.081312 * b + 128)
  return [clamp(u, 0, 255), clamp(v, 0, 255)]
}

const CHROMA_NORM = 255 * 255 * 2

/** Alfa (0-255) de un píxel. Referencia usada por los tests de paridad. */
export function chromaAlpha8(r, g, b, chroma) {
  const [u, v] = frameUv(r, g, b)
  const [ku, kv] = chromaKeyUv(chroma.color)
  const du = u - ku
  const dv = v - kv
  const diff = Math.sqrt((du * du + dv * dv) / CHROMA_NORM)
  const a = chroma.blend > 1e-4
    ? clamp((diff - chroma.similarity) / chroma.blend, 0, 1)
    : (diff > chroma.similarity ? 1 : 0)
  return Math.trunc(a * 255)   // FFmpeg trunca al convertir a uint8
}

/** `green` o `blue` según el canal dominante de la clave. */
export function despillType(color) {
  const [, g, b] = hexRgb(color)
  return b > g ? 'blue' : 'green'
}

export const DESPILL_MIX = 0.5

/** Supresión de derrame. Espejo de `despill` (mix=0.5, escala = -spill). */
export function despillRgb(r, g, b, chroma) {
  const spill = chroma.spill
  if (spill <= 1e-4) return [r, g, b]
  let rf = r / 255
  let gf = g / 255
  let bf = b / 255
  if (despillType(chroma.color) === 'blue') {
    const smap = Math.max(0, bf - (rf * DESPILL_MIX + gf * (1 - DESPILL_MIX)))
    bf = Math.max(0, bf - spill * smap)
  } else {
    const smap = Math.max(0, gf - (rf * DESPILL_MIX + bf * (1 - DESPILL_MIX)))
    gf = Math.max(0, gf - spill * smap)
  }
  return [Math.trunc(rf * 255), Math.trunc(gf * 255), Math.trunc(bf * 255)]
}

/**
 * Aplica chroma key + despill sobre un ImageData RGBA en sitio.
 *
 * Una sola pasada con LUT de U/V precalculada por canal: el término lineal de
 * cada canal se tabula (256 entradas × 3) y por píxel solo quedan dos sumas y
 * una raíz. Es el camino caliente del preview.
 */
export function applyChromaKey(data, chroma) {
  const [ku, kv] = chromaKeyUv(chroma.color)
  const { similarity, blend, spill } = chroma
  const hasBlend = blend > 1e-4
  const doSpill = spill > 1e-4
  const blue = doSpill && despillType(chroma.color) === 'blue'
  // Términos de U y V tabulados por canal (entero, como swscale).
  const uR = new Int32Array(256); const uG = new Int32Array(256); const uB = new Int32Array(256)
  const vR = new Int32Array(256); const vG = new Int32Array(256); const vB = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    uR[i] = SW_RU * i; uG[i] = SW_GU * i; uB[i] = SW_BU * i
    vR[i] = SW_RV * i; vG[i] = SW_GV * i; vB[i] = SW_BV * i
  }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    let u = (uR[r] + uG[g] + uB[b] + SW_OFFSET) >> SW_SHIFT
    let v = (vR[r] + vG[g] + vB[b] + SW_OFFSET) >> SW_SHIFT
    if (u < 0) u = 0; else if (u > 255) u = 255
    if (v < 0) v = 0; else if (v > 255) v = 255
    const du = u - ku
    const dv = v - kv
    const diff = Math.sqrt((du * du + dv * dv) / CHROMA_NORM)
    let a
    if (hasBlend) {
      a = (diff - similarity) / blend
      if (a < 0) a = 0; else if (a > 1) a = 1
    } else {
      a = diff > similarity ? 1 : 0
    }
    // El alfa del croma MULTIPLICA el que ya trajera el píxel (PNG/WebM con alfa).
    data[i + 3] = Math.trunc((data[i + 3] / 255) * Math.trunc(a * 255))
    if (doSpill) {
      const rf = r / 255
      const gf = g / 255
      const bf = b / 255
      if (blue) {
        const smap = Math.max(0, bf - (rf * DESPILL_MIX + gf * (1 - DESPILL_MIX)))
        data[i + 2] = Math.trunc(Math.max(0, bf - spill * smap) * 255)
      } else {
        const smap = Math.max(0, gf - (rf * DESPILL_MIX + bf * (1 - DESPILL_MIX)))
        data[i + 1] = Math.trunc(Math.max(0, gf - spill * smap) * 255)
      }
    }
  }
  return data
}

/** (sigmaFrac, bias) para limpiar/expandir el alfa del croma. Espejo de Python.
 *  sigmaFrac es fracción del ALTO; bias en [-1,1] (negativo contrae). */
export function chromaMorphParams(chroma) {
  const edge = chroma?.edge || 0
  const shrink = chroma?.shrink || 0
  if (edge < 1e-4 && Math.abs(shrink) < 1e-4) return [0, 0]
  const sigmaFrac = Math.max(edge * CHROMA_EDGE_MAX, Math.abs(shrink) * MATTE_EXPAND_MAX)
  const bias = shrink * 0.5 - edge * 0.5
  return [sigmaFrac, bias]
}

// --- Claves de caché (espejo de Python, para saber si hay que re-pedir) -----

/** Firma de los ajustes que SÍ obligan a re-ejecutar el modelo. */
export function baseSignature(auto) {
  return [auto.provider, auto.mask_fps, auto.mask_height, auto.stabilize].join('|')
}
