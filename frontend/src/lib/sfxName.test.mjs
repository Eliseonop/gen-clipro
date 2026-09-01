import assert from 'node:assert/strict'
import {
  sfxNameFromFile, matchSfxCategory, sfxDraftFromFile, sfxDraftFromSaved, sfxSavePayload,
  upsertSfxCategory, realSfxCategories,
} from './sfxName.js'

assert.equal(sfxNameFromFile('Fast whoosh.mp3'), 'Fast whoosh')
assert.equal(sfxNameFromFile('C:\\tmp\\boom.wav'), 'boom')
assert.equal(sfxNameFromFile('  hit  .ogg'), 'hit')
assert.equal(sfxNameFromFile(''), '')

const cats = [
  { id: '13_OTHER', label: 'Other / Ambience' },
  { id: '07_UI', label: 'UI / Notification' },
]
assert.deepEqual(matchSfxCategory('UI / Notification', cats), { categoryId: '07_UI', newCategory: '' })
assert.deepEqual(matchSfxCategory('07_UI', cats), { categoryId: '07_UI', newCategory: '' })
assert.deepEqual(matchSfxCategory('Whoosh', cats), { categoryId: '', newCategory: 'Whoosh' })
assert.deepEqual(matchSfxCategory('  ', cats), { categoryId: '', newCategory: '' })

const draft = sfxDraftFromFile({ name: 'whoosh_01.mp3' }, {
  categoryId: '13_OTHER',
  categoryLabel: 'Other / Ambience',
  uso: 'sin clasificar',
})
assert.equal(draft.name, 'whoosh_01')
assert.equal(draft.categoryId, '13_OTHER')
assert.equal(draft.categoryLabel, 'Other / Ambience')
assert.equal(draft.uso, 'sin clasificar')
assert.equal(draft.saved, false)
assert.equal(draft.sfxId, null)

const saved = sfxDraftFromSaved({
  id: '13_OTHER/old.mp3', name: 'old', category: 'Other / Ambience',
  folder: '13_OTHER', uso: 'sin clasificar', url: '/api/sfx/file/x',
})
assert.equal(saved.sfxId, '13_OTHER/old.mp3')
assert.equal(saved.previewUrl, '/api/sfx/file/x')
assert.equal(saved.categoryId, '13_OTHER')
assert.equal(saved.saved, false)
assert.equal(saved.name, 'old')

assert.deepEqual(
  sfxSavePayload({ name: 'x', categoryId: '', categoryLabel: 'Whoosh', uso: 'transición' }, cats),
  { name: 'x', categoryId: '', newCategory: 'Whoosh', uso: 'transición' },
)
assert.deepEqual(
  sfxSavePayload({ name: 'n', categoryId: '07_UI', uso: 'pago' }, cats),
  { name: 'n', categoryId: '07_UI', newCategory: '', uso: 'pago' },
)

assert.deepEqual(
  upsertSfxCategory(cats, { id: '14_WHOOSH', label: 'Whoosh', count: 0 }),
  [...cats, { id: '14_WHOOSH', label: 'Whoosh', count: 0 }],
)
assert.equal(upsertSfxCategory(cats, { id: '07_UI', label: 'UI / Notification', count: 9 })[1].count, 9)
assert.equal(realSfxCategories([{ id: 'favoritos', label: 'Favoritos' }, ...cats]).length, 2)
console.log('sfxName ok')
