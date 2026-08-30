import assert from 'node:assert/strict'
import {
  clipPlaybackMuted, makeClip, newReframe,
  shouldConfirmTrackDelete, removeTrack,
  canCaptionClip, textClipsFromTranscript,
} from './editorModel.js'

const legacy = makeClip('clips', { index: 1, filename: 'a.mp4', end: 5, start: 0 }, 'V1', 0, 5)
assert.equal(legacy.reframe.dual_crop, false)
assert.equal(legacy.reframe.master, false)
assert.equal((legacy.reframe.keyframes || []).length, 0)

const master = makeClip('clips', {
  index: 2, filename: 'b.mp4', end: 8, start: 0,
  reframe: {
    master: true, dual_crop: true, split_layout: 'auto',
    keyframes: [{ t: 0, cx: 0.3, cy: 0.5, zoom: 1 }],
    keyframes2: [{ t: 0, cx: 0.7, cy: 0.5, zoom: 0.5 }],
  },
}, 'V1', 0, 8)
assert.equal(master.reframe.master, true)
assert.equal(master.reframe.dual_crop, true)
assert.equal(master.reframe.keyframes[0].cx, 0.3)
assert.ok(master.reframe.keyframes[0].id)
assert.equal(newReframe().split_layout, 'auto')
assert.equal(legacy.muted, false)
assert.equal(clipPlaybackMuted(legacy, { muted: false }), false)
assert.equal(clipPlaybackMuted({ muted: true }, { muted: false }), true)
assert.equal(clipPlaybackMuted({ muted: false }, { muted: true }), true)

console.log('makeClip reframe copy ok')

const tracks = [
  { id: 'V1', kind: 'video', name: 'V1' },
  { id: 'V2', kind: 'video', name: 'V2' },
]
const clips = [
  { id: 'c1', track_id: 'V1', kind: 'video' },
]
assert.equal(shouldConfirmTrackDelete(clips, 'V1'), true)
assert.equal(shouldConfirmTrackDelete(clips, 'V2'), false)
const emptied = removeTrack(tracks, clips, 'V2')
assert.deepEqual(emptied.tracks.map((t) => t.id), ['V1'])
assert.equal(emptied.clips.length, 1)
const withClips = removeTrack(tracks, clips, 'V1')
assert.deepEqual(withClips.tracks.map((t) => t.id), ['V2'])
assert.equal(withClips.clips.length, 0)

assert.equal(canCaptionClip({ kind: 'video', asset_kind: 'clips', asset_id: '3' }), true)
assert.equal(canCaptionClip({ kind: 'video', asset_kind: 'clips', index: 7 }), true)
assert.equal(canCaptionClip({ kind: 'text', asset_kind: 'text' }), false)
assert.equal(canCaptionClip({ kind: 'audio', asset_kind: 'audios', filename: 'a.wav' }), true)
assert.equal(canCaptionClip({ kind: 'audio', asset_kind: 'sfx', filename: 'hit.wav' }), true)

const captions = textClipsFromTranscript(
  { start: 10, in_point: 2, out_point: 8 },
  [
    { start: 2, end: 4, text: 'hola' },
    { start: 0, end: 1, text: 'fuera' },
    { start: 3, end: 5, text: '  ' },
  ],
  'T1',
  { font: 'Arial' },
)
assert.equal(captions.length, 1)
assert.equal(captions[0].track_id, 'T1')
assert.equal(captions[0].text, 'hola')
assert.equal(captions[0].start, 10)
assert.equal(+(captions[0].out_point - captions[0].in_point).toFixed(3), 2)

console.log('track delete + captions ok')

