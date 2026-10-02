// Runtime de los efectos de vídeo (`clip.vfx`): aplica la pila de efectos de un
// clip a un fotograma. Lo usan el preview (render/canvas.js, etapa tras GIF y
// recorte de fondo) y la página del export (fx/render/entry.js), así que lo que
// se ve es lo que se exporta.
//
// `clip.vfx = [{ uid, effect, v, enabled, params, from, to }]`: `from`/`to` en
// segundos locales del clip (`to` null = hasta el final). El orden del array es
// el orden de aplicación.
//
// Margen (`pad`): un efecto que pinta fuera de la imagen (sombra, borde de papel)
// declara un margen en fracción del lado menor. Solo se usa si el clip es un
// objeto libre que muestra la imagen ENTERA (`padAllowed`); si no, el efecto se
// aplica igual pero lo que cae fuera de la imagen no se ve (así se comportan el
// preview y el export).

import { createLruBytes, pixelBytes } from '../../lib/lruBytes.js'
import { getEffect } from '../registry.js'
import { runShader } from './gl.js'
import { resolveParams } from './params.js'
import { rng } from './rand.js'

export const PREVIEW_MAX_SIDE = 1280
export const FX_FPS = 30   // cadencia de `frame` (azar por fotograma), fija para todos

// Canvas de trabajo por clip (dos por clip: las etapas se alternan).
const outCache = createLruBytes({ maxBytes: 160 * 1024 * 1024, name: 'fx-out' })

function num(v, d) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

let uidSeq = 0
export function newVfxUid() {
  uidSeq += 1
  return `fx${Date.now().toString(36)}${uidSeq.toString(36)}`
}

/** Entrada `vfx` normalizada (null si el efecto no existe). */
export function normalizeVfxEntry(raw) {
  const effect = getEffect(raw?.effect)
  if (!effect) return null
  const from = Math.max(0, num(raw.from, 0))
  const to = raw.to == null ? null : Math.max(from, num(raw.to, from))
  return {
    uid: String(raw.uid || newVfxUid()),
    effect: effect.id,
    v: Math.max(1, Math.round(num(raw.v, effect.v))),
    enabled: raw.enabled !== false,
    params: resolveParams(effect, raw.params),
    from,
    to,
  }
}

/** Entrada nueva de un efecto con sus valores por defecto. */
export function makeVfxEntry(effectId, { params, from = 0, to = null } = {}) {
  const effect = getEffect(effectId)
  if (!effect) return null
  const dur = effect.defaultDur
  return normalizeVfxEntry({
    uid: newVfxUid(), effect: effect.id, v: effect.v, enabled: true, params, from,
    to: to ?? (dur != null ? from + dur : null),
  })
}

/** Efectos de vídeo aplicables del clip (activos, conocidos, no generadores). */
export function clipVfx(clip) {
  const list = Array.isArray(clip?.vfx) ? clip.vfx : []
  const out = []
  for (const raw of list) {
    if (!raw || raw.enabled === false) continue
    const e = normalizeVfxEntry(raw)
    if (e && getEffect(e.effect).engine !== 'generator') out.push(e)
  }
  return out
}

export function hasVfx(clip) {
  return clipVfx(clip).length > 0
}

/** Tramo [from, to) del efecto dentro de un clip de `clipDur` segundos. */
export function vfxWindow(entry, clipDur) {
  const to = entry.to == null ? clipDur : Math.min(clipDur, entry.to)
  return { from: Math.min(entry.from, clipDur), to }
}

export function vfxActiveAt(entries, t, clipDur) {
  return entries.filter((e) => {
    const w = vfxWindow(e, clipDur)
    return t >= w.from && t < w.to + 1e-6
  })
}

/** Margen total (fracción del lado menor) de la pila entera del clip. */
export function vfxPadFrac(entries) {
  let p = 0
  for (const e of entries) p += getEffect(e.effect)?.pad || 0
  return Math.min(0.5, p)
}

/**
 * Tamaños del lienzo de salida. `w`×`h` = contenido en px de la fuente; `k` =
 * px de salida por px de fuente (≤1 si se limita el lado mayor).
 */
export function vfxLayout(w, h, padFrac, maxSide = Infinity) {
  const k = Math.min(1, maxSide / Math.max(1, w, h))
  const cw0 = Math.max(2, Math.round(w * k))
  const ch0 = Math.max(2, Math.round(h * k))
  const P = padFrac > 0 ? Math.max(1, Math.round(padFrac * Math.min(cw0, ch0))) : 0
  const cw = cw0 + 2 * P
  const ch = ch0 + 2 * P
  return {
    k, cw0, ch0, P, cw, ch,
    content: [P / cw, P / ch, (P + cw0) / cw, (P + ch0) / ch],
    // Margen en px de la FUENTE (para la geometría del clip).
    padSrc: k > 0 ? P / k : 0,
  }
}

