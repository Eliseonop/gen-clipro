# Pila de clips en la misma pista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la timeline del montaje, si varios clips de la **misma pista** se solapan en el tiempo, se ven como bandas apiladas (librero) y se pueden abrir en mini-filas, sin crear pistas ni mover `start`.

**Architecture:** Lógica pura en `clipStack.js` (solape, grupos conexos, empaquetado, layout Y). `EdTimeline` solo pinta: contraído = clip de delante + bandas en tiempo real; abierto = la pista crece y esos clips pasan a mini-filas. `expandedClusterId` es estado React local. No se toca el JSON de la timeline, ni `reframe` / `master` / `dual_crop` / `split_layout`, ni preview/export.

**Tech Stack:** React (Vite), tests Node `assert` (`node archivo.test.mjs`), CSS en `editor.css`.

## Global Constraints

- **No mezclar con receta:** no editar `recipeLayout.js`, `panning.js`, `reframe`, `master`, `dual_crop`, `split_layout`, `ClipEditor`, `compose.py`, `videosAt`, `topVideoAt`, ni `editorModel.js` (makeClip / newReframe).
- No crear pistas. No cambiar `start`, `track_id`, duración, ni orden del array `clips` (el orden de pintura/composición se mantiene).
- Sin badge “N clips”. Bandas reales en X = tiempo real del clip oculto.
- Una pila abierta como máximo. UI no persistida.
- Aplica a vídeo, audio y texto.
- Spec: `docs/superpowers/specs/2026-08-30-timeline-clip-stack-design.md`.
- Tests: `node frontend/src/features/editor/clipStack.test.mjs` (cwd: repo root o `frontend/`; usar ruta al archivo).
- No tocar `git config`. No commitear salvo petición explícita.

---

## File map

- Create: `frontend/src/features/editor/clipStack.js` — solape, clusters, pack, frente, peeks, resolve expand, geometría Y, `stackViewForTrack`.
- Create: `frontend/src/features/editor/clipStack.test.mjs`
- Modify: `frontend/src/features/editor/EdTimeline.jsx` — layout por clip, altura de lane/cabecera, expand/collapse.
- Modify: `frontend/src/features/editor/editor.css` — `.ed-clip` con `top`/`height` explícitos; variantes `peek` / `front`; `.ed-stack-toggle`.
- No modificar: `editorModel.js`, `VideoEditor.jsx` (el estado de pila vive en `EdTimeline`), backend, taller.

`clipStack.js` importa solo `clipEnd` de `editorModel.js`. No al revés.

---

### Task 1: Solape y grupos conexos

**Files:**
- Create: `frontend/src/features/editor/clipStack.js`
- Create: `frontend/src/features/editor/clipStack.test.mjs`

**Interfaces:**
- Consumes: `clipEnd(c)` desde `./editorModel.js`.
- Produces:
  - `clipsOverlap(a, b) → boolean`
  - `overlapClusters(clips, trackId) → { id: string, clipIds: string[] }[]`
  - Helper de test (solo en el test): `clip(id, trackId, start, dur)`.

- [ ] **Step 1: Escribir el test que falla**

Create `frontend/src/features/editor/clipStack.test.mjs`:

```javascript
import assert from 'node:assert/strict'
import { clipsOverlap, overlapClusters } from './clipStack.js'

function clip(id, trackId, start, dur) {
  return { id, track_id: trackId, start, in_point: 0, out_point: dur }
}

assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4)), true)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 2, 5)), true)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 1, 2)), true)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 10, 5)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V1', 12, 8)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('b', 'V2', 3, 4)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 0), clip('b', 'V1', 0, 5)), false)
assert.equal(clipsOverlap(clip('a', 'V1', 0, 10), clip('a', 'V1', 0, 10)), false)

const row = [
  clip('a', 'V1', 0, 10),
  clip('b', 'V1', 3, 4),
  clip('c', 'V1', 8, 4),
  clip('d', 'V1', 20, 5),
  clip('e', 'V1', 22, 3),
  clip('f', 'V2', 0, 30),
]
const v1 = overlapClusters(row, 'V1')
assert.equal(v1.length, 2)
assert.deepEqual(v1[0].clipIds.slice().sort(), ['a', 'b', 'c'])
assert.equal(v1[0].id, ['a', 'b', 'c'].sort().join('|'))
assert.deepEqual(v1[1].clipIds.slice().sort(), ['d', 'e'])
assert.equal(overlapClusters(row, 'V2').length, 0)
assert.equal(overlapClusters([], 'V1').length, 0)

console.log('clipStack overlap ok')
```

