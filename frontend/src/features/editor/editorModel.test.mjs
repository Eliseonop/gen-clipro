import assert from 'node:assert/strict'
import {
  SPEED_MIN, SPEED_MAX, SPEED_PRESETS,
  clipSpeed, clipSourceDur, clipDur, clipEnd,
  timelineToSource, sourceToTimeline, splitClipAt,
  clipPlaybackMuted, makeClip, mediaUrl, newReframe,
  shouldConfirmTrackDelete, removeTrack,
  canCaptionClip, textClipsFromTranscript, makeTextClip, resizeGeneratedClip,
  splitClipByMaxWords, splitTrackTextByMaxWords, extraClipsAfterSplit,
  nextClipSelection, rangeSelectOnTrack, groupMoveFromOrig, patchClipsStyle, removeClipsByIds,
  previewElementVolume, parsePreviewVolume, laneKindForAsset, trackKindForClip,
} from './editorModel.js'

const vFast = { kind: 'video', start: 10, in_point: 2, out_point: 6, speed: 2 }
assert.equal(clipSourceDur(vFast), 4)
assert.equal(clipDur(vFast), 2)
assert.equal(clipEnd(vFast), 12)
assert.equal(clipSpeed(vFast), 2)
assert.equal(clipSpeed({ kind: 'text', speed: 4 }), 1)
assert.equal(clipSpeed({ kind: 'video' }), 1)
assert.equal(clipSpeed({ kind: 'audio', speed: 99 }), SPEED_MAX)
assert.equal(clipSpeed({ kind: 'video', speed: 0 }), 1)
assert.equal(timelineToSource(vFast, 10), 2)
assert.equal(timelineToSource(vFast, 12), 6)
assert.equal(sourceToTimeline(vFast, 4), 11)
const vRev = { ...vFast, reverse: true }
assert.equal(timelineToSource(vRev, 10), 6)
assert.equal(timelineToSource(vRev, 12), 2)
assert.deepEqual(SPEED_PRESETS, [0.3, 0.5, 1, 1.5, 2, 3, 5, 10])
assert.equal(SPEED_MIN, 0.1)
assert.equal(SPEED_MAX, 10)
const splitParts = splitClipAt(vFast, 11, 'c-right')
assert.equal(splitParts.left.out_point, 4)
assert.equal(splitParts.right.in_point, 4)
assert.equal(splitParts.right.start, 11)
assert.equal(splitParts.right.speed, 2)
assert.equal(splitClipAt(vFast, 10.02, 'x'), null)
console.log('clip speed ok')

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
assert.equal(legacy.speed, 1)
assert.equal(legacy.keep_pitch, false)
assert.equal(legacy.reverse, false)
assert.equal(clipPlaybackMuted(legacy, { muted: false }), false)
assert.equal(clipPlaybackMuted({ muted: true }, { muted: false }), true)
assert.equal(clipPlaybackMuted({ muted: false }, { muted: true }), true)

assert.equal(legacy.asset_scope, 'project')
assert.equal(mediaUrl('p1', legacy), '/api/media/p1/video/a.mp4')

const libAudio = makeClip('audios', {
  id: 'lib_abc123def456', filename: 'yt.m4a', duration: 12, scope: 'library',
}, 'A1', 0, 12)
assert.equal(libAudio.asset_scope, 'library')
assert.equal(libAudio.asset_id, 'lib_abc123def456')
assert.equal(mediaUrl('p1', libAudio), '/api/library/media/audio/yt.m4a')

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
assert.equal(captions[0].text_role, 'caption')
assert.equal(captions[0].start, 10)
assert.equal(+(captions[0].out_point - captions[0].in_point).toFixed(3), 2)

const longCaps = textClipsFromTranscript(
  { start: 0, in_point: 0, out_point: 6 },
  [{ start: 0, end: 6, text: 'uno dos tres cuatro cinco seis' }],
  'T1',
  { font: 'Arial', max_words: 2 },
)
assert.equal(longCaps.length, 3)
assert.equal(longCaps[0].text, 'uno dos')
assert.equal(longCaps[1].text, 'tres cuatro')
assert.equal(longCaps[2].text, 'cinco seis')
assert.equal(longCaps[0].start, 0)
assert.equal(longCaps[1].start, 2)
assert.equal(longCaps[2].start, 4)
assert.equal(+(longCaps[0].out_point - longCaps[0].in_point).toFixed(3), 2)

