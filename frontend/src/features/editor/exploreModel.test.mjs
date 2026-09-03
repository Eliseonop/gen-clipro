import assert from 'node:assert/strict'
import {
  EXPLORE_SUGGESTIONS, CLASSIC_SUGGESTIONS, RECENT_MAX,
  kindLabel, providerLabel, formatExploreMeta, filterExploreItems,
  readRecent, pushRecent,
  readExploreSession, writeExploreSession, resetExploreSession,
  collectThemeText, extractKeywords, themeSuggestions,
} from './exploreModel.js'

assert.ok(CLASSIC_SUGGESTIONS.includes('cine'))
assert.ok(EXPLORE_SUGGESTIONS.includes('futuro'))
assert.equal(kindLabel('gif'), 'GIF')
assert.equal(kindLabel('video'), 'Video')
assert.equal(providerLabel('pexels'), 'Pexels')
assert.equal(formatExploreMeta({ width: 1080, height: 1920, kind: 'video', duration: 8.2 }), '1080 × 1920 · 8s')
assert.equal(formatExploreMeta({ kind: 'photo' }), '')

const mixed = [
  { id: '1', kind: 'photo', provider: 'pexels' },
  { id: '2', kind: 'video', provider: 'pexels' },
  { id: '3', kind: 'gif', provider: 'giphy' },
]
assert.deepEqual(filterExploreItems(mixed, 'gif', 'all').map((x) => x.id), ['3'])
assert.deepEqual(filterExploreItems(mixed, 'all', 'pexels').map((x) => x.id), ['1', '2'])

const mem = {
  data: {},
  getItem(k) { return this.data[k] ?? null },
  setItem(k, v) { this.data[k] = String(v) },
}
assert.deepEqual(readRecent(mem), [])
assert.deepEqual(pushRecent('time machine', mem), ['time machine'])
assert.deepEqual(pushRecent('clock', mem), ['clock', 'time machine'])
assert.deepEqual(pushRecent('time machine', mem)[0], 'time machine')
for (let i = 0; i < 25; i++) pushRecent(`q${i}`, mem)
assert.equal(readRecent(mem).length, RECENT_MAX)

resetExploreSession()
assert.equal(readExploreSession().draft, '')
writeExploreSession({ draft: 'clock', q: 'clock', searched: true, items: [{ id: 'a' }] })
assert.equal(readExploreSession().draft, 'clock')
assert.equal(readExploreSession().items[0].id, 'a')
resetExploreSession()
assert.equal(readExploreSession().searched, false)

const filler = 'Por favor, quiero que veas esto. Gracias.'
assert.deepEqual(extractKeywords(filler), [])
assert.deepEqual(themeSuggestions(filler), CLASSIC_SUGGESTIONS)

const theme = 'Por favor, quiero que viajemos al futuro con una máquina del tiempo en una ciudad antigua llena de científicos.'
const keys = extractKeywords(theme)
assert.ok(keys.length > 0)
assert.ok(!keys.some((k) => ['que', 'por', 'favor', 'quiero', 'por favor'].includes(k)))
assert.ok(keys.some((k) => /máquina|tiempo|ciudad|futuro|científic/i.test(k)))

const gathered = collectThemeText({
  project: {
    audios: [{ description: 'Narración sobre cine épico', text: '' }],
    clips: [],
    transcripts: [{ segments: [{ text: 'Una explosión en el laboratorio' }] }],
  },
  timelineClips: [{ kind: 'text', text: 'el héroe viaja al futuro' }],
})
assert.ok(gathered.includes('cine épico'))
assert.ok(gathered.includes('laboratorio'))
assert.ok(gathered.includes('futuro'))

console.log('exploreModel ok')
