import assert from 'node:assert/strict'
import {
  SPEED_MIN, SPEED_MAX, SPEED_PRESETS,
  clipSpeed, clipSourceDur, clipDur, clipEnd,
  clipKeepPitch,
  timelineToSource, sourceToTimeline, splitClipAt,
  clipPlaybackMuted, makeClip, mediaUrl, newReframe,
  shouldConfirmTrackDelete, removeTrack,
  canCaptionClip, textClipsFromTranscript, makeTextClip, resizeGeneratedClip, trimClipPatch, trimPreviewHead,
  splitClipByMaxWords, splitTrackTextByMaxWords, extraClipsAfterSplit, extraClipsAfterOneSplit, splitOneTextClip,
  nextClipSelection, rangeSelectOnTrack, groupMoveFromOrig, patchClipsStyle, removeClipsByIds,
  previewElementVolume, parsePreviewVolume, laneKindForAsset, trackKindForClip,
  duplicateClipOntoTrack, dupCount, lineageRoot, syncMaterialInstances,
  applyFaceTrack, isEditingExistingClip, clipSaveIndex,
  trackContextItems, linkedPartnerName, linkTrackPair, unlinkTrackPair,
  clipCopyText,
  applyAudioSpeedToLinkedText, makeShapeClip, isGeneratedDurationClip,
  matchClipsToFirstDuration, durationPatchToMatch,
  clipLayerInfo, moveClipLayer, canLayerClip,
  trackTextContent,
} from './editorModel.js'

const vFast = { kind: 'video', start: 10, in_point: 2, out_point: 6, speed: 2 }
assert.equal(clipSourceDur(vFast), 4)
assert.equal(clipDur(vFast), 2)
assert.equal(clipEnd(vFast), 12)
assert.equal(clipSpeed(vFast), 2)
assert.equal(clipSpeed({ kind: 'text', speed: 4 }), 1)
assert.equal(clipSpeed({ kind: 'shape', speed: 4 }), 1)
assert.equal(clipSpeed({ kind: 'video' }), 1)
assert.equal(clipSpeed({ kind: 'audio', speed: 99 }), SPEED_MAX)
assert.equal(clipSpeed({ kind: 'video', speed: 0 }), 1)
assert.equal(clipKeepPitch({}), true)
assert.equal(clipKeepPitch({ keep_pitch: true }), true)
assert.equal(clipKeepPitch({ keep_pitch: false }), false)
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
assert.equal(legacy.keep_pitch, true)
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
assert.deepEqual(next.ids, ['a', 'd'])
assert.equal(next.anchorId, 'a')

next = nextClipSelection(selClips, ['v'], 'v', 'a', { range: true })
assert.deepEqual(next.ids, ['v', 'a'])
assert.equal(next.anchorId, 'v')

next = nextClipSelection(selClips, ['a', 'd'], 'a', 'd', { range: true })
assert.deepEqual(next.ids, ['a'])
assert.equal(next.anchorId, 'a')

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

const timed = [
  { id: 'img', kind: 'image', start: 0, in_point: 0, out_point: 8, source_duration: 8, track_id: 'V1' },
  { id: 'shp', kind: 'shape', start: 1, in_point: 0, out_point: 3, source_duration: 3, track_id: 'V2' },
  { id: 'vid', kind: 'video', start: 0, in_point: 1, out_point: 4, source_duration: 5, track_id: 'V1' },
  { id: 'aud', kind: 'audio', start: 0, in_point: 0, out_point: 12, source_duration: 12, track_id: 'A1' },
]
const sameLen = matchClipsToFirstDuration(timed, ['img', 'shp'])
assert.equal(sameLen.find((c) => c.id === 'img').out_point, 8)
assert.equal(sameLen.find((c) => c.id === 'shp').start, 0)
assert.equal(sameLen.find((c) => c.id === 'shp').out_point, 8)
assert.equal(sameLen.find((c) => c.id === 'shp').source_duration, 8)
assert.equal(sameLen.find((c) => c.id === 'shp').track_id, 'V2')

const capped = matchClipsToFirstDuration(timed, ['img', 'vid'])
assert.equal(capped.find((c) => c.id === 'vid').start, 0)
assert.equal(capped.find((c) => c.id === 'vid').out_point, 5)
assert.equal(capped.find((c) => c.id === 'vid').source_duration, 5)
assert.equal(capped.find((c) => c.id === 'vid').track_id, 'V1')

