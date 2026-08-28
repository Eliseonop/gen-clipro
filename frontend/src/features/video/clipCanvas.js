// Dibujo del resultado 9:16 en vivo del editor de clip (single o doble encuadre).
// Función pura respecto a React: recibe el <video>, el <canvas> y un `env` con las
// refs vivas y los helpers de geometría del componente, y lee `.current` en cada
// frame igual que hacía el efecto original (comportamiento idéntico).
import { clamp, posAt } from '../../lib/panning'

const OUT_RATIO = 9 / 16

export function drawClipFrame(v, c, env) {
  const { dualCropRef, splitOrientRef, panModeRef, zoomRef, zoom2Ref, kfsRef, kfs2Ref, geom, clampCenter, prep } = env
  const ctx = c.getContext('2d')
  const isDual = dualCropRef.current
  const orient = splitOrientRef.current
  const mode = panModeRef.current
  const vw = v.videoWidth || prep.width, vh = v.videoHeight || prep.height

  ctx.clearRect(0, 0, c.width, c.height)

  if (!isDual) {
    // Un solo encuadre 9:16
    const { widthFrac: wf, heightFrac: hf } = geom(zoomRef.current, OUT_RATIO)
    const pp = posAt(kfsRef.current, v.currentTime, mode)
    const p = clampCenter(pp.cx, pp.cy, zoomRef.current, OUT_RATIO)
    let sw = wf * vw, sh = hf * vh
    let sx = clamp((p.cx - wf / 2) * vw, 0, vw - sw)
    let sy = clamp((p.cy - hf / 2) * vh, 0, vh - sh)
    try { ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height) } catch { /* noop */ }
  } else {
    // Doble encuadre
    const tAspect = orient === 'vertical' ? (9 / 8) : (4.5 / 16)

    // Crop 1
    const { widthFrac: wf1, heightFrac: hf1 } = geom(zoomRef.current, tAspect)
    const pp1 = posAt(kfsRef.current, v.currentTime, mode)
    const p1 = clampCenter(pp1.cx, pp1.cy, zoomRef.current, tAspect)
    let sw1 = wf1 * vw, sh1 = hf1 * vh
    let sx1 = clamp((p1.cx - wf1 / 2) * vw, 0, vw - sw1)
    let sy1 = clamp((p1.cy - hf1 / 2) * vh, 0, vh - sh1)

    // Crop 2
    const { widthFrac: wf2, heightFrac: hf2 } = geom(zoom2Ref.current, tAspect)
    const pp2 = posAt(kfs2Ref.current, v.currentTime, mode)
    const p2 = clampCenter(pp2.cx, pp2.cy, zoom2Ref.current, tAspect)
    let sw2 = wf2 * vw, sh2 = hf2 * vh
    let sx2 = clamp((p2.cx - wf2 / 2) * vw, 0, vw - sw2)
    let sy2 = clamp((p2.cy - hf2 / 2) * vh, 0, vh - sh2)

    if (orient === 'vertical') {
      try {
        ctx.drawImage(v, sx1, sy1, sw1, sh1, 0, 0, c.width, c.height / 2)
        ctx.drawImage(v, sx2, sy2, sw2, sh2, 0, c.height / 2, c.width, c.height / 2)
        ctx.strokeStyle = '#292e3e'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, c.height / 2)
        ctx.lineTo(c.width, c.height / 2)
        ctx.stroke()
      } catch { /* noop */ }
    } else {
      try {
        ctx.drawImage(v, sx1, sy1, sw1, sh1, 0, 0, c.width / 2, c.height)
        ctx.drawImage(v, sx2, sy2, sw2, sh2, c.width / 2, 0, c.width / 2, c.height)
        ctx.strokeStyle = '#292e3e'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(c.width / 2, 0)
        ctx.lineTo(c.width / 2, c.height)
        ctx.stroke()
      } catch { /* noop */ }
    }
  }
}
