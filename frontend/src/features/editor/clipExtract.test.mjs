import assert from 'node:assert/strict'
import {
  dragMark, markToSourceRange, segmentDescription, segmentRange, materialDuration, hasFaceTrack, segmentLabel, MIN_SEGMENT,
} from './clipExtract.js'
import { makeClip } from './editorModel.js'

// dragMark: nunca descarta la otra marca; se para a MIN_SEGMENT de ella.
assert.deepEqual(dragMark({ in: 2, out: 8 }, 'in', 5), { in: 5, out: 8 })
assert.deepEqual(dragMark({ in: 2, out: 8 }, 'in', 9), { in: +(8 - MIN_SEGMENT).toFixed(3), out: 8 })
assert.deepEqual(dragMark({ in: 2, out: 8 }, 'out', 1), { in: 2, out: +(2 + MIN_SEGMENT).toFixed(3) })
assert.deepEqual(dragMark({ in: 2, out: 8 }, 'out', 99, 20), { in: 2, out: 20 })
assert.deepEqual(dragMark({ in: null, out: 8 }, 'in', -3), { in: 0, out: 8 })

const video = (o) => ({ kind: 'video', start: 0, in_point: 0, out_point: 60, speed: 1, ...o })

// Vídeo abierto tal cual: timeline = archivo.
assert.deepEqual(
  (({ start, end }) => ({ start, end }))(markToSourceRange([video()], { in: 12.5, out: 19 })),
  { start: 12.5, end: 19 },
)
// Timeline recortada: el clip empieza en la timeline en 0 pero en el archivo en 30.
assert.deepEqual(
  (({ start, end }) => ({ start, end }))(markToSourceRange([video({ in_point: 30 })], { in: 2, out: 7 })),
  { start: 32, end: 37 },
)
// Rango que cruza un corte → error.
const cut = [video({ out_point: 10 }), video({ start: 10, in_point: 20, out_point: 40 })]
assert.ok(markToSourceRange(cut, { in: 8, out: 12 }).error)
assert.equal(markToSourceRange(cut, { in: 11, out: 15 }).start, 21)
// Sin marcas completas.
assert.ok(markToSourceRange([video()], { in: 3, out: null }).error)
assert.ok(markToSourceRange([], { in: 3, out: 5 }).error)

// Materiales.
assert.deepEqual(segmentRange({ in_point: 4, out_point: 9 }), { in: 4, out: 9 })
assert.equal(segmentRange({ start: 4, end: 9 }), null)
assert.equal(materialDuration({ in_point: 4, out_point: 9, start: 4, end: 9 }), 5)
assert.equal(materialDuration({ start: 300, end: 315 }), 15)
assert.equal(hasFaceTrack({ face_track: {}, reframe: { keyframes: [{ t: 1, cx: 0.5 }] } }), true)
assert.equal(hasFaceTrack({ reframe: { keyframes: [{ t: 1, cx: 0.5 }] } }), false)
assert.equal(segmentLabel('Entrevista', 65, 72.4), 'Entrevista · 1:05–1:12')

// makeClip de un segmento: recorta el archivo original y marca ref_segment.
const seg = makeClip('clips', {
  index: 7, filename: 'src.mp4', start: 12, end: 18, in_point: 12, out_point: 18,
}, 'V1', 3, 6)
assert.equal(seg.in_point, 12)
assert.equal(seg.out_point, 18)
assert.equal(seg.ref_segment, true)
// Clip normal: sin cambios.
const plain = makeClip('clips', { index: 8, filename: 'a.mp4', start: 300, end: 305 }, 'V1', 0, 5)
assert.equal(plain.in_point, 0)
assert.equal(plain.out_point, 5)
assert.equal(plain.ref_segment, undefined)
// Seguimiento guardado → el reframe (keyframes en tiempo de archivo) viaja con el clip.
const tracked = makeClip('clips', {
  index: 9, filename: 'src.mp4', in_point: 12, out_point: 18, face_track: { start: 12, end: 18 },
  reframe: { zoom: 1, keyframes: [{ t: 12, cx: 0.3, cy: 0.4 }, { t: 18, cx: 0.6, cy: 0.4 }] },
}, 'V1', 0, 6)
assert.equal(tracked.reframe.keyframes.length, 2)
assert.equal(tracked.reframe.keyframes[0].t, 12)
assert.equal(makeClip('clips', { index: 10, filename: 'a.mp4', reframe: { keyframes: [{ t: 1, cx: 0.2 }] } }, 'V1', 0, 5).reframe.keyframes.length, 0)

// Descripción del modal: manual / la del vídeo original / ninguna.
const ask = { description: '  mía ', sourceDescription: 'original' }
assert.equal(segmentDescription({ ...ask, descMode: 'manual' }), 'mía')
assert.equal(segmentDescription({ ...ask, descMode: 'source' }), 'original')
assert.equal(segmentDescription({ ...ask, descMode: 'none' }), '')
assert.equal(segmentDescription(null), '')

console.log('clipExtract.test OK')
