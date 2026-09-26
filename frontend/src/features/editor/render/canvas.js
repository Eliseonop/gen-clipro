// Dibujo del editor sobre <canvas>: compuesto final (vídeo + texto), vista de edición
// del Main (recorte/keyframes) y guías de alineado.
//
// Estas funciones son puras respecto a React: reciben un `env` con las refs vivas del
// componente (clipsRef, tracksRef, mediaEls, outRef, …) y leen `.current` en el momento
// de la llamada, igual que hacía el componente. Así el comportamiento por frame no cambia.
import { drawReframe, clamp } from '../../../lib/panning'
import { drawTextClip } from '../../../lib/textstyles'
import { drawShapeClip, pathAnchorPoints, pathPoints } from '../../../lib/shapes'
import { drawAlignGuides } from '../../../lib/alignGuides'
import { clipDur, timelineToSource } from '../editorModel'
import { gifFrameAt, gifInfo } from '../gifPlayer'
import { cutoutDrawable } from '../bgCutout'
import { magicOverlayCanvas } from '../bgMagic'
import { applyCanvasFx, clipFxAt } from '../../../lib/clipFx'
import { posedTransform, clipPose, clipMasksAt } from '../../../lib/clipAnim'
import { beginMaskLayer, endMaskLayer, maskHandles, strokeMaskShape } from '../../../lib/clipMask'
import { adjustPasses } from '../../../lib/clipAdjust'
import { blendOp } from '../../../lib/clipBlend'
import { adjustmentMatrix } from '../../../lib/clipFilters'
import { colorMatrix, matrixFilterUrl } from '../../../lib/clipAdjust'
import { cssFont, effectiveTextStyle } from '../../../lib/textstyles'
import { clipPropsAt, keyframesOn } from '../../../lib/clipKeyframes'
import { focalOf, planeProject, text3dAngles } from '../../../lib/text3d'
import { warpLayer } from './warp3d'
import {
  clipFlip, cropWindow, destRectOnFrame, frameRectOf, isOverlay, mediaSize, slotAspectOf,
  sourceCropPx, srcRectOn, layersAt,
} from '../../../lib/clipLayout'
import { drawPlatformChrome } from './platformChrome'
import { drawSelectionFrame, frameOfDest } from '../../../lib/selectionFrame'

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

// --- Texto 3D (#4): el texto se pinta en una capa del tamaño del canvas y la capa
// se deforma con WebGL (render/warp3d.js), alrededor del centro de su caja. Igual
// que el export (text_ass.text_warp_spec + filtro perspective).
let _text3dLayer = null
function text3dLayer(w, h) {
  if (typeof document === 'undefined' || !w || !h) return null
  if (!_text3dLayer) _text3dLayer = document.createElement('canvas')
  if (_text3dLayer.width !== w) _text3dLayer.width = w
  if (_text3dLayer.height !== h) _text3dLayer.height = h
  return _text3dLayer
}

// Caja y tiradores del texto, proyectados (coordenadas del recuadro Main).
function projectTextRender(r, pr) {
  if (!r?.box) return r
  const { x, y, w, h } = r.box
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([X, Y]) => pr(X, Y))
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  let handles = null
  if (r.handles) {
    handles = {}
    for (const [k, p] of Object.entries(r.handles)) handles[k] = p ? { ...p, ...pr(p.x, p.y) } : p
  }
  return { ...r, box, handles }
}