const audCut = matchClipsToFirstDuration(timed, ['shp', 'aud'])
assert.equal(audCut.find((c) => c.id === 'aud').start, 1)
assert.equal(audCut.find((c) => c.id === 'aud').out_point, 3)
assert.equal(durationPatchToMatch({ kind: 'video', in_point: 0, out_point: 2, source_duration: 2 }, 10).out_point, 2)
assert.deepEqual(matchClipsToFirstDuration(timed, ['img']), timed)
const spedVid = matchClipsToFirstDuration([
  { id: 'img', kind: 'image', start: 10, in_point: 0, out_point: 4, source_duration: 4, track_id: 'V1' },
  { id: 'vid', kind: 'video', start: 2, in_point: 0, out_point: 2, source_duration: 10, speed: 2, track_id: 'V2' },
], ['img', 'vid'])
assert.equal(spedVid.find((c) => c.id === 'vid').start, 10)
assert.equal(spedVid.find((c) => c.id === 'vid').out_point, 8)
assert.equal(clipDur(spedVid.find((c) => c.id === 'vid')), 4)
assert.equal(spedVid.find((c) => c.id === 'vid').track_id, 'V2')

const sameLane = matchClipsToFirstDuration([
  { id: 'a', kind: 'image', start: 10, in_point: 0, out_point: 2, source_duration: 2, track_id: 'V1' },
  { id: 'b', kind: 'shape', start: 3, in_point: 0, out_point: 5, source_duration: 5, track_id: 'V1' },
], ['a', 'b'])
assert.equal(sameLane.find((c) => c.id === 'b').start, 10)
assert.equal(sameLane.find((c) => c.id === 'b').out_point, 2)
assert.equal(sameLane.find((c) => c.id === 'b').track_id, 'V1')
assert.deepEqual(sameLane.map((c) => c.id), ['b', 'a'])

const stacked = [
  { id: 'img', kind: 'image', track_id: 'V1', start: 0 },
  { id: 'shp', kind: 'shape', track_id: 'V1', start: 0 },
  { id: 'other', kind: 'video', track_id: 'V2', start: 0 },
]
assert.equal(canLayerClip(stacked[1]), true)
assert.deepEqual(clipLayerInfo(stacked, 'img'), { index: 1, count: 2, canBack: false, canFront: true })
assert.deepEqual(clipLayerInfo(stacked, 'shp'), { index: 2, count: 2, canBack: true, canFront: false })
const sentBack = moveClipLayer(stacked, 'shp', 'back')
assert.deepEqual(sentBack.map((c) => c.id), ['shp', 'img', 'other'])
assert.equal(clipLayerInfo(sentBack, 'shp').index, 1)
assert.deepEqual(moveClipLayer(stacked, 'img', 'front').map((c) => c.id), ['shp', 'img', 'other'])
assert.deepEqual(moveClipLayer(stacked, 'shp', 'backward').map((c) => c.id), ['shp', 'img', 'other'])
assert.deepEqual(moveClipLayer(stacked, 'img', 'forward').map((c) => c.id), ['shp', 'img', 'other'])
assert.equal(moveClipLayer(stacked, 'img', 'back'), stacked)
assert.equal(moveClipLayer(stacked, 'shp', 'front'), stacked)

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

const shapeClip = makeShapeClip('V2', 1, 5, { type: 'arrow', label: 'Flecha' })
assert.equal(shapeClip.kind, 'shape')
assert.equal(shapeClip.asset_kind, 'shape')
assert.equal(shapeClip.shape.type, 'arrow')
assert.equal(shapeClip.out_point, 5)
assert.equal(shapeClip.keep_pitch, true)
assert.equal(trackKindForClip('shape'), 'video')
assert.equal(laneKindForAsset('shape'), 'video')
assert.equal(isGeneratedDurationClip(shapeClip), true)
assert.equal(canCaptionClip(shapeClip), false)

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

assert.equal(trimPreviewHead(watermark, 'trim-left', 0), 2)
assert.ok(Math.abs(trimPreviewHead(watermark, 'trim-right', 0) - (clipEnd(watermark) - 0.04)) < 1e-9)
const videoTrim = { kind: 'video', start: 5, in_point: 1, out_point: 5, source_duration: 20, speed: 1 }
assert.deepEqual(trimClipPatch(videoTrim, 'trim-left', 1), { in_point: 2, start: 6 })
assert.equal(trimPreviewHead(videoTrim, 'trim-left', 1), 6)
assert.equal(trimClipPatch(videoTrim, 'trim-right', 2).out_point, 7)
assert.ok(Math.abs(trimPreviewHead(videoTrim, 'trim-right', 2) - (5 + 6 - 0.04)) < 1e-9)

