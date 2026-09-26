import assert from 'node:assert/strict'
import {
  FONTS, cssFont, defaultTextStyle, TEXT_PRESETS, effectiveTextStyle,
  selectedSubtitleThemeId, clearTextTheme, applyOrClearTheme,
  applyTextCase, fontString, TEXT_LOOKS, lookPatch, activeLookId, bgRects, bendPlaced, curveOf, stretchOf } from './textstyles.js'
import { SUBTITLE_THEMES, themeById } from './subtitleThemes.js'

assert.ok(FONTS.includes('Anton'))
assert.ok(FONTS.includes('Arial'))
assert.match(cssFont('Anton'), /^Anton\b/)
assert.notEqual(cssFont('Anton'), cssFont('Arial'))

const st = defaultTextStyle()
assert.equal(typeof st.font, 'string')
assert.equal(typeof st.size, 'number')
assert.equal(typeof st.bold, 'boolean')
assert.equal(typeof st.color, 'string')
assert.equal(typeof st.border_color, 'string')
assert.equal(typeof st.border_width, 'number')
assert.equal(typeof st.align, 'string')
assert.equal(st.opacity, 1)

for (const p of TEXT_PRESETS) {
  assert.ok(FONTS.includes(p.style.font), p.id)
}

const shorts = SUBTITLE_THEMES.find((t) => t.style.font === 'Anton')
assert.ok(shorts, 'algún tema debe poder usar Anton')
assert.equal(shorts.style.color, '#ffffff')
assert.ok((shorts.style.border_width || 0) >= 5)

// Herencia pista→texto (espejo del backend effective_text_style).
assert.deepEqual(
  effectiveTextStyle({ font: 'Anton', color: '#fff', max_words: 6 }, { color: '#f00' }),
  { font: 'Anton', color: '#f00', max_words: 6 },   // clip override; resto heredado
)
assert.deepEqual(effectiveTextStyle(null, null), {})
assert.deepEqual(effectiveTextStyle({ font: 'Anton' }, null), { font: 'Anton' })
assert.equal(effectiveTextStyle({ opacity: 0.8 }, {}).opacity, 0.8)   // opacidad heredada

assert.equal(selectedSubtitleThemeId(defaultTextStyle()), null)
assert.equal(selectedSubtitleThemeId({ preset: 'outline' }), null)
assert.equal(selectedSubtitleThemeId({ theme: 'classic' }), null)
assert.equal(selectedSubtitleThemeId({ theme: 'classic', word_fx: 'highlight' }), 'classic')
assert.equal(selectedSubtitleThemeId({ preset: 'neon', word_fx: 'glow' }), 'neon')

const classic = themeById('classic')
const fromPlain = applyOrClearTheme(defaultTextStyle(), classic)
assert.equal(fromPlain.theme, 'classic')
assert.equal(fromPlain.word_fx, classic.style.word_fx)
assert.equal(fromPlain.font, classic.style.font)

const toggledOff = applyOrClearTheme(fromPlain, classic)
assert.equal(selectedSubtitleThemeId(toggledOff), null)
assert.equal(toggledOff.word_fx, 'none')

const neon = applyOrClearTheme(fromPlain, themeById('neon'))
assert.equal(neon.theme, 'neon')
assert.notEqual(neon.font, classic.style.font)

const stripped = { theme: 'classic', word_fx: 'none', font: 'Arial', x: 0.5 }
const repaired = applyOrClearTheme(stripped, classic)
assert.equal(repaired.theme, 'classic')
assert.equal(repaired.word_fx, classic.style.word_fx)
assert.equal(repaired.font, classic.style.font)

const placed = { x: 0.3, y: 0.2, w: 0.5, size: 0.06, opacity: 0.4, max_words: 6, theme: 'fire', word_fx: 'pop' }
const cleared = clearTextTheme(placed)
assert.equal(selectedSubtitleThemeId(cleared), null)
assert.equal(cleared.x, 0.3)
assert.equal(cleared.y, 0.2)
assert.equal(cleared.w, 0.5)
assert.equal(cleared.size, 0.06)
assert.equal(cleared.opacity, 0.4)
assert.equal(cleared.max_words, 6)
assert.equal(cleared.word_fx, 'none')

console.log('text fonts ok')

// --- Diseño (B / I) y May./min. como CapCut -----------------------------------
assert.equal(fontString({ bold: true, italic: true, font: 'Arial' }, 20), 'italic bold 20px Arial, sans-serif')
assert.equal(fontString({ font: 'Anton' }, 12), `12px ${cssFont('Anton')}`)
assert.equal(applyTextCase('hola MUNDO', 'upper'), 'HOLA MUNDO')
assert.equal(applyTextCase('hola MUNDO', 'lower'), 'hola mundo')
assert.equal(applyTextCase('hola MUNDO\nqué tal', 'title'), 'Hola Mundo\nQué Tal')   // = apply_text_case
assert.equal(applyTextCase('  a  b\n c', 'title'), '  A  B\n C')
assert.equal(applyTextCase('hola', undefined), 'hola')
assert.equal(applyTextCase(null, 'upper'), '')

