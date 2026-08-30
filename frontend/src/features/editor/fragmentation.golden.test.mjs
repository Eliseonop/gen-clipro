// GOLDEN parity: el frontend (textClipsFromTranscript) debe producir exactamente
// lo mismo que el backend (fragment.py). Ambos verifican shared/fragmentation_cases.json.
// Si una implementación cambia y diverge, este test (o el de Python) falla.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { textClipsFromTranscript } from './editorModel.js'

const casesPath = fileURLToPath(new URL('../../../../shared/fragmentation_cases.json', import.meta.url))
const { cases } = JSON.parse(readFileSync(casesPath, 'utf8'))

const ORIGIN_KEYS = ['transcript_id', 'segment_index', 'fragment_index', 'word_range', 'source_range']
function norm(c) {
  return {
    text: c.text,
    start: c.start,
    out_point: c.out_point,
    words: (c.words || []).map((w) => ({ text: w.text, start: w.start, end: w.end })),
    origin: Object.fromEntries(ORIGIN_KEYS.map((k) => [k, c.origin[k]])),
  }
}

for (const cs of cases) {
  const transcript = cs.transcript_id == null ? null : { id: cs.transcript_id }
  const got = textClipsFromTranscript(cs.src, cs.segments, cs.track_id, cs.style, transcript)
  assert.deepEqual(got.map(norm), cs.expected, cs.name)
}

console.log('fragmentation golden parity ok')
