import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { clamp } from '../../lib/panning'
import {
  CROP_RATIOS, clampCrop, cropCursor, cropHandleAt, cropHandleNorms, cropRatioNorm,
  cropWindow, fitCropRatio, insideCrop, mediaSize, resizeCropFree, resizeCropLocked,
} from '../../lib/clipLayout'
import { clipEnd, safeMediaTime, timelineToSource } from './editorModel'
import { drawSourceFor } from './render/canvas'

// "Recortar" como en CapCut: un modal con el fotograma COMPLETO de la fuente y un
// recuadro blanco (esquinas + barras en los lados, guías de tercios, fuera atenuado).
// Debajo, el scrub del clip; al pie Rotación, Proporción, Restablecer y Confirmar.
// El recuadro vive en estado local hasta Confirmar: cancelar no toca la timeline.

const PAD = 18        // margen (px CSS) alrededor de la imagen para que se vean los tiradores
const HIT = 14        // tolerancia (px CSS) de los tiradores

function timecode(t, fps) {
  const f = Math.max(1, Math.round(fps || 30))
  const total = Math.max(0, Math.round((t || 0) * f))
  const ff = total % f
  const s = Math.floor(total / f)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`
}

// Rectángulo (px de canvas) donde se dibuja la fuente entera, ajustada dentro del stage.
function imageRect(cw, ch, srcAspect, pad) {
  const aw = Math.max(1, cw - pad * 2)
  const ah = Math.max(1, ch - pad * 2)
  const w = Math.min(aw, ah * srcAspect)
  const h = w / srcAspect
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

function drawCropFrame(ctx, img, crop, dpr) {
  const bx = img.x + (crop.cx - crop.wf / 2) * img.w
  const by = img.y + (crop.cy - crop.hf / 2) * img.h
  const bw = crop.wf * img.w
  const bh = crop.hf * img.h
  // Fuera del recorte: atenuado (solo sobre la imagen).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(img.x, img.y, img.w, by - img.y)
  ctx.fillRect(img.x, by + bh, img.w, img.y + img.h - (by + bh))
  ctx.fillRect(img.x, by, bx - img.x, bh)
  ctx.fillRect(bx + bw, by, img.x + img.w - (bx + bw), bh)
  // Guías de tercios (punteadas) y borde.
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = dpr
  ctx.setLineDash([3 * dpr, 3 * dpr])
  for (const f of [1 / 3, 2 / 3]) {
    ctx.beginPath()
    ctx.moveTo(bx + bw * f, by); ctx.lineTo(bx + bw * f, by + bh)
    ctx.moveTo(bx, by + bh * f); ctx.lineTo(bx + bw, by + bh * f)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5 * dpr
  ctx.strokeRect(bx, by, bw, bh)
  // Tiradores: círculo en las esquinas, píldora en los lados.
  ctx.fillStyle = '#fff'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 4 * dpr
  for (const { hx, hy, x, y } of cropHandleNorms(crop.cx, crop.cy, crop.wf, crop.hf)) {
    const px = img.x + x * img.w
    const py = img.y + y * img.h
    ctx.beginPath()
    if (hx && hy) {
      ctx.arc(px, py, 5 * dpr, 0, Math.PI * 2)
    } else {
      const w = (hy ? 26 : 8) * dpr
      const h = (hy ? 8 : 26) * dpr
      ctx.roundRect(px - w / 2, py - h / 2, w, h, 4 * dpr)
    }
    ctx.fill()
  }
  ctx.restore()
}

export default function EdCropModal({
  clip, mediaEl, playhead, playing, fps, outAspect, onSeek, onConfirm, onCancel,
}) {
  const dialogRef = useRef(null)
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)          // último rectángulo de imagen (px CSS) para el hit-testing
  const liveRef = useRef({})           // valores que lee el bucle de dibujo sin re-suscribirse

  const sz = mediaSize(mediaEl)
  const srcAspect = sz.w && sz.h ? sz.w / sz.h : 16 / 9
  const start = clip.start
  const dur = Math.max(0, clipEnd(clip) - start)
  const localT = clamp(playhead - start, 0, dur)

  const [crop, setCrop] = useState(() => {
    const srcT = clamp(timelineToSource(clip, clamp(playhead, start, start + dur)), clip.in_point, clip.out_point)
    const c = cropWindow(clip, srcAspect, outAspect, srcT, localT)
    return clampCrop(c.cx, c.cy, c.wf, c.hf)
  })
  const [ratio, setRatio] = useState('free')
  const [rotation, setRotation] = useState(() => +(clip.transform?.rotation || 0))
  const rn = cropRatioNorm(ratio, srcAspect, outAspect)

  liveRef.current = { crop, playhead, playing, clip, mediaEl, fps, srcAspect }

  useEffect(() => { dialogRef.current?.focus() }, [])

  // Bucle de dibujo: fuente entera + recuadro. La fuente es el mismo <video>/<img>
  // oculto del editor; en pausa se lleva al instante del cabezal.
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const cv = canvasRef.current
      const stage = stageRef.current
      if (!cv || !stage) return
      const L = liveRef.current
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const r = stage.getBoundingClientRect()
      const cw = Math.max(2, Math.round(r.width * dpr))
      const ch = Math.max(2, Math.round(r.height * dpr))
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch }
      const ctx = cv.getContext('2d')
      ctx.clearRect(0, 0, cw, ch)
      const img = imageRect(cw, ch, L.srcAspect, PAD * dpr)
      imgRef.current = { x: img.x / dpr, y: img.y / dpr, w: img.w / dpr, h: img.h / dpr }
      const el = L.mediaEl
      if (!el) return
      const head = clamp(L.playhead, L.clip.start, clipEnd(L.clip))
      const srcT = clamp(timelineToSource(L.clip, head), L.clip.in_point, L.clip.out_point)
      if (!L.playing && L.clip.kind !== 'image') {
        const seekT = safeMediaTime(el, srcT, L.fps)
        if (Math.abs(el.currentTime - seekT) > 0.06) { try { el.currentTime = seekT } catch { /* noop */ } }
      }
      try { ctx.drawImage(drawSourceFor(L.clip, el, srcT), img.x, img.y, img.w, img.h) } catch { /* noop */ }
      drawCropFrame(ctx, img, L.crop, dpr)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  // Puntero → coords normalizadas de la fuente (0-1).
  function toNorm(e) {
    const r = canvasRef.current.getBoundingClientRect()
    const img = imgRef.current
    return [clamp((e.clientX - r.left - img.x) / img.w, 0, 1), clamp((e.clientY - r.top - img.y) / img.h, 0, 1)]
  }
  function handleAt(e) {
    const img = imgRef.current
    if (!img) return null
    const [nx, ny] = toNorm(e)
    return cropHandleAt(nx, ny, crop, { width: img.w, height: img.h }, HIT)
  }

  function onPointerDown(e) {
    if (e.button !== 0 || !imgRef.current) return
    const [nx0, ny0] = toNorm(e)
    const handle = handleAt(e)
    const start0 = crop
    if (!handle && !insideCrop(nx0, ny0, start0)) return
    e.preventDefault()
    const cv = canvasRef.current
    cv.setPointerCapture?.(e.pointerId)
    const move = (ev) => {
      const [nx, ny] = toNorm(ev)
      if (handle) {
        const c = rn
          ? resizeCropLocked(start0, handle.hx, handle.hy, nx, ny, rn, 0.05)
          : resizeCropFree(start0, handle.hx, handle.hy, nx, ny)
        setCrop(clampCrop(c.cx, c.cy, c.wf, c.hf))
      } else {
        setCrop(clampCrop(start0.cx + (nx - nx0), start0.cy + (ny - ny0), start0.wf, start0.hf))
      }
    }
    const up = () => {
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', up)
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
  }

  function onPointerHover(e) {
    if (e.buttons) return
    const cv = canvasRef.current
    if (!cv || !imgRef.current) return
    const h = handleAt(e)
    const [nx, ny] = toNorm(e)
    cv.style.cursor = h ? cropCursor(h.hx, h.hy) : (insideCrop(nx, ny, crop) ? 'move' : 'default')
  }

  function pickRatio(id) {
    setRatio(id)
    const r = cropRatioNorm(id, srcAspect, outAspect)
    if (r) setCrop((c) => fitCropRatio(c, r))
  }

  function reset() {
    setRatio('free')
    setCrop({ cx: 0.5, cy: 0.5, wf: 1, hf: 1 })
    setRotation(0)
  }

  function confirm() {
    onConfirm?.({ crop, rotation: clamp(Number(rotation) || 0, -180, 180) })
  }

  function onKey(e) {
    // El modal se traga las teclas: que no disparen atajos del editor (espacio, S, Supr…).
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
    else if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); confirm() }
  }

  const step = 1 / Math.max(1, fps || 30)

  return (
    <div
      className="modal-overlay crop-overlay"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
      onKeyDown={onKey}
    >
      <div ref={dialogRef} className="modal crop-modal" role="dialog" aria-modal="true" aria-label="Recortar" tabIndex={-1}>
        <div className="crop-head">
          <span>Recortar</span>
          <button className="icon-btn" type="button" onClick={onCancel} title="Cerrar (Esc)">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="crop-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="crop-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerHover}
          />
        </div>

        <div className="crop-scrub">
          <span className="crop-tc">
            <b>{timecode(localT, fps)}</b> | {timecode(dur, fps)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(step, dur - step)}
            step={step}
            value={Math.min(localT, Math.max(step, dur - step))}
            disabled={clip.kind === 'image'}
            onChange={(e) => onSeek?.(start + Number(e.target.value))}
            title="Elige el fotograma para ver el recorte"
          />
        </div>

        <div className="crop-foot">
          <label className="crop-field" title="Gira el clip en el lienzo">
            <span>Rotación</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
            <span className="crop-deg">
              <input
                type="number" min={-180} max={180} step={1}
                value={Math.round(rotation)}
                onChange={(e) => setRotation(clamp(Number(e.target.value) || 0, -180, 180))}
              />°
            </span>
          </label>
          <label className="crop-field">
            <span>Recorte</span>
            <select value={ratio} onChange={(e) => pickRatio(e.target.value)}>
              {CROP_RATIOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <span className="crop-spacer" />
          <button className="ghost small" type="button" onClick={reset}>Restablecer</button>
          <button className="primary small" type="button" onClick={confirm}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}
