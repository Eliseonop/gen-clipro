import assert from 'node:assert/strict'
import {
  MASK_FEATHER_MAX, MASK_KF_KEYS, MASK_SHAPES, MASK_TYPES, clipMasks, defaultMask,
  hasMask, heartPoints, maskFromProps, maskGeometry, maskHandleBox, maskHandles,
  maskHitMode, maskStaticProps, maskable, normalizeMask, starPoints, toMaskLocal,
} from './clipMask.js'
import { KF_PROP_KEYS } from './clipKeyframes.js'
import { clipMasksAt } from './clipAnim.js'

// --- Catálogo y modelo -----------------------------------------------------
assert.equal(MASK_TYPES.length, 7)
assert.deepEqual(MASK_TYPES.map((t) => t.id),
  ['linear', 'circle', 'rectangle', 'star', 'heart', 'text', 'brush'])
assert.ok(MASK_TYPES.every((t) => t.label && t.icon))
// Los tipos geométricos tienen su trazado registrado (punto de extensión).
for (const id of ['linear', 'circle', 'rectangle', 'star', 'heart']) {
  assert.equal(typeof MASK_SHAPES[id], 'function', id)
}

assert.equal(normalizeMask({ type: 'nope' }).type, 'circle')
assert.equal(normalizeMask({ feather: 9 }).feather, MASK_FEATHER_MAX)
assert.equal(normalizeMask({ opacity: -1 }).opacity, 0)
assert.equal(normalizeMask({}).enabled, true)
assert.equal(normalizeMask({ enabled: false }).enabled, false)
assert.equal(normalizeMask({ type: 'text' }).text.align, 'center')
assert.equal(normalizeMask({ type: 'brush' }).brush.points.length, 0)
// Puntos de pincel inválidos fuera; la marca de trazo nuevo se conserva.
const brush = normalizeMask({
  type: 'brush',
  brush: { points: [{ x: 0.1, y: 0.2 }, { x: 'x', y: 1 }, { x: 0.3, y: 0.4, m: 1 }] },
}).brush
assert.equal(brush.points.length, 2)
assert.equal(brush.points[1].m, 1)

assert.ok(maskable({ kind: 'video' }))
assert.ok(maskable({ kind: 'image' }))
assert.ok(maskable({ kind: 'shape' }))
assert.ok(!maskable({ kind: 'text' }))
assert.ok(!maskable({ kind: 'audio' }))

assert.deepEqual(clipMasks({ kind: 'video' }), [])
assert.equal(clipMasks({ masks: [{ type: 'star' }] }).length, 1)
assert.ok(hasMask({ masks: [{ type: 'star' }] }))
assert.ok(!hasMask({ masks: [{ type: 'star', enabled: false }] }))

// El tamaño por defecto se adapta al formato (≈60 % del ancho de salida).
const vert = defaultMask('rectangle', 720 / 1280)
const horiz = defaultMask('rectangle', 1280 / 720)
assert.ok(horiz.w > vert.w)
assert.equal(defaultMask('circle').w, defaultMask('circle').h)
assert.equal(defaultMask('text').text.content, 'TEXTO')

// --- Geometría independiente de la resolución ------------------------------
const mask = normalizeMask({ type: 'circle', x: 0.25, y: 0.5, w: 0.4, h: 0.4 })
const g916 = maskGeometry(mask, { x: 0, y: 0, w: 720, h: 1280 })
assert.equal(g916.cx, 180)
assert.equal(g916.cy, 640)
// w/h van en unidades de ALTO: el círculo es redondo en cualquier aspecto.
for (const [w, h] of [[720, 1280], [1280, 720], [1080, 1080]]) {
  const g = maskGeometry(mask, { x: 0, y: 0, w, h })
  assert.equal(g.hw, g.hh)
  assert.equal(g.hw, 0.2 * h)
}
// Doblar el lienzo dobla la máscara: misma proporción de la imagen.
const g2 = maskGeometry(mask, { x: 0, y: 0, w: 1440, h: 2560 })
assert.equal(g2.cx / 1440, g916.cx / 720)
assert.equal(g2.hw / 2560, g916.hw / 1280)

