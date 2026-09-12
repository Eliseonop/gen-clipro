import assert from 'node:assert/strict'
import {
  clampCrop,
  cropSizeFromCorner,
  cropWindow,
  destRect,
  destRectOnCanvas,
  freeFrameAt,
  isOverlay,
  mediaSize,
  newTransform,
  sourceCropPx,
  srcRectOn,
  videosAt,
} from './clipLayout.js'

const fillClip = {
  layout: 'fill',
  reframe: { zoom: 0.5, pan_mode: 'smooth', keyframes: [{ t: 0, cx: 0.5, cy: 0.5, zoom: 0.5 }] },
}

const overlayClip = {
  layout: 'overlay',
  reframe: {
    zoom: 1,
    crop_w: 500 / 1920,
    crop_h: 300 / 1080,
    pan_mode: 'smooth',
    keyframes: [{ t: 0, cx: 0.4, cy: 0.3, zoom: 1 }],
  },
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
}

const srcW = 1920, srcH = 1080, outW = 720, outH = 1280
const srcAspect = srcW / srcH
const outAspect = outW / outH

// --- Independencia crop vs transform ---

const crop0 = cropWindow(overlayClip, srcAspect, outAspect, 0)
assert.ok(Math.abs(crop0.wf * srcW - 500) < 1.5)
assert.ok(Math.abs(crop0.hf * srcH - 300) < 1.5)

const scaled = { ...overlayClip, transform: { ...overlayClip.transform, scale: 2 } }
const cropAfterScale = cropWindow(scaled, srcAspect, outAspect, 0)
assert.equal(cropAfterScale.wf, crop0.wf)
assert.equal(cropAfterScale.hf, crop0.hf)
assert.equal(cropAfterScale.cx, crop0.cx)
assert.equal(cropAfterScale.cy, crop0.cy)

const moved = { ...overlayClip, transform: { ...overlayClip.transform, x: 0.2, y: 0.8 } }
const cropAfterMove = cropWindow(moved, srcAspect, outAspect, 0)
assert.equal(cropAfterMove.wf, crop0.wf)
assert.equal(cropAfterMove.hf, crop0.hf)
assert.equal(cropAfterMove.cx, crop0.cx)

const biggerCrop = {
  ...overlayClip,
  reframe: { ...overlayClip.reframe, crop_w: 0.5, crop_h: 0.4 },
}
assert.equal(biggerCrop.transform.scale, 1)
assert.equal(biggerCrop.transform.x, 0.5)

// --- Scale 1.0 = 1 px fuente → 1 px de salida ---

const px = sourceCropPx(crop0, srcW, srcH)
assert.ok(Math.abs(px.sw - 500) < 1.5)
assert.ok(Math.abs(px.sh - 300) < 1.5)

const d1 = destRect(overlayClip.transform, px, outW, outH)
assert.ok(Math.abs(d1.dw - 500) < 1.5)
assert.ok(Math.abs(d1.dh - 300) < 1.5)
assert.ok(Math.abs(d1.dx + d1.dw / 2 - outW / 2) < 1)
assert.ok(Math.abs(d1.dy + d1.dh / 2 - outH / 2) < 1)

const d15 = destRect({ ...overlayClip.transform, scale: 1.5 }, px, outW, outH)
assert.ok(Math.abs(d15.dw - 750) < 2)
assert.ok(Math.abs(d15.dh - 450) < 1.5)

const d2 = destRect({ ...overlayClip.transform, scale: 2 }, px, outW, outH)
assert.ok(Math.abs(d2.dw - 1000) < 2)
assert.ok(Math.abs(d2.dh - 600) < 1.5)

// Preview canvas (360×640) debe ser proporcional al 720×1280
const preview = destRectOnCanvas(overlayClip.transform, px, outW, outH, 360, 640)
assert.ok(Math.abs(preview.dw - 250) < 1.5)
assert.ok(Math.abs(preview.dh - 150) < 1.5)

// --- Fill no usa crop_w/h: sigue atado al aspecto de salida ---

const fillCrop = cropWindow(fillClip, srcAspect, outAspect, 0)
assert.ok(Math.abs(fillCrop.hf - 0.5) < 1e-9)
assert.ok(Math.abs(fillCrop.wf / fillCrop.hf - (outAspect / srcAspect)) < 1e-6)
assert.equal(isOverlay(fillClip), false)
assert.equal(isOverlay(overlayClip), true)

// 16:9 en salida 9:16 (zoom 1): se ve toda la altura y se recortan los lados; se puede panear X
const fillCover = { layout: 'fill', reframe: { zoom: 1, pan_mode: 'smooth', keyframes: [] } }
const cover169 = cropWindow(fillCover, 16 / 9, 9 / 16, 0)
assert.ok(Math.abs(cover169.hf - 1) < 1e-9)
assert.ok(cover169.wf < 0.4)
assert.equal(cover169.cx, 0.5)

// --- Esquinas del encuadre cambian solo el crop ---

const sized = cropSizeFromCorner(0.55, 0.4, 0.4, 0.3)
assert.ok(sized.wf > 0.2)
assert.ok(sized.hf > 0.1)
const clamped = clampCrop(0.4, 0.3, sized.wf, sized.hf)
assert.ok(clamped.wf <= 1)
assert.ok(clamped.cx >= clamped.wf / 2)

assert.equal(newTransform().scale, 1)
assert.equal(newTransform().rotation, 0)