function workCanvas(key, i, cw, ch) {
  const k = `${key}:${i}`
  let c = outCache.get(k)
  if (!c) {
    if (typeof document === 'undefined') return null
    c = document.createElement('canvas')
    outCache.set(k, c, 0)
  }
  if (c.width !== cw || c.height !== ch) {
    c.width = cw
    c.height = ch
    outCache.resize(k, pixelBytes(c))
  }
  return c
}

/**
 * Aplica la pila a un fotograma.
 *
 * - `source`: lo que se dibuja (vídeo, canvas del recorte, VideoFrame…).
 * - `w`, `h`: tamaño del contenido en px de la FUENTE (el material).
 * - `entries`: `clipVfx(clip)`; `t`: tiempo local del clip; `clipDur`.
 * - `padAllowed`: si el margen de los efectos puede verse.
 * - `key`: id estable para los canvas de trabajo; `target`: canvas donde dejar
 *   el resultado (el export); si no, se devuelve uno de la caché.
 *
 * Devuelve `{ canvas, layout }` o null si no hay ningún efecto activo en `t` y
 * el clip no tiene margen (entonces se dibuja la fuente tal cual).
 */
export function renderVfx({ source, w, h, entries, t, clipDur, padAllowed = false, key = 'fx', maxSide = PREVIEW_MAX_SIDE, target = null }) {
  if (!source || !entries?.length || !(w > 0) || !(h > 0)) return null
  const padFrac = padAllowed ? vfxPadFrac(entries) : 0
  const active = vfxActiveAt(entries, t, clipDur)
  if (!active.length && !padFrac && !target) return null
  const L = vfxLayout(w, h, padFrac, maxSide)
  const { cw, ch, content } = L

  let input = source
  let srcRect = [0, 0, 1, 1]   // contenido dentro de la entrada (uv)
  let out = null
  const stages = active.length ? active : [null]
  for (let i = 0; i < stages.length; i++) {
    const last = i === stages.length - 1
    out = last && target ? target : workCanvas(key, i % 2, cw, ch)
    if (!out) return null
    if (out.width !== cw || out.height !== ch) { out.width = cw; out.height = ch }
    const g = out.getContext('2d')
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    g.filter = 'none'
    g.clearRect(0, 0, cw, ch)
    const entry = stages[i]
    const effect = entry && getEffect(entry.effect)
    if (!effect) {
      // Sin efecto activo pero con margen: la fuente centrada en el lienzo.
      drawContent(g, input, srcRect, L)
    } else {
      const win = vfxWindow(entry, clipDur)
      const time = Math.max(0, t - win.from)
      const dur = Math.max(1e-3, win.to - win.from)
      const frame = Math.floor(time * FX_FPS + 1e-6)
      // Valores resueltos siempre (una entrada sin normalizar trae params parciales).
      const params = resolveParams(effect, entry.params)
      const seed = Number(params.seed ?? 1) || 1
      if (effect.engine === 'shader') {
        const glc = runShader(effect, input, {
          cw, ch, srcRect, content, time, dur, frame, seed, params,
        })
        if (glc) g.drawImage(glc, 0, 0)
        else drawContent(g, input, srcRect, L)   // sin WebGL2: la fuente sin efecto
      } else {
        effect.render({
          ctx: g, src: input, srcRect: rectPx(input, srcRect, w, h),
          content: { x: L.P, y: L.P, w: L.cw0, h: L.ch0 }, cw, ch,
          minSide: Math.min(L.cw0, L.ch0), scale: L.k,
          t: time, dur, progress: Math.min(1, time / dur), frame, seed,
          params, rand: rng(seed, frame),
        })
      }
    }
    input = out
    srcRect = content
  }
  return { canvas: out, layout: L }
}

function sizeOf(el, w, h) {
  const sw = Number(el?.videoWidth || el?.naturalWidth || el?.displayWidth || el?.width || 0)
  const sh = Number(el?.videoHeight || el?.naturalHeight || el?.displayHeight || el?.height || 0)
  return sw && sh ? { sw, sh } : { sw: w, sh: h }
}

function rectPx(el, r, w, h) {
  const { sw, sh } = sizeOf(el, w, h)
  return { x: r[0] * sw, y: r[1] * sh, w: (r[2] - r[0]) * sw, h: (r[3] - r[1]) * sh }
}

function drawContent(g, input, srcRect, L) {
  const r = rectPx(input, srcRect, L.cw0, L.ch0)
  try { g.drawImage(input, r.x, r.y, r.w, r.h, L.P, L.P, L.cw0, L.ch0) } catch { /* fuente sin datos aún */ }
}

/** Suelta los canvas de trabajo de los clips que ya no existen. */
export function releaseDeadVfx(aliveIds) {
  outCache.purge((k) => aliveIds.has(k.slice(0, k.lastIndexOf(':'))))
}
