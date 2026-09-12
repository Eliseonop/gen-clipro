// Dibujo del editor sobre <canvas>: compuesto final (vídeo + texto), vista de edición
// del Main (recorte/keyframes) y overlay de encuadre de texto.
//
// Estas funciones son puras respecto a React: reciben un `env` con las refs vivas del
// componente (clipsRef, tracksRef, mediaEls, outRef, …) y leen `.current` en el momento
// de la llamada, igual que hacía el componente. Así el comportamiento por frame no cambia.
import { drawReframe, kfColor, cropCornerNorms, clamp } from '../../../lib/panning'
import { drawTextClip } from '../../../lib/textstyles'
import { drawShapeClip } from '../../../lib/shapes'
import { drawAlignGuides } from '../../../lib/alignGuides'
import { clipDur, clipEnd, isVisualClip, newReframe, timelineToSource, safeMediaTime } from '../editorModel'
import { gifFrameAt, gifInfo } from '../gifPlayer'
import { cutoutDrawable } from '../bgCutout'
import { applyCanvasFx, clipFxAt } from '../../../lib/clipFx'
import { posedTransform, clipPose, clipMasksAt } from '../../../lib/clipAnim'
import { beginMaskLayer, endMaskLayer, maskHandles, strokeMaskShape } from '../../../lib/clipMask'
import { cssFont } from '../../../lib/textstyles'
import { keyframesOn, normalizeItems } from '../../../lib/clipKeyframes'
import {
  cropWindow, destRectOnFrame, frameRectOf, isFramed, isOverlay, mediaSize, slotAspectOf, sourceCropPx, videosAt,
} from '../../../lib/clipLayout'

// Desplaza geometría (dest / box / handles) del sistema local del recuadro Main
// a coordenadas del canvas, para hit-testing e interacción.
function offsetDest(d, ox, oy) {
  if (!d) return d
  return { ...d, dx: (d.dx ?? d.x) + ox, dy: (d.dy ?? d.y) + oy }
}
function offsetBox(box, ox, oy) {
  if (!box) return box
  if (box.dx != null) return { ...box, dx: box.dx + ox, dy: box.dy + oy }
  return { ...box, x: box.x + ox, y: box.y + oy }
}
function offsetHandles(handles, ox, oy) {
  if (!handles) return handles
  const out = {}
  for (const k of Object.keys(handles)) {
    const h = handles[k]
    out[k] = h && typeof h.x === 'number' ? { ...h, x: h.x + ox, y: h.y + oy } : h
  }
  return out
}
function offsetRender(r, ox, oy) {
  if (!r) return r
  return { ...r, box: offsetBox(r.box, ox, oy), handles: offsetHandles(r.handles, ox, oy) }
}

export function fillDestRect(cw, ch, clip, localT) {
  const pose = clipPose(clip, localT)
  const sc = pose.scale ?? 1
  const dw = cw * sc
  const dh = ch * sc
  return {
    dx: (pose.x ?? 0.5) * cw - dw / 2,
    dy: (pose.y ?? 0.5) * ch - dh / 2,
    dw,
    dh,
    rotation: pose.rotation || 0,
  }
}

export function boxToDest(box, rotation = 0) {
  if (!box) return null
  if (box.dx != null) return { dx: box.dx, dy: box.dy, dw: box.dw, dh: box.dh, rotation: box.rotation || rotation }
  return { dx: box.x, dy: box.y, dw: box.w, dh: box.h, rotation }
}

export function pointInDest(px, py, dest) {
  if (!dest) return false
  const { dx, dy, dw, dh, rotation = 0 } = dest
  const cx = dx + dw / 2
  const cy = dy + dh / 2
  let x = px - cx
  let y = py - cy
  if (rotation) {
    const rad = -rotation * Math.PI / 180
    const c = Math.cos(rad)
    const s = Math.sin(rad)
    const nx = x * c - y * s
    const ny = x * s + y * c
    x = nx
    y = ny
  }
  return x >= -dw / 2 && x <= dw / 2 && y >= -dh / 2 && y <= dh / 2
}

export function hitFrontmost(hits, px, py) {
  if (!hits?.length) return null
  for (let i = hits.length - 1; i >= 0; i--) {
    if (pointInDest(px, py, hits[i].dest)) return hits[i]
  }
  return null
}


