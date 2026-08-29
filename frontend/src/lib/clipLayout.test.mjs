import assert from 'node:assert/strict'
import {
  applyFrame,
  clampCrop,
  cropSizeFromCorner,
  cropWindow,
  destRect,
  destRectOnCanvas,
  enableOverlay,
  isOverlay,
  newTransform,
  sourceCropPx,
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

// --- Esquinas del encuadre cambian solo el crop ---

const sized = cropSizeFromCorner(0.55, 0.4, 0.4, 0.3)
assert.ok(sized.wf > 0.2)
assert.ok(sized.hf > 0.1)
const clamped = clampCrop(0.4, 0.3, sized.wf, sized.hf)
assert.ok(clamped.wf <= 1)
assert.ok(clamped.cx >= clamped.wf / 2)

// --- Activar overlay captura el encuadre actual y no lo reescribe al escalar ---

const enabled = enableOverlay(fillClip, srcAspect, outAspect, 0, srcW, srcH, outW, outH)
assert.equal(enabled.layout, 'overlay')
assert.ok(enabled.reframe.crop_w > 0)
assert.ok(enabled.reframe.crop_h > 0)
const cropOnEnable = cropWindow(enabled, srcAspect, outAspect, 0)
assert.ok(Math.abs(cropOnEnable.wf - fillCrop.wf) < 1e-9)
assert.ok(Math.abs(cropOnEnable.hf - fillCrop.hf) < 1e-9)
const afterUserScale = cropWindow(
  { ...enabled, transform: { ...enabled.transform, scale: enabled.transform.scale * 2 } },
  srcAspect, outAspect, 0,
)
assert.equal(afterUserScale.wf, cropOnEnable.wf)
assert.equal(afterUserScale.hf, cropOnEnable.hf)

assert.equal(newTransform().scale, 1)
assert.equal(newTransform().rotation, 0)

// --- Encuadre asistido: Completo / mitad superior / mitad inferior ---

const top = applyFrame(fillClip, 'top', srcAspect, outAspect, 0, srcW, srcH, outW, outH)
assert.equal(top.layout, 'overlay')
assert.equal(top.frame, 'top')
assert.equal(top.reframe.dual_crop, false)
assert.equal(top.reframe.keyframes.length, fillClip.reframe.keyframes.length)
const topCrop = cropWindow({ ...fillClip, ...top }, srcAspect, outAspect, 0)
const topPx = sourceCropPx(topCrop, srcW, srcH)
const topDest = destRect(top.transform, topPx, outW, outH)
assert.ok(Math.abs(topDest.dx) < 2)
assert.ok(Math.abs(topDest.dy) < 2)
assert.ok(Math.abs(topDest.dw - outW) < 2)
assert.ok(Math.abs(topDest.dh - outH / 2) < 2)

const bot = applyFrame(fillClip, 'bottom', srcAspect, outAspect, 0, srcW, srcH, outW, outH)
const botCrop = cropWindow({ ...fillClip, ...bot }, srcAspect, outAspect, 0)
const botPx = sourceCropPx(botCrop, srcW, srcH)
const botDest = destRect(bot.transform, botPx, outW, outH)
assert.ok(Math.abs(botDest.dx) < 2)
assert.ok(Math.abs(botDest.dy - outH / 2) < 2)
assert.ok(Math.abs(botDest.dw - outW) < 2)
assert.ok(Math.abs(botDest.dh - outH / 2) < 2)
assert.ok(Math.abs((botDest.dy + botDest.dh) - outH) < 2)

const full = applyFrame(top, 'full', srcAspect, outAspect, 0, srcW, srcH, outW, outH)
assert.equal(full.layout, 'fill')
assert.equal(full.frame, 'full')
assert.equal(isOverlay(full), false)

const containClip = {
  layout: 'fill',
  reframe: { keyframes: [{ t: 0, cx: 0.2, cy: 0.2, zoom: 0.4, fit: 'contain' }] },
}
const containWin = cropWindow(containClip, 16 / 9, 9 / 16, 0)
assert.equal(containWin.wf, 1)
assert.equal(containWin.hf, 1)
assert.equal(containWin.cx, 0.5)
assert.equal(containWin.cy, 0.5)

console.log('clipLayout overlay crop/transform ok')
