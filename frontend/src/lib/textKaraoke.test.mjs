import assert from 'node:assert/strict'
import { activeWordIndex, splitCaptionWords, applyThemeToStyle } from './textKaraoke.js'
import { SUBTITLE_THEMES, themeById } from './subtitleThemes.js'

assert.deepEqual(splitCaptionWords('  hola   mundo  '), ['hola', 'mundo'])
assert.deepEqual(splitCaptionWords(''), [])

assert.equal(activeWordIndex(4, -0.1, 2), -1)
assert.equal(activeWordIndex(4, 0, 2), 0)
assert.equal(activeWordIndex(4, 0.49, 2), 0)
assert.equal(activeWordIndex(4, 0.5, 2), 1)
assert.equal(activeWordIndex(4, 1.99, 2), 3)
assert.equal(activeWordIndex(4, 2, 2), 3)
assert.equal(activeWordIndex(0, 0.5, 2), -1)

const karaoke = themeById('karaoke')
assert.ok(karaoke)
assert.equal(karaoke.style.word_fx, 'glow')
assert.ok(karaoke.style.highlight_color)

const themed = applyThemeToStyle({ x: 0.4, y: 0.9, w: 0.7, color: '#111111' }, karaoke)
assert.equal(themed.theme, 'karaoke')
assert.equal(themed.x, 0.4)
assert.equal(themed.y, 0.9)
assert.equal(themed.w, 0.7)
assert.notEqual(themed.color, '#111111')

const fresh = applyThemeToStyle({}, themeById('classic'))
assert.equal(fresh.theme, 'classic')
assert.ok(fresh.y > 0.7)

assert.ok(SUBTITLE_THEMES.length >= 6)
for (const t of SUBTITLE_THEMES) {
  assert.ok(t.id && t.name && t.style)
  assert.ok(t.style.font)
  assert.ok(t.style.color)
  assert.ok(t.style.highlight_color)
  assert.ok(['none', 'highlight', 'glow', 'pop'].includes(t.style.word_fx))
  assert.ok(['none', 'fade', 'pop', 'slide_up'].includes(t.style.block_appear))
}

console.log('textKaraoke ok')
