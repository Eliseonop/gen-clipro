import assert from 'node:assert/strict'
import {
  PANEL_DEFAULTS, PANEL_LAYOUT_KEY, PANEL_MIN,
  applyPanelDrag, clampPanelLayout, parsePanelLayout, readPanelLayout, writePanelLayout,
} from './panelLayout.js'

assert.deepEqual(parsePanelLayout(null), PANEL_DEFAULTS)
assert.deepEqual(parsePanelLayout('nope'), PANEL_DEFAULTS)
assert.equal(parsePanelLayout('{"materials":420}').materials, 420)
assert.equal(parsePanelLayout('{"materials":420}').inspector, PANEL_DEFAULTS.inspector)

const tight = clampPanelLayout(
  { materials: 900, inspector: 900, bottom: 900, crops: 900 },
  { workW: 1000, bottomW: 1000, editorH: 700, topbarH: 44 },
)
assert.ok(tight.materials + tight.inspector + PANEL_MIN.canvas <= 1000)
assert.ok(tight.bottom <= 700)
assert.ok(tight.crops + PANEL_MIN.timeline <= 1000)
assert.ok(tight.materials >= PANEL_MIN.materials)
assert.ok(tight.inspector >= PANEL_MIN.inspector)

const origin = { materials: 380, inspector: 340, bottom: 240, crops: 268 }
const box = { workW: 1600, bottomW: 1600, editorH: 900, topbarH: 44 }
const widerMat = applyPanelDrag('materials', origin, 80, 0, box)
assert.equal(widerMat.materials, 460)
const widerInsp = applyPanelDrag('inspector', origin, -40, 0, box)
assert.equal(widerInsp.inspector, 380)
const tallerBottom = applyPanelDrag('bottom', origin, 0, -30, box)
assert.equal(tallerBottom.bottom, 270)
const narrowerCrops = applyPanelDrag('crops', origin, 40, 0, box)
assert.equal(narrowerCrops.crops, 228)

const store = new Map()
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, v) },
}
writePanelLayout(storage, { materials: 500, inspector: 500, bottom: 200, crops: 220 })
assert.equal(readPanelLayout(storage).materials, 500)
assert.equal(readPanelLayout(storage).inspector, 500)
assert.ok(store.get(PANEL_LAYOUT_KEY).includes('"materials":500'))

console.log('panelLayout ok')
