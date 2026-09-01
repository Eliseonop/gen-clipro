// Matemática de reencuadre/paneo compartida por el editor de vídeo.
// Los keyframes son { t, cx, cy, zoom?, pan_mode? } con t en segundos (relativo a la fuente)
// y cx/cy el centro de la ventana de recorte en coordenadas normalizadas (0-1).

import { containDest, splitOrientationFor } from './recipeLayout.js'

export const OUT_RATIO = 9 / 16

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const r2 = (x) => Math.round(x * 100) / 100
export const r4 = (x) => Math.round(x * 10000) / 10000

function zoomOf(k, fallback = 1) {
  const z = k?.zoom
  return z == null ? fallback : clamp(z, 0.1, 1)
}

function modeOf(k, fallback = 'smooth') {
  if (k?.pan_mode === 'direct') return 'direct'
  if (k?.pan_mode === 'smooth') return 'smooth'
  return fallback === 'direct' ? 'direct' : 'smooth'
}

function fitOf(k, fallback = 'cover') {
  if (k?.fit === 'contain') return 'contain'
  if (k?.fit === 'cover') return 'cover'
  return fallback === 'contain' ? 'contain' : 'cover'
}

/** Centro, zoom, modo y fit en `time`. El punto de destino define cómo se llega a él. */
export function frameAt(kfs, time, fallbackZoom = 1, fallbackMode = 'smooth') {
  if (!kfs || !kfs.length) {
    return { cx: 0.5, cy: 0.5, zoom: fallbackZoom, pan_mode: fallbackMode, fit: 'cover' }
  }
  const s = [...kfs].sort((a, b) => a.t - b.t)
  if (time <= s[0].t) {
    return {
      cx: s[0].cx, cy: s[0].cy, zoom: zoomOf(s[0], fallbackZoom),
      pan_mode: modeOf(s[0], fallbackMode), fit: fitOf(s[0]),
    }
  }
  const last = s[s.length - 1]
  if (time >= last.t) {
    return {
      cx: last.cx, cy: last.cy, zoom: zoomOf(last, fallbackZoom),
      pan_mode: modeOf(last, fallbackMode), fit: fitOf(last),
    }
  }

  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1]
    if (time >= a.t && time <= b.t) {
      const arrive = modeOf(b, fallbackMode)
      const za = zoomOf(a, fallbackZoom)
      const zb = zoomOf(b, fallbackZoom)
      if (arrive === 'direct') {
        return { cx: a.cx, cy: a.cy, zoom: za, pan_mode: 'direct', fit: fitOf(a) }
      }
      const f = (time - a.t) / ((b.t - a.t) || 1)
      return {
        cx: a.cx + (b.cx - a.cx) * f,
        cy: a.cy + (b.cy - a.cy) * f,
        zoom: za + (zb - za) * f,
        pan_mode: 'smooth',
        fit: fitOf(b),
      }
    }
  }
  return {
    cx: last.cx, cy: last.cy, zoom: zoomOf(last, fallbackZoom),
    pan_mode: modeOf(last, fallbackMode), fit: fitOf(last),
  }
}

export function posAt(kfs, time, panMode = 'smooth') {
  const f = frameAt(kfs, time, 1, panMode)
  return { cx: f.cx, cy: f.cy }
}

// Fracción de ancho/alto de la ventana de recorte respecto al fotograma fuente.
export function geomFor(zoom, srcAspect, targetAspect = OUT_RATIO) {
  const heightFrac = clamp(zoom, 0.1, 1)
  const widthFrac = Math.min(1, (heightFrac * targetAspect) / srcAspect)
  return { widthFrac, heightFrac }
}

export function clampCenter(cx, cy, zoom, srcAspect, targetAspect = OUT_RATIO) {
  const { widthFrac: wf, heightFrac: hf } = geomFor(zoom, srcAspect, targetAspect)
  const wx = wf / 2, wy = hf / 2
  return {
    cx: wf >= 1 ? 0.5 : clamp(cx, wx, 1 - wx),
    cy: hf >= 1 ? 0.5 : clamp(cy, wy, 1 - wy),
  }
}

/** Recorte de fuente y destino en px para un hueco (`dest` ya en píxeles). */
export function sourceDrawRect(fr, srcW, srcH, dest, slotAspect = OUT_RATIO) {
  const srcAspect = srcW / Math.max(1, srcH)
  if (fr.fit === 'contain') {
    const box = containDest(dest.dw, dest.dh, srcW, srcH)
    return {
      sx: 0, sy: 0, sw: srcW, sh: srcH,
      dx: dest.dx + box.dx, dy: dest.dy + box.dy, dw: box.dw, dh: box.dh,
    }
  }
  const zoom = fr.zoom
  const { widthFrac: wf, heightFrac: hf } = geomFor(zoom, srcAspect, slotAspect)
  const p = clampCenter(fr.cx, fr.cy, zoom, srcAspect, slotAspect)
  const sw = wf * srcW, sh = hf * srcH
  return {
    sx: clamp((p.cx - wf / 2) * srcW, 0, Math.max(0, srcW - sw)),
    sy: clamp((p.cy - hf / 2) * srcH, 0, Math.max(0, srcH - sh)),
    sw, sh,
    dx: dest.dx, dy: dest.dy, dw: dest.dw, dh: dest.dh,
  }
}

