import assert from 'node:assert/strict'
import {
  frameHandles, frameOfDest, handleAt, handleCursor, resizeCursor, ROT_GAP, ROTATE_CURSOR,
} from './selectionFrame.js'
import { hitTransformHandle } from './clipLayout.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)
const f = { cx: 100, cy: 50, w: 80, h: 40 }

// Texto: × arriba a la izquierda, tres esquinas, laterales y giro DEBAJO.
const t = frameHandles(f, { del: true, sides: true })
assert.deepEqual(Object.keys(t).sort(), ['bl', 'br', 'del', 'l', 'r', 'rot', 'tr'])
assert.deepEqual(t.del, { x: 60, y: 30 })
assert.deepEqual(t.br, { x: 140, y: 70 })
assert.deepEqual(t.l, { x: 60, y: 50 })
assert.deepEqual(t.rot, { x: 100, y: 70 + ROT_GAP })

// Vídeo: cuatro esquinas y giro; figura: además laterales y arriba/abajo.
assert.deepEqual(Object.keys(frameHandles(f)).sort(), ['bl', 'br', 'rot', 'tl', 'tr'])
assert.deepEqual(Object.keys(frameHandles(f, { sides: true, tb: true })).sort(), ['b', 'bl', 'br', 'l', 'r', 'rot', 't', 'tl', 'tr'])

// Girado 90°: el giro queda a la izquierda del centro y la esquina br abajo a la izquierda.
const r = frameHandles({ ...f, rotation: 90 }, { sides: true })
near(r.rot.x, 100 - (20 + ROT_GAP)); near(r.rot.y, 50)
near(r.br.x, 80); near(r.br.y, 90)

// handleAt respeta el orden: el primero que acierta gana.
assert.equal(handleAt(141, 69, t, ['del', 'rot', 'br']), 'br')
assert.equal(handleAt(100, 70 + ROT_GAP + 3, t, ['rot']), 'rot')
assert.equal(handleAt(100, 50, t, ['del', 'rot', 'br', 'l', 'r']), null)
assert.equal(handleAt(0, 0, null, ['br']), null)

assert.deepEqual(frameOfDest({ dx: 60, dy: 30, dw: 80, dh: 40, rotation: 15 }), { cx: 100, cy: 50, w: 80, h: 40, rotation: 15 })

// Vídeo / imagen: esquinas escalan, el giro está debajo y dentro se mueve (también girado).
const d = { dx: 60, dy: 30, dw: 80, dh: 40 }
assert.equal(hitTransformHandle(60, 30, d), 'scale')
assert.equal(hitTransformHandle(100, 70 + ROT_GAP, d), 'rotate')
assert.equal(hitTransformHandle(100, 30 - 22, d), null)
assert.equal(hitTransformHandle(100, 50, d), 'move')
assert.equal(hitTransformHandle(100, 85, { ...d, rotation: 90 }), 'move')
assert.equal(hitTransformHandle(135, 50, { ...d, rotation: 90 }), null)

// Cursor: diagonal en las esquinas, ↔ en los laterales, ↕ arriba/abajo, girado con el recuadro.
assert.equal(handleCursor('tl'), 'nwse-resize')
assert.equal(handleCursor('br'), 'nwse-resize')
assert.equal(handleCursor('tr'), 'nesw-resize')
assert.equal(handleCursor('bl'), 'nesw-resize')
assert.equal(handleCursor('l'), 'ew-resize')
assert.equal(handleCursor('r'), 'ew-resize')
assert.equal(handleCursor('t'), 'ns-resize')
assert.equal(handleCursor('b'), 'ns-resize')
assert.equal(handleCursor('r', 90), 'ns-resize')
assert.equal(handleCursor('r', 45), 'nwse-resize')
assert.equal(handleCursor('br', 90), 'nesw-resize')
assert.equal(handleCursor('br', -45), 'ew-resize')
assert.equal(handleCursor('r', 200), 'ew-resize')
assert.equal(handleCursor('del'), 'pointer')
assert.equal(handleCursor('rot', 30), ROTATE_CURSOR)
assert.ok(ROTATE_CURSOR.startsWith('url("data:image/svg+xml,') && ROTATE_CURSOR.endsWith(' 12 12, grab'))
assert.equal(handleCursor('nada'), null)
assert.equal(resizeCursor(22), 'ew-resize')
assert.equal(resizeCursor(23), 'nwse-resize')
assert.equal(resizeCursor(-90), 'ns-resize')

console.log('selectionFrame ok')