// --- Estilo preestablecido (rejilla "Aa") -----------------------------------------
assert.ok(TEXT_LOOKS.length >= 20)
assert.equal(new Set(TEXT_LOOKS.map((l) => l.id)).size, TEXT_LOOKS.length)
const yellow = TEXT_LOOKS.find((l) => l.id === 'yellow-black')
const applied = { font: 'Anton', size: 0.05, x: 0.3, ...lookPatch(yellow) }
assert.equal(applied.color, '#ffe600')
assert.equal(applied.font, 'Anton')             // no toca fuente, tamaño ni posición
assert.equal(applied.x, 0.3)
assert.equal(activeLookId(applied), 'yellow-black')
// Cambiar un solo valor lo saca del preestablecido.
assert.equal(activeLookId({ ...applied, border_width: 9 }), null)
// "Ninguno" deja el texto liso (y se reconoce como tal).
const plainLook = { ...applied, ...lookPatch(null) }
assert.equal(plainLook.border_width, 0)
assert.equal(plainLook.bg, 'none')
assert.equal(activeLookId(plainLook), 'none')
// Un estilo con fondo previo no se cuela: el preestablecido lo reemplaza entero.
assert.equal({ bg: '#123456', ...lookPatch(yellow) }.bg, 'none')

// Fondo completo (espejo de text_ass.box_rects): por línea / bloque, margen, desplazamiento.
{
  const rows = [{ x: 10, w: 100, y: 50 }, { x: 30, w: 60, y: 80 }]
  const line = bgRects(rows, {}, 20, 24)
  assert.deepEqual(line[0], { x: 10, y: 38, w: 100, h: 24 })
  assert.equal(line.length, 2)
  const [block] = bgRects(rows, { bg_style: 'block' }, 20, 24)
  assert.deepEqual(block, { x: 10, y: 38, w: 100, h: 54 })
  // Contorno 4 + Ancho 0,5 em (10 px) + Alto 0,25 em (5 px); desplazamiento X +0,2 em, Y +0,4 em (arriba).
  const [pad] = bgRects([rows[0]], { border_width: 4, bg_pad_x: 0.5, bg_pad_y: 0.25, bg_dx: 0.2, bg_dy: 0.4 }, 20, 24)
  assert.deepEqual(pad, { x: 10 - 14 + 4, y: 38 - 9 - 8, w: 100 + 28, h: 24 + 18 })
  assert.deepEqual(bgRects([{ x: 0, w: 0, y: 0 }], {}, 20, 24), [])
}


// Curva (espejo de backend/tests/test_text_curve.py).
{
  assert.equal(curveOf({ curve_on: true, curve: 0.6 }), 0.6)
  assert.equal(curveOf({ curve_on: false, curve: 0.6 }), 0)
  assert.equal(curveOf({ curve_on: true, curve: 0.6, bg: '#000000' }), 0)
  assert.equal(curveOf({ curve_on: true, curve: 3 }), 1)
  const ctx = { measureText: (t) => ({ width: [...t].length * 10 }) }
  // Una línea de 90 px centrada (2 palabras), fuerza 1: media vuelta.
  const placed = [{ w: 'HOLA', x: -45, y: 0, mid: 0 }, { w: 'MUNDO', x: -45 + 40 + 10, y: 0, mid: 0 }]
  bendPlaced(ctx, placed, 1, 90, 0)
  const g = placed.flatMap((p) => p.glyphs)
  assert.equal(g.length, 9)
  assert.ok(g[0].y > g[2].y, 'hacia arriba: los extremos bajan')
  assert.ok(g[0].rot < 0 && g.at(-1).rot > 0)
  assert.ok(g.at(-1).rot - g[0].rot > (140 * Math.PI) / 180)
  assert.equal(placed[0].ul, null)
  const down = [{ w: 'HOLA', x: -20, y: 0, mid: 0 }]
  bendPlaced(ctx, down, -0.5, 40, 0)
  assert.ok(down[0].glyphs[0].y < 0 && down[0].glyphs[0].rot > 0, 'hacia abajo: los extremos suben')
}

// Escala X / Y (espejo de StretchTest del backend).
assert.deepEqual(stretchOf({ stretch_x: 2, stretch_y: 0.5 }), [1, 1])
assert.deepEqual(stretchOf({ scale_split: true, stretch_x: 2, stretch_y: 0.5 }), [2, 0.5])
assert.deepEqual(stretchOf({ scale_split: true }), [1, 1])
assert.deepEqual(stretchOf({ scale_split: true, stretch_x: 1000 }), [100, 1])
console.log('text looks ok')
