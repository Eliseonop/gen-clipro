// Fragmentación con timing real por palabra (productor de words[] + origin).
// Comprueba: (1) conserva todas las palabras; (2) cada fragmento solo sus words[];
// (3) tiempos relativos al clip; (4) sin solapes ni pérdidas/duplicados;
// (5) origin conservado; (6) fallback intacto cuando no hay words[].
import assert from 'node:assert/strict'
import { textClipsFromTranscript, splitClipByMaxWords } from './editorModel.js'

// Segmento con words[] reales (tiempos ABSOLUTOS del audio, como Whisper).
const segment = {
  start: 10, end: 16,
  text: 'uno dos tres cuatro cinco seis',
  words: [
    { text: 'uno', start: 10.0, end: 10.4, prob: 0.9 },
    { text: 'dos', start: 10.6, end: 11.0 },
    { text: 'tres', start: 12.0, end: 12.5 },
    { text: 'cuatro', start: 12.6, end: 13.0 },
    { text: 'cinco', start: 14.0, end: 14.5 },
    { text: 'seis', start: 15.0, end: 16.0 },
  ],
}
// Clip fuente: material completo desde 10s, se ve tal cual (in_point 0).
const src = { start: 0, in_point: 10, out_point: 16 }
const transcript = { id: 'tr_test' }

const caps = textClipsFromTranscript(src, [segment], 'T1', { font: 'Arial', max_words: 2 }, transcript)

// 3 fragmentos de 2 palabras.
assert.equal(caps.length, 3)
assert.deepEqual(caps.map((c) => c.text), ['uno dos', 'tres cuatro', 'cinco seis'])

// (1) + (4) todas las palabras están, una sola vez, en orden.
const allWords = caps.flatMap((c) => c.words.map((w) => w.text))
assert.deepEqual(allWords, ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'])

// (2) cada fragmento solo lleva sus palabras.
assert.deepEqual(caps.map((c) => c.words.length), [2, 2, 2])
assert.deepEqual(caps[1].words.map((w) => w.text), ['tres', 'cuatro'])

// (3) tiempos RELATIVOS al inicio del fragmento (la 1ª palabra empieza en 0).
for (const c of caps) assert.equal(c.words[0].start, 0)
// timeline: fragmento arranca en el tiempo real de su 1ª palabra (src.start=0, in_point=10)
assert.equal(caps[0].start, 0)     // 'uno' en 10.0 → 10-10
assert.equal(caps[1].start, 2)     // 'tres' en 12.0 → 12-10
assert.equal(caps[2].start, 4)     // 'cinco' en 14.0 → 14-10
// duración real del fragmento: de su 1ª a su última palabra
assert.equal(caps[0].out_point, 1)   // 'uno'..'dos': 10.0 → 11.0
assert.equal(caps[2].out_point, 2)   // 'cinco'..'seis': 14.0 → 16.0

// (4) sin solapes: fin(relativo→abs) de un fragmento <= inicio del siguiente
const abs = caps.map((c) => ({ s: c.start, e: c.start + c.out_point }))
assert.ok(abs[0].e <= abs[1].s + 1e-9)
assert.ok(abs[1].e <= abs[2].s + 1e-9)

// (5) origin conservado y trazable.
for (let i = 0; i < caps.length; i++) {
  assert.equal(caps[i].origin.transcript_id, 'tr_test')
  assert.equal(caps[i].origin.segment_index, 0)
  assert.equal(caps[i].origin.fragment_index, i)
  assert.deepEqual(caps[i].origin.source_range, { start: 10, end: 16 })
}
// word_range no se solapa y cubre las 6 palabras sin huecos.
assert.deepEqual(caps.map((c) => c.origin.word_range), [[0, 2], [2, 4], [4, 6]])

console.log('words fragmentation: real timing ok')

// (6) FALLBACK: sin words[] → reparto uniforme idéntico al comportamiento previo.
const noWords = textClipsFromTranscript(
  { start: 0, in_point: 0, out_point: 6 },
  [{ start: 0, end: 6, text: 'uno dos tres cuatro cinco seis' }],
  'T1', { font: 'Arial', max_words: 2 },
)
assert.equal(noWords.length, 3)
assert.deepEqual(noWords.map((c) => c.start), [0, 2, 4])
assert.deepEqual(noWords.map((c) => c.words.length), [0, 0, 0])   // sin timing inventado
assert.equal(noWords[0].origin.transcript_id, null)              // origin igual se conserva

// Re-split de un fragmento que ya trae words[] + origin: mantiene trazabilidad.
const parent = {
  id: 'p1', track_id: 'T1', kind: 'text', text: 'a b c d', start: 5, in_point: 0, out_point: 4,
  style: {}, words: [
    { text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 },
    { text: 'c', start: 2, end: 3 }, { text: 'd', start: 3, end: 4 },
  ],
  origin: { transcript_id: 'tr_test', segment_index: 3, word_range: [10, 14] },
}
const re = splitClipByMaxWords(parent, 2)
assert.equal(re.length, 2)
assert.deepEqual(re.map((c) => c.words.map((w) => w.text)), [['a', 'b'], ['c', 'd']])
assert.equal(re[0].words[0].start, 0)         // relativo al nuevo fragmento
assert.equal(re[1].start, 7)                  // base 5 + 'c' en 2
// word_range sigue siendo absoluto al segmento original (offset 10 preservado).
assert.deepEqual(re.map((c) => c.origin.word_range), [[10, 12], [12, 14]])

console.log('words fragmentation: fallback + re-split ok')
