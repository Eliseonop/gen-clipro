// Eliminar fondo en el PREVIEW: produce un "recorte" (canvas con alfa) del
// material y lo sustituye como fuente de dibujo del clip.
//
// Aprovecha el mismo gancho que ya usa el GIF animado en render/canvas.js:
//
//     const drawEl = cutoutDrawable(clip, el, srcTime) || gifDrawable(...) || el
//
// El canvas devuelto conserva el ASPECTO del material, así que toda la geometría
// posterior (recorte, encuadre, pose, keyframes, máscaras) sigue funcionando sin
// cambios: para el resto del editor es "la fuente", solo que con agujeros.
//
// Reparto de trabajo con el backend:
//   * el backend sirve el matte CRUDO del modelo (nivel 1 de la caché), que es
//     inmutable para una base_key → el navegador lo cachea y mover un slider no
//     vuelve a pedir red;
//   * aquí se aplican umbral/suavizado/invertir (LUT de clipBg, la MISMA que usa
//     Python), la pluma y las correcciones del pincel.
// El export hace exactamente lo mismo sobre los mismos PNG, de ahí la paridad.
import {
  applyChromaKey, applyMatteLevels, autoActive, chromaActive, chromaMorphParams,
  clipBg, matteIndexFor, MATTE_EXPAND_MAX,
} from '../../lib/clipBg'
import { mediaSize } from '../../lib/clipLayout'

// Techo de resolución del recorte. Con croma hay una pasada por píxel en JS, así
// que se recorta más: el lienzo del preview es bastante menor y no se nota.
const MAX_SIDE_MATTE = 1280
const MAX_SIDE_CHROMA = 960

// Fotogramas de matte que se mantienen descargados (~16 s a 15 fps).
const MATTE_IMG_MAX = 260
// Fotogramas que se piden por adelantado para que la reproducción no tirite.
const PREFETCH = 6

const matteImgs = new Map()   // `${baseKey}/${idx}` -> HTMLImageElement
const metas = new Map()       // baseKey -> meta | 'loading' | 'error'
const alphaCache = new Map()  // clipId -> { sig, canvas }
const cutCache = new Map()    // clipId -> { sig, canvas }
const blurCache = new Map()   // clipId -> { sig, canvas } (auxiliar de la pluma)
const grayCache = new Map()   // clipId -> { sig, canvas } (alfa como gris, croma)

function evict(map, max) {
  while (map.size > max) {
    const first = map.keys().next()
    if (first.done) return
    map.delete(first.value)
  }
}