// Geometría (en px del canvas) del encuadre de texto a partir de fm normalizado.
export function framingRect(cw, ch, fm) {
  const boxW = (fm.w ?? 0.8) * cw
  const boxH = (fm.h ?? 0.13) * ch
  const bx = (fm.x ?? 0.5) * cw - boxW / 2
  const by = (fm.y ?? 0.5) * ch - boxH / 2
  return { bx, by, boxW, boxH }
}

// Dibuja el overlay amarillo de encuadre sobre el canvas principal.
// El rectángulo define la POSICIÓN y el TAMAÑO de los textos de la pista.
export function drawFramingOverlay(ctx, cw, ch, fm) {
  const { bx, by, boxW, boxH } = framingRect(cw, ch, fm)
  const hs = 6
  ctx.save()
  ctx.fillStyle = 'rgba(255, 215, 0, 0.14)'
  ctx.fillRect(bx, by, boxW, boxH)
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 2.5
  ctx.setLineDash([9, 5])
  ctx.strokeRect(bx, by, boxW, boxH)
  ctx.setLineDash([])
  ctx.fillStyle = '#FFD700'
  ctx.fillRect(bx - hs, by + boxH / 2 - hs, hs * 2, hs * 2)              // izq (ancho)
  ctx.fillRect(bx + boxW - hs, by + boxH / 2 - hs, hs * 2, hs * 2)       // der (ancho)
  ctx.fillRect(bx + boxW / 2 - hs, by + boxH - hs, hs * 2, hs * 2)       // abajo (alto)
  ctx.fillRect(bx + boxW - hs, by + boxH - hs, hs * 2, hs * 2)           // esquina (ambos)
  ctx.font = 'bold 11px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Encuadre de texto', bx + boxW / 2, by - 4)
  ctx.restore()
}

function overlayDest(ctx, media, clip, srcTime, outW, outH, localT, frame) {
  const { w: vw, h: vh } = mediaSize(media)
  const crop = cropWindow(clip, vw / vh, outW / outH, srcTime, localT)
  const px = sourceCropPx(crop, vw, vh)
  return { px, dest: destRectOnFrame(posedTransform(clip, localT), px, outW, outH, frame) }
}

function drawOverlayLayer(ctx, media, clip, srcTime, outW, outH, fx, localT, frame) {
  const { px, dest } = overlayDest(ctx, media, clip, srcTime, outW, outH, localT, frame)
  const pose = clipPose(clip, localT)
  ctx.save()
  if (fx.wipe != null && fx.wipe < 1) {
    ctx.beginPath()
    ctx.rect(dest.dx, dest.dy, dest.dw * Math.max(0, fx.wipe), dest.dh)
    ctx.clip()
  }
  if (fx.cssFilter && fx.cssFilter !== 'none') ctx.filter = fx.cssFilter
  ctx.globalAlpha = fx.opacity * pose.opacity
  ctx.translate(dest.dx + dest.dw / 2 + fx.tx * dest.dw, dest.dy + dest.dh / 2 + fx.ty * dest.dh)
  ctx.rotate((dest.rotation || 0) * Math.PI / 180)
  ctx.scale(fx.scale, fx.scale)
  try { ctx.drawImage(media, px.sx, px.sy, px.sw, px.sh, -dest.dw / 2, -dest.dh / 2, dest.dw, dest.dh) } catch { /* noop */ }
  ctx.restore()
  return dest
}

function reframeForDraw(clip, localT, srcTime) {
  if (!keyframesOn(clip) || clip.reframe?.dual_crop) return clip.reframe
  const p = clipPose(clip, localT, srcTime)
  return {
    ...(clip.reframe || {}),
    zoom: p.zoom,
    keyframes: [{ t: srcTime, cx: p.cx, cy: p.cy, zoom: p.zoom, pan_mode: 'smooth' }],
  }
}

function drawTransformHandles(ctx, dest) {
  const { dx, dy, dw, dh } = dest
  const hs = 5
  ctx.save()
  ctx.strokeStyle = '#ff3b5c'
  ctx.lineWidth = 1.6
  ctx.strokeRect(dx, dy, dw, dh)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#ff3b5c'
  ;[[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]].forEach(([x, y]) => {
    ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2)
    ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2)
  })
  const rx = dx + dw / 2, ry = dy - 22
  ctx.beginPath()
  ctx.moveTo(dx + dw / 2, dy)
  ctx.lineTo(rx, ry)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(rx, ry, 6, 0, Math.PI * 2)
  ctx.fillStyle = '#ff3b5c'
  ctx.fill()
  ctx.restore()
}