function drawText3d(g, c, ang, { cw, ch, ox, oy, head, track, localT, selected }) {
  const layer = text3dLayer(g.canvas?.width, g.canvas?.height)
  if (!layer) return null
  const l = layer.getContext('2d')
  l.setTransform(1, 0, 0, 1, 0, 0)
  l.clearRect(0, 0, layer.width, layer.height)
  l.translate(ox, oy)
  const r = drawTextClip(l, c, cw, ch, { selected, frame: false, time: head, trackStyle: track?.style })
  const pose = clipPose(c, localT)
  const f = focalOf(ch, effectiveTextStyle(track?.style, c.style).perspective)
  const cx = ox + pose.x * cw
  const cy = oy + pose.y * ch
  const warped = warpLayer(layer, cx, cy, ang[0], ang[1], f)
  g.drawImage(warped || layer, 0, 0)
  const pr = (X, Y) => {
    const p = planeProject(cx, cy, ang[0], ang[1], f, X + ox, Y + oy)
    return { x: p.x - ox, y: p.y - oy }
  }
  return projectTextRender(r, pr)
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


function overlayDest(ctx, media, clip, srcTime, outW, outH, localT, frame) {
  const { w: vw, h: vh } = mediaSize(media)
  const crop = cropWindow(clip, vw / vh, outW / outH, srcTime, localT)
  const px = sourceCropPx(crop, vw, vh)
  return { px, dest: destRectOnFrame(posedTransform(clip, localT), px, outW, outH, frame) }
}

function drawOverlayLayer(ctx, media, drawEl, clip, srcTime, outW, outH, fx, localT, frame) {
  const { px: geo, dest } = overlayDest(ctx, media, clip, srcTime, outW, outH, localT, frame)
  const px = srcRectOn(drawEl, media, geo)
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
  const flip = clipFlip(clip)
  ctx.scale(fx.scale * (flip.h ? -1 : 1), fx.scale * (flip.v ? -1 : 1))
  try { ctx.drawImage(drawEl, px.sx, px.sy, px.sw, px.sh, -dest.dw / 2, -dest.dh / 2, dest.dw, dest.dh) } catch { /* noop */ }
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

// Vídeo / imagen seleccionados: recuadro de CapCut (esquinas escalan, giro debajo).
function drawTransformHandles(ctx, dest) {
  drawSelectionFrame(ctx, frameOfDest(dest))
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
// Eliminar fondo. El resultado conserva el ASPECTO del material pero NO siempre su
// resolución (el recorte topa el lado mayor), así que quien dibuje debe traducir
// los píxeles de origen con `srcRectOn`. Mismo gancho que ya usaba el GIF: para el
// resto del dibujo esto "es" la fuente.
export function drawSourceFor(clip, el, srcTime, { cutout = true } = {}) {
  const gif = gifDrawable(clip, el, srcTime)
  const base = gif || el
  if (!cutout) return base
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
  // Volteo (#7): va dentro de la pose, justo antes de dibujar la fuente.
  const flip = clipFlip(clip)

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
    if (flip.h) x = -x
    if (flip.v) y = -y
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
  if (flip.h) x = -x
  if (flip.v) y = -y
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

// Círculo del pincel de Eliminar fondo bajo el cursor. Es el mismo radio que se
// pinta en la máscara. En la Eliminación personalizada (`plain`) es el círculo
// blanco de CapCut: el color lo da el trazo (cian añade, rojo quita). En el
// retoque de la automática: verde = conservar, rojo = eliminar.
function drawBgBrushCursor(ctx, clip, brush, frame, env, head, plain = false) {
  const r = bgBrushRadiusPx(clip, brush.size || 0.08, frame, env, head)
  if (!(r > 0) || brush.px == null || brush.py == null) return
  const keep = brush.op === 'keep'
  ctx.save()
  ctx.beginPath()
  ctx.arc(brush.px, brush.py, r, 0, Math.PI * 2)
  if (plain) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.fill()
    ctx.lineWidth = Math.max(1.5, frame.h * 0.0025)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 3
    ctx.stroke()
    ctx.restore()
    return
  }
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
  // Eliminación personalizada: mientras se edita, el clip se ve SIN recortar y
  // con la selección encima (cian), como en CapCut; se dibuja por la MISMA
  // geometría que la fuente del clip. Al Aplicar vuelve a verse el recorte.
  const magic = env.magicRef?.current
  // Fondo del área exportada. Normalmente negro; el usuario puede cambiarlo por
  // cuadros (para VER la transparencia), un color o una imagen/vídeo de prueba.
  // Es SOLO vista previa: no afecta al export. El fondo del workspace lo pinta
  // drawMainView.
  drawBackdrop(ctx, ox, oy, cw, ch, env)

  let overlayDestSel = null
  let selRender = null
  const hits = []
  // Recuadros de selección: se pintan al final, encima de todas las capas (como
  // CapCut); si no, un vídeo en una pista superior taparía el de un texto.
  const selFrames = []

  function drawTextLayer(c) {
    const track = tracksRef.current.find((t) => t.id === c.track_id)
    const isSel = selected.has(c.id)
    // Máscara en texto ("revelar texto") y modo de fusión: misma capa que los visuales.
    const tMasks = clipMasksAt(c, Math.max(0, head - (c.start || 0)))
    const tOp = blendOp(c)
    const tLayer = (tMasks.length || tOp) ? beginMaskLayer(ctx) : null
    const tg = tLayer ? tLayer.ctx : ctx
    const tLocal = Math.max(0, head - (c.start || 0))
    const ang3d = text3dAngles(clipPropsAt(c, tLocal))
    let r
    if (ang3d) {
      r = drawText3d(tg, c, ang3d, { cw, ch, ox, oy, head, track, localT: tLocal, selected: isSel })
    } else {
      tg.save(); tg.translate(ox, oy)
      r = drawTextClip(tg, c, cw, ch, { selected: isSel, frame: false, time: head, trackStyle: track?.style })
      tg.restore()
    }
    if (tLayer) endMaskLayer(ctx, tLayer, tMasks, fr, { cssFontOf: cssFont, op: tOp })
    if (!r?.box) return
    const hit = { id: c.id, kind: 'text', dest: boxToDest(offsetBox(r.box, ox, oy), r.box.rotation || 0), handles: null }
    hits.push(hit)
    if (!isSel) return
    selFrames.push(() => {
      let sr
      if (ang3d) {
        // Plano sobre la caja proyectada (en la capa deformada se torcería).
        const b = r.box
        const h = drawSelectionFrame(ctx, { cx: ox + b.x + b.w / 2, cy: oy + b.y + b.h / 2, w: b.w, h: b.h + 8 }, { del: true, sides: true })
        sr = { ...r, handles: offsetHandles(h, -ox, -oy) }
      } else {
        ctx.save(); ctx.translate(ox, oy)
        sr = drawTextClip(ctx, c, cw, ch, { selected: true, selectionOnly: true, time: head, trackStyle: track?.style })
        ctx.restore()
      }
      selRender = offsetRender(sr, ox, oy)
      hit.handles = selRender.handles
    })
  }

  // Una sola pila de fondo a frente (vídeo, imagen, figura… y TEXTO en su capa):
  // un texto en una pista por debajo de un vídeo queda detrás de él.
  // Máscara de ajuste: un clip puede pintarse en dos pasadas (base sin ajustes de
  // color + fantasma con ajustes recortado por esas máscaras). Solo la base da hit.
  const passes = []
  for (const c of layersAt(head, clipsRef.current, tracksRef.current)) {
    if (c.kind === 'text') passes.push({ clip: c, text: true })
    else passes.push(...adjustPasses(c))
  }
  for (const { clip, ghost, text } of passes) {
    if (text) {
      drawTextLayer(clip)
      continue
    }
    // Capa de ajuste (#19): filtra lo ya compuesto dentro del cuadro (lo de debajo).
    if (clip.kind === 'adjustment') {
      applyAdjustmentLayer(ctx, clip, fr)
      continue
    }
    const localT = Math.max(0, head - (clip.start || 0))
    // Con máscara o modo de fusión (#8) el clip se pinta en una capa aparte: la
    // máscara recorta su alfa y la capa se funde entera con lo de debajo (como el
    // export). Sin nada de eso se pinta directo (mismo camino de siempre).
    const masks = clipMasksAt(clip, localT)
    const op = blendOp(clip)
    const layer = (masks.length || op) ? beginMaskLayer(ctx) : null
    const g = layer ? layer.ctx : ctx
    const flush = () => { if (layer) endMaskLayer(ctx, layer, masks, fr, { cssFontOf: cssFont, op }) }
    if (clip.kind === 'shape') {
      const isSel = selected.has(clip.id)
      g.save(); g.translate(ox, oy)
      const r = drawShapeClip(g, clip, cw, ch, { time: localT })
      g.restore()
      flush()
      if (ghost) continue
      const dest = r?.box ? boxToDest(offsetBox(r.box, ox, oy), r.box.rotation || 0) : offsetDest(fillDestRect(cw, ch, clip, localT), ox, oy)
      const hit = { id: clip.id, kind: 'shape', dest, handles: null }
      hits.push(hit)
      if (isSel) {
        selFrames.push(() => {
          hit.handles = drawSelectionFrame(ctx, frameOfDest(dest), { sides: true, tb: true })
          selRender = { ...offsetRender(r, ox, oy), handles: hit.handles }
        })
      }
      continue
    }
    const el = mediaEls.current.get(clip.id)
    const { w: mw } = mediaSize(el)
    if (!el || !mw) { flush(); continue }
    const srcTime = clip.kind === 'image'
      ? clamp(timelineToSource(clip, head), clip.in_point, clip.out_point)
      : el.currentTime
    // GIF animado + Eliminar fondo: la fuente de dibujo se sustituye por un
    // canvas del MISMO aspecto; la geometría se sigue calculando con `el` (las
    // dimensiones reales del material), nunca con la del recorte.
    const editing = !!(magic?.on && magic.clipId === clip.id && !ghost)
    const drawEl = drawSourceFor(clip, el, srcTime, { cutout: !editing })
    const magicEl = editing ? magicOverlayCanvas(clip.id, magic, mw, mediaSize(el).h) : null
    const fx = fxForClip(clip, head)
    if (isOverlay(clip)) {
      const dest = drawOverlayLayer(g, el, drawEl, clip, srcTime, outW, outH, fx, localT, fr)
      // Misma geometría de overlay, con el overlay de selección encima.
      if (magicEl) drawOverlayLayer(g, el, magicEl, clip, srcTime, outW, outH, fx, localT, fr)
      flush()
      if (ghost) continue
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
      const flip = clipFlip(clip)
      if (dx || dy || rot || Math.abs(sc - 1) > 0.001 || flip.h || flip.v) {
        g.translate(cw / 2 + dx, ch / 2 + dy)
        g.rotate(rot * Math.PI / 180)
        g.scale(sc * (flip.h ? -1 : 1), sc * (flip.v ? -1 : 1))
        g.translate(-cw / 2, -ch / 2)
      }
      const rfDraw = reframeForDraw(clip, localT, srcTime)
      drawReframe(g, drawEl, rfDraw, srcTime, outW / outH, { clear: false, dest: { dx: 0, dy: 0, dw: cw, dh: ch } })
      // Selección de la Eliminación personalizada, por la MISMA geometría del clip.
      if (magicEl) drawReframe(g, magicEl, rfDraw, srcTime, outW / outH, { clear: false, dest: { dx: 0, dy: 0, dw: cw, dh: ch } })
      g.restore()
      flush()
      if (ghost) continue
      const dest = offsetDest(fillDestRect(cw, ch, clip, localT), ox, oy)
      hits.push({ id: clip.id, kind: clip.kind, dest, overlay: false })
      if (selected.has(clip.id) && !overlayDestSel) overlayDestSel = dest
    }
  }

  for (const draw of selFrames) draw()
  if (overlayDestSel) drawTransformHandles(ctx, overlayDestSel)
  const bgBrush = env.bgBrushRef?.current
  if (bgBrush?.on) {
    const selId = selected.values().next().value
    const selClip = selId ? clipsRef.current.find((c) => c.id === selId) : null
    if (selClip) drawBgBrushCursor(ctx, selClip, bgBrush, fr, env, head, !!magic?.on)
  }
  if (env.maskModeRef?.current) {
    const selId = selected.values().next().value
    const selClip = selId ? clipsRef.current.find((c) => c.id === selId) : null
    const selLocalT = selClip ? Math.max(0, head - (selClip.start || 0)) : 0
    const selMasks = selClip ? clipMasksAt(selClip, selLocalT, { includeAdjust: true }) : []
    if (selMasks.length) drawMaskOverlay(ctx, selMasks[0], fr)
  }
  // Seguimiento (#15): recuadro del objeto mientras se arrastra.
  const tb = env.trackBoxRef?.current
  if (tb) {
    ctx.save()
    ctx.fillStyle = 'rgba(250, 204, 21, 0.12)'
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    const x = Math.min(tb.x0, tb.x1), y = Math.min(tb.y0, tb.y1)
    ctx.fillRect(x, y, Math.abs(tb.x1 - tb.x0), Math.abs(tb.y1 - tb.y0))
    ctx.strokeRect(x, y, Math.abs(tb.x1 - tb.x0), Math.abs(tb.y1 - tb.y0))
    ctx.restore()
  }
  // Pluma (#14): el trazado que se está dibujando; si no, las anclas del
  // trazado seleccionado cuando se editan sus puntos.
  const pen = env.penRef?.current
  if (pen) drawPenOverlay(ctx, pen, env.penHoverRef?.current, fr)
  else if (env.pathEditRef?.current) {
    const selId = selected.values().next().value
    const selClip = selId ? clipsRef.current.find((c) => c.id === selId) : null
    if (selClip?.kind === 'shape' && selClip.shape?.type === 'path') {
      drawPathAnchors(ctx, pathAnchorPoints(selClip, fr, Math.max(0, head - (selClip.start || 0))), !!selClip.shape.closed)
    }
  }
  if (env.hitListRef) env.hitListRef.current = hits
  return selRender
}

function drawAnchor(ctx, x, y, r, first) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = first ? '#38bdf8' : '#fff'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = first ? '#fff' : '#38bdf8'
  ctx.stroke()
}

// Pluma (#14): curva provisional (con el puntero como siguiente punto) + anclas.
// El primer punto va resaltado: pulsarlo cierra el trazado.
export function drawPenOverlay(ctx, pen, hover, frame) {
  const toPx = ([x, y]) => [frame.x + x * frame.w, frame.y + y * frame.h]
  const pts = pen.points || []
  const line = hover ? [...pts, hover] : pts
  ctx.save()
  if (line.length >= 2) {
    ctx.strokeStyle = 'rgba(56,189,248,0.95)'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pathPoints(line, { smooth: true }).map(toPx).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
  }
  pts.forEach((p, i) => { const [x, y] = toPx(p); drawAnchor(ctx, x, y, i === 0 && pts.length >= 3 ? 6.5 : 4.5, i === 0) })
  ctx.restore()
}

// Editar puntos de un trazado: polígono de anclas (discontinuo) + anclas.
export function drawPathAnchors(ctx, anchors, closed) {
  if (!anchors.length) return
  ctx.save()
  ctx.strokeStyle = 'rgba(56,189,248,0.55)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  anchors.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  if (closed) ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
  anchors.forEach(([x, y]) => drawAnchor(ctx, x, y, 5, false))
  ctx.restore()
}

let _adjCanvas = null
// Capa de ajuste (#19): copia el cuadro ya compuesto y lo vuelve a pintar a través
// de la matriz de la capa (un feColorMatrix = el colorchannelmixer del export).
function applyAdjustmentLayer(ctx, clip, fr) {
  const url = matrixFilterUrl(adjustmentMatrix(clip, colorMatrix(clip.effects || {})))
  if (!url || typeof document === 'undefined') return
  const w = Math.max(1, Math.round(fr.w))
  const h = Math.max(1, Math.round(fr.h))
  if (!_adjCanvas) _adjCanvas = document.createElement('canvas')
  if (_adjCanvas.width !== w || _adjCanvas.height !== h) { _adjCanvas.width = w; _adjCanvas.height = h }
  const g = _adjCanvas.getContext('2d')
  g.clearRect(0, 0, w, h)
  g.drawImage(ctx.canvas, fr.x, fr.y, fr.w, fr.h, 0, 0, w, h)
  ctx.save()
  ctx.filter = url
  ctx.drawImage(_adjCanvas, 0, 0, w, h, fr.x, fr.y, fr.w, fr.h)
  ctx.restore()
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

// Canvas principal: siempre el compuesto. El recorte de la fuente se edita en su
// propio modal (EdCropModal), no en este lienzo.
export function drawMainView(head, env) {
  const {
    mainCanvasRef, clipsRef, outRef, selRef, selIdsRef,
    mainTextBox, alignGuidesRef,
    viewZoomRef, mainStageRef, platformOverlayRef,
  } = env
  const canvas = mainCanvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const clip = clipsRef.current.find((c) => c.id === selRef.current)

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
  // Overlays de edición (guías) mapeados al recuadro Main.
  ctx.save()
  ctx.translate(frame.x, frame.y)
  drawAlignGuides(ctx, frame.w, frame.h, alignGuidesRef?.current)
  ctx.restore()
  // Borde fijo = límite del área que se exporta. Línea fina y neutra (blanco muy
  // tenue) para no teñir los colores del material; el atenuado exterior ya marca
  // el recuadro, así que basta un contorno sutil.
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.32)'
  ctx.lineWidth = Math.max(1, dpr)
  const lw = ctx.lineWidth
  ctx.strokeRect(frame.x + lw / 2, frame.y + lw / 2, frame.w - lw, frame.h - lw)
  ctx.restore()
  // Marco de plataforma (TikTok / Shorts): solo vista previa, encima del recuadro
  // exportable.
  drawPlatformChrome(ctx, frame, platformOverlayRef?.current)
}