const autoSplit = textClipsFromTranscript(
  { start: 0, in_point: 0, out_point: 8 },
  [{ start: 0, end: 8, text: 'a b c d e f g h i j k l' }],
  'T1',
  { font: 'Arial' },
)
assert.equal(autoSplit.length, 2)
assert.equal(autoSplit[0].text, 'a b c d e f g h')
assert.equal(autoSplit[1].text, 'i j k l')

const srcClip = {
  id: 'c1', track_id: 'T1', kind: 'text', text_role: 'caption', text: 'a b c d e f',
  start: 10, in_point: 0, out_point: 6, style: { font: 'Arial' },
}
const parts = splitClipByMaxWords(srcClip, 4)
assert.equal(parts.length, 2)
assert.equal(parts[0].text, 'a b c d')
assert.equal(parts[1].text, 'e f')
assert.equal(parts[0].start, 10)
assert.equal(parts[1].start, 14)
assert.equal(+(parts[0].out_point).toFixed(3), 4)
assert.equal(+(parts[1].out_point).toFixed(3), 2)
assert.notEqual(parts[0].id, parts[1].id)

const untouched = splitClipByMaxWords({ ...srcClip, text: 'hola' }, 4)
assert.equal(untouched.length, 1)
assert.equal(untouched[0].text, 'hola')

const mixed = [
  { id: 'v1', track_id: 'V1', kind: 'video' },
  { id: 't1', track_id: 'T1', kind: 'text', text_role: 'caption', text: 'uno dos tres cuatro', start: 0, in_point: 0, out_point: 4, style: {} },
  { id: 't2', track_id: 'T2', kind: 'text', text: 'otro largo de mas de cuatro palabras ya', start: 1, in_point: 0, out_point: 2, style: {} },
]
assert.equal(extraClipsAfterSplit(mixed, 'T1', 4), 0)
assert.equal(extraClipsAfterSplit(mixed, 'T1', 2), 1)
const splitT1 = splitTrackTextByMaxWords(mixed, 'T1', 2)
assert.equal(splitT1.filter((c) => c.track_id === 'T1').length, 2)
assert.equal(splitT1.filter((c) => c.track_id === 'T2').length, 1)
assert.equal(splitT1.filter((c) => c.kind === 'video').length, 1)

console.log('track delete + captions ok')

const selClips = [
  { id: 'a', track_id: 'T1', kind: 'text', start: 0 },
  { id: 'b', track_id: 'T1', kind: 'text', start: 2 },
  { id: 'c', track_id: 'T1', kind: 'text', start: 4 },
  { id: 'd', track_id: 'T2', kind: 'text', start: 1 },
  { id: 'v', track_id: 'V1', kind: 'video', start: 0 },
]

assert.deepEqual(rangeSelectOnTrack(selClips, 'T1', 'a', 'c'), ['a', 'b', 'c'])
assert.deepEqual(rangeSelectOnTrack(selClips, 'T1', 'c', 'a'), ['a', 'b', 'c'])

let next = nextClipSelection(selClips, ['a'], 'a', 'b', {})
assert.deepEqual(next, { ids: ['b'], anchorId: 'b' })

next = nextClipSelection(selClips, ['a'], 'a', 'b', { additive: true })
assert.deepEqual(next.ids.sort(), ['a', 'b'])
assert.equal(next.anchorId, 'b')

next = nextClipSelection(selClips, ['a', 'b'], 'b', 'a', { additive: true })
assert.deepEqual(next.ids, ['b'])
assert.equal(next.anchorId, 'b')

next = nextClipSelection(selClips, ['a'], 'a', 'v', { additive: true })
assert.deepEqual(next, { ids: ['v'], anchorId: 'v' })

next = nextClipSelection(selClips, ['a'], 'a', 'c', { range: true })
assert.deepEqual(next.ids, ['a', 'b', 'c'])
assert.equal(next.anchorId, 'c')

next = nextClipSelection(selClips, ['a'], 'a', 'd', { range: true })
assert.deepEqual(next, { ids: ['d'], anchorId: 'd' })

next = nextClipSelection(selClips, ['a', 'b', 'c'], 'a', 'b', { keepGroup: true })
assert.deepEqual(next.ids, ['a', 'b', 'c'])
assert.equal(next.anchorId, 'b')

const moved = groupMoveFromOrig(
  selClips.map((c) => ({ ...c })),
  [{ id: 'a', start: 1 }, { id: 'b', start: 3 }],
  -5,
)
assert.equal(moved.find((c) => c.id === 'a').start, 0)
assert.equal(moved.find((c) => c.id === 'b').start, 2)
assert.equal(moved.find((c) => c.id === 'c').start, 4)