Notas: A 0–10 pisa B 3–7 y C 8–12 (C empieza en 8, A acaba en 10). B 3–7 no pisa C 8–12, pero el grupo es conexo A–B–C. D/E son otro grupo. F está en otra pista.

- [ ] **Step 2: Correr el test y ver que falla**

Run: `node frontend/src/features/editor/clipStack.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` o `clipsOverlap is not a function`.

- [ ] **Step 3: Implementación mínima**

Create `frontend/src/features/editor/clipStack.js`:

```javascript
import { clipEnd } from './editorModel.js'

export function clipsOverlap(a, b) {
  if (!a || !b || a.id === b.id) return false
  if (a.track_id !== b.track_id) return false
  const ae = clipEnd(a)
  const be = clipEnd(b)
  if (ae <= a.start || be <= b.start) return false
  return a.start < be && b.start < ae
}

function clusterKey(ids) {
  return [...ids].sort().join('|')
}

export function overlapClusters(clips, trackId) {
  const row = (clips || []).filter((c) => c.track_id === trackId)
  const n = row.length
  const parent = row.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const unite = (i, j) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[ri] = rj
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (clipsOverlap(row[i], row[j])) unite(i, j)
    }
  }
  const buckets = new Map()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!buckets.has(r)) buckets.set(r, [])
    buckets.get(r).push(row[i].id)
  }
  const groups = []
  for (const clipIds of buckets.values()) {
    if (clipIds.length < 2) continue
    groups.push({ id: clusterKey(clipIds), clipIds })
  }
  groups.sort((ga, gb) => {
    const minStart = (ids) => Math.min(...ids.map((id) => row.find((c) => c.id === id).start))
    return minStart(ga.clipIds) - minStart(gb.clipIds)
  })
  return groups
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `node frontend/src/features/editor/clipStack.test.mjs`

Expected: `clipStack overlap ok` y exit 0.

---

### Task 2: Frente, peeks, empaquetado y expand persistente

**Files:**
- Modify: `frontend/src/features/editor/clipStack.js`
- Modify: `frontend/src/features/editor/clipStack.test.mjs`

**Interfaces:**
- Consumes: `clipsOverlap`, `overlapClusters`.
- Produces:
  - `frontClipId(clusterClipIds, clips, selectedIds) → string | null`
  - `peekClipIds(clusterClipIds, clips, frontId) → string[]` (máximo 2, orden atrás→delante según orden en `clips`)
  - `packClusterLanes(clips) → Map<string, number>` (lane 0…n-1)
  - `resolveExpandedClusterId(prevId, clusters) → string | null`

- [ ] **Step 1: Ampliar el test**

Append to `clipStack.test.mjs` (imports + casos):

```javascript
import {
  clipsOverlap, overlapClusters,
  frontClipId, peekClipIds, packClusterLanes, resolveExpandedClusterId,
} from './clipStack.js'

const ordered = [clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4), clip('c', 'V1', 5, 3)]
assert.equal(frontClipId(['a', 'b', 'c'], ordered, []), 'c')
assert.equal(frontClipId(['a', 'b', 'c'], ordered, ['a']), 'a')
assert.equal(frontClipId(['a', 'b', 'c'], ordered, ['a', 'b']), 'b')
assert.equal(frontClipId(['a', 'b', 'c'], ordered, ['z']), 'c')
assert.equal(frontClipId([], ordered, []), null)

assert.deepEqual(peekClipIds(['a', 'b', 'c'], ordered, 'c'), ['a', 'b'])
const four = [...ordered, clip('d', 'V1', 6, 2)]
assert.deepEqual(peekClipIds(['a', 'b', 'c', 'd'], four, 'd'), ['b', 'c'])

