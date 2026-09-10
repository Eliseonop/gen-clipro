import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  BG_MODES, BG_PROVIDERS, BG_PROVIDER_IDS, CHROMA_PRESETS, DEFAULT_MASK_FPS,
  DEFAULT_MASK_HEIGHT, DEFAULT_PROVIDER, MASK_FPS_MAX, MASK_HEIGHT_MIN,
  MATTE_FEATHER_MAX, applyChromaKey, applyMatteLevels, autoActive, autoRequested,
  bgActive, bgCapable, chromaActive, chromaAlpha8, chromaKeyUv, clipBg, defaultBg,
  despillRgb, despillType, frameUv, hexRgb, matteFrameIndex, matteFrameTime,
  matteIndexFor, matteLevels, normalizeBg, normalizeChroma, normalizeEdit, normalizeHex,
} from './clipBg.js'

// El fixture lo genera backend/tests/test_clip_bg.py, verificado bit a bit
// contra el chromakey/despill REALES de ffmpeg. La paridad preview↔export se
// cierra en dos saltos: Python == FFmpeg allí, JS == Python aquí.
const golden = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../../shared/bg_chroma_golden.json', import.meta.url)), 'utf8'))
const COLORS = golden.colors

// --- Catálogo y modelo -----------------------------------------------------
assert.equal(BG_PROVIDERS.length, 2)
assert.deepEqual(BG_PROVIDER_IDS, ['u2net', 'u2netp'])
assert.ok(BG_PROVIDERS.every((p) => p.label && p.hint))
assert.equal(DEFAULT_PROVIDER, 'u2net')
assert.deepEqual(BG_MODES, ['auto', 'chroma'])
assert.ok(CHROMA_PRESETS.every((p) => /^#[0-9A-F]{6}$/.test(p.color)))

assert.equal(normalizeBg(null), null)
assert.equal(normalizeBg({}), null)
assert.equal(clipBg({ kind: 'video' }), null)

{
  const bg = normalizeBg({ enabled: true, mode: 'auto', auto: {}, chroma: {} })
  assert.equal(bg.mode, 'auto')
  assert.equal(bg.auto.provider, DEFAULT_PROVIDER)
  assert.equal(bg.auto.mask_fps, DEFAULT_MASK_FPS)
  assert.equal(bg.auto.mask_height, DEFAULT_MASK_HEIGHT)
  assert.equal(bg.auto.status, 'idle')
  assert.equal(bg.chroma.color, '#00FF00')
  assert.equal(bg.auto.enabled, false)
  assert.equal(bg.chroma.enabled, false)
}

// Valores fuera de rango se acotan igual que en Python.
{
  const bg = normalizeBg({
    mode: 'raro',
    auto: { mask_fps: 999, mask_height: 4, threshold: 5, feather: 9, softness: -3, provider: 'x' },
    chroma: { similarity: 88, blend: -1, spill: 42 },
  })
  assert.equal(bg.mode, 'auto')
  assert.equal(bg.auto.mask_fps, MASK_FPS_MAX)
  assert.equal(bg.auto.mask_height, MASK_HEIGHT_MIN)
  assert.equal(bg.auto.threshold, 1)
  assert.equal(bg.auto.softness, 0)
  assert.equal(bg.auto.feather, MATTE_FEATHER_MAX)
  assert.equal(bg.auto.provider, DEFAULT_PROVIDER)
  assert.equal(bg.chroma.similarity, 1)
  assert.equal(bg.chroma.blend, 0)
  assert.equal(bg.chroma.spill, 1)
}

for (const [raw, want] of [['0x00ff00', '#00FF00'], ['#0f0', '#00FF00'],
  ['00FF00', '#00FF00'], ['basura', '#00FF00'], ['#123456', '#123456']]) {
  assert.equal(normalizeHex(raw), want, raw)
}
assert.deepEqual(hexRgb('#3CC83C'), [60, 200, 60])

// Solo vídeo e imagen admiten eliminar fondo.
for (const [kind, ok] of [['video', true], ['image', true], ['shape', false],
  ['text', false], ['audio', false]]) {
  assert.equal(bgCapable({ kind }), ok, kind)
}

// Activo solo con matte LISTO o con croma encendido.
{
  const ready = { enabled: true, base_key: 'k', status: 'ready' }
  assert.equal(bgActive({ kind: 'video', bg_removal: { auto: { enabled: true, status: 'running' } } }), false)
  assert.equal(autoRequested({ kind: 'video', bg_removal: { auto: { enabled: true, status: 'running' } } }), true)
  assert.equal(bgActive({ kind: 'video', bg_removal: { auto: ready } }), true)
  assert.equal(bgActive({ kind: 'video', bg_removal: { chroma: { enabled: true } } }), true)
  assert.equal(bgActive({ kind: 'video', bg_removal: { enabled: false, auto: ready } }), false)
  assert.equal(bgActive({ kind: 'shape', bg_removal: { auto: ready } }), false)
  assert.equal(autoActive(normalizeBg({ auto: ready })), true)
  assert.equal(chromaActive(normalizeBg({ chroma: { enabled: true } })), true)
}

// defaultBg deja el panel en un estado utilizable pero sin efecto todavía.
{
  const bg = defaultBg()
  assert.equal(bg.enabled, true)
  assert.equal(bg.auto.enabled, false)
  assert.equal(bg.chroma.enabled, false)
}

// Trazos sin puntos se descartan (no ensucian el proyecto).
assert.equal(normalizeEdit({ op: 'keep', points: [] }), null)
assert.equal(normalizeEdit({ op: 'erase', points: [{ x: 'x', y: 1 }] }), null)
{
  const e = normalizeEdit({ op: 'raro', size: 9, points: [{ x: 0.5, y: 0.5, m: 1 }] })
  assert.equal(e.op, 'erase')
  assert.equal(e.size, 1)
  assert.deepEqual(e.points, [{ x: 0.5, y: 0.5, m: 1 }])
}

// --- Índice de fotograma (tiempo ABSOLUTO de la fuente) ---------------------
assert.equal(matteFrameIndex(0, 15), 0)
assert.equal(matteFrameIndex(1, 15), 15)
assert.equal(matteFrameIndex(0.0333, 15), 0)
assert.equal(matteFrameIndex(0.0334, 15), 1)
assert.equal(matteFrameIndex(-5, 15), 0)
for (const i of [0, 1, 7, 450]) assert.equal(matteFrameIndex(matteFrameTime(i, 15), 15), i)

// matteIndexFor acota al rango disponible, igual que read_matte_frame en Python.
{
  const meta = { mask_fps: 15, range: [0, 100] }
  assert.equal(matteIndexFor(meta, 0), 0)
  assert.equal(matteIndexFor(meta, 2), 30)
  assert.equal(matteIndexFor(meta, 9999), 100, 'debe acotar al último fotograma')
  assert.equal(matteIndexFor(meta, -5), 0)
  // imagen fija: un solo fotograma, siempre el 0
  assert.equal(matteIndexFor({ mask_fps: 15, range: [0, 0] }, 12), 0)
  // clip que empieza más allá del inicio cacheado: no baja del primero
  assert.equal(matteIndexFor({ mask_fps: 15, range: [30, 60] }, 0), 30)
  // GIF en bucle: el tiempo da la vuelta con la duración intrínseca
  assert.equal(matteIndexFor(meta, 5.5, 2), matteIndexFor(meta, 1.5, 0))
  assert.equal(matteIndexFor(meta, 1.5, 2), matteIndexFor(meta, 1.5, 0))
  // sin meta no revienta
  assert.equal(matteIndexFor(null, 3), 0)
}

// --- Paridad con Python (y por tanto con FFmpeg) ---------------------------
for (const [i, c] of COLORS.entries()) {
  assert.deepEqual(frameUv(...c), golden.frame_uv[i], `frameUv ${c}`)
}

for (const caso of golden.chroma) {
  const chroma = normalizeChroma({ ...caso.chroma, enabled: true })
  assert.deepEqual(chromaKeyUv(chroma.color), caso.key_uv, `keyUv ${caso.chroma.color}`)
  for (const [i, c] of COLORS.entries()) {
    assert.equal(chromaAlpha8(...c, chroma), caso.alpha[i],
      `alfa ${JSON.stringify(caso.chroma)} rgb=${c}`)
  }
}

for (const caso of golden.despill) {
  const chroma = normalizeChroma({ ...caso.chroma, enabled: true, similarity: 0.9, blend: 0 })
  for (const [i, c] of COLORS.entries()) {
    assert.deepEqual(despillRgb(...c, chroma), caso.rgb[i],
      `despill ${JSON.stringify(caso.chroma)} rgb=${c}`)
  }
}
assert.equal(despillType('#00FF00'), 'green')
assert.equal(despillType('#0000FF'), 'blue')
assert.equal(despillType('#00FFFF'), 'green')   // empate G/B → verde

// Niveles del matte: la LUT completa debe coincidir con la de Python.
for (const caso of golden.levels) {
  const auto = normalizeBg({ auto: caso.auto }).auto
  const data = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) data[i * 4 + 3] = i
  applyMatteLevels(data, auto)
  for (let i = 0; i < 256; i++) {
    assert.equal(data[i * 4 + 3], caso.lut[i],
      `niveles ${JSON.stringify(caso.auto)} entrada=${i}`)
  }
}

// matteLevels (escalar) debe cuadrar con la LUT en los extremos.
assert.equal(matteLevels(0, 0.5, 0.25), 0)
assert.equal(matteLevels(1, 0.5, 0.25), 1)
assert.ok(Math.abs(matteLevels(0.5, 0.5, 0.25) - 0.5) < 1e-9)

// --- applyChromaKey: la pasada rápida debe dar lo mismo que la de referencia -
for (const caso of golden.chroma) {
  const chroma = normalizeChroma({ ...caso.chroma, enabled: true })
  const data = new Uint8ClampedArray(COLORS.length * 4)
  for (const [i, [r, g, b]] of COLORS.entries()) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255
  }
  applyChromaKey(data, chroma)
  for (const [i, c] of COLORS.entries()) {
    assert.equal(data[i * 4 + 3], caso.alpha[i],
      `applyChromaKey ${JSON.stringify(caso.chroma)} rgb=${c}`)
  }
}

// El alfa del croma MULTIPLICA el que ya trajera el píxel (PNG/WebM con alfa).
{
  const chroma = normalizeChroma({ enabled: true, color: '#00FF00', similarity: 0.2, blend: 0 })
  const data = new Uint8ClampedArray([255, 0, 0, 128])   // rojo semitransparente
  applyChromaKey(data, chroma)
  assert.equal(data[3], 128, 'no debe volver opaco un píxel que ya era translúcido')
}

// applyChromaKey también aplica el despill sobre el RGB, en la misma pasada.
{
  const chroma = normalizeChroma({ enabled: true, color: '#00FF00', similarity: 0.9, blend: 0, spill: 1 })
  const data = new Uint8ClampedArray([90, 180, 90, 255])
  applyChromaKey(data, chroma)
  assert.deepEqual([data[0], data[1], data[2]], despillRgb(90, 180, 90, chroma))
}

console.log('clipBg ok')
