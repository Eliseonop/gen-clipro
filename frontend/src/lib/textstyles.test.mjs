import assert from 'node:assert/strict'
import {
  FONTS, cssFont, defaultTextStyle, TEXT_PRESETS, effectiveTextStyle,
  selectedSubtitleThemeId, clearTextTheme, applyOrClearTheme,
} from './textstyles.js'
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