const packedTwo = packClusterLanes([clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4)])
assert.equal(packedTwo.size, 2)
assert.notEqual(packedTwo.get('a'), packedTwo.get('b'))

const A = clip('a', 'V1', 0, 5)
const B = clip('b', 'V1', 4, 4)
const C = clip('c', 'V1', 7, 5)
const packed = packClusterLanes([A, B, C])
assert.equal(Math.max(...packed.values()) + 1, 2)
assert.equal(packed.get('a'), packed.get('c'))
assert.notEqual(packed.get('a'), packed.get('b'))

const clusters = [
  { id: 'a|b', clipIds: ['a', 'b'] },
  { id: 'c|d', clipIds: ['c', 'd'] },
]
assert.equal(resolveExpandedClusterId('a|b', clusters), 'a|b')
assert.equal(resolveExpandedClusterId('a|b', [
  { id: 'a|b|x', clipIds: ['a', 'b', 'x'] },
]), 'a|b|x')
assert.equal(resolveExpandedClusterId('a|b|x', [
  { id: 'a|b', clipIds: ['a', 'b'] },
]), 'a|b')
assert.equal(resolveExpandedClusterId('a|b', [
  { id: 'c|d', clipIds: ['c', 'd'] },
]), null)

console.log('clipStack pack/front ok')
```

- [ ] **Step 2: Correr y ver fallo** (`frontClipId is not a function`).

- [ ] **Step 3: Añadir las funciones a `clipStack.js`**

```javascript
export function frontClipId(clusterClipIds, clips, selectedIds) {
  const inCluster = new Set(clusterClipIds || [])
  if (!inCluster.size) return null
  const selected = new Set(selectedIds || [])
  let last = null
  let lastSel = null
  for (const c of clips || []) {
    if (!inCluster.has(c.id)) continue
    last = c.id
    if (selected.has(c.id)) lastSel = c.id
  }
  return lastSel || last
}

export function peekClipIds(clusterClipIds, clips, frontId) {
  const inCluster = new Set(clusterClipIds || [])
  const hidden = []
  for (const c of clips || []) {
    if (!inCluster.has(c.id) || c.id === frontId) continue
    hidden.push(c.id)
  }
  return hidden.slice(-2)
}

export function packClusterLanes(clips) {
  const list = [...(clips || [])].sort((a, b) => (a.start - b.start) || String(a.id).localeCompare(String(b.id)))
  const laneEnds = []
  const out = new Map()
  for (const c of list) {
    const end = clipEnd(c)
    let placed = false
    for (let i = 0; i < laneEnds.length; i++) {
      if (c.start >= laneEnds[i]) {
        laneEnds[i] = end
        out.set(c.id, i)
        placed = true
        break
      }
    }
    if (!placed) {
      out.set(c.id, laneEnds.length)
      laneEnds.push(end)
    }
  }
  return out
}

