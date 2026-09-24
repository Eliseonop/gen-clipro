import assert from 'node:assert/strict'
import { placeSoundDesign } from './soundDesign.js'
import { clipVolumeAt } from './clipKeyframes.js'

// Mismo caso que backend/tests/test_sound_design.py (PlaceTest).
const tracks = [
  { id: 'V1', kind: 'video', name: 'V1' },
  { id: 'S', kind: 'audio', name: 'SFX' },
]
const clips = [
  { id: 'v', track_id: 'V1', kind: 'video', start: 10, in_point: 0, out_point: 6, source_duration: 6, speed: 1 },
  { id: 'busy', track_id: 'S', kind: 'audio', start: 12, in_point: 0, out_point: 1, source_duration: 1, speed: 1 },
]
const SOUNDS = [
  { what: 'Viento', kind: 'ambience', start: 0, duration: 6, volume: 0.3, sfx: { id: '02_IMPACTS/Whoosh Wind.mp3', name: 'Whoosh Wind', duration: 4.5 } },
  { what: 'Águila', kind: 'spot', start: 5.5, duration: 2, volume: 0.9, sfx: { id: '10_ANIMALS/EAGLE RAHHH.mp3', name: 'EAGLE RAHHH', duration: 3 } },
]
let n = 0
const out = placeSoundDesign(clips, tracks, clips[0], SOUNDS, (p) => `${p}${++n}`)

assert.deepEqual(out.tracks.filter((t) => t.kind === 'audio').map((t) => t.name), ['SFX', 'SFX 2'], 'la pista SFX ya tenía algo en ese tramo')
assert.equal(out.added.length, 2)
const wind = out.clips.find((c) => String(c.asset_id || '').endsWith('Whoosh Wind.mp3'))
const eagle = out.clips.find((c) => String(c.asset_id || '').endsWith('EAGLE RAHHH.mp3'))
assert.deepEqual([wind.start, wind.out_point], [10, 4.5], 'no pasa del archivo')
assert.equal(wind.track_id, out.tracks[out.tracks.length - 1].id)
assert.deepEqual([eagle.start, eagle.out_point], [15.5, 0.5], 'no pasa del final de la escena')
assert.equal(eagle.track_id, 'S', 'cabe en la primera pista SFX')
assert.equal(wind.asset_kind, 'sfx')
assert.equal(wind.filename, '02_IMPACTS/Whoosh Wind.mp3')
assert.deepEqual([wind.note, wind.note_source], ['Viento', 'ai'])
assert.ok(Math.abs(clipVolumeAt(wind, 0)) < 1e-6, 'el ambiente entra con fundido')
assert.ok(Math.abs(clipVolumeAt(wind, 2) - 0.3) < 1e-6)
assert.equal(eagle.volume, 0.9)
assert.equal(clips.length, 2, 'no muta la entrada')

console.log('soundDesign ok')