const freeLong = {
  id: 'w1', track_id: 'T1', kind: 'text', text_role: 'free',
  text: 'uno dos tres cuatro cinco seis', start: 0, in_point: 0, out_point: 20, style: {},
}
assert.equal(extraClipsAfterSplit([freeLong], 'T1', 2), 0)
assert.equal(splitTrackTextByMaxWords([freeLong], 'T1', 2).length, 1)
assert.equal(extraClipsAfterOneSplit(freeLong, 2), 2)
assert.equal(splitOneTextClip([freeLong, { id: 'v' }], 'w1', 2).length, 4)
assert.equal(splitOneTextClip([freeLong], 'w1', 2)[0].text, 'uno dos')

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
assert.notEqual(img.id, makeClip('images', { id: 'i2', filename: 'b.png' }, 'V2', 0).id)

const imgGrown = resizeGeneratedClip(img, 'trim-right', 3)
assert.equal(imgGrown.out_point, 8)
assert.ok(imgGrown.source_duration >= 8)

console.log('image clip ok')

assert.equal(isEditingExistingClip({ existingIndex: 12 }), true)
assert.equal(isEditingExistingClip({ existingIndex: 0 }), true)
assert.equal(isEditingExistingClip({ existingIndex: null }), false)
assert.equal(isEditingExistingClip({}), false)
assert.equal(clipSaveIndex({ existingIndex: 7 }, 111), 7)
assert.equal(clipSaveIndex({ existingIndex: null }, 111), 111)

const src = makeClip('clips', { index: 3, filename: 'x.mp4', label: 'Orig', description: 'gancho', end: 8, start: 0 }, 'V1', 2, 8)
assert.equal(src.description, 'gancho')
assert.equal(src.dup_of, null)
const copy = duplicateClipOntoTrack(src, 'V3', 'c-copy')
assert.equal(copy.id, 'c-copy')
assert.equal(copy.track_id, 'V3')
assert.notEqual(copy.id, src.id)
assert.notEqual(copy.reframe, src.reframe)
assert.equal(copy.dup_of, src.id)
assert.equal(copy.asset_id, src.asset_id)
assert.equal(copy.filename, src.filename)
assert.equal(copy.start, src.start)
assert.equal(copy.description, 'gancho')
assert.equal(src.dup_of, null)
assert.equal(lineageRoot(src), src.id)
assert.equal(lineageRoot(copy), src.id)
assert.equal(dupCount([src, copy], src), 1)
assert.equal(dupCount([src, copy], copy), 1)

const other = { ...src, id: 'c-other', asset_id: '9' }
const synced = syncMaterialInstances([src, copy, other], {
  assetKind: 'clips',
  assetId: '3',
  duration: 5,
  filename: 'x2.mp4',
  name: 'Nuevo',
  description: 'editado',
  reframe: { zoom: 0.8, pan_mode: 'smooth', keyframes: [] },
})
assert.equal(synced[0].source_duration, 5)
assert.equal(synced[0].out_point, 5)
assert.equal(synced[0].filename, 'x2.mp4')
assert.equal(synced[0].name, 'Nuevo')
assert.equal(synced[0].description, 'editado')
assert.equal(synced[1].source_duration, 5)
assert.equal(synced[2].source_duration, 8)
assert.equal(synced[2].filename, 'x.mp4')

const faced = applyFaceTrack(null, [{ t: 0, cx: 0.2, cy: 0.4 }, { t: 1, cx: 0.8, cy: 0.6 }], 'direct')
assert.equal(faced.pan_mode, 'direct')
assert.equal(faced.face_track_mode, 'direct')
assert.equal(faced.keyframes[0].pan_mode, 'direct')
assert.equal(faced.keyframes[1].cx, 0.8)
const smooth = applyFaceTrack(faced, [{ t: 0, cx: 0.5, cy: 0.5 }], 'smooth')
assert.equal(smooth.face_track_mode, 'smooth')
assert.equal(smooth.keyframes[0].pan_mode, 'smooth')
const kept = applyFaceTrack(faced, [], 'smooth')
assert.equal(kept.face_track_mode, 'smooth')
assert.equal(kept.keyframes.length, 2)
assert.equal(kept.keyframes[0].cx, 0.2)

console.log('duplicate + sync + face-track ok')