const containClip = {
  layout: 'fill',
  reframe: { keyframes: [{ t: 0, cx: 0.2, cy: 0.2, zoom: 0.4, fit: 'contain' }] },
}
const containWin = cropWindow(containClip, 16 / 9, 9 / 16, 0)
assert.equal(containWin.wf, 1)
assert.equal(containWin.hf, 1)
assert.equal(containWin.cx, 0.5)
assert.equal(containWin.cy, 0.5)

const tracks = [
  { id: 'V1', kind: 'video' },
  { id: 'V2', kind: 'video' },
  { id: 'A1', kind: 'audio' },
]
const layered = videosAt(2, [
  { id: 'v', kind: 'video', track_id: 'V1', start: 0, in_point: 0, out_point: 10 },
  { id: 'm', kind: 'image', track_id: 'V2', start: 1, in_point: 0, out_point: 5 },
  { id: 's', kind: 'shape', track_id: 'V2', start: 1, in_point: 0, out_point: 5 },
  { id: 'a', kind: 'audio', track_id: 'A1', start: 0, in_point: 0, out_point: 10 },
], tracks)
assert.deepEqual(layered.map((c) => c.id), ['v', 'm', 's'])
const sameTrackFront = videosAt(2, [
  { id: 'v', kind: 'video', track_id: 'V1', start: 0, in_point: 0, out_point: 10 },
  { id: 's', kind: 'shape', track_id: 'V2', start: 1, in_point: 0, out_point: 5 },
  { id: 'm', kind: 'image', track_id: 'V2', start: 1, in_point: 0, out_point: 5 },
], tracks)
assert.deepEqual(sameTrackFront.map((c) => c.id), ['v', 's', 'm'])
assert.equal(mediaSize({ videoWidth: 1920, videoHeight: 1080 }).w, 1920)
assert.equal(mediaSize({ naturalWidth: 800, naturalHeight: 600 }).w, 800)
assert.equal(mediaSize({ videoWidth: 0, naturalWidth: 400, naturalHeight: 300 }).h, 300)

// --- Eliminar fondo: el recorte se dibuja a menos resolución, la geometría no cambia ---
// El material es 1920x1080; el recorte de Eliminar fondo topa en 1280x720. El
// rectángulo de origen se reubica en el lienzo pequeño, pero el destino (y por tanto
// el tamaño del clip en pantalla) lo decide la geometría del MATERIAL.
const material = { videoWidth: 1920, videoHeight: 1080 }
const recorte = { width: 1280, height: 720 }
const cropPx = sourceCropPx({ cx: 0.5, cy: 0.5, wf: 0.5, hf: 0.5 }, 1920, 1080)
const enRecorte = srcRectOn(recorte, material, cropPx)
assert.deepEqual(enRecorte, { sx: 320, sy: 180, sw: 640, sh: 360 })
// Mismas dimensiones (GIF, o material por debajo del tope) → el rectángulo no se toca.
assert.equal(srcRectOn({ width: 1920, height: 1080 }, material, cropPx), cropPx)
assert.equal(srcRectOn(null, material, cropPx), cropPx)

// --- Objeto libre → encuadre equivalente (cx/cy/zoom) ---
// Un clip 1920x1080 recortado a la ventana 9:16 y escalado hasta llenar el cuadro
// devuelve el MISMO encuadre del que salió: es la inversa de convertirlo a objeto.
const fOutW = 720, fOutH = 1280
const fSrc = { w: 1920, h: 1080 }
const zoom = 0.7
const original = { cx: 0.42, cy: 0.55, zoom }
const framed = {
  layout: 'fill',
  start: 0,
  in_point: 0,
  out_point: 8,
  reframe: { zoom, keyframes: [{ t: 0, ...original }] },
}
const win = cropWindow(framed, fSrc.w / fSrc.h, fOutW / fOutH, 0, 0)
const winPx = sourceCropPx(win, fSrc.w, fSrc.h)
const asFreeObject = {
  ...framed,
  layout: 'overlay',
  frame: 'free',
  reframe: { ...framed.reframe, crop_w: win.wf, crop_h: win.hf, dual_crop: false },
  transform: { x: 0.5, y: 0.5, scale: fOutH / winPx.sh, rotation: 0 },
}
const back = freeFrameAt(asFreeObject, 0, fSrc.w, fSrc.h, fOutW, fOutH)
assert.ok(Math.abs(back.zoom - zoom) < 1e-6, `zoom ${back.zoom}`)
assert.ok(Math.abs(back.cx - win.cx) < 1e-6, `cx ${back.cx}`)
assert.ok(Math.abs(back.cy - win.cy) < 1e-6, `cy ${back.cy}`)

// Mover el objeto en el lienzo mueve el encuadre al lado contrario: al desplazarlo a
// la derecha, lo que queda dentro del cuadro es la parte IZQUIERDA de la fuente.
const shifted = freeFrameAt(
  { ...asFreeObject, transform: { ...asFreeObject.transform, x: 0.6 } },
  0, fSrc.w, fSrc.h, fOutW, fOutH,
)
assert.ok(shifted.cx < back.cx, `${shifted.cx} < ${back.cx}`)
assert.ok(Math.abs(shifted.zoom - zoom) < 1e-6)

// Escalar el objeto al doble deja ver la mitad de alto de la fuente.
const zoomed = freeFrameAt(
  { ...asFreeObject, transform: { ...asFreeObject.transform, scale: asFreeObject.transform.scale * 2 } },
  0, fSrc.w, fSrc.h, fOutW, fOutH,
)
assert.ok(Math.abs(zoomed.zoom - zoom / 2) < 1e-6, `zoom ${zoomed.zoom}`)

console.log('clipLayout overlay crop/transform ok')