/** Zoom (fracción de altura) al arrastrar una esquina, manteniendo el aspecto. */
export function zoomFromCorner(nx, ny, cx, cy, srcAspect, targetAspect = OUT_RATIO) {
  const dx = Math.abs(nx - cx)
  const dy = Math.abs(ny - cy)
  const fromY = 2 * dy
  const fromX = (2 * dx * srcAspect) / (targetAspect || OUT_RATIO)
  return clamp(Math.max(fromX, fromY), 0.35, 1)
}

/** Esquinas del recuadro en coords normalizadas (igual que Editar clip). */
export function cropCornerNorms(cx, cy, wf, hf) {
  return [
    [cx - wf / 2, cy - hf / 2],
    [cx + wf / 2, cy - hf / 2],
    [cx - wf / 2, cy + hf / 2],
    [cx + wf / 2, cy + hf / 2],
  ]
}

export function isNearCropCorner(nx, ny, cx, cy, wf, hf, rect, px = 14) {
  return cropCornerNorms(cx, cy, wf, hf).some(([x, y]) => {
    const dx = (nx - x) * rect.width
    const dy = (ny - y) * rect.height
    return dx * dx + dy * dy <= px * px
  })
}

// Colores (poco saturados) para distinguir cada encuadre/keyframe.
export const KF_COLORS = ['#e8a34d', '#5aa9e6', '#67b99a', '#c98bb9', '#e0757c', '#8f8ff0', '#c9b458', '#6ac4c9']
export const kfColor = (i) => KF_COLORS[((i % KF_COLORS.length) + KF_COLORS.length) % KF_COLORS.length]

// Aspecto de cada mitad en doble encuadre, dependiente del aspecto de salida.
export function targetAspectFor(reframe, outAspect = OUT_RATIO) {
  if (reframe?.dual_crop) {
    const orient = splitOrientationFor(outAspect, reframe)
    return orient === 'horizontal' ? (outAspect / 2) : (outAspect * 2)
  }
  return outAspect
}

function blit(ctx, video, r) {
  try {
    ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh)
  } catch { /* noop */ }
}

// Dibuja el fotograma reencuadrado del vídeo en el canvas de salida.
// `srcTime` = tiempo de la fuente (para interpolar keyframes).
// `outAspect` = ancho/alto del formato de salida (9/16, 16/9, 1, …).
export function drawReframe(ctx, video, reframe, srcTime, outAspect = OUT_RATIO, opts) {
  const c = ctx.canvas
  const vw = video.videoWidth || video.naturalWidth, vh = video.videoHeight || video.naturalHeight
  if (!vw || !vh) return
  const mode = reframe?.pan_mode || 'smooth'
  if (opts?.clear !== false) ctx.clearRect(0, 0, c.width, c.height)

  if (!reframe || !reframe.dual_crop) {
    const fr = frameAt(reframe?.keyframes, srcTime, reframe?.zoom ?? 1, mode)
    blit(ctx, video, sourceDrawRect(fr, vw, vh, { dx: 0, dy: 0, dw: c.width, dh: c.height }, outAspect))
    return
  }

  const orient = splitOrientationFor(outAspect, reframe)
  const tAspect = targetAspectFor(reframe, outAspect)
  const z1 = reframe.zoom ?? 1
  const z2 = reframe.zoom2 ?? z1
  const draw = (kfs, fallbackZoom, dest) => {
    const fr = frameAt(kfs, srcTime, fallbackZoom, mode)
    blit(ctx, video, sourceDrawRect(fr, vw, vh, dest, tAspect))
  }
  if (orient === 'vertical') {
    draw(reframe.keyframes, z1, { dx: 0, dy: 0, dw: c.width, dh: c.height / 2 })
    draw(reframe.keyframes2?.length ? reframe.keyframes2 : reframe.keyframes, z2, {
      dx: 0, dy: c.height / 2, dw: c.width, dh: c.height / 2,
    })
  } else {
    draw(reframe.keyframes, z1, { dx: 0, dy: 0, dw: c.width / 2, dh: c.height })
    draw(reframe.keyframes2?.length ? reframe.keyframes2 : reframe.keyframes, z2, {
      dx: c.width / 2, dy: 0, dw: c.width / 2, dh: c.height,
    })
  }
}

// Genera barras deterministas para representar la onda de un audio (sin decodificar).
export function pseudoWaveform(seed, bars = 48) {
  let h = 0
  const str = String(seed || 'a')
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  const out = []
  for (let i = 0; i < bars; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    const base = 0.25 + (h % 1000) / 1000 * 0.75
    // modular un poco para que parezca voz (envolvente)
    const env = 0.6 + 0.4 * Math.sin((i / bars) * Math.PI * 3)
    out.push(Math.max(0.12, Math.min(1, base * env)))
  }
  return out
}