assert.deepEqual(
  trackContextItems({ kind: 'text' }, { linked: false, canLink: true, hasText: true }).map((i) => i.id),
  ['rename', 'copy-text', 'delete'],
)
assert.equal(trackContextItems({ kind: 'text' }, { hasText: false }).find((i) => i.id === 'copy-text').disabled, true)
assert.equal(
  trackTextContent([
    { id: 'b', track_id: 'T1', kind: 'text', start: 1, text: 'mundo' },
    { id: 'a', track_id: 'T1', kind: 'text', start: 0, text: 'Hola' },
    { id: 'v', track_id: 'V1', kind: 'video', start: 0, text: 'no' },
  ], 'T1'),
  'Hola mundo',
)
assert.equal(clipCopyText({ description: 'gancho TTS' }), 'gancho TTS')
assert.equal(clipCopyText({ text: '  guion  ' }), 'guion')
assert.equal(clipCopyText({ description: 'desc', text: 'guion' }), 'desc')
assert.equal(clipCopyText({}), '')
assert.equal(clipCopyText({ kind: 'audio', filename: 'n.wav' }, [{ filename: 'n.wav', text: 'hola' }]), 'hola')
assert.equal(clipCopyText({ kind: 'audio', asset_id: 'a9' }, [{ id: 'a9', description: 'desc' }]), 'desc')
assert.equal(clipCopyText({ kind: 'video', filename: 'n.wav' }, [{ filename: 'n.wav', text: 'hola' }]), '')
const ttsClip = makeClip('audios', { id: 'a9', filename: 'n.wav', text: 'hola mundo', duration: 2 }, 'A1', 0, 2)
assert.equal(ttsClip.description, 'hola mundo')
assert.equal(clipCopyText(ttsClip), 'hola mundo')
assert.deepEqual(
  trackContextItems({ kind: 'audio' }, { linked: false, canLink: true }).map((i) => i.label),
  ['Renombrar', 'Relacionar', 'Eliminar'],
)
assert.equal(trackContextItems({ kind: 'audio' }, { linked: true }).find((i) => i.id === 'unlink').label, 'Desrelacionar')
assert.equal(trackContextItems({ kind: 'audio' }, { linked: false, canLink: false }).find((i) => i.id === 'link').disabled, true)

const pairIn = [
  { id: 'A1', kind: 'audio', name: 'A1', linked_track_id: null },
  { id: 'A2', kind: 'audio', name: 'A2', linked_track_id: 'T1' },
  { id: 'T1', kind: 'text', name: 'T1', linked_track_id: 'A2' },
  { id: 'T2', kind: 'text', name: 'T2', linked_track_id: null },
]
const paired = linkTrackPair(pairIn, 'A1', 'T1')
assert.equal(paired.find((t) => t.id === 'A1').linked_track_id, 'T1')
assert.equal(paired.find((t) => t.id === 'T1').linked_track_id, 'A1')
assert.equal(paired.find((t) => t.id === 'A2').linked_track_id, null)
assert.equal(linkedPartnerName(paired.find((t) => t.id === 'A1'), paired), 'T1')
assert.equal(linkedPartnerName(paired.find((t) => t.id === 'T1'), paired), 'A1')
const unpaired = unlinkTrackPair(paired, 'A1')
assert.equal(unpaired.find((t) => t.id === 'A1').linked_track_id, null)
assert.equal(unpaired.find((t) => t.id === 'T1').linked_track_id, null)
const afterDel = removeTrack(paired, [], 'T1')
assert.equal(afterDel.tracks.find((t) => t.id === 'A1').linked_track_id, null)

const audio = {
  id: 'a', kind: 'audio', track_id: 'A1', start: 0,
  in_point: 0, out_point: 10, source_duration: 10, speed: 1,
}
const capIn = {
  id: 't1', kind: 'text', track_id: 'T1', start: 2,
  in_point: 0, out_point: 2, source_duration: 2,
  words: [{ text: 'hola', start: 0, end: 0.4 }],
}
const capOut = {
  id: 't2', kind: 'text', track_id: 'T1', start: 12,
  in_point: 0, out_point: 1, source_duration: 1, words: [],
}
const linkTracks = [
  { id: 'A1', kind: 'audio', name: 'A1', linked_track_id: 'T1' },
  { id: 'T1', kind: 'text', name: 'T1', linked_track_id: 'A1' },
]
const sped = applyAudioSpeedToLinkedText([audio, capIn, capOut], linkTracks, audio, 2)
const nt1 = sped.find((c) => c.id === 't1')
assert.equal(nt1.start, 1)
assert.equal(nt1.out_point, 1)
assert.equal(nt1.words[0].end, 0.2)
assert.equal(sped.find((c) => c.id === 't2').start, 12)
assert.equal(applyAudioSpeedToLinkedText([audio, capIn], [{ id: 'A1', kind: 'audio' }], audio, 2).find((c) => c.id === 't1').start, 2)

console.log('track link + caption speed ok')

