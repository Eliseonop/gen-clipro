// Matemática de reencuadre/paneo compartida por el editor de vídeo.
// Los keyframes son { t, cx, cy } con t en segundos (relativo a la fuente) y
// cx/cy el centro de la ventana de recorte en coordenadas normalizadas (0-1).

export const OUT_RATIO = 9 / 16

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const r2 = (x) => Math.round(x * 100) / 100
export const r4 = (x) => Math.round(x * 10000) / 10000

// Centro interpolado en el instante `time` según el modo de paneo.
export function posAt(kfs, time, panMode = 'smooth') {
  if (!kfs || !kfs.length) return { cx: 0.5, cy: 0.5 }
  const s = [...kfs].sort((a, b) => a.t - b.t)
  if (time <= s[0].t) return { cx: s[0].cx, cy: s[0].cy }
  const last = s[s.length - 1]
  if (time >= last.t) return { cx: last.cx, cy: last.cy }

  if (panMode === 'direct') {
    let active = s[0]
    for (let i = 0; i < s.length; i++) {
      if (s[i].t <= time) active = s[i]
      else break
    }
    return { cx: active.cx, cy: active.cy }
  }

  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1]
    if (time >= a.t && time <= b.t) {
      const f = (time - a.t) / ((b.t - a.t) || 1)
      return { cx: a.cx + (b.cx - a.cx) * f, cy: a.cy + (b.cy - a.cy) * f }
    }
  }
  return { cx: last.cx, cy: last.cy }
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

// Colores (poco saturados) para distinguir cada encuadre/keyframe.
export const KF_COLORS = ['#e8a34d', '#5aa9e6', '#67b99a', '#c98bb9', '#e0757c', '#8f8ff0', '#c9b458', '#6ac4c9']
export const kfColor = (i) => KF_COLORS[((i % KF_COLORS.length) + KF_COLORS.length) % KF_COLORS.length]

// Aspecto de cada mitad en doble encuadre, dependiente del aspecto de salida.
export function targetAspectFor(reframe, outAspect = OUT_RATIO) {
  if (reframe?.dual_crop) {
    return (reframe.split_orientation === 'horizontal') ? (outAspect / 2) : (outAspect * 2)
  }
  return outAspect
}

// Dibuja el fotograma reencuadrado del vídeo en el canvas de salida.
// `srcTime` = tiempo de la fuente (para interpolar keyframes).
// `outAspect` = ancho/alto del formato de salida (9/16, 16/9, 1, …).
export function drawReframe(ctx, video, reframe, srcTime, outAspect = OUT_RATIO) {
  const c = ctx.canvas
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw || !vh) return
  const srcAspect = vw / vh
  const mode = reframe?.pan_mode || 'smooth'
  ctx.clearRect(0, 0, c.width, c.height)

  if (!reframe || !reframe.dual_crop) {
    const zoom = reframe?.zoom ?? 1
    const { widthFrac: wf, heightFrac: hf } = geomFor(zoom, srcAspect, outAspect)
    const pp = posAt(reframe?.keyframes, srcTime, mode)
    const p = clampCenter(pp.cx, pp.cy, zoom, srcAspect, outAspect)
    const sw = wf * vw, sh = hf * vh
    const sx = clamp((p.cx - wf / 2) * vw, 0, vw - sw)
    const sy = clamp((p.cy - hf / 2) * vh, 0, vh - sh)
    try { ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height) } catch { /* noop */ }
    return
  }

  // Doble encuadre
  const orient = reframe.split_orientation || 'vertical'
  const tAspect = targetAspectFor(reframe, outAspect)
  const z1 = reframe.zoom ?? 1
  const z2 = reframe.zoom2 ?? z1
  const draw = (kfs, zoom, dx, dy, dw, dh) => {
    const { widthFrac: wf, heightFrac: hf } = geomFor(zoom, srcAspect, tAspect)
    const pp = posAt(kfs, srcTime, mode)
    const p = clampCenter(pp.cx, pp.cy, zoom, srcAspect, tAspect)
    const sw = wf * vw, sh = hf * vh
    const sx = clamp((p.cx - wf / 2) * vw, 0, vw - sw)
    const sy = clamp((p.cy - hf / 2) * vh, 0, vh - sh)
    try { ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh) } catch { /* noop */ }
  }
  if (orient === 'vertical') {
    draw(reframe.keyframes, z1, 0, 0, c.width, c.height / 2)
    draw(reframe.keyframes2?.length ? reframe.keyframes2 : reframe.keyframes, z2, 0, c.height / 2, c.width, c.height / 2)
  } else {
    draw(reframe.keyframes, z1, 0, 0, c.width / 2, c.height)
    draw(reframe.keyframes2?.length ? reframe.keyframes2 : reframe.keyframes, z2, c.width / 2, 0, c.width / 2, c.height)
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
