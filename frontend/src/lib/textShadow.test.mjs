// Sombra paralela del texto: mismos parámetros que el export
// (backend/tests/test_text_shadow.py usa los mismos números).
import assert from 'node:assert/strict'
import { SHADOW_DEFAULTS, textShadow } from './textstyles.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`)

// Sin sombra, o con brillo (usa el mismo color y se dibuja aparte) → null.
assert.equal(textShadow({}, 40), null)
assert.equal(textShadow({ shadow: true, glow: true }, 40), null)
assert.equal(textShadow({ shadow: true, shadow_opacity: 0 }, 40), null)

// Valores por defecto (proyectos antiguos con solo `shadow: true`).
const d = textShadow({ shadow: true }, 40)
assert.equal(d.color, '#000000')
near(d.opacity, SHADOW_DEFAULTS.opacity, 'opacidad')
near(d.dx, Math.cos(Math.PI / 4) * 0.06 * 40, 'dx')
near(d.dy, Math.sin(Math.PI / 4) * 0.06 * 40, 'dy')
near(d.sigma, 0.05 * 40, 'sigma')

// Ángulo 90° = hacia abajo; distancia y desenfoque en em del tamaño de letra.
const s = textShadow({ shadow: true, shadow_color: '#ff0000', shadow_opacity: 1, shadow_distance: 0.3, shadow_angle: 90, shadow_blur: 0.2 }, 40)
near(s.dx, 0, 'dx abajo')
near(s.dy, 12, 'dy abajo')
near(s.sigma, 8, 'sigma')
assert.equal(s.color, '#ff0000')

// Límites: distancia y desenfoque 0–1 em, opacidad 0–1.
const big = textShadow({ shadow: true, shadow_distance: 5, shadow_angle: 0, shadow_blur: -1, shadow_opacity: 3 }, 10)
near(big.dx, 10, 'distancia topada')
near(big.sigma, 0, 'desenfoque no negativo')
near(big.opacity, 1, 'opacidad topada')

console.log('textShadow ok')
