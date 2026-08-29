// Dibujo del resultado 9:16 en vivo del editor de clip (una o dos capas).
import { clamp, posAt, geomFor, clampCenter } from '../../lib/panning'
import { outputRect, slotTargetAspect } from './composeModel'

function drawLayerInto(ctx, v, layer, prep, dest, srcTime) {
  const vw = v.videoWidth || prep?.width || 0
  const vh = v.videoHeight || prep?.height || 0
  if (!vw || !vh) return
  const srcAspect = vw / vh
  const tAspect = slotTargetAspect(dest)
  const zoom = layer.zoom ?? 1
  const mode = layer.pan_mode || 'smooth'
  const { widthFrac: wf, heightFrac: hf } = geomFor(zoom, srcAspect, tAspect)
  const pp = posAt(layer.keyframes, srcTime, mode)
  const p = clampCenter(pp.cx, pp.cy, zoom, srcAspect, tAspect)
  const sw = wf * vw, sh = hf * vh
  const sx = clamp((p.cx - wf / 2) * vw, 0, vw - sw)
  const sy = clamp((p.cy - hf / 2) * vh, 0, vh - sh)
  const c = ctx.canvas
  const dx = dest.x * c.width
  const dy = dest.y * c.height
  const dw = dest.w * c.width
  const dh = dest.h * c.height
  try { ctx.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh) } catch { /* noop */ }
}

export function drawComposeFrame(videos, canvas, env) {
  const { layers, preps } = env
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0a0c12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const n = layers.length
  layers.forEach((layer, i) => {
    if (env.soloIndex != null && i !== env.soloIndex) return
    const v = videos[i]
    const prep = preps[i]
    if (!v || v.readyState < 2) return
    const dest = outputRect(layer, i, env.soloIndex != null ? 1 : n)
    const srcTime = v.currentTime || 0
    drawLayerInto(ctx, v, layer, prep, dest, srcTime)
  })
  if (n === 2 && env.soloIndex == null) {
    const a = outputRect(layers[0], 0, 2)
    const b = outputRect(layers[1], 1, 2)
    const sharedEdge = (a.x + a.w === b.x && a.y === b.y && a.h === b.h)
      || (a.y + a.h === b.y && a.x === b.x && a.w === b.w)
    if (sharedEdge) {
      ctx.strokeStyle = '#292e3e'
      ctx.lineWidth = 2
      ctx.beginPath()
      if (a.y + a.h === b.y) {
        const y = b.y * canvas.height
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
      } else {
        const x = b.x * canvas.width
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
      }
      ctx.stroke()
    }
  }
}

/** Compatibilidad: un vídeo, dual_crop del mismo origen (editor legado). */
export function drawClipFrame(v, c, env) {
  const { dualCropRef, splitOrientRef, panModeRef, zoomRef, zoom2Ref, kfsRef, kfs2Ref, prep } = env
  const isDual = dualCropRef.current
  const layers = isDual
    ? [
        { zoom: zoomRef.current, pan_mode: panModeRef.current, keyframes: kfsRef.current, slot: splitOrientRef.current === 'horizontal' ? 'left' : 'top' },
        { zoom: zoom2Ref.current, pan_mode: panModeRef.current, keyframes: kfs2Ref.current, slot: splitOrientRef.current === 'horizontal' ? 'right' : 'bottom' },
      ]
    : [
        { zoom: zoomRef.current, pan_mode: panModeRef.current, keyframes: kfsRef.current, slot: 'full' },
      ]
  const videos = isDual ? [v, v] : [v]
  const preps = isDual ? [prep, prep] : [prep]
  drawComposeFrame(videos, c, { layers, preps })
}