/** Metadatos del matte en caché (rango disponible, cadencia). Los pide una vez. */
export function bgMeta(baseKey) {
  if (!baseKey) return null
  const hit = metas.get(baseKey)
  if (hit && typeof hit === 'object') return hit
  if (hit) return null   // 'loading' | 'error'
  metas.set(baseKey, 'loading')
  fetch(`/api/bg/status/${encodeURIComponent(baseKey)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((m) => metas.set(baseKey, m))
    .catch(() => metas.set(baseKey, 'error'))
  return null
}

export function bgMetaState(baseKey) {
  const hit = metas.get(baseKey)
  if (!hit) return 'unknown'
  return typeof hit === 'object' ? 'ready' : hit
}

function matteImage(baseKey, idx) {
  const key = `${baseKey}/${idx}`
  let img = matteImgs.get(key)
  if (img) {
    // refrescar el orden de uso (Map conserva el orden de inserción)
    matteImgs.delete(key)
    matteImgs.set(key, img)
    return img.complete && img.naturalWidth ? img : null
  }
  img = new Image()
  img.decoding = 'sync'
  img.src = `/api/bg/matte/${encodeURIComponent(baseKey)}/${idx}.png`
  matteImgs.set(key, img)
  evict(matteImgs, MATTE_IMG_MAX)
  return null
}

function scratch(store, id, w, h) {
  let entry = store.get(id)
  if (!entry) {
    if (typeof document === 'undefined') return null
    entry = { sig: '', canvas: document.createElement('canvas') }
    store.set(id, entry)
    evict(store, 24)
  }
  const cv = entry.canvas
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
  return entry
}

function editsSig(edits) {
  if (!edits?.length) return ''
  let n = 0
  for (const e of edits) n += e.points.length
  return `${edits.length}:${n}:${edits[edits.length - 1].size}`
}

/** Pinta las correcciones del pincel sobre el canvas del alfa (ya con niveles).
 *
 * `keep` pinta alfa opaco; `erase` lo borra (destination-out). Es el mismo
 * orden que ``derive_matte`` en Python: primero conservar, luego eliminar, así
 * que eliminar siempre gana en un punto pintado con las dos.
 */
function paintEdits(ctx, edits, w, h) {
  for (const op of ['keep', 'erase']) {
    const picked = edits.filter((e) => e.op === op)
    if (!picked.length) continue
    ctx.save()
    ctx.globalCompositeOperation = op === 'keep' ? 'source-over' : 'destination-out'
    ctx.strokeStyle = '#fff'
    ctx.fillStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const e of picked) {
      ctx.lineWidth = Math.max(1, e.size * h)
      let start = true
      ctx.beginPath()
      for (const p of e.points) {
        if (p.m && !start) { ctx.stroke(); ctx.beginPath(); start = true }
        if (start) { ctx.moveTo(p.x * w, p.y * h); start = false } else { ctx.lineTo(p.x * w, p.y * h) }
      }
      ctx.stroke()
      // trazo de un solo punto: la línea no pinta nada, hace falta el círculo
      for (const p of e.points) {
        if (e.points.length > 1) break
        ctx.beginPath()
        ctx.arc(p.x * w, p.y * h, Math.max(0.5, (e.size * h) / 2), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

/** Difumina el alfa del canvas EN SITIO (mismo gancho que la pluma). */
function blurCanvasInPlace(entry, clip, w, h, sigma) {
  const blur = scratch(blurCache, clip.id, w, h)
  if (!blur) return
  const bctx = blur.canvas.getContext('2d')
  bctx.setTransform(1, 0, 0, 1, 0, 0)
  bctx.globalCompositeOperation = 'source-over'
  bctx.globalAlpha = 1
  bctx.clearRect(0, 0, w, h)
  bctx.filter = `blur(${sigma.toFixed(2)}px)`
  bctx.drawImage(entry.canvas, 0, 0)
  bctx.filter = 'none'
  const ctx = entry.canvas.getContext('2d', { willReadFrequently: true })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(blur.canvas, 0, 0)
}

/** Limpia/expande SOLO el canal alfa del croma (blur del alfa + sesgo + clamp).
 *
 * El blur del canvas afecta a todos los canales, así que el alfa se vuelca a un
 * canvas gris opaco, se difumina ahí y se devuelve al alfa — el RGB no se toca.
 * Espejo de ``chroma_alpha_ffmpeg`` (alphaextract → gblur → lut) del export.
 */
function morphChromaAlpha(ctx, clip, w, h, sigma, bias) {
  const src = ctx.getImageData(0, 0, w, h)
  const k = Math.round(bias * 255)
  if (sigma > 0.3) {
    const gray = scratch(grayCache, clip.id, w, h)
    const blur = scratch(blurCache, clip.id, w, h)
    if (gray && blur) {
      const gctx = gray.canvas.getContext('2d', { willReadFrequently: true })
      gctx.setTransform(1, 0, 0, 1, 0, 0)
      const gi = gctx.createImageData(w, h)
      for (let i = 0; i < src.data.length; i += 4) {
        const a = src.data[i + 3]
        gi.data[i] = a; gi.data[i + 1] = a; gi.data[i + 2] = a; gi.data[i + 3] = 255
      }
      gctx.putImageData(gi, 0, 0)
      const bctx = blur.canvas.getContext('2d', { willReadFrequently: true })
      bctx.setTransform(1, 0, 0, 1, 0, 0)
      bctx.globalCompositeOperation = 'source-over'
      bctx.globalAlpha = 1
      bctx.clearRect(0, 0, w, h)
      bctx.filter = `blur(${sigma.toFixed(2)}px)`
      bctx.drawImage(gray.canvas, 0, 0)
      bctx.filter = 'none'
      const bd = bctx.getImageData(0, 0, w, h)
      for (let i = 0; i < src.data.length; i += 4) {
        const v = bd.data[i] + k       // canal R = alfa difuminado
        src.data[i + 3] = v < 0 ? 0 : v > 255 ? 255 : v
      }
      ctx.putImageData(src, 0, 0)
      return
    }
  }
  if (k) {
    for (let i = 3; i < src.data.length; i += 4) {
      const v = src.data[i] + k
      src.data[i] = v < 0 ? 0 : v > 255 ? 255 : v
    }
    ctx.putImageData(src, 0, 0)
  }
}

/** Canvas cuyo ALFA es el matte final del clip (niveles+invertir, pluma, pincel). */
function matteAlphaCanvas(clip, auto, meta, srcTime, w, h, loopDur) {
  const idx = matteIndexFor(meta, srcTime, loopDur)
  // Pedir por adelantado los siguientes: la reproducción va a necesitarlos.
  for (let k = 1; k <= PREFETCH; k++) {
    const next = Math.min(meta.range[1], idx + k)
    if (next !== idx) matteImage(auto.base_key, next)
  }
  const img = matteImage(auto.base_key, idx)
  if (!img) return null

  const sig = [auto.base_key, idx, auto.threshold, auto.softness, auto.feather,
    auto.expansion, auto.opacity, auto.invert ? 1 : 0, editsSig(auto.edits),
    `${w}x${h}`].join('|')
  const entry = scratch(alphaCache, clip.id, w, h)
  if (!entry) return null
  if (entry.sig === sig) return entry.canvas

  const ctx = entry.canvas.getContext('2d', { willReadFrequently: true })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  // Niveles + invertir con la MISMA LUT que Python (paridad exacta).
  const data = ctx.getImageData(0, 0, w, h)
  applyMatteLevels(data.data, auto)
  ctx.putImageData(data, 0, 0)
  // Expansión/contracción: difuminar el alfa y sesgarlo (espejo de expand_alpha).
  // Cerca del borde el alfa difuminado sube en rampa; sumarle un sesgo mueve el
  // cruce y el clamp lo endurece → el contorno crece (>0) o encoge (<0).
  const expansion = auto.expansion || 0
  if (Math.abs(expansion) > 1e-4) {
    const se = Math.abs(expansion) * MATTE_EXPAND_MAX * h
    if (se > 0.3) blurCanvasInPlace(entry, clip, w, h, se)
    const d = ctx.getImageData(0, 0, w, h)
    const k = Math.round(expansion * 0.5 * 255)
    for (let i = 3; i < d.data.length; i += 4) {
      const v = d.data[i] + k
      d.data[i] = v < 0 ? 0 : v > 255 ? 255 : v
    }
    ctx.putImageData(d, 0, 0)
  }
  // Pluma: equivalente a la gaussiana de cv2 (misma convención que clipMask).
  const sigma = auto.feather * h
  if (sigma > 0.3) blurCanvasInPlace(entry, clip, w, h, sigma)
  if (auto.edits.length) paintEdits(ctx, auto.edits, w, h)
  // Opacidad del sujeto: escala el alfa final (espejo de out*opacity en Python).
  const opacity = auto.opacity ?? 1
  if (opacity < 1) {
    const d = ctx.getImageData(0, 0, w, h)
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = Math.floor(d.data[i] * opacity + 0.5)
    ctx.putImageData(d, 0, 0)
  }
  entry.sig = sig
  return entry.canvas
}

/**
 * Recorte del clip para el preview, o `null` si no hay nada que recortar
 * (entonces el llamador usa el elemento original, como siempre).
 *
 * `loopDur` es la duración intrínseca del material cuando se repite (GIF), para
 * indexar el matte igual que lo hace el reproductor del GIF.
 */
export function cutoutDrawable(clip, el, srcTime, loopDur = 0) {
  const bg = clipBg(clip)
  if (!bg) return null
  const wantChroma = chromaActive(bg)
  const wantMatte = autoActive(bg)
  if (!wantChroma && !wantMatte) return null
  const { w: sw, h: sh } = mediaSize(el)
  if (!sw || !sh) return null

  const meta = wantMatte ? bgMeta(bg.auto.base_key) : null
  if (wantMatte && !meta) {
    // El matte está marcado como listo pero aún no llegaron sus metadatos: no
    // dibujar a medias (se vería el fondo un instante). Sin croma, sin recorte.
    if (!wantChroma) return null
  }

  const cap = wantChroma ? MAX_SIDE_CHROMA : MAX_SIDE_MATTE
  const scale = Math.min(1, cap / Math.max(sw, sh))
  const w = Math.max(2, Math.round(sw * scale))
  const h = Math.max(2, Math.round(sh * scale))

  const alpha = (wantMatte && meta)
    ? matteAlphaCanvas(clip, bg.auto, meta, srcTime, w, h, loopDur)
    : null
  if (wantMatte && meta && !alpha && !wantChroma) return null

  const chromaSig = wantChroma
    ? `${bg.chroma.color}:${bg.chroma.similarity}:${bg.chroma.blend}:${bg.chroma.spill}`
      + `:${bg.chroma.edge}:${bg.chroma.shrink}`
    : ''
  const alphaSig = alpha ? alphaCache.get(clip.id)?.sig || '' : ''
  const sig = [`${w}x${h}`, chromaSig, alphaSig, wantChroma ? srcTime.toFixed(4) : ''].join('#')
  const entry = scratch(cutCache, clip.id, w, h)
  if (!entry) return null
  if (entry.sig === sig) return entry.canvas

  const ctx = entry.canvas.getContext('2d', { willReadFrequently: wantChroma })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.clearRect(0, 0, w, h)
  try { ctx.drawImage(el, 0, 0, w, h) } catch { return null }
  if (wantChroma) {
    const data = ctx.getImageData(0, 0, w, h)
    applyChromaKey(data.data, bg.chroma)
    ctx.putImageData(data, 0, 0)
    const [sf, bias] = chromaMorphParams(bg.chroma)
    if (sf > 0 || Math.abs(bias) > 1e-4) morphChromaAlpha(ctx, clip, w, h, sf * h, bias)
  }
  if (alpha) {
    // destination-in multiplica el alfa: el del croma y el del matte se combinan
    // igual que el `blend=multiply` del filtergraph del export.
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(alpha, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }
  entry.sig = sig
  return entry.canvas
}

/** Olvida lo cacheado de un clip (al borrarlo, o al recalcular su matte). */
export function resetCutout(clipId) {
  if (clipId == null) {
    alphaCache.clear()
    cutCache.clear()
    blurCache.clear()
    grayCache.clear()
    matteImgs.clear()
    metas.clear()
    return
  }
  alphaCache.delete(clipId)
  cutCache.delete(clipId)
  blurCache.delete(clipId)
  grayCache.delete(clipId)
}

/** Invalida los metadatos de una base_key (tras ampliar el rango del matte). */
export function resetBgMeta(baseKey) {
  if (baseKey) metas.delete(baseKey)
  else metas.clear()
}