const styled = patchClipsStyle(
  [
    { id: 'a', kind: 'text', style: { font: 'Arial', color: '#fff' } },
    { id: 'b', kind: 'text', style: { font: 'Arial', color: '#fff' } },
    { id: 'v', kind: 'video', style: { font: 'Arial' } },
  ],
  ['a', 'b'],
  { font: 'Anton' },
)
assert.equal(styled.find((c) => c.id === 'a').style.font, 'Anton')
assert.equal(styled.find((c) => c.id === 'b').style.font, 'Anton')
assert.equal(styled.find((c) => c.id === 'v').style.font, 'Arial')

const left = removeClipsByIds(selClips, ['a', 'c'])
assert.deepEqual(left.map((c) => c.id), ['b', 'd', 'v'])

console.log('clip multi-select ok')

assert.equal(previewElementVolume(1, 1, false), 1)
assert.equal(previewElementVolume(1, 0.3, false), 0.3)
assert.equal(previewElementVolume(0.5, 0.5, false), 0.25)
assert.equal(previewElementVolume(1, 0.3, true), 0)
assert.equal(parsePreviewVolume('0.4'), 0.4)
assert.equal(parsePreviewVolume('nope'), 1)
assert.equal(parsePreviewVolume('2'), 1)
assert.equal(parsePreviewVolume(null), 1)

console.log('preview volume ok')

const madeFree = makeTextClip('T2', 1, 3, 'Marca', { font: 'Arial' })
assert.equal(madeFree.kind, 'text')
assert.equal(madeFree.text_role, 'free')
assert.equal(madeFree.out_point, 3)
assert.deepEqual(madeFree.words, [])

const themedFree = makeTextClip('T2', 0, 4, 'Hola mundo', { theme: 'neon', word_fx: 'glow', font: 'Impact' })
assert.equal(themedFree.text_role, 'free')
assert.equal(themedFree.style.word_fx, 'glow')
assert.equal(themedFree.style.theme, 'neon')

const madeCap = makeTextClip('T1', 0, 2, 'Hola', {}, { text_role: 'caption' })
assert.equal(madeCap.text_role, 'caption')

const watermark = { kind: 'text', text_role: 'free', start: 2, in_point: 0, out_point: 3, source_duration: 3 }
const grown = resizeGeneratedClip(watermark, 'trim-right', 12)
assert.equal(grown.out_point, 15)
assert.equal(grown.source_duration, 15)

const leftGrow = resizeGeneratedClip(watermark, 'trim-left', -1)
assert.equal(leftGrow.start, 1)
assert.equal(leftGrow.in_point, 0)
assert.equal(leftGrow.out_point, 4)

const pinned = resizeGeneratedClip({ ...watermark, start: 0 }, 'trim-left', -4)
assert.equal(pinned.start, 0)
assert.equal(pinned.out_point, 3)

const shrunk = resizeGeneratedClip(watermark, 'trim-right', -10)
assert.equal(shrunk.out_point, 0.15)

const freeLong = {
  id: 'w1', track_id: 'T1', kind: 'text', text_role: 'free',
  text: 'uno dos tres cuatro cinco seis', start: 0, in_point: 0, out_point: 20, style: {},
}
assert.equal(extraClipsAfterSplit([freeLong], 'T1', 2), 0)
assert.equal(splitTrackTextByMaxWords([freeLong], 'T1', 2).length, 1)

console.log('text role + generated resize ok')

const img = makeClip('images', { id: 'i1', filename: 'meme.png', label: 'Meme' }, 'V2', 10)
assert.equal(img.kind, 'image')
assert.equal(img.asset_kind, 'images')
assert.equal(img.track_id, 'V2')
assert.equal(img.start, 10)
assert.equal(img.in_point, 0)
assert.equal(img.out_point, 5)
assert.equal(img.source_duration, 5)
assert.equal(img.layout, 'fill')
assert.equal(img.frame, 'full')
assert.equal(img.reframe.zoom, 1)
assert.equal(clipSpeed(img), 1)
assert.equal(clipDur(img), 5)
assert.equal(trackKindForClip('image'), 'video')
assert.equal(laneKindForAsset('images'), 'video')
assert.equal(mediaUrl('p1', img), '/api/media/p1/image/meme.png')
assert.equal(canCaptionClip(img), false)

const imgGrown = resizeGeneratedClip(img, 'trim-right', 3)
assert.equal(imgGrown.out_point, 8)
assert.ok(imgGrown.source_duration >= 8)

console.log('image clip ok')

