import assert from 'node:assert/strict'
import { textRole, isCaptionText, isFreeText, isGeneratedClip } from './textRole.js'

assert.equal(textRole(null), null)
assert.equal(textRole({ kind: 'video' }), null)
assert.equal(textRole({ kind: 'text', text_role: 'free' }), 'free')
assert.equal(textRole({ kind: 'text', text_role: 'caption' }), 'caption')
assert.equal(textRole({ kind: 'text', origin: { transcript_id: 'tr' } }), 'caption')
assert.equal(textRole({ kind: 'text', words: [{ text: 'hola', start: 0, end: 1 }] }), 'caption')
assert.equal(textRole({ kind: 'text', text: 'marca', words: [] }), 'free')
assert.equal(isCaptionText({ kind: 'text', text_role: 'caption' }), true)
assert.equal(isFreeText({ kind: 'text', text: 'x' }), true)
assert.equal(isGeneratedClip({ kind: 'text' }), true)
assert.equal(isGeneratedClip({ kind: 'video' }), false)
console.log('textRole ok')
