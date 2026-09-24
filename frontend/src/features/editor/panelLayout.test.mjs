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

// Disposiciones del workspace: el signo del arrastre sigue al lado del panel
{
  const { WORKSPACE_PRESETS, workspacePreset, readWorkspacePreset, writeWorkspacePreset } = await import('./panelLayout.js')
  assert.equal(workspacePreset('nope').id, 'default')
  assert.ok(WORKSPACE_PRESETS.length >= 4)
  const o = { materials: 380, inspector: 340, bottom: 240, crops: 268 }
  const b = { workW: 1600, bottomW: 1600, editorH: 900, topbarH: 44 }
  assert.equal(applyPanelDrag('materials', o, 40, 0, b, 'mirror').materials, 340)
  assert.equal(applyPanelDrag('inspector', o, 40, 0, b, 'main-right').inspector, 380)
  assert.equal(applyPanelDrag('inspector', o, 40, 0, b).inspector, 300)
  const mem = new Map()
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  assert.equal(readWorkspacePreset(st), 'default')
  writeWorkspacePreset(st, 'main-left')
  assert.equal(readWorkspacePreset(st), 'main-left')
  writeWorkspacePreset(st, 'bogus')
  assert.equal(readWorkspacePreset(st), 'default')
}

// Main a toda altura: el separador del inspector redimensiona el Main
{
  const o = { materials: 380, inspector: 340, bottom: 240, crops: 268, main: 440 }
  const b = { workW: 1600, bottomW: 1000, editorH: 900, topbarH: 44 }
  const r = applyPanelDrag('inspector', o, -60, 0, b, 'tall-main')
  assert.equal(r.main, 500)
  assert.equal(r.inspector, 340)
  const tightMain = clampPanelLayout({ ...o, main: 3000 }, b)
  assert.ok(tightMain.materials + tightMain.main + PANEL_MIN.inspector <= 1600)
}
