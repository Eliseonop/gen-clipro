import assert from 'node:assert/strict'
import { digitTabIndex, isTypingTarget, scopeShortcutIndex, scopeTabsFor, stepNavId, wheelStepDir } from './materialNav.js'

assert.deepEqual(scopeTabsFor('video'), ['all', 'saved', 'cargar'])
assert.deepEqual(scopeTabsFor('audio'), ['all', 'saved', 'cargar'])
assert.deepEqual(scopeTabsFor('image'), ['all', 'saved', 'explore'])
assert.deepEqual(scopeTabsFor('sfx'), [])

assert.equal(digitTabIndex('Digit1'), 0)
assert.equal(digitTabIndex('Digit3'), 2)
assert.equal(digitTabIndex('Numpad2'), 1)
assert.equal(digitTabIndex('Digit0'), -1)
assert.equal(digitTabIndex('KeyA'), -1)

assert.equal(scopeShortcutIndex({ shiftKey: true, code: 'Digit1' }), 0)
assert.equal(scopeShortcutIndex({ shiftKey: true, code: 'Digit3' }), 2)
assert.equal(scopeShortcutIndex({ shiftKey: false, code: 'Digit1' }), -1, 'sin Shift no cambia de pestaña')
assert.equal(scopeShortcutIndex({ shiftKey: true, ctrlKey: true, code: 'Digit1' }), -1)

const nav = ['video', 'image', 'audio']
assert.equal(stepNavId(nav, 'video', 1), 'image')
assert.equal(stepNavId(nav, 'image', -1), 'video')
assert.equal(stepNavId(nav, 'video', -1), 'video')
assert.equal(stepNavId(nav, 'audio', 1), 'audio')

assert.equal(wheelStepDir(0, 80), 1)
assert.equal(wheelStepDir(0, -80), -1)
assert.equal(wheelStepDir(120, 0), 1, 'Shift+rueda en Windows suele llegar como deltaX')
assert.equal(wheelStepDir(-120, 0), -1)
assert.equal(wheelStepDir(0, 0), 0)

assert.equal(isTypingTarget({ tagName: 'INPUT' }), true)
assert.equal(isTypingTarget({ tagName: 'BUTTON', isContentEditable: false }), false)

console.log('materialNav ok')
