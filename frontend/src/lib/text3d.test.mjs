// Texto 3D: misma proyección que el export (backend/tests/test_text3d.py usa los
// mismos números de referencia).
import assert from 'node:assert/strict'
import { focalOf, planeProject, text3dAngles, TEXT3D_MAX_ANGLE } from './text3d.js'

const near = (a, b, msg, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} != ${b}`)

near(focalOf(1280, 0.5), 1280, 'focal por defecto = alto del cuadro')
near(focalOf(1280, 0), 5120, 'perspectiva 0')
near(focalOf(1280, 1), 731.428571, 'perspectiva 1', 1e-4)
near(focalOf(1280, undefined), 1280, 'sin valor → por defecto')

assert.equal(text3dAngles({}), null)
assert.equal(text3dAngles({ rot_x: 0.01, rot_y: -0.02 }), null)
assert.deepEqual(text3dAngles({ rot_x: 30 }), [30, 0])
assert.deepEqual(text3dAngles({ rot_x: 200, rot_y: -90 }), [TEXT3D_MAX_ANGLE, -TEXT3D_MAX_ANGLE])

const f = focalOf(1280, 0.5)
const GOLDEN = [
  [[360, 640, 60, 0, 200, 600], [204.216027, 620.527003, 1.027063]],
  [[360, 640, -30, 45, 100, 900], [62.891339, 882.588206, 0.928184]],
  [[360, 640, 75, -75, 700, 100], [1057.171667, 475.359693, 0.848895]],
]
for (const [[cx, cy, rx, ry, X, Y], [ex, ey, ew]] of GOLDEN) {
  const p = planeProject(cx, cy, rx, ry, f, X, Y)
  near(p.x, ex, `x ${rx},${ry}`)
  near(p.y, ey, `y ${rx},${ry}`)
  near(p.w, ew, `w ${rx},${ry}`)
  // Coordenadas homogéneas coherentes: hx/w = x.
  near(p.hx / p.w, p.x, 'hx/w')
  near(p.hy / p.w, p.y, 'hy/w')
}

// El centro de giro no se mueve y la parte de arriba se aleja (se estrecha) al inclinar.
const c = planeProject(360, 640, 60, 0, f, 360, 640)
near(c.x, 360, 'centro x'); near(c.y, 640, 'centro y'); near(c.w, 1, 'centro w')
const tl = planeProject(360, 640, 60, 0, f, 160, 540)
const bl = planeProject(360, 640, 60, 0, f, 160, 740)
assert.ok(360 - tl.x < 360 - bl.x, 'arriba más estrecho que abajo')

console.log('text3d ok')
