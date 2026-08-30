import assert from 'node:assert/strict'
import { FONTS, cssFont, defaultTextStyle, TEXT_PRESETS } from './textstyles.js'
import { SUBTITLE_THEMES } from './subtitleThemes.js'

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

console.log('text fonts ok')
