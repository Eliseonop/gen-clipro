// Sombra paralela del texto: mismos parámetros que el export
// (backend/tests/test_text_shadow.py usa los mismos números).
import assert from 'node:assert/strict'
import { SHADOW_DEFAULTS, textGlow, textShadow } from './textstyles.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`)

// Sin sombra → null. Con Brillo, la silueta de debajo es su halo (no la sombra paralela).
assert.equal(textShadow({}, 40), null)
assert.equal(textShadow({ shadow: true, shadow_opacity: 0 }, 40), null)
assert.deepEqual(textShadow({ shadow: true, glow: true, glow_color: '#00ff00' }, 40), textGlow({ glow: true, glow_color: '#00ff00' }, 40))

// Brillo completo (espejo de GlowParamsTest del backend).
assert.equal(textGlow({ glow: true, shadow_color: '#123456' }, 40).color, '#123456')
assert.equal(textGlow({ glow: true, shadow_color: '#123456', glow_color: '#abcdef' }, 40).color, '#abcdef')
assert.equal(textGlow({ glow: false }, 40), null)
assert.equal(textGlow({ glow: true, glow_intensity: 0 }, 40), null)
{
  const g = textGlow({ glow: true, glow_intensity: 0.5, glow_range: 1, glow_dx: 0.5, glow_dy: 0.25 }, 40)
  assert.deepEqual([g.opacity, g.sigma, g.dx, g.dy, g.spread], [0.5, 20, 20, -10, 0])
  assert.ok(textGlow({ glow: true, glow_style: 'strong' }, 40).spread > 0)
  assert.equal(Object.is(textGlow({ glow: true }, 40).dy, -0), false)
}

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