// toMaskLocal es la inversa de la colocación (con rotación incluida).
const frame = { x: 30, y: 50, w: 720, h: 1280 }
const rotated = normalizeMask({ type: 'rectangle', x: 0.4, y: 0.6, rotation: 37 })
const gr = maskGeometry(rotated, frame)
assert.deepEqual(
  Object.values(toMaskLocal(gr.cx, gr.cy, rotated, frame)).map((v) => +v.toFixed(6)),
  [0, 0],
)
// Un punto sobre el eje X LOCAL (ya girado) vuelve con y = 0.
const probe = toMaskLocal(
  gr.cx + gr.hw * Math.cos(gr.rot), gr.cy + gr.hw * Math.sin(gr.rot), rotated, frame,
)
assert.ok(Math.abs(probe.y) < 1e-9, `y=${probe.y}`)
assert.ok(Math.abs(probe.x - gr.hw / gr.ref) < 1e-9, `x=${probe.x}`)

// --- Tiradores y hit-testing ----------------------------------------------
const hFrame = { x: 0, y: 0, w: 720, h: 1280 }
const circle = normalizeMask({ type: 'circle' })
const handles = maskHandles(circle, hFrame)
assert.deepEqual(Object.keys(handles).sort(), ['b', 'box', 'br', 'c', 'fea', 'r', 'rot'])
assert.equal(handles.c.x, 360)
assert.equal(handles.r.x, 360 + 320)
assert.ok(handles.rot.y < handles.c.y)
assert.equal(maskHitMode(360, 640, circle, hFrame), 'move')
assert.equal(maskHitMode(handles.r.x, handles.r.y, circle, hFrame), 'width')
assert.equal(maskHitMode(handles.b.x, handles.b.y, circle, hFrame), 'height')
assert.equal(maskHitMode(handles.rot.x, handles.rot.y, circle, hFrame), 'rotate')
assert.equal(maskHitMode(handles.fea.x, handles.fea.y, circle, hFrame), 'feather')
assert.equal(maskHitMode(5, 5, circle, hFrame), null)
// La división es infinita: su caja de tiradores es acotada, no el semiplano.
const linear = normalizeMask({ type: 'linear' })
assert.ok(maskHandleBox(linear, hFrame).hw < maskGeometry(linear, hFrame).hw)
assert.equal(maskHitMode(360, 640, linear, hFrame), 'move')

// --- Keyframes -------------------------------------------------------------
for (const key of MASK_KF_KEYS) assert.ok(KF_PROP_KEYS.includes(key), key)
assert.deepEqual(maskStaticProps({ masks: [{ type: 'circle', x: 0.2, y: 0.8 }] }), {
  mx: 0.2, my: 0.8, mw: 0.5, mh: 0.5, msx: 1, msy: 1, mrot: 0, mfeather: 0,
})
assert.equal(maskStaticProps({ kind: 'video' }).mx, 0.5)
assert.equal(maskFromProps(circle, { mx: 0.9, mrot: 45 }).x, 0.9)
assert.equal(maskFromProps(circle, { mx: 0.9, mrot: 45 }).rotation, 45)

const animado = {
  kind: 'video',
  masks: [{ type: 'circle', x: 0.2 }],
  keyframes: {
    enabled: true,
    items: [
      { id: 'k1', t: 0, interpolation: 'linear', props: { mx: 0.2 } },
      { id: 'k2', t: 4, interpolation: 'linear', props: { mx: 0.8 } },
    ],
  },
}
assert.equal(clipMasksAt(animado, 0)[0].x, 0.2)
assert.equal(+clipMasksAt(animado, 2)[0].x.toFixed(4), 0.5)
assert.equal(clipMasksAt(animado, 4)[0].x, 0.8)
assert.equal(clipMasksAt(animado, 99)[0].x, 0.8)   // fuera de rango: se mantiene
// Sin keyframes la máscara es la guardada; sin máscara, lista vacía.
assert.equal(clipMasksAt({ kind: 'video', masks: [{ type: 'circle', x: 0.33 }] }, 9)[0].x, 0.33)
assert.deepEqual(clipMasksAt({ kind: 'video' }, 0), [])
assert.deepEqual(clipMasksAt({ kind: 'video', masks: [{ enabled: false }] }, 0), [])

// Un clip sin máscara no altera las props existentes de keyframes.
assert.equal(KF_PROP_KEYS.filter((k) => k === 'x').length, 1)
assert.ok(KF_PROP_KEYS.includes('volume'))

// --- Formas ----------------------------------------------------------------
assert.equal(starPoints(10, 10).length, 10)              // 5 puntas → 10 vértices
assert.equal(starPoints(10, 10, 6).length, 12)
const heart = heartPoints(100, 50)
assert.equal(heart.length, 96)
assert.ok(Math.max(...heart.map((p) => Math.abs(p[0]))) <= 100.0001)
assert.ok(Math.max(...heart.map((p) => Math.abs(p[1]))) <= 50.0001)

console.log('clipMask ok')