export function resolveExpandedClusterId(prevId, clusters) {
  if (!prevId) return null
  const list = clusters || []
  if (list.some((c) => c.id === prevId)) return prevId
  const prevIds = prevId.split('|').filter(Boolean)
  const prevSet = new Set(prevIds)
  const grew = list.find((c) => prevIds.every((id) => c.clipIds.includes(id)))
  if (grew) return grew.id
  const shrunk = list.find((c) => {
    let n = 0
    for (const id of c.clipIds) if (prevSet.has(id)) n += 1
    return n >= 2
  })
  return shrunk ? shrunk.id : null
}
```

- [ ] **Step 4: Tests en verde.**

Run: `node frontend/src/features/editor/clipStack.test.mjs`

Expected: ambas líneas `ok` y exit 0.

---

### Task 3: Geometría Y + vista por pista

**Files:**
- Modify: `frontend/src/features/editor/clipStack.js`
- Modify: `frontend/src/features/editor/clipStack.test.mjs`

**Interfaces:**
- Consumes: funciones de Task 1–2.
- Produces:
  - Constantes: `STACK_PAD = 5`, `PEEK_GUTTER = 12`, `PEEK_BAND_H = 8`, `PEEK_LIFT = 4`, `SUB_ROW_GAP = 3`, `PEEK_SPINE = 2`.
  - `subRowHeight(rowH) → number` — `Math.max(28, rowH - 6)`.
  - `trackLaneHeight(rowH, expandedLaneCount) → number` — si `expandedLaneCount < 2` → `rowH`; si no → `STACK_PAD * 2 + n * subRowHeight(rowH) + (n - 1) * SUB_ROW_GAP`.
  - `clusterSpan(clipIds, clips) → { start, end }`.
  - `stackViewForTrack(clips, trackId, selectedIds, expandedClusterId, rowH) → { height, liveExpandedId, layouts: Map<clipId, Layout>, clusters, toggle }`.
  - `Layout`: `{ variant: 'solo'|'front'|'peek'|'expanded'|'hidden', top, height, clusterId, z, peekExtra?: boolean }`.
  - `toggle`: `{ clusterId, start, end } | null` (solo si este track tiene el grupo abierto).
  - `liveExpandedId`: id resuelto **si el grupo abierto es de esta pista**, si no `null`.

Reglas de layout (contraído, pista altura `rowH`):

- `solo`: `top = STACK_PAD`, `height = rowH - 2 * STACK_PAD` (igual que hoy).
- `front`: `top = STACK_PAD`, `height = rowH - STACK_PAD - PEEK_GUTTER`.
- `peek` índice `i` en `peekClipIds` (0 = detrás): `top = rowH - PEEK_GUTTER + (i === 0 && peekCount === 2 ? PEEK_LIFT : 0)`, `height = PEEK_BAND_H + (peekExtra ? PEEK_SPINE : 0)`, `peekExtra` si hay más de 2 ocultos.
- `hidden`: no se pinta (layout presente para no caer en solo).
- `expanded` lane `k`: `top = STACK_PAD + k * (subRowHeight(rowH) + SUB_ROW_GAP)`, `height = subRowHeight(rowH)`.

z: peek `1 + i`, front `4`, expanded `2`, solo `1`. El CSS `.ed-clip.sel` sigue subiendo el seleccionado.

- [ ] **Step 1: Tests de geometría**

```javascript
import {
  STACK_PAD, PEEK_GUTTER, PEEK_BAND_H,
  subRowHeight, trackLaneHeight, clusterSpan, stackViewForTrack,
} from './clipStack.js'

assert.equal(trackLaneHeight(52, 0), 52)
assert.equal(trackLaneHeight(52, 1), 52)
assert.ok(trackLaneHeight(52, 2) > 52)

const span = clusterSpan(['a', 'b'], [clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4)])
assert.equal(span.start, 0)
assert.equal(span.end, 10)

const rowH = 52
const clips = [clip('a', 'V1', 0, 10), clip('b', 'V1', 3, 4), clip('z', 'V1', 20, 2)]
const collapsed = stackViewForTrack(clips, 'V1', [], null, rowH)
assert.equal(collapsed.height, 52)
assert.equal(collapsed.liveExpandedId, null)
assert.equal(collapsed.layouts.get('z').variant, 'solo')
assert.equal(collapsed.layouts.get('b').variant, 'front')
assert.equal(collapsed.layouts.get('a').variant, 'peek')
assert.equal(collapsed.layouts.get('b').height, rowH - STACK_PAD - PEEK_GUTTER)
assert.ok(collapsed.layouts.get('a').top >= rowH - PEEK_GUTTER)
assert.equal(collapsed.toggle, null)

const open = stackViewForTrack(clips, 'V1', [], collapsed.clusters[0].id, rowH)
assert.equal(open.liveExpandedId, collapsed.clusters[0].id)
assert.ok(open.height > rowH)
assert.equal(open.layouts.get('a').variant, 'expanded')
assert.equal(open.layouts.get('b').variant, 'expanded')
assert.equal(open.layouts.get('z').variant, 'solo')
assert.ok(open.layouts.get('z').top <= STACK_PAD + 1)
assert.notEqual(open.layouts.get('a').top, open.layouts.get('b').top)
assert.equal(open.toggle.clusterId, open.liveExpandedId)
assert.equal(open.toggle.start, 0)

