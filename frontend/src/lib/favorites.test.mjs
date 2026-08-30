import assert from 'node:assert/strict'
import {
  FAV_CAT,
  audioFavKey,
  clipFavRef,
  emptyFavorites,
  nameTextStyleFavorite,
  normalizeFavorites,
  snapshotTextStyle,
  toggleId,
} from './favorites.js'

assert.deepEqual(toggleId([], 'a'), ['a'])
assert.deepEqual(toggleId(['a', 'b'], 'a'), ['b'])
assert.deepEqual(toggleId(['a'], 'b'), ['a', 'b'])

assert.equal(audioFavKey('p1', 'au9'), 'p1:au9')

const sfxClip = { asset_kind: 'sfx', filename: '01_REACTIONS/hit.mp3', asset_id: '01_REACTIONS/hit.mp3' }
assert.deepEqual(clipFavRef('p1', sfxClip), { bucket: 'sfx', id: '01_REACTIONS/hit.mp3' })
const audioClip = { asset_kind: 'audios', asset_id: 'abc', filename: 'n.wav' }
assert.deepEqual(clipFavRef('p1', audioClip), { bucket: 'audios', id: 'p1:abc' })
assert.equal(clipFavRef('p1', { asset_kind: 'clips', asset_id: '1' }), null)
assert.equal(clipFavRef('p1', { kind: 'text', asset_kind: 'text' }), null)

const n = normalizeFavorites(null)
assert.deepEqual(n, emptyFavorites())
assert.deepEqual(normalizeFavorites({ sfx: ['x'], extra: 1 }).sfx, ['x'])
assert.deepEqual(normalizeFavorites({ sfx: ['x'] }).textStyles, [])

const orig = { theme: 'neon', size: 0.05, x: 0.4, y: 0.8, w: 0.9, color: '#fff' }
const snap = snapshotTextStyle(orig)
assert.equal(snap.x, 0.4)
assert.equal(snap.theme, 'neon')
snap.x = 0
assert.equal(orig.x, 0.4)

assert.equal(nameTextStyleFavorite({ theme: 'classic', size: 0.05 }, []), 'classic · 64px')
assert.equal(
  nameTextStyleFavorite({ theme: 'classic', size: 0.05 }, [{ name: 'classic · 64px' }]),
  'classic · 64px (2)',
)

assert.equal(FAV_CAT, 'favoritos')

console.log('favorites ok')