function fxForClip(clip, head) {
  const localT = Math.max(0, head - (clip.start || 0))
  return clipFxAt(clip, localT, clipDur(clip))
}

// Para un clip de GIF animado devuelve el <canvas> del fotograma que toca en
// `srcTime` (tiempo local en el gif), sincronizado con el timeline. Devuelve null
// si no es un gif o aún no está decodificado → el llamador usa el <img> original.
// El fotograma comparte dimensiones con el <img>, así que la geometría de recorte
// (sourceCropPx, reframe) no cambia al sustituir la fuente.
function gifDrawable(clip, el, srcTime) {
  if (!el || clip?.kind !== 'image') return null
  const src = el.currentSrc || el.src || ''
  if (!/\.gif(\?|#|$)/i.test(src)) return null
  return gifFrameAt(src, srcTime, clip.loop !== false)
}

// Duración intrínseca de un GIF (para indexar su matte igual que su reproductor).
function gifLoopDur(clip, el) {
  if (!el || clip?.kind !== 'image') return 0
  const src = el.currentSrc || el.src || ''
  if (!/\.gif(\?|#|$)/i.test(src)) return 0
  return gifInfo(src)?.duration || 0
}

// Fuente de dibujo del clip: fotograma de GIF si toca, y encima el recorte de
// Eliminar fondo. El resultado siempre tiene el ASPECTO del material, así que la
// geometría posterior (recorte, pose, máscaras) no cambia. Mismo gancho que ya
// usaba el GIF: para el resto del dibujo esto "es" la fuente.
function drawSourceFor(clip, el, srcTime) {
  const gif = gifDrawable(clip, el, srcTime)
  const base = gif || el
  return cutoutDrawable(clip, base, srcTime, gifLoopDur(clip, el)) || base
}

// Punto del canvas → coordenadas NORMALIZADAS de la fuente (0-1 del ancho/alto
// del material). Es la inversa exacta de lo que dibuja drawComposite, y es lo
// que necesita el pincel de Eliminar fondo: el usuario pinta sobre el
// reproductor y el trazo se guarda en el espacio del material, así que sigue
// valiendo aunque luego se recorte, se mueva o se escale el clip.
// Devuelve null si el punto cae fuera del material.
export function canvasToSourceNorm(clip, px, py, frame, env, head) {
  const el = env.mediaEls?.current?.get(clip.id)
  const { w: vw, h: vh } = mediaSize(el)
  if (!vw || !vh) return null
  const outW = env.outRef.current.w, outH = env.outRef.current.h
  const localT = Math.max(0, head - (clip.start || 0))
  const srcTime = clip.kind === 'image'
    ? clamp(timelineToSource(clip, head), clip.in_point, clip.out_point)
    : (el.currentTime || 0)
  // La aparición/salida (zoom, pop, slide) también transforma el dibujo, así que
  // hay que deshacerla: si no, pintar durante los primeros/últimos 0,4 s de un
  // clip con transición dejaría el trazo desplazado.
  const fx = clipFxAt(clip, localT, clipDur(clip))
  const fxs = fx.scale || 1

  const unrotate = (x, y, deg) => {
    if (!deg) return [x, y]
    const rad = -deg * Math.PI / 180
    const c = Math.cos(rad), sn = Math.sin(rad)
    return [x * c - y * sn, x * sn + y * c]
  }

  if (isOverlay(clip)) {
    // El PIP se dibuja centrado en `dest` (desplazado por fx, girado y escalado
    // por fx.scale) recortando `crop` de la fuente.
    const { px: crop, dest } = overlayDest(null, el, clip, srcTime, outW, outH, localT, frame)
    let x = px - (dest.dx + dest.dw / 2 + fx.tx * dest.dw)
    let y = py - (dest.dy + dest.dh / 2 + fx.ty * dest.dh)
    ;[x, y] = unrotate(x, y, dest.rotation || 0)
    x /= fxs
    y /= fxs
    const u = (x + dest.dw / 2) / dest.dw
    const v = (y + dest.dh / 2) / dest.dh
    if (u < 0 || u > 1 || v < 0 || v > 1) return null
    return { x: (crop.sx + u * crop.sw) / vw, y: (crop.sy + v * crop.sh) / vh }
  }

  // Fill: deshacer fx, luego la pose (traslación/rotación/escala) y por último
  // el recorte cover. Es la inversa exacta de lo que hace drawComposite.
  const cw = frame.w, ch = frame.h
  // fx⁻¹
  let x = (px - frame.x) - (cw / 2 + fx.tx * cw)
  let y = (py - frame.y) - (ch / 2 + fx.ty * ch)
  x = x / fxs + cw / 2
  y = y / fxs + ch / 2
  // pose⁻¹
  const pose = clipPose(clip, localT)
  x -= cw / 2 + (pose.x - 0.5) * cw
  y -= ch / 2 + (pose.y - 0.5) * ch
  ;[x, y] = unrotate(x, y, pose.rotation || 0)
  const sc = pose.scale ?? 1
  if (sc) { x /= sc; y /= sc }
  const u = (x + cw / 2) / cw
  const v = (y + ch / 2) / ch
  if (u < 0 || u > 1 || v < 0 || v > 1) return null
  const crop = cropWindow(clip, vw / vh, slotAspectOf(clip, outW / outH), srcTime, localT)
  return {
    x: crop.cx - crop.wf / 2 + u * crop.wf,
    y: crop.cy - crop.hf / 2 + v * crop.hf,
  }
}

// Radio EN PÍXELES DEL LIENZO de un pincel definido en fracción del alto de la
// fuente. Es la relación directa que usa el dibujo del clip, así que el círculo
// que ve el usuario coincide con lo que se pinta de verdad.
export function bgBrushRadiusPx(clip, size, frame, env, head) {
  const el = env.mediaEls?.current?.get(clip.id)
  const { w: vw, h: vh } = mediaSize(el)
  if (!vw || !vh) return 0
  const outW = env.outRef.current.w, outH = env.outRef.current.h
  const localT = Math.max(0, head - (clip.start || 0))
  const srcTime = clip.kind === 'image'
    ? clamp(timelineToSource(clip, head), clip.in_point, clip.out_point)
    : (el.currentTime || 0)
  const fxs = clipFxAt(clip, localT, clipDur(clip)).scale || 1
  if (isOverlay(clip)) {
    const { px: crop, dest } = overlayDest(null, el, clip, srcTime, outW, outH, localT, frame)
    if (!crop.sh) return 0
    return (size * vh / crop.sh) * dest.dh * fxs / 2
  }
  const crop = cropWindow(clip, vw / vh, slotAspectOf(clip, outW / outH), srcTime, localT)
  const pose = clipPose(clip, localT)
  if (!crop.hf) return 0
  return (size / crop.hf) * frame.h * (pose.scale ?? 1) * fxs / 2
}

// Círculo del pincel de Eliminar fondo bajo el cursor: verde = conservar,
// rojo = eliminar. Es el mismo radio que se pinta en la máscara.
function drawBgBrushCursor(ctx, clip, brush, frame, env, head) {
  const r = bgBrushRadiusPx(clip, brush.size || 0.08, frame, env, head)
  if (!(r > 0) || brush.px == null || brush.py == null) return
  const keep = brush.op === 'keep'
  ctx.save()
  ctx.beginPath()
  ctx.arc(brush.px, brush.py, r, 0, Math.PI * 2)
  ctx.fillStyle = keep ? 'rgba(52, 211, 153, 0.18)' : 'rgba(248, 113, 113, 0.18)'
  ctx.fill()
  ctx.lineWidth = Math.max(1.5, frame.h * 0.003)
  ctx.strokeStyle = keep ? 'rgba(52, 211, 153, 0.95)' : 'rgba(248, 113, 113, 0.95)'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(brush.px, brush.py, Math.max(1.5, r * 0.06), 0, Math.PI * 2)
  ctx.fillStyle = keep ? '#34d399' : '#f87171'
  ctx.fill()
  ctx.restore()
}

// Dibuja el compuesto (todas las pistas de vídeo, fondo→frente + textos) dentro del
// recuadro Main (`frame`, en px del canvas). Lo que sobresale del recuadro se dibuja
// igualmente (contexto estilo CapCut) y el canvas lo recorta en su borde. Los dest/box/
// handles de `hits` quedan en coordenadas del canvas.
// Fondo de vista previa del área exportada (solo preview, no toca el export).
function drawBackdrop(ctx, ox, oy, cw, ch, env) {
  const bp = env.bgPreviewRef?.current
  const mode = bp?.mode || 'normal'
  if (mode === 'checker') {
    const s = 12
    ctx.fillStyle = '#c9ccd3'
    ctx.fillRect(ox, oy, cw, ch)
    ctx.fillStyle = '#8b909b'
    for (let y = 0; y < ch; y += s) {
      for (let x = 0; x < cw; x += s) {
        if (((x / s | 0) + (y / s | 0)) & 1) {
          ctx.fillRect(ox + x, oy + y, Math.min(s, cw - x), Math.min(s, ch - y))
        }
      }
    }
    return
  }
  if (mode === 'solid') {
    ctx.fillStyle = bp.color || '#000'
    ctx.fillRect(ox, oy, cw, ch)
    return
  }
  if (mode === 'media') {
    ctx.fillStyle = '#000'
    ctx.fillRect(ox, oy, cw, ch)
    const el = env.bgPreviewElRef?.current
    if (el) {
      const { w: mw, h: mh } = mediaSize(el)
      if (mw && mh) {
        const scale = Math.max(cw / mw, ch / mh)
        const dw = mw * scale, dh = mh * scale
        ctx.save()
        ctx.beginPath(); ctx.rect(ox, oy, cw, ch); ctx.clip()
        try { ctx.drawImage(el, ox + (cw - dw) / 2, oy + (ch - dh) / 2, dw, dh) } catch { /* aún no listo */ }
        ctx.restore()
      }
    }
    return
  }
  ctx.fillStyle = '#000'
  ctx.fillRect(ox, oy, cw, ch)
}

export function drawComposite(ctx, head, selClipIds, env, frame) {
  const { clipsRef, tracksRef, mediaEls, outRef } = env
  const selected = new Set(Array.isArray(selClipIds) ? selClipIds : (selClipIds ? [selClipIds] : []))
  const fr = frame || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height }
  const cw = fr.w, ch = fr.h, ox = fr.x, oy = fr.y
  const outW = outRef.current.w, outH = outRef.current.h
  // Fondo del área exportada. Normalmente negro; el usuario puede cambiarlo por
  // cuadros (para VER la transparencia), un color o una imagen/vídeo de prueba.
  // Es SOLO vista previa: no afecta al export. El fondo del workspace lo pinta
  // drawMainView.
  drawBackdrop(ctx, ox, oy, cw, ch, env)

  let overlayDestSel = null
  let selRender = null
  const hits = []
  for (const clip of videosAt(head, clipsRef.current, tracksRef.current)) {
    const localT = Math.max(0, head - (clip.start || 0))
    // Con máscara el clip se pinta en una capa aparte y la máscara recorta su
    // alfa; sin máscara se pinta directo (mismo camino de siempre).
    const masks = clipMasksAt(clip, localT)
    const layer = masks.length ? beginMaskLayer(ctx) : null
    const g = layer ? layer.ctx : ctx
    const flush = () => { if (layer) endMaskLayer(ctx, layer, masks, fr, { cssFontOf: cssFont }) }
    if (clip.kind === 'shape') {
      const isSel = selected.has(clip.id)
      g.save(); g.translate(ox, oy)
      const r = drawShapeClip(g, clip, cw, ch, { selected: isSel, time: localT })
      g.restore()
      flush()
      if (isSel) selRender = offsetRender(r, ox, oy)
      const dest = r?.box ? boxToDest(offsetBox(r.box, ox, oy), r.box.rotation || 0) : offsetDest(fillDestRect(cw, ch, clip, localT), ox, oy)
      hits.push({ id: clip.id, kind: 'shape', dest, handles: offsetHandles(r?.handles, ox, oy) })
      continue
    }
    const el = mediaEls.current.get(clip.id)
    const { w: mw } = mediaSize(el)
    if (!el || !mw) { flush(); continue }
    const srcTime = clip.kind === 'image'
      ? clamp(timelineToSource(clip, head), clip.in_point, clip.out_point)
      : el.currentTime
    // GIF animado + Eliminar fondo: la fuente de dibujo se sustituye por un
    // canvas de las MISMAS dimensiones, así el recorte/encuadre no cambia.
    const drawEl = drawSourceFor(clip, el, srcTime)
    const fx = fxForClip(clip, head)
    if (isOverlay(clip)) {
      const dest = drawOverlayLayer(g, drawEl, clip, srcTime, outW, outH, fx, localT, fr)
      flush()
      hits.push({ id: clip.id, kind: clip.kind, dest, overlay: true })
      if (selected.has(clip.id)) overlayDestSel = dest
    } else {
      const pose = clipPose(clip, localT)
      g.save()
      g.translate(ox, oy)
      applyCanvasFx(g, { ...fx, opacity: fx.opacity * pose.opacity }, cw, ch)
      const dx = (pose.x - 0.5) * cw
      const dy = (pose.y - 0.5) * ch
      const rot = pose.rotation || 0
      const sc = pose.scale ?? 1
      if (dx || dy || rot || Math.abs(sc - 1) > 0.001) {
        g.translate(cw / 2 + dx, ch / 2 + dy)
        g.rotate(rot * Math.PI / 180)
        g.scale(sc, sc)
        g.translate(-cw / 2, -ch / 2)
      }
      drawReframe(g, drawEl, reframeForDraw(clip, localT, srcTime), srcTime, outW / outH, { clear: false, dest: { dx: 0, dy: 0, dw: cw, dh: ch } })
      g.restore()
      flush()
      const dest = offsetDest(fillDestRect(cw, ch, clip, localT), ox, oy)
      hits.push({ id: clip.id, kind: clip.kind, dest, overlay: false })
      if (selected.has(clip.id) && !overlayDestSel) overlayDestSel = dest
    }
  }

  for (const c of clipsRef.current) {
    if (c.kind !== 'text') continue
    const track = tracksRef.current.find((t) => t.id === c.track_id)
    if (track?.hidden) continue
    const activeText = head >= c.start - 0.02 && head < c.start + clipDur(c)
    if (!activeText) continue
    const isSel = selected.has(c.id)
    ctx.save(); ctx.translate(ox, oy)
    const r = drawTextClip(ctx, c, cw, ch, { selected: isSel, time: head, trackStyle: track?.style })
    ctx.restore()
    if (isSel) selRender = offsetRender(r, ox, oy)
    if (r?.box) hits.push({ id: c.id, kind: 'text', dest: boxToDest(offsetBox(r.box, ox, oy)), handles: offsetHandles(r.handles, ox, oy) })
  }
  if (overlayDestSel) drawTransformHandles(ctx, overlayDestSel)
  const bgBrush = env.bgBrushRef?.current
  if (bgBrush?.on) {
    const selId = selected.values().next().value
    const selClip = selId ? clipsRef.current.find((c) => c.id === selId) : null
    if (selClip) drawBgBrushCursor(ctx, selClip, bgBrush, fr, env, head)
  }
  if (env.maskModeRef?.current) {
    const selId = selected.values().next().value
    const selClip = selId ? clipsRef.current.find((c) => c.id === selId) : null
    const selLocalT = selClip ? Math.max(0, head - (selClip.start || 0)) : 0
    const selMasks = selClip ? clipMasksAt(selClip, selLocalT) : []
    if (selMasks.length) drawMaskOverlay(ctx, selMasks[0], fr)
  }
  if (env.hitListRef) env.hitListRef.current = hits
  return selRender
}

// Guía de edición de la máscara: contorno + caja + tiradores (tamaño, giro, pluma).
export function drawMaskOverlay(ctx, mask, frame) {
  const h = maskHandles(mask, frame)
  const g = h.box
  ctx.save()
  strokeMaskShape(ctx, mask, frame, { color: 'rgba(56,189,248,0.95)', lineWidth: 2 })
  ctx.translate(g.cx, g.cy)
  ctx.rotate(g.rot)
  ctx.strokeStyle = 'rgba(56,189,248,0.45)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 5])
  ctx.strokeRect(-g.hw, -g.hh, g.hw * 2, g.hh * 2)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(0, -g.hh)
  ctx.lineTo(0, -g.hh - Math.max(16, frame.h * 0.022))
  ctx.stroke()
  ctx.restore()
  const hs = 5
  for (const [key, p] of Object.entries(h)) {
    if (key === 'box' || key === 'c') continue
    ctx.save()
    ctx.fillStyle = key === 'fea' ? '#fbbf24' : '#38bdf8'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    if (key === 'rot') ctx.arc(p.x, p.y, hs + 1, 0, Math.PI * 2)
    else ctx.rect(p.x - hs, p.y - hs, hs * 2, hs * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

function drawCropRuler(ctx, bx, by, bw, bh) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 4])
  for (const f of [1 / 3, 2 / 3]) {
    ctx.beginPath()
    ctx.moveTo(bx + bw * f, by)
    ctx.lineTo(bx + bw * f, by + bh)
    ctx.moveTo(bx, by + bh * f)
    ctx.lineTo(bx + bw, by + bh * f)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(255, 213, 0, 0.92)'
  for (let i = 0; i <= 10; i++) {
    const f = i / 10
    const x = bx + bw * f
    const y = by + bh * f
    const big = i % 5 === 0
    const len = big ? 8 : 4
    ctx.beginPath()
    ctx.moveTo(x, by)
    ctx.lineTo(x, by - len)
    ctx.moveTo(bx, y)
    ctx.lineTo(bx - len, y)
    ctx.stroke()
  }
  ctx.restore()
}

// Canvas principal: el compuesto (resultado) es la vista por defecto.
// El recorte de fuente (vídeo completo + recuadro) aparece en Clip Editor
// y en Encuadre (al seleccionar un fill, o al pulsar Encuadre).
export function drawMainView(head, env) {
  const {
    mainCanvasRef, clipsRef, mediaEls, outRef, selRef, selIdsRef, selKfRef, hiddenKfRef,
    playingRef, framingModeRef, mainTextBox, alignGuidesRef, croppingRef,
    viewZoomRef, mainStageRef, cropModeRef,
  } = env
  const canvas = mainCanvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const clip = clipsRef.current.find((c) => c.id === selRef.current)
  // Vista de recorte (fuente completa + recuadro naranja móvil, zonas fuera atenuadas)
  // cuando el clip está encuadrado con "Fijar vídeo" (llena marco o slot) o cuando se
  // pulsa "Recortar" sobre un overlay libre. Si no, compuesto (marco fijo). Estable en play.
  // Con el panel de Máscara abierto siempre se muestra el compuesto: es donde
  // se manipula la máscara (la vista de recorte no la puede representar).
  const cropEdit = !!(clip && isVisualClip(clip) && !framingModeRef.current
    && !env.maskModeRef?.current
    && (isFramed(clip) || cropModeRef?.current))

  // Recorte (fuente + recuadro): Clip Editor, o herramienta Encuadre con un visual seleccionado.
  if (cropEdit && clip && isVisualClip(clip)) {
    const el = mediaEls.current.get(clip.id)
    const { w: vw, h: vh } = mediaSize(el)
    if (!el || !vw) {
      ctx.fillStyle = '#05060a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }
    const srcAspect = vw / vh
    const cw2 = 520, ch2 = Math.round(cw2 / srcAspect)
    if (canvas.width !== cw2 || canvas.height !== ch2) { canvas.width = cw2; canvas.height = ch2 }
    const active = head >= clip.start - 0.02 && head < clipEnd(clip)
    const clampedHead = clamp(head, clip.start, clipEnd(clip))
    const srcTime = clamp(timelineToSource(clip, clampedHead), clip.in_point, clip.out_point)
    if (!(playingRef.current && active) && clip.kind !== 'image') {
      const seekT = safeMediaTime(el, srcTime, env.fpsRef?.current)
      if (Math.abs(el.currentTime - seekT) > 0.06) { try { el.currentTime = seekT } catch { /* noop */ } }
    }
    ctx.clearRect(0, 0, cw2, ch2)
    const drawEl = drawSourceFor(clip, el, srcTime)
    try { ctx.drawImage(drawEl, 0, 0, cw2, ch2) } catch { /* noop */ }
    const rf = clip.reframe || newReframe()
    // El recorte se hace respecto al aspecto del SLOT (Completo=salida; mitades≈1:1).
    const outA = slotAspectOf(clip, outRef.current.w / outRef.current.h)
    const srcT = (playingRef.current && active && clip.kind !== 'image') ? el.currentTime : srcTime
    const localHead = Math.max(0, head - clip.start)
    const crop = cropWindow(clip, srcAspect, outA, srcT, localHead)
    const { cx: pcx, cy: pcy, wf, hf } = crop
    const bx = (pcx - wf / 2) * cw2, by = (pcy - hf / 2) * ch2, bw = wf * cw2, bh = hf * ch2
    ctx.fillStyle = 'rgba(3,5,12,0.58)'
    ctx.fillRect(0, 0, cw2, by)
    ctx.fillRect(0, by + bh, cw2, ch2 - (by + bh))
    ctx.fillRect(0, by, bx, bh)
    ctx.fillRect(bx + bw, by, cw2 - (bx + bw), bh)
    const kfs = keyframesOn(clip)
      ? normalizeItems(clip.keyframes.items)
      : [...(rf.keyframes || [])].sort((a, b) => a.t - b.t)
    kfs.forEach((k, i) => {
      if (hiddenKfRef.current.has(k.id)) return
      const g = keyframesOn(clip)
        ? cropWindow(clip, srcAspect, outA, srcT, k.t)
        : cropWindow({ ...clip, reframe: { ...rf, keyframes: [k] } }, srcAspect, outA, k.t)
      const kx = (g.cx - g.wf / 2) * cw2, ky = (g.cy - g.hf / 2) * ch2
      ctx.strokeStyle = kfColor(i)
      ctx.lineWidth = k.id === selKfRef.current ? 3 : 1.5
      ctx.strokeRect(kx, ky, g.wf * cw2, g.hf * ch2)
    })
    ctx.strokeStyle = '#ff8c1a'; ctx.lineWidth = 2.5
    ctx.strokeRect(bx, by, bw, bh)
    if (croppingRef?.current) drawCropRuler(ctx, bx, by, bw, bh)
    const hs = 5
    ctx.fillStyle = '#ff8c1a'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    cropCornerNorms(pcx, pcy, wf, hf).forEach(([nx, ny]) => {
      const hx = nx * cw2, hy = ny * ch2
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2)
      ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2)
    })
    return
  }

  // El canvas ocupa TODO el stage (más ancho que la salida), para ver el desborde del
  // clip fuera del cuadro naranja (p. ej. 16:9 dentro de 9:16). El cuadro va centrado.
  const sr = mainStageRef?.current?.getBoundingClientRect()
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  const cwT = Math.max(2, Math.round((sr?.width || 900) * dpr))
  const chT = Math.max(2, Math.round((sr?.height || 700) * dpr))
  if (canvas.width !== cwT || canvas.height !== chT) { canvas.width = cwT; canvas.height = chT }
  const cw = canvas.width, ch = canvas.height
  const outA = outRef.current.w / outRef.current.h
  const frame = frameRectOf(cw, ch, viewZoomRef?.current ?? 1, outA)
  // Fondo del workspace (fuera del Main).
  ctx.fillStyle = '#0b0e16'
  ctx.fillRect(0, 0, cw, ch)
  mainTextBox.current = drawComposite(
    ctx, head,
    selIdsRef?.current?.length ? selIdsRef.current : (clip?.id ? [clip.id] : []),
    env, frame,
  )
  // Atenuar el contexto que queda fuera del recuadro exportable.
  ctx.save()
  ctx.fillStyle = 'rgba(7, 9, 16, 0.62)'
  ctx.fillRect(0, 0, cw, frame.y)
  ctx.fillRect(0, frame.y + frame.h, cw, ch - (frame.y + frame.h))
  ctx.fillRect(0, frame.y, frame.x, frame.h)
  ctx.fillRect(frame.x + frame.w, frame.y, cw - (frame.x + frame.w), frame.h)
  ctx.restore()
  // Overlays de edición (encuadre de texto, guías) mapeados al recuadro Main.
  ctx.save()
  ctx.translate(frame.x, frame.y)
  if (framingModeRef.current) drawFramingOverlay(ctx, frame.w, frame.h, framingModeRef.current)
  drawAlignGuides(ctx, frame.w, frame.h, alignGuidesRef?.current)
  ctx.restore()
  // Borde naranja fijo = límite del área que se exporta.
  ctx.save()
  ctx.strokeStyle = '#ff8c1a'
  ctx.lineWidth = Math.max(2, cw * 0.004)
  const lw = ctx.lineWidth
  ctx.strokeRect(frame.x + lw / 2, frame.y + lw / 2, frame.w - lw, frame.h - lw)
  ctx.restore()
}

// Vista de RESULTADO en vivo (composición final 9:16) para el panel lateral mientras se
// encuadra con Fijar vídeo. Reusa drawComposite en un canvas propio con el aspecto de
// salida. Sin selección/handles ni hit-list (no debe interferir con la edición del recorte).
export function drawResultView(head, env) {
  const { resultCanvasRef, outRef } = env
  const canvas = resultCanvasRef?.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const a = outRef.current.w / outRef.current.h
  const long = 640
  const cw = a >= 1 ? long : Math.max(2, Math.round(long * a))
  const ch = a >= 1 ? Math.max(2, Math.round(long / a)) : long
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch }
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  const resultEnv = { ...env, hitListRef: null }
  drawComposite(ctx, head, [], resultEnv, { x: 0, y: 0, w: cw, h: ch })
}
