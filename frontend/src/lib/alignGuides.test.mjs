import assert from 'node:assert/strict'
import { canvasAlignTargets, halfOnFrame, snapAlign, snapFrameEdges, snapMove, textAlignTargets } from './alignGuides.js'

const canvas = canvasAlignTargets([])
assert.deepEqual(canvas.xs, [0.5])
assert.deepEqual(canvas.ys, [0.5])

const withOther = canvasAlignTargets([{ x: 0.3, y: 0.8, w: 0.4 }])
assert.ok(withOther.xs.includes(0.5))
assert.ok(withOther.xs.includes(0.3))
assert.ok(withOther.xs.includes(0.1))
assert.ok(withOther.xs.includes(0.5) && withOther.xs.includes(0.3 + 0.2))
assert.ok(withOther.ys.includes(0.8))

const near = snapAlign(0.51, 0.49, canvasAlignTargets([]), 0.02)
assert.equal(near.x, 0.5)
assert.equal(near.y, 0.5)
assert.deepEqual(near.guides.v, [0.5])
assert.deepEqual(near.guides.h, [0.5])

const far = snapAlign(0.2, 0.2, canvasAlignTargets([]), 0.02)
assert.equal(far.x, 0.2)
assert.equal(far.y, 0.2)
assert.deepEqual(far.guides.v, [])
assert.deepEqual(far.guides.h, [])

const clips = [
  { id: 'a', kind: 'text', track_id: 'T1', start: 0, in_point: 0, out_point: 2, style: { x: 0.5, y: 0.2, w: 0.4 } },
  { id: 'b', kind: 'text', track_id: 'T1', start: 0, in_point: 0, out_point: 2, style: { x: 0.7, y: 0.2, w: 0.2 } },
  { id: 'c', kind: 'text', track_id: 'T1', start: 10, in_point: 0, out_point: 1, style: { x: 0.1, y: 0.1, w: 0.2 } },
]
const t = textAlignTargets(clips, [{ id: 'T1', kind: 'text' }], 0.5, 'a')
assert.ok(t.xs.includes(0.7))
assert.ok(!t.xs.includes(0.1))

// --- Bordes del cuadro (CapCut): el lado del elemento se pega y el borde brilla --
// Elemento de 0,2 × 0,1 (semitamaño 0,1 × 0,05).
let e = snapFrameEdges(0.105, 0.5, 0.1, 0.05, 0.02)
assert.equal(e.x, 0.1)                            // lado izquierdo sobre el borde izquierdo
assert.deepEqual(e.edges, ['left'])
e = snapFrameEdges(0.89, 0.96, 0.1, 0.05, 0.02)
assert.equal(e.x, 0.9)                            // lado derecho sobre el borde derecho
assert.equal(e.y, 0.95)                           // y el de abajo sobre el de abajo
assert.deepEqual(e.edges, ['right', 'bottom'])
// Por FUERA: el elemento justo fuera del cuadro (para que una animación entre).
e = snapFrameEdges(-0.09, 0.5, 0.1, 0.05, 0.02)
assert.equal(e.x, -0.1)                           // su lado derecho toca el borde izquierdo
assert.deepEqual(e.edges, ['left'])
e = snapFrameEdges(0.5, 1.06, 0.1, 0.05, 0.02)
assert.equal(e.y, 1.05)                           // su lado de arriba toca el borde de abajo
assert.deepEqual(e.edges, ['bottom'])
// Lejos de todo: nada.
e = snapFrameEdges(0.3, 0.3, 0.1, 0.05, 0.02)
assert.deepEqual(e.edges, [])
assert.equal(e.dx, Infinity)
// Sin tamaño no hay bordes.
assert.deepEqual(snapFrameEdges(0.1, 0.1, 0, 0, 0.02).edges, [])

// snapMove: en cada eje gana el imán más cercano (centro vs. borde).
let m = snapMove(0.105, 0.51, canvasAlignTargets([]), { w: 0.1, h: 0.05 }, 0.02)
assert.equal(m.x, 0.1)
assert.equal(m.y, 0.5)                            // Y: el centro del cuadro
assert.deepEqual(m.guides.edges, ['left'])
assert.deepEqual(m.guides.v, [])
assert.deepEqual(m.guides.h, [0.5])
// Muy fuera del cuadro no hay imán y la posición se respeta (−5000 de CapCut).
m = snapMove(-3, 0.5, canvasAlignTargets([]), { w: 0.1, h: 0.05 }, 0.02)
assert.equal(m.x, -3)
assert.deepEqual(m.guides.edges, [])
// Sin semitamaño, como antes: solo el centro.
m = snapMove(0.51, 0.3, canvasAlignTargets([]), null, 0.02)
assert.equal(m.x, 0.5)
assert.deepEqual(m.guides.edges, [])

assert.deepEqual(halfOnFrame({ dw: 200, dh: 100 }, { w: 1000, h: 500 }), { w: 0.1, h: 0.1 })
assert.deepEqual(halfOnFrame({ w: 100, h: 50 }, { w: 1000, h: 500 }), { w: 0.05, h: 0.05 })
assert.equal(halfOnFrame(null, { w: 1, h: 1 }), null)

console.log('alignGuides ok')
