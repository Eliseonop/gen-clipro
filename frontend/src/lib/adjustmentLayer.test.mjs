import assert from 'node:assert/strict'
import { adjustmentMatrix, applyMatrix, filterMatrix } from './clipFilters.js'
import { colorMatrix } from './clipAdjust.js'
import { videosAt } from './clipLayout.js'
import { clipSpeed, isGeneratedDurationClip, makeAdjustmentClip, trackKindForClip } from '../features/editor/editorModel.js'

// Capa de ajuste (#19). La matriz se compara con Python en test_adjustment_layer.py.
assert.equal(adjustmentMatrix({}), null, 'sin nada, no hace nada')
assert.equal(adjustmentMatrix({ filters: [{ id: 'noir', amount: 1 }], opacity: 0 }), null, 'intensidad 0')

// Solo filtros al 100 % = la matriz del filtro; la intensidad la mezcla con el original.
const c = [0.6, 0.4, 0.2]
const only = adjustmentMatrix({ filters: [{ id: 'sepia', amount: 1 }] })
assert.deepEqual(applyMatrix(only, c), applyMatrix(filterMatrix('sepia'), c))
const half = adjustmentMatrix({ filters: [{ id: 'sepia', amount: 1 }], opacity: 0.5 })
applyMatrix(half, c).forEach((v, i) => assert.ok(Math.abs(v - (c[i] + applyMatrix(only, c)[i]) / 2) < 1e-12))
// Los ajustes de color van después de los filtros.
const e = { hue: 90 }
const both = adjustmentMatrix({ filters: [{ id: 'warm', amount: 1 }], effects: e }, colorMatrix(e))
const hueOnly = adjustmentMatrix({ effects: e }, colorMatrix(e))
applyMatrix(both, c).forEach((v, i) => assert.ok(Math.abs(v - applyMatrix(hueOnly, applyMatrix(filterMatrix('warm'), c))[i]) < 1e-9))

// Modelo: pista de vídeo, duración libre, sin velocidad.
const clip = makeAdjustmentClip('V2', 1, 3)
assert.equal(clip.kind, 'adjustment')
assert.equal(trackKindForClip('adjustment'), 'video')
assert.ok(isGeneratedDurationClip(clip))
assert.equal(clipSpeed({ ...clip, speed: 4 }), 1)
assert.deepEqual([clip.start, clip.out_point, clip.opacity], [1, 3, 1])

// Entra en el orden de capas del preview (encima del vídeo de V1).
const tracks = [{ id: 'V1', kind: 'video' }, { id: 'V2', kind: 'video' }]
const video = { id: 'v', track_id: 'V1', kind: 'video', start: 0, in_point: 0, out_point: 10, speed: 1 }
assert.deepEqual(videosAt(2, [clip, video], tracks).map((x) => x.id), ['v', clip.id])
assert.deepEqual(videosAt(5, [clip, video], tracks).map((x) => x.id), ['v'], 'fuera de su tramo no está')

console.log('adjustmentLayer ok')
