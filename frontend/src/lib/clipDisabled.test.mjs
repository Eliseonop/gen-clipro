// Clip desactivado (#10, tecla V): fuera del dibujo y del sonido del preview,
// igual que en el export (backend/tests/test_clip_disabled.py).
import assert from 'node:assert/strict'
import { videosAt } from './clipLayout.js'
import { clipDisabled, clipPlaybackMuted } from '../features/editor/editorModel.js'

const tracks = [{ id: 'V1', kind: 'video' }]
const clip = (id, extra = {}) => ({
  id, track_id: 'V1', kind: 'video', start: 0, in_point: 0, out_point: 2, source_duration: 2, ...extra,
})
assert.deepEqual(videosAt(1, [clip('a'), clip('b', { disabled: true })], tracks).map((c) => c.id), ['a'])
assert.equal(clipDisabled(clip('a')), false)
assert.equal(clipDisabled(clip('a', { disabled: true })), true)
assert.equal(clipPlaybackMuted(clip('a', { disabled: true }), {}), true)
assert.equal(clipPlaybackMuted(clip('a'), {}), false)

console.log('clipDisabled ok')
