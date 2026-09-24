// Tamaños de paneles del editor. Se guardan en localStorage y se recortan
// para que el canvas y la timeline no desaparezcan al arrastrar.

export const PANEL_LAYOUT_KEY = 'vy:panel-layout'

export const PANEL_DEFAULTS = {
  materials: 380,
  inspector: 340,
  bottom: 240,
  crops: 268,
  main: 440,
}

export const PANEL_MIN = {
  materials: 240,
  inspector: 260,
  canvas: 280,
  bottom: 140,
  workspace: 180,
  crops: 180,
  timeline: 240,
}

export const PANEL_SPLIT = 8

const KEYS = ['materials', 'inspector', 'bottom', 'crops', 'main']

function num(v, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, 0), 4000)
}

export function parsePanelLayout(raw, defaults = PANEL_DEFAULTS) {
  let data = raw
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw) } catch { return { ...defaults } }
  }
  if (!data || typeof data !== 'object') return { ...defaults }
  const out = { ...defaults }
  for (const k of KEYS) out[k] = num(data[k], defaults[k])
  return out
}

export function clampPanelLayout(layout, box = {}, defaults = PANEL_DEFAULTS) {
  const cur = parsePanelLayout(layout, defaults)
  const workW = num(box.workW, 1200)
  const bottomW = num(box.bottomW, workW)
  const editorH = num(box.editorH, 800)
  const topbarH = num(box.topbarH, 44)

  const colSplit = PANEL_SPLIT * 2
  const maxMat = Math.max(PANEL_MIN.materials, workW - cur.inspector - PANEL_MIN.canvas - colSplit)
  const materials = Math.min(Math.max(cur.materials, PANEL_MIN.materials), maxMat)

  const maxInsp = Math.max(PANEL_MIN.inspector, workW - materials - PANEL_MIN.canvas - colSplit)
  const inspector = Math.min(Math.max(cur.inspector, PANEL_MIN.inspector), maxInsp)

  const availH = Math.max(PANEL_MIN.bottom + PANEL_MIN.workspace, editorH - topbarH - PANEL_SPLIT)
  const maxBottom = Math.max(PANEL_MIN.bottom, availH - PANEL_MIN.workspace)
  const bottom = Math.min(Math.max(cur.bottom, PANEL_MIN.bottom), maxBottom)

  const maxCrops = Math.max(PANEL_MIN.crops, bottomW - PANEL_MIN.timeline - PANEL_SPLIT)
  const crops = Math.min(Math.max(cur.crops, PANEL_MIN.crops), maxCrops)

  // Ancho del Main en "tall-main" (columna derecha de alto completo)
  const maxMain = Math.max(PANEL_MIN.canvas, workW - materials - PANEL_MIN.inspector - colSplit)
  const main = Math.min(Math.max(cur.main, PANEL_MIN.canvas), maxMain)

  return { materials, inspector, bottom, crops, main }
}

// Disposiciones del workspace (estilo CapCut). `mat`/`insp` = signo del
// arrastre horizontal: +1 si el panel queda a la IZQUIERDA de su separador
// (arrastrar a la derecha lo ensancha), -1 si queda a la derecha. `inspKey`: qué
// ancho mueve el separador del inspector (en "tall-main" se redimensiona el Main
// y el inspector se estira).
export const WORKSPACE_PRESET_KEY = 'vy:workspace-preset'

export const WORKSPACE_PRESETS = [
  { id: 'default', label: 'Predeterminado', desc: 'Materiales · Main · Inspector', mat: 1, insp: -1 },
  { id: 'main-right', label: 'Main a la derecha', desc: 'Materiales · Inspector · Main', mat: 1, insp: 1 },
  { id: 'main-left', label: 'Main a la izquierda', desc: 'Main · Materiales · Inspector', mat: -1, insp: -1 },
  { id: 'mirror', label: 'Invertido', desc: 'Inspector · Main · Materiales', mat: -1, insp: 1 },
  { id: 'tall-media', label: 'Materiales a toda altura', desc: 'Materiales junto a la timeline', mat: 1, insp: -1 },
  { id: 'tall-main', label: 'Main a toda altura', desc: 'Main a la derecha, de arriba abajo', mat: 1, insp: -1, inspKey: 'main' },
]

export function workspacePreset(id) {
  return WORKSPACE_PRESETS.find((p) => p.id === id) || WORKSPACE_PRESETS[0]
}

export function readWorkspacePreset(storage) {
  try {
    return workspacePreset(storage?.getItem?.(WORKSPACE_PRESET_KEY)).id
  } catch {
    return WORKSPACE_PRESETS[0].id
  }
}

export function writeWorkspacePreset(storage, id) {
  try {
    storage?.setItem?.(WORKSPACE_PRESET_KEY, workspacePreset(id).id)
  } catch { /* quota / modo privado */ }
}

export function applyPanelDrag(kind, origin, dx, dy, box, preset = 'default') {
  const p = workspacePreset(preset)
  const next = { ...origin }
  if (kind === 'materials') next.materials = origin.materials + p.mat * dx
  else if (kind === 'inspector') {
    const key = p.inspKey || 'inspector'
    next[key] = origin[key] + p.insp * dx
  }
  else if (kind === 'bottom') next.bottom = origin.bottom - dy
  else if (kind === 'crops') next.crops = origin.crops - dx
  return clampPanelLayout(next, box)
}

export function readPanelLayout(storage) {
  try {
    return parsePanelLayout(storage?.getItem?.(PANEL_LAYOUT_KEY))
  } catch {
    return { ...PANEL_DEFAULTS }
  }
}

export function writePanelLayout(storage, layout) {
  try {
    storage?.setItem?.(PANEL_LAYOUT_KEY, JSON.stringify(parsePanelLayout(layout)))
  } catch { /* quota / modo privado */ }
}