console.log('clipStack layout ok')
```

- [ ] **Step 2: Fallo esperado** (`STACK_PAD is not exported`).

- [ ] **Step 3: Implementar constantes + `stackViewForTrack`**

```javascript
export const STACK_PAD = 5
export const PEEK_GUTTER = 12
export const PEEK_BAND_H = 8
export const PEEK_LIFT = 4
export const SUB_ROW_GAP = 3
export const PEEK_SPINE = 2

export function subRowHeight(rowH) {
  return Math.max(28, rowH - 6)
}

export function trackLaneHeight(rowH, expandedLaneCount) {
  const n = expandedLaneCount || 0
  if (n < 2) return rowH
  const sub = subRowHeight(rowH)
  return STACK_PAD * 2 + n * sub + (n - 1) * SUB_ROW_GAP
}

export function clusterSpan(clipIds, clips) {
  const want = new Set(clipIds || [])
  let start = Infinity
  let end = -Infinity
  for (const c of clips || []) {
    if (!want.has(c.id)) continue
    start = Math.min(start, c.start)
    end = Math.max(end, clipEnd(c))
  }
  if (!Number.isFinite(start)) return { start: 0, end: 0 }
  return { start, end }
}

export function stackViewForTrack(clips, trackId, selectedIds, expandedClusterId, rowH) {
  const list = clips || []
  const clusters = overlapClusters(list, trackId)
  const resolved = resolveExpandedClusterId(expandedClusterId, clusters)
  const expanded = clusters.find((c) => c.id === resolved) || null
  const members = expanded ? list.filter((c) => expanded.clipIds.includes(c.id) && c.track_id === trackId) : []
  const packed = expanded ? packClusterLanes(members) : new Map()
  const laneCount = packed.size ? Math.max(...packed.values()) + 1 : 0
  const height = trackLaneHeight(rowH, laneCount)
  const clusterOf = new Map()
  for (const cl of clusters) {
    for (const id of cl.clipIds) clusterOf.set(id, cl)
  }
  const layouts = new Map()
  for (const c of list) {
    if (c.track_id !== trackId) continue
    const cl = clusterOf.get(c.id)
    if (!cl) {
      layouts.set(c.id, { variant: 'solo', top: STACK_PAD, height: rowH - 2 * STACK_PAD, clusterId: null, z: 1 })
      continue
    }
    if (expanded && cl.id === expanded.id) {
      const k = packed.get(c.id) || 0
      const sub = subRowHeight(rowH)
      layouts.set(c.id, {
        variant: 'expanded',
        top: STACK_PAD + k * (sub + SUB_ROW_GAP),
        height: sub,
        clusterId: cl.id,
        z: 2,
      })
      continue
    }
    const front = frontClipId(cl.clipIds, list, selectedIds)
    const peeks = peekClipIds(cl.clipIds, list, front)
    const hiddenTotal = cl.clipIds.length - 1
    const peekExtra = hiddenTotal > 2
    if (c.id === front) {
      layouts.set(c.id, {
        variant: 'front',
        top: STACK_PAD,
        height: rowH - STACK_PAD - PEEK_GUTTER,
        clusterId: cl.id,
        z: 4,
      })
    } else {
      const i = peeks.indexOf(c.id)
      if (i < 0) {
        layouts.set(c.id, { variant: 'hidden', top: 0, height: 0, clusterId: cl.id, z: 0 })
      } else {
        const peekCount = peeks.length
        const top = rowH - PEEK_GUTTER + (i === 0 && peekCount === 2 ? PEEK_LIFT : 0)
        layouts.set(c.id, {
          variant: 'peek',
          top,
          height: PEEK_BAND_H + (peekExtra ? PEEK_SPINE : 0),
          clusterId: cl.id,
          z: 1 + i,
          peekExtra,
        })
      }
    }
  }
  const toggle = expanded
    ? { clusterId: expanded.id, ...clusterSpan(expanded.clipIds, members) }
    : null
  return {
    height,
    liveExpandedId: expanded ? expanded.id : null,
    layouts,
    clusters,
    toggle,
  }
}
```

- [ ] **Step 4: Tests en verde** (`clipStack overlap/pack/layout ok`).

El orden del array manda: sin selección, el de delante es el último del grupo en `clips` (`b` en el fixture).

---

### Task 4: Pintar en `EdTimeline` (bandas + cajón)

**Files:**
- Modify: `frontend/src/features/editor/EdTimeline.jsx`
- Modify: `frontend/src/features/editor/editor.css`

**Interfaces:**
- Consumes: `stackViewForTrack` de `./clipStack.js`.
- Produces: cada pista usa `view.height` en lane y cabecera; cada clip visible (`variant !== 'hidden'`) recibe `top`/`height`/`variant`/`clusterId`.

- [ ] **Step 1: CSS**

En `.ed-clip` quitar `top: 5px; bottom: 5px` (el inline style pone `top` y `height`). Añadir al final del bloque timeline:

```css
.ed-clip.peek {
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 1px 0 rgba(0,0,0,0.45);
  border-top-left-radius: 2px;
  border-top-right-radius: 4px;
}
.ed-clip.peek .ed-clip-handle { display: none; }
.ed-clip.peek .ed-clip-wave { display: none; }
.ed-clip.front { box-shadow: 0 4px 10px rgba(0,0,0,0.35); }
.ed-stack-toggle {
  position: absolute; z-index: 5;
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0;
  border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;
  background: rgba(8,10,18,0.85); color: #fff; cursor: pointer;
}
.ed-stack-toggle:hover { background: rgba(20,24,40,0.95); }
.ed-track-head.stack-open,
.ed-lane.stack-open { max-height: none; }
```

`.ed-track-head` hoy tiene `max-height: var(--ed-row-h)`: el inline `style={{ height, minHeight, maxHeight: height }}` debe ganar. Si no, la clase `stack-open` pone `max-height: none`.

- [ ] **Step 2: Estado y vistas en `EdTimeline`**

Importar `stackViewForTrack`. Dentro del componente:

```javascript
const [expandedClusterId, setExpandedClusterId] = useState(null)
const viewsByTrack = new Map()
for (const t of rows) {
  viewsByTrack.set(t.id, stackViewForTrack(clips, t.id, selectedIds, expandedClusterId, rowH))
}
```

Cabecera: para cada `t`, `const vh = viewsByTrack.get(t.id).height` y

```javascript
style={{ height: vh, minHeight: vh, maxHeight: vh }}
className={`ed-track-head ${t.kind} ... ${viewsByTrack.get(t.id).liveExpandedId ? 'stack-open' : ''}`}
```

Lane: mismo `height`/`minHeight` y clase `stack-open`. `overflow: visible` en `.ed-lane` (ya lo es por defecto).

- [ ] **Step 3: `ClipBlock` con layout**

Sustituir el map de clips por:

```javascript
{clips.filter((c) => c.track_id === t.id).map((c) => {
  const lay = viewsByTrack.get(t.id).layouts.get(c.id)
  if (!lay || lay.variant === 'hidden') return null
  return (
    <ClipBlock key={c.id} clip={c} pps={pps} layout={lay}
      selected={selectedIds.includes(c.id)} selKfId={selKfId}
      onDown={(e, mode) => startClipDrag(e, c, mode)}
      onPeek={() => setExpandedClusterId(lay.clusterId)}
      onKfDown={(e, kf, idx) => startKfDrag(e, c, kf, idx)}
      onContext={(e) => onContextClip?.(e, c)}
      onDouble={() => onDoubleClip?.(c)} />
  )
})}
{viewsByTrack.get(t.id).toggle && (
  <button type="button" className="ed-stack-toggle"
    data-cluster-id={viewsByTrack.get(t.id).toggle.clusterId}
    style={{ left: viewsByTrack.get(t.id).toggle.start * pps, top: 2 }}
    title="Cerrar pila"
    onPointerDown={(e) => { e.stopPropagation(); setExpandedClusterId(null) }}>
    <Icon name="expand_less" size={14} />
  </button>
)}
```

`ClipBlock`:

- `style={{ left, width: w, top: layout.top, height: layout.height, zIndex: layout.z }}`
- `className` incluye `layout.variant` (`solo` no hace falta clase extra).
- `data-cluster-id={layout.clusterId || undefined}`
- Si `layout.variant === 'peek'`: `onPointerDown` hace `e.stopPropagation(); onPeek()`. Sin handles, sin wave, sin keyframes. `title` = nombre del clip.
- Si no: comportamiento actual (handles, wave, kf).

- [ ] **Step 4: Comprobar tests de stack siguen pasando** (no hay test de React). Lint mental: no importar recipe/reframe.

---

### Task 5: Abrir / cerrar

**Files:**
- Modify: `frontend/src/features/editor/EdTimeline.jsx`

**Interfaces:**
- Consumes: `setExpandedClusterId`, `viewsByTrack`, `data-cluster-id`.
- Produces: clic en peek abre (y cierra la anterior); chevron cierra; clic en regla / vacío de lane / clip de **otro** grupo cierra; clic en clip del grupo abierto no cierra.

- [ ] **Step 1: Cerrar al pinchar fuera del grupo**

`onRulerDown`: primera línea `setExpandedClusterId(null)`.

Lane `onPointerDown`:

```javascript
onPointerDown={(e) => {
  onSelectTrack(t.id)
  if (e.target === e.currentTarget) setExpandedClusterId(null)
}}
```

Al inicio de `startClipDrag`, después de `e.stopPropagation()`:

```javascript
const home = clips.find((x) => x.id === clip.id)
const view = viewsByTrack.get(home?.track_id)
const lay = view?.layouts.get(clip.id)
if (lay?.variant !== 'peek' && expandedClusterId && lay?.clusterId !== expandedClusterId) {
  setExpandedClusterId(null)
}
```

`viewsByTrack` se recalcula cada render; `startClipDrag` es una función del render actual, el closure es válido al hacer pointerdown.

Peek ya hace `setExpandedClusterId(lay.clusterId)` (una sola pila abierta).

- [ ] **Step 2: No cerrar al editar el grupo abierto** — el clip expandido tiene `clusterId === expandedClusterId`; `startClipDrag` no llama a `setExpandedClusterId(null)`.

No hace falta test Node. Verificación en Task 6.

---

### Task 6: Verificar en el navegador

**Files:** ninguno nuevo.

- [ ] **Step 1: Levantar el frontend** (`npm run dev` en `frontend/` si no está).

- [ ] **Step 2: Flujo manual**

1. Pista V1: dos clips que se pisan (parcial y uno contenido). Se ven bandas bajo el de delante, **solo** en el intervalo del oculto. Sin número “2”.
2. El de delante se arrastra y recorta. Clic en la banda abre mini-filas; la cabecera V1 crece; V2 no.
3. En abierto: seleccionar, recortar, borrar cada clip; `start` no salta de pista.
4. Chevron y clic en la regla cierran. Clic en un clip de la pila abierta no cierra.
5. Mover hasta que no se pisen → desaparece la pila.
6. Audio y texto: misma pila.
7. Dos grupos en V1: abrir uno no abre el otro; el cerrado se queda arriba.
8. Preview / encuadre / dual_crop / receta: igual que antes (no se ha tocado ese código).

- [ ] **Step 3: Tests**

Run: `node frontend/src/features/editor/clipStack.test.mjs`

Expected: tres `ok`, exit 0.

---

## Spec coverage

| Spec | Task |
|---|---|
| Solape real, no borde, misma pista | 1 |
| Grupo conexo, id estable, dos grupos | 1 |
| Frente = orden array / selección | 2 |
| Máx. 2 bandas + lomo extra | 2 + 3 |
| Resolve expand al crecer/encoger | 2 |
| Bandas en tiempo real, margen inferior | 3 + 4 |
| Cajón mini-filas, pack greedy | 2 + 3 + 4 |
| Altura por pista, otros clips arriba | 3 + 4 |
| Peek abre; frente se edita | 4 + 5 |
| Chevron + clic fuera; una pila | 5 |
| Sin persistir, sin receta, sin pistas nuevas | constraints + file map |
| Tests unitarios listados | 1–3 |
| Verificación UI | 6 |
