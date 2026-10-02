// Página de HORNEADO del export (Chromium headless, backend/app/fx_bake.py).
//
// Decodifica el tramo preparado por FFmpeg, aplica la MISMA pila de efectos que
// el preview (core/runtime.js) y codifica un WebM VP9 con alfa, todo dentro de la
// página con WebCodecs (mediabunny): así solo cruzan el proceso archivos
// comprimidos, no fotogramas crudos (medido: ~100 fps a 720×1280 con GPU frente a
// ~9 fps pasando RGBA por HTTP/WebSocket; docs/EFECTOS_ANIMADOS.md §8).

import {
  ALL_FORMATS, BufferTarget, CanvasSource, Input, Output, UrlSource, VideoSampleSink, WebMOutputFormat,
} from 'mediabunny'
import { preloadFxAssets, setFxAssetBase } from '../core/assets.js'
import { compileEffect } from '../core/gl.js'
import { clipVfx, renderVfx, vfxLayout, vfxPadFrac } from '../core/runtime.js'
import { rng } from '../core/rand.js'
import { EFFECTS, getEffect } from '../registry.js'

function assetsOf(entries) {
  const out = new Set()
  for (const e of entries || []) for (const a of getEffect(e.effect)?.assets || []) out.add(a)
  return [...out]
}

async function report(url, body) {
  if (!url) return
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) } catch { /* el progreso es opcional */ }
}

function outputFor(canvas, fps, bitrate) {
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() })
  const source = new CanvasSource(canvas, { codec: 'vp9', bitrate, alpha: 'keep', latencyMode: 'quality' })
  output.addVideoTrack(source, { frameRate: fps })
  return { output, source }
}

/**
 * Hornea un clip con efectos.
 * job = { input, output, progress, assetBase, entries, clipDur, width, height,
 *         fps, frames, padAllowed, bitrate }
 */
async function bake(job) {
  setFxAssetBase(job.assetBase || '/')
  await preloadFxAssets(assetsOf(job.entries))
  const input = new Input({ source: new UrlSource(job.input), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (!track) throw new Error('La entrada no tiene vídeo.')
  const W = job.width || track.displayWidth
  const H = job.height || track.displayHeight
  const entries = clipVfx({ vfx: job.entries })
  // El tamaño del lienzo (con el margen de la pila) se fija antes del encoder,
  // que lee el canvas al añadir cada fotograma.
  const layout = vfxLayout(W, H, job.padAllowed ? vfxPadFrac(entries) : 0, Infinity)
  const canvas = document.createElement('canvas')
  canvas.width = layout.cw
  canvas.height = layout.ch
  const { output, source } = outputFor(canvas, job.fps, job.bitrate || 16e6)
  await output.start()
  const sink = new VideoSampleSink(track)
  let n = 0
  for await (const sample of sink.samples()) {
    if (job.frames && n >= job.frames) { sample.close(); break }
    const vf = sample.toVideoFrame()
    renderVfx({
      source: vf, w: W, h: H, entries, t: n / job.fps, clipDur: job.clipDur,
      padAllowed: job.padAllowed, key: 'bake', maxSide: Infinity, target: canvas,
    })
    vf.close()
    sample.close()
    await source.add(n / job.fps, 1 / job.fps)
    n += 1
    if (n % 15 === 0) report(job.progress, { done: n, total: job.frames || 0 })
  }
  await output.finalize()
  const r = await fetch(job.output, { method: 'POST', body: output.target.buffer })
  if (!r.ok) throw new Error(`No se pudo entregar el horneado (${r.status}).`)
  return { frames: n, width: canvas.width, height: canvas.height, pad: layout.P }
}

/**
 * Hornea un GENERADOR (clip propio sin fuente: partículas, marcos…).
 * job = { output, progress, assetBase, effect, params, width, height, fps, frames, dur }
 */
async function generate(job) {
  setFxAssetBase(job.assetBase || '/')
  const effect = getEffect(job.effect)
  if (!effect || effect.engine !== 'generator') throw new Error(`Generador desconocido: ${job.effect}`)
  await preloadFxAssets(effect.assets || [])
  const canvas = document.createElement('canvas')
  canvas.width = job.width
  canvas.height = job.height
  const ctx = canvas.getContext('2d')
  const { output, source } = outputFor(canvas, job.fps, job.bitrate || 12e6)
  await output.start()
  const seed = Number(job.params?.seed ?? 1) || 1
  for (let n = 0; n < job.frames; n++) {
    const t = n / job.fps
    const frame = Math.floor(t * 30 + 1e-6)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    effect.render({
      ctx, w: canvas.width, h: canvas.height, t, dur: job.dur, progress: Math.min(1, t / job.dur),
      frame, seed, params: job.params, rand: rng(seed, frame),
    })
    await source.add(t, 1 / job.fps)
    if (n % 15 === 0) report(job.progress, { done: n, total: job.frames })
  }
  await output.finalize()
  const r = await fetch(job.output, { method: 'POST', body: output.target.buffer })
  if (!r.ok) throw new Error(`No se pudo entregar el horneado (${r.status}).`)
  return { frames: job.frames }
}

/** Compila todos los shaders (test de humo del catálogo). */
function compileAll() {
  const errors = []
  for (const e of EFFECTS) {
    if (e.engine !== 'shader') continue
    try { compileEffect(e) } catch (err) { errors.push({ id: e.id, error: String(err.message || err) }) }
  }
  return errors
}

window.__fx = {
  bake, generate, compileAll, renderVfx,
  setAssetBase: setFxAssetBase, preload: preloadFxAssets,
  ready: true,
}
