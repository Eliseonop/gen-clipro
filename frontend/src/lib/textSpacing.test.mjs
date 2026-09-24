// Espaciado entre letras e interlineado (#6): mismos límites y valores por defecto
// que el export (backend/tests/test_text_spacing.py).
import assert from 'node:assert/strict'
import {
  LETTER_SPACING_RANGE, LINE_HEIGHT_DEFAULT, LINE_HEIGHT_RANGE, letterSpacingPx, lineHeightOf,
} from './textstyles.js'

assert.deepEqual(LETTER_SPACING_RANGE, [-0.5, 1])
assert.equal(LINE_HEIGHT_DEFAULT, 1.22)
assert.deepEqual(LINE_HEIGHT_RANGE, [0.6, 3])

assert.equal(letterSpacingPx({}, 64), 0)
assert.equal(letterSpacingPx({ letter_spacing: 0.25 }, 64), 16)
assert.equal(letterSpacingPx({ letter_spacing: -5 }, 64), -32)
assert.equal(letterSpacingPx({ letter_spacing: 'x' }, 64), 0)

assert.equal(lineHeightOf({}), 1.22)
assert.equal(lineHeightOf({ line_height: 1.8 }), 1.8)
assert.equal(lineHeightOf({ line_height: 10 }), 3)
assert.equal(lineHeightOf({ line_height: 0.1 }), 0.6)

console.log('textSpacing ok')
