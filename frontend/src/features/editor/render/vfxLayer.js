// Efectos de vídeo (`clip.vfx`) en el preview: la etapa que va tras GIF y
// recorte de fondo en `drawSourceFor`. Para el resto del dibujo el resultado
// «es» la fuente (mismo gancho que el recorte de Eliminar fondo).
//
// Margen: si el clip es un objeto libre que muestra la imagen entera
// (`vfxPadAllowed`, espejo de fx_bake.pad_allowed), la fuente crece por el
// margen de la pila y la geometría se calcula con un material VIRTUAL más
// grande (`videoWidth/videoHeight`): como la escala es «1 px de fuente = 1 px de
// salida», el destino crece igual y mantiene el centro — lo mismo que hace el
// export al componer el archivo horneado, que mide eso mismo.

import { animClipDur } from '../../../fx/core/animEval.js'
import { clipVfx, renderVfx, vfxPadFrac } from '../../../fx/core/runtime.js'
import { cropWindow, isOverlay, mediaSize } from '../../../lib/clipLayout.js'

const memo = new WeakMap()   // clip -> { entries, padKey, pad }
const last = new Map()       // clip.id -> { clip, t, src, out }

function speedOf(clip) {
  let s = Number(clip?.speed)
  if (['text', 'image', 'shape', 'adjustment'].includes(clip?.kind) || !Number.isFinite(s) || s <= 0) s = 1
  return Math.min(10, Math.max(0.1, s))
}

/** El margen se ve solo en un objeto libre sin recorte (inicio, mitad y final). */
export function vfxPadAllowed(clip, w, h, outW, outH) {
  if (!isOverlay(clip) || !(w > 0) || !(h > 0) || !(outW > 0) || !(outH > 0)) return false
  const dur = animClipDur(clip)
  const inp = Number(clip.in_point) || 0
  const spd = speedOf(clip)
  for (const lt of [0, dur / 2, dur]) {
    const c = cropWindow(clip, w / h, outW / outH, inp + lt * spd, lt)
    if (c.wf < 0.999 || c.hf < 0.999) return false
  }
  return true
}

function info(clip, w, h, outW, outH) {
  let m = memo.get(clip)
  if (!m) {
    m = { entries: clipVfx(clip), padKey: '', pad: false }
    memo.set(clip, m)
  }
  const key = `${w}x${h}@${outW}x${outH}`
  if (m.padKey !== key) {
    m.padKey = key
    m.pad = m.entries.length > 0 && vfxPadFrac(m.entries) > 0 && vfxPadAllowed(clip, w, h, outW, outH)
  }
  return m
}

/**
 * Fuente con los efectos aplicados, o null si el clip no tiene ninguno activo.
 * Devuelve `{ canvas, media }`: `media` es el material para la geometría (el
 * real, o uno virtual más grande si hay margen).
 */
export function vfxDrawable(clip, drawable, media, localT, outW, outH) {
  if (!Array.isArray(clip?.vfx) || !clip.vfx.length) return null
  const { w, h } = mediaSize(media)
  const m = info(clip, w, h, outW, outH)
  if (!m.entries.length) return null
  // En pausa (mismo clip, mismo instante, misma fuente quieta) se reutiliza el
  // último resultado: el rAF del editor redibuja en cada fotograma.
  const prev = last.get(clip.id)
  const still = !(typeof HTMLVideoElement !== 'undefined' && media instanceof HTMLVideoElement && !media.paused)
  if (prev && still && prev.clip === clip && prev.t === localT && prev.src === drawable && prev.out) return prev.out
  const r = renderVfx({
    source: drawable, w, h, entries: m.entries, t: localT, clipDur: animClipDur(clip),
    padAllowed: m.pad, key: clip.id,
  })
  if (!r) {
    last.delete(clip.id)
    return null
  }
  const pad = r.layout.padSrc
  const out = {
    canvas: r.canvas,
    media: m.pad && pad > 0 ? { videoWidth: w + 2 * pad, videoHeight: h + 2 * pad } : media,
  }
  last.set(clip.id, { clip, t: localT, src: drawable, out })
  return out
}

export function releaseVfxMemo(aliveIds) {
  for (const id of [...last.keys()]) if (!aliveIds.has(id)) last.delete(id)
}
