// Dibujo del resultado en vivo del editor de clip (una o dos capas).
import { sourceDrawRect, frameAt } from '../../lib/panning'
import { previewDest, slotTargetAspect } from './composeModel'

function drawLayerInto(ctx, v, layer, prep, dest, srcTime, outAspect) {
  const vw = v.videoWidth || prep?.width || 0
  const vh = v.videoHeight || prep?.height || 0
  if (!vw || !vh) return
  const c = ctx.canvas
  const slot = {
    dx: dest.x * c.width,
    dy: dest.y * c.height,
    dw: dest.w * c.width,
    dh: dest.h * c.height,
  }
  const tAspect = slotTargetAspect(dest, outAspect)
  const fr = frameAt(layer.keyframes, srcTime, layer.zoom ?? 1, layer.pan_mode || 'smooth')
  const r = sourceDrawRect(fr, vw, vh, slot, tAspect)
  try { ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh) } catch { /* noop */ }
}

export function drawComposeFrame(videos, canvas, env) {
  const { layers, preps } = env
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0a0c12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const n = layers.length
  const outAspect = env.outAspect ?? (canvas.width / Math.max(1, canvas.height))
  const solo = env.soloIndex != null
  layers.forEach((layer, i) => {
    if (solo && i !== env.soloIndex) return
    const v = videos[i]
    const prep = preps[i]
    if (!v || v.readyState < 2) return
    const dest = previewDest(layer, i, solo ? 1 : n, {
      solo,
      syncedDual: !!env.syncedDual,
      outAspect,
    })
    const srcTime = v.currentTime || 0
    drawLayerInto(ctx, v, layer, prep, dest, srcTime, outAspect)
  })
  if (n === 2 && !solo) {
    const a = previewDest(layers[0], 0, 2, { syncedDual: !!env.syncedDual, outAspect })
    const b = previewDest(layers[1], 1, 2, { syncedDual: !!env.syncedDual, outAspect })
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
  drawComposeFrame(videos, c, { layers, preps, syncedDual: isDual, outAspect: c.width / Math.max(1, c.height) })
}
