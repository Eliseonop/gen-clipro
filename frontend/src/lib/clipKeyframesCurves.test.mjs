// Curvas de animación por keyframe (cúbicas, rebote, bézier personalizada).
// Los números "golden" son los de backend/tests/test_keyframe_curves.py: el
// preview y el export deben dar exactamente la misma curva.
import assert from 'node:assert/strict'
import {
  bezierY, clipPropsAt, copyKeyframeAt, duplicateKeyframeAt, easeT, interpBezier,
  normalizeBezier, normalizeInterp, normalizeItems, pasteKeyframeAt, patchKeyframe,
  upsertKeyframeAt, INTERP_BEZIER, KF_INTERPS,
} from './clipKeyframes.js'

const U = [0.1, 0.3, 0.5, 0.7, 0.9]
const GOLDEN = [
  ['cubic-in', null, [0.001, 0.027, 0.125, 0.343, 0.729]],
  ['cubic-out', null, [0.271, 0.657, 0.875, 0.973, 0.999]],
  ['cubic-in-out', null, [0.004, 0.108, 0.5, 0.892, 0.996]],
  ['back-out', null, [0.403933, 0.907361, 1.087401, 1.075776, 1.012616]],
  ['bezier', [0.1, 0.9, 0.2, 1], [0.585273, 0.888456, 0.966236, 0.991978, 0.999381]],
  ['bezier', [0.9, 0, 0.1, 1], [0.004666, 0.059813, 0.5, 0.940187, 0.995334]],
  ['bezier', [0.5, -0.5, 0.5, 1.5], [-0.070756, 0.020053, 0.5, 0.979947, 1.070756]],
]
for (const [kind, bez, want] of GOLDEN) {
  U.forEach((u, i) => assert.ok(Math.abs(easeT(u, kind, bez) - want[i]) < 2e-6, `${kind} ${bez} u=${u}`))
}

// Extremos fijos y bézier "recta" = lineal.
assert.equal(bezierY([0.9, 0, 0.1, 1], 0), 0)
assert.equal(bezierY([0.9, 0, 0.1, 1], 1), 1)
for (const u of U) assert.ok(Math.abs(bezierY([0.25, 0.25, 0.75, 0.75], u) - u) < 1e-6)
// Tiradores en x=0 (derivada nula al inicio): no se cuelga y sigue creciendo.
assert.ok(bezierY([0, 1, 0, 1], 0.01) > 0.3)

// Normalización: x se limita a 0–1, y a −1…2; basura → null.
assert.deepEqual(normalizeBezier([-1, 5, 2, -3]), [0, 2, 1, -1])
assert.equal(normalizeBezier([0.1, 0.2]), null)
assert.equal(normalizeBezier(['a', 0, 1, 1]), null)
assert.equal(normalizeInterp('cubic-in'), 'cubic-in')
assert.equal(normalizeInterp('bezier'), 'bezier')
assert.equal(normalizeInterp('smooth'), 'linear')
assert.ok(KF_INTERPS.some((o) => o.id === 'bezier'))

// La curva viaja con el keyframe y se usa al interpolar.
const clip = {
  kind: 'image',
  transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
  keyframes: {
    enabled: true,
    items: [
      { id: 'a', t: 0, interpolation: 'linear', props: { x: 0 } },
      { id: 'b', t: 1, interpolation: 'bezier', bezier: [0.1, 0.9, 0.2, 1], props: { x: 1 } },
    ],
  },
}
assert.deepEqual(normalizeItems(clip.keyframes.items)[1].bezier, [0.1, 0.9, 0.2, 1])
assert.ok(Math.abs(clipPropsAt(clip, 0.3).x - 0.888456) < 2e-6)

// patchKeyframe cambia la curva; interpBezier devuelve la del preset o la propia.
const patched = patchKeyframe(clip, 'b', { interpolation: 'bezier', bezier: [0.9, 0, 0.1, 1] })
assert.ok(Math.abs(clipPropsAt(patched, 0.3).x - 0.059813) < 2e-6)
assert.deepEqual(interpBezier(normalizeItems(patched.keyframes.items)[1]), [0.9, 0, 0.1, 1])
assert.deepEqual(interpBezier({ interpolation: 'cubic-out' }), INTERP_BEZIER['cubic-out'])

// Un keyframe nuevo hereda la curva personalizada del último.
const added = upsertKeyframeAt(clip, 2, { x: 0.5 }, undefined, 30)
const last = normalizeItems(added.keyframes.items).at(-1)
assert.equal(last.interpolation, 'bezier')
assert.deepEqual(last.bezier, [0.1, 0.9, 0.2, 1])

// Copiar/pegar y duplicar conservan la curva.
const board = copyKeyframeAt(clip, 1, 30)
assert.deepEqual(board.bezier, [0.1, 0.9, 0.2, 1])
const pasted = pasteKeyframeAt({ ...clip, keyframes: { enabled: true, items: [clip.keyframes.items[0]] } }, 1.5, board, ['transform'], 30)
assert.deepEqual(normalizeItems(pasted.keyframes.items).at(-1).bezier, [0.1, 0.9, 0.2, 1])
const dup = duplicateKeyframeAt(clip, 'b', 2.5, 30)
assert.deepEqual(normalizeItems(dup.keyframes.items).at(-1).bezier, [0.1, 0.9, 0.2, 1])

console.log('clipKeyframesCurves ok')
