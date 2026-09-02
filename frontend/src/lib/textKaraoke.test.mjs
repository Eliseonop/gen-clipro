import assert from 'node:assert/strict'
import {
  activeWordIndex, activeWordIndexFromWords, splitCaptionWords, applyThemeToStyle,
  wordFxList, hasWordFx, toggleWordFx, karaokeOn, chunkCaptionText, styleOpacity, wordOpacity,
  wordsPerBoxOptions, activeWordsPerBox,
} from './textKaraoke.js'
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

const themed = applyThemeToStyle({ x: 0.4, y: 0.9, w: 0.7, color: '#111111', opacity: 0.55 }, karaoke)
assert.equal(themed.theme, 'karaoke')
assert.equal(themed.x, 0.4)
assert.equal(themed.y, 0.9)
assert.equal(themed.w, 0.7)
assert.equal(themed.opacity, 0.55)
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
  assert.ok(wordFxList(t.style.word_fx).every((x) => ['highlight', 'glow', 'pop'].includes(x)))
  assert.ok(typeof t.style.active_opacity === 'number')
  assert.ok(typeof t.style.inactive_opacity === 'number')
  assert.ok(['none', 'fade', 'pop', 'slide_up'].includes(t.style.block_appear))
}

assert.deepEqual(wordFxList('none'), [])
assert.deepEqual(wordFxList('glow'), ['glow'])
assert.deepEqual(wordFxList(['glow', 'pop']), ['glow', 'pop'])
assert.equal(hasWordFx({ word_fx: 'glow' }, 'glow'), true)
assert.equal(hasWordFx({ word_fx: 'glow' }, 'pop'), false)
assert.equal(hasWordFx({ word_fx: ['glow', 'pop'] }, 'pop'), true)
assert.equal(karaokeOn({ word_fx: 'none' }), false)
assert.equal(karaokeOn({ word_fx: ['pop'] }), true)
assert.deepEqual(toggleWordFx('glow', 'pop'), ['glow', 'pop'])
assert.deepEqual(toggleWordFx(['glow', 'pop'], 'glow'), ['pop'])
assert.equal(toggleWordFx(['pop'], 'pop'), 'none')

assert.deepEqual(chunkCaptionText('uno dos tres cuatro cinco', 2), ['uno dos', 'tres cuatro', 'cinco'])
assert.deepEqual(chunkCaptionText('hola mundo', 10), ['hola mundo'])
assert.deepEqual(chunkCaptionText('hola mundo', 0), ['hola mundo'])
assert.deepEqual(chunkCaptionText('', 4), [])

assert.deepEqual(wordsPerBoxOptions(0), [])
assert.deepEqual(wordsPerBoxOptions(1), [1])
assert.deepEqual(wordsPerBoxOptions(4), [1, 2, 3, 4])
assert.deepEqual(wordsPerBoxOptions(20), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
assert.deepEqual(wordsPerBoxOptions(2, true), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
assert.equal(activeWordsPerBox([1, 2, 3, 4], 8), 4)
assert.equal(activeWordsPerBox([1, 2, 3, 4], 2), 2)

assert.equal(styleOpacity({}), 1)
assert.equal(styleOpacity({ opacity: 0.4 }), 0.4)
assert.equal(styleOpacity({ opacity: 0 }), 0)
assert.equal(styleOpacity({ opacity: 2 }), 1)

assert.equal(wordOpacity({ word_fx: 'highlight', active_opacity: 1, inactive_opacity: 0.4 }, true), 1)
assert.equal(wordOpacity({ word_fx: 'highlight', active_opacity: 1, inactive_opacity: 0.4 }, false), 0.4)
assert.equal(wordOpacity({ word_fx: 'none', active_opacity: 0.8, inactive_opacity: 0.2 }, false), 0.8)
assert.equal(wordOpacity({ word_fx: 'highlight' }, false), 1)

const keepPos = applyThemeToStyle({ x: 0.4, y: 0.9, w: 0.7, inactive_opacity: 1, max_words: 4 }, karaoke)
assert.equal(keepPos.x, 0.4)
assert.equal(keepPos.max_words, 4)
assert.equal(keepPos.inactive_opacity, karaoke.style.inactive_opacity)
assert.equal(keepPos.active_opacity, karaoke.style.active_opacity)
assert.equal(keepPos.font, karaoke.style.font)

const classic = themeById('classic')
assert.equal(classic.style.inactive_opacity, 0.55)
assert.equal(classic.style.active_opacity, 1)

// activeWordIndexFromWords: usa el timing real (relativo al clip).
const rw = [{ start: 0, end: 0.4 }, { start: 2, end: 2.5 }, { start: 3, end: 4 }]
assert.equal(activeWordIndexFromWords(rw, -1), 0)    // antes de la 1ª → la primera
assert.equal(activeWordIndexFromWords(rw, 0), 0)
assert.equal(activeWordIndexFromWords(rw, 1.9), 0)   // sigue activa hasta que empieza la 2ª
assert.equal(activeWordIndexFromWords(rw, 2), 1)
assert.equal(activeWordIndexFromWords(rw, 3.5), 2)
assert.equal(activeWordIndexFromWords(rw, 99), 2)    // más allá → la última
assert.equal(activeWordIndexFromWords([], 1), -1)

console.log('textKaraoke ok')
