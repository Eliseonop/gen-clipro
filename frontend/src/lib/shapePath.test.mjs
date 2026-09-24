import assert from 'node:assert/strict'
import {
  dashPattern, drawInKeyframes, hitPathAnchor, hitPathSegment, normalizeShape, pathAnchorPoints,
  pathLocalPoint, pathPoints, pathShape, renormalizePath, shapeDrawAt, shapeGeometry, trimPolyline,
} from './shapes.js'
import { clipPropsAt } from './clipKeyframes.js'

const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} ≠ ${b}`)

// --- Curva por las anclas (mismos números que test_shape_path.py) -----------------
{
  const pts = [[0, 100], [30, 10], [70, 90], [100, 0]]
  const open = pathPoints(pts, { smooth: true })
  assert.equal(open.length, 37)
  assert.deepEqual(open[0], [0, 100])
  assert.deepEqual(open[36], [100, 0])
  assert.deepEqual(open[12], [30, 10], 'pasa por cada ancla')
  near(open[5][0], 9.866898148148149, 'o5.x')
  near(open[20][1], 69.62962962962963, 'o20.y')
  const closed = pathPoints(pts, { closed: true, smooth: true })
  assert.equal(closed.length, 48, 'anillo sin repetir el primer punto')
  near(closed[40][0], 71.48148148148147, 'c40.x')
  assert.deepEqual(pathPoints(pts, { smooth: false }), pts, 'sin suavizar: rectas')
}

// --- Figura desde puntos del cuadro --------------------------------------------------
{
  const sh = pathShape([[0.1, 0.8], [0.4, 0.2], [0.9, 0.5]])
  assert.deepEqual([sh.x, sh.y, sh.w, sh.h], [0.5, 0.5, 0.8, 0.6])
  assert.deepEqual(sh.points, [[0, 100], [37.5, 0], [100, 50]])
  assert.equal(sh.fill, 'none')
  // Línea horizontal: la caja no puede medir 0 de alto; las anclas quedan en el centro.
  const flat = pathShape([[0.2, 0.5], [0.6, 0.5]])
  assert.equal(flat.h, 0.03)
  assert.deepEqual(flat.points.map((p) => p[1]), [50, 50])
  const geo = shapeGeometry('path', normalizeShape(sh))
  assert.equal(geo.strokes.length, 1, 'abierto → trazo')
  assert.equal(shapeGeometry('path', normalizeShape({ ...sh, closed: true })).fills.length, 1, 'cerrado → contorno')
}

// --- Estilo y normalización ---------------------------------------------------------
{
  assert.deepEqual(dashPattern('dash', 4), [8, 8])
  assert.deepEqual(dashPattern('dot', 4), [0, 8])
  assert.equal(dashPattern('solid', 4), null)
  const st = normalizeShape({ type: 'rect', dash: 'zigzag', draw: 7 })
  assert.equal(st.dash, 'solid')
  assert.equal(st.draw, 1)
  assert.equal(normalizeShape({ type: 'path' }).smooth, true)
  assert.equal(normalizeShape({ type: 'rect' }).points, undefined, 'solo el trazado lleva anclas')
}

// --- Recortar el trazo --------------------------------------------------------------
{
  const L = [[0, 0], [10, 0], [10, 10]]
  assert.deepEqual(trimPolyline(L, 0.25), [[0, 0], [5, 0]])
  assert.deepEqual(trimPolyline(L, 0.75), [[0, 0], [10, 0], [10, 5]])
  assert.deepEqual(trimPolyline(L, 1), L)
  assert.deepEqual(trimPolyline(L, 0), [])
}

// --- Editar anclas: ida y vuelta pantalla ↔ trazado ---------------------------------
{
  const frame = { x: 100, y: 50, w: 360, h: 640 }
  for (const flip of [{}, { flip_h: true }, { flip_v: true }]) {
    const clip = { id: 'p', kind: 'shape', start: 0, ...flip, shape: { ...pathShape([[0.1, 0.8], [0.4, 0.2], [0.9, 0.5]]), rotation: 30 } }
    const anchors = pathAnchorPoints(clip, frame, 0)
    anchors.forEach(([x, y], i) => {
      const back = pathLocalPoint(clip, frame, 0, x, y)
      near(back[0], clip.shape.points[i][0], `x ${i} ${JSON.stringify(flip)}`, 1e-2)
      near(back[1], clip.shape.points[i][1], `y ${i} ${JSON.stringify(flip)}`, 1e-2)
    })
    // Reajustar la caja tras sacar un ancla de 0–100 no mueve el trazado en pantalla.
    const moved = { ...clip, shape: { ...clip.shape, points: [[-20, 110], ...clip.shape.points.slice(1)] } }
    const before = pathAnchorPoints(moved, frame, 0)
    const after = pathAnchorPoints({ ...moved, shape: renormalizePath(moved.shape, frame.w / frame.h, { h: !!flip.flip_h, v: !!flip.flip_v }) }, frame, 0)
    before.forEach(([x, y], i) => {
      near(after[i][0], x, `renorm x ${i} ${JSON.stringify(flip)}`, 0.05)
      near(after[i][1], y, `renorm y ${i} ${JSON.stringify(flip)}`, 0.05)
    })
  }
  const anchors = [[0, 0], [100, 0], [100, 100]]
  assert.equal(hitPathAnchor(anchors, 98, 3), 1)
  assert.equal(hitPathAnchor(anchors, 50, 50), -1)
  assert.equal(hitPathSegment(anchors, 50, 4, false), 0)
  assert.equal(hitPathSegment(anchors, 50, 50, false), -1)
  assert.equal(hitPathSegment(anchors, 48, 52, true), 2, 'cerrado: el tramo de vuelta cuenta')
}

// --- Dibujar trazo ---------------------------------------------------------------------
{
  const clip = { id: 's', kind: 'shape', start: 0, in_point: 0, out_point: 5, shape: pathShape([[0.1, 0.5], [0.9, 0.5]]) }
  assert.equal(shapeDrawAt(clip, 2), 1, 'sin animar: entero')
  assert.equal(shapeDrawAt({ ...clip, shape: { ...clip.shape, draw: 0.4 } }, 2), 0.4)
  const anim = drawInKeyframes(clip, 1.5, 30)
  near(shapeDrawAt(anim, 0), 0, 'empieza sin trazo')
  near(shapeDrawAt(anim, 0.75), 0.5, 'a mitad (ease-in-out)')
  near(shapeDrawAt(anim, 1.5), 1, 'termina entero')
  near(shapeDrawAt(anim, 4), 1, 'y se queda')
  near(clipPropsAt(anim, 0.75).x, clip.shape.x, 'no mueve la figura')
  // Clip más corto que la animación: acaba con el clip.
  near(shapeDrawAt(drawInKeyframes({ ...clip, out_point: 1 }, 1.5, 30), 1), 1, 'clip corto')
}

console.log('shapePath ok')
