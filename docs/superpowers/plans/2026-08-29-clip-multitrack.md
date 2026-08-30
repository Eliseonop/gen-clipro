# Receta viva (taller + formato en montaje) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El taller guarda un tramo en aspecto original más una receta de 1–2 pistas (Entero/Custom); el montaje y el export aplican esa receta al formato actual de la timeline.

**Architecture:** Extender `Reframe`/`Keyframe` (no un modelo paralelo). Geometría compartida en `panning.js` y `reframe_math.py`. `dual_crop` + `keyframes2` siguen siendo las dos pistas. Clips nuevos llevan `master: true` y no se aplastan a 9:16 al generar. El montaje copia la receta al soltar solo si `master` es true.

**Tech Stack:** React (Vite), Node `assert` tests (`node archivo.test.mjs`), FastAPI/Pydantic, unittest desde `backend/` (`python -m unittest tests.<modulo>`).

## Global Constraints

- Máximo 2 pistas sincronizadas del mismo URL en esta oleada.
- `fit` ausente = `"cover"`. `master` ausente = clip legado (no copiar receta al timeline).
- `split_layout` default en clips nuevos: `"auto"` (9:16 apilado, horizontal lado a lado).
- El Dividir del montaje (corte en playhead, tecla S) no cambia de significado.
- Cortar en el taller sigue partiendo el tiempo.
- UI en español: Entero, Custom, Dividir, Cortar.
- No tocar `git config`. Commits solo con mensaje convencional `feat:` / `test:` / `fix:`.
- Spec: `docs/superpowers/specs/2026-08-29-clip-multitrack-design.md`.

---

## File map

- Create: `frontend/src/lib/recipeLayout.js` — `splitOrientationFor`, `syncedDualSlots`, `isMasterReframe`.
- Create: `backend/app/recipe_layout.py` — mismo contrato (espejo).
- Create: `frontend/src/lib/recipeLayout.test.mjs`
- Create: `backend/tests/test_recipe_layout.py`
- Modify: `frontend/src/lib/panning.js` — `frameAt.fit`, `drawReframe` contain + auto split.
- Modify: `frontend/src/lib/panning.test.mjs`
- Modify: `backend/app/reframe_math.py` — `frame_at` incluye `fit`.
- Modify: `backend/tests/test_reframe_math.py`
- Modify: `backend/app/schemas.py` — `Keyframe.fit`, `Reframe.master`, `Reframe.split_layout`.
- Modify: `frontend/src/features/video/composeModel.js` — `addSplitTrack`, `recipeFromLayers`.
- Modify: `frontend/src/features/video/composeModel.test.mjs`
- Modify: `frontend/src/features/video/clipCanvas.js` — tamaño de canvas y huecos auto.
- Modify: `frontend/src/features/video/ClipEditor.jsx` — Dividir, fit por punto, generate master.
- Modify: `backend/app/clipper.py` — corte sin crop 9:16 si `reframe.master`.
- Modify: `backend/app/compose.py` — auto split + contain en export.
- Modify: `frontend/src/features/editor/editorModel.js` — `newReframe` / `makeClip`.
- Modify: `frontend/src/features/editor/MaterialClipGrid.jsx` — payload con `reframe`.
- Modify: `frontend/src/features/editor/VideoEditor.jsx` — quitar checkbox dual; pasar reframe al drop.
- Modify: `frontend/src/features/editor/EdCrops.jsx` — selector de pista si dual.

---

### Task 1: Geometría de receta (JS + Python)

**Files:**
- Create: `frontend/src/lib/recipeLayout.js`
- Create: `frontend/src/lib/recipeLayout.test.mjs`
- Create: `backend/app/recipe_layout.py`
- Create: `backend/tests/test_recipe_layout.py`
- Modify: `frontend/src/lib/panning.js` (`frameAt`)
- Modify: `frontend/src/lib/panning.test.mjs`
- Modify: `backend/app/reframe_math.py`
- Modify: `backend/tests/test_reframe_math.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: `frameAt` actual `{ cx, cy, zoom, pan_mode }`.
- Produces:
  - `frameAt(...)` también `{ fit }` (`"cover"` | `"contain"`).
  - `splitOrientationFor(outAspect, reframe) → "vertical" | "horizontal"`.
  - `syncedDualSlots(outAspect, reframe) → ["top","bottom"] | ["left","right"]`.
  - `isMasterReframe(reframe) → boolean`.
  - `containDest(slotW, slotH, srcW, srcH) → { dx, dy, dw, dh }` relativo al hueco (origen 0,0).

- [ ] **Step 1: Test JS de layout y fit**

Create `frontend/src/lib/recipeLayout.test.mjs`:

```javascript
import assert from 'node:assert/strict'
import { splitOrientationFor, syncedDualSlots, isMasterReframe, containDest } from './recipeLayout.js'
import { frameAt } from './panning.js'

assert.equal(splitOrientationFor(9 / 16, { split_layout: 'auto' }), 'vertical')
assert.equal(splitOrientationFor(16 / 9, { split_layout: 'auto' }), 'horizontal')
assert.equal(splitOrientationFor(9 / 16, { split_layout: 'horizontal' }), 'horizontal')
assert.equal(splitOrientationFor(16 / 9, { split_orientation: 'vertical' }), 'vertical')

assert.deepEqual(syncedDualSlots(9 / 16, { split_layout: 'auto' }), ['top', 'bottom'])
assert.deepEqual(syncedDualSlots(16 / 9, { split_layout: 'auto' }), ['left', 'right'])

assert.equal(isMasterReframe({ master: true }), true)
assert.equal(isMasterReframe({}), false)
assert.equal(isMasterReframe(null), false)

const box = containDest(720, 1280, 1920, 1080)
assert.ok(box.dw <= 720 + 1e-6)
assert.ok(box.dh <= 1280 + 1e-6)
assert.ok(Math.abs(box.dw / box.dh - 1920 / 1080) < 1e-6)

const kfs = [
  { t: 0, cx: 0.2, cy: 0.5, zoom: 1, pan_mode: 'smooth', fit: 'contain' },
  { t: 2, cx: 0.8, cy: 0.5, zoom: 0.5, pan_mode: 'smooth', fit: 'cover' },
]
assert.equal(frameAt(kfs, 0.5).fit, 'contain')
assert.equal(frameAt(kfs, 1.5).fit, 'cover')
assert.equal(frameAt([], 0).fit, 'cover')

console.log('recipeLayout ok')
```

- [ ] **Step 2: Run JS test — debe fallar**

Run: `node frontend/src/lib/recipeLayout.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` para `recipeLayout.js` o `fit` undefined.

- [ ] **Step 3: Implementar `recipeLayout.js` y `fit` en `frameAt`**

`frontend/src/lib/recipeLayout.js`:

```javascript
export function isMasterReframe(reframe) {
  return !!(reframe && reframe.master === true)
}

export function splitOrientationFor(outAspect, reframe) {
  const layout = reframe?.split_layout
  if (layout === 'vertical' || layout === 'horizontal') return layout
  if (layout !== 'auto' && (reframe?.split_orientation === 'vertical' || reframe?.split_orientation === 'horizontal')) {
    return reframe.split_orientation
  }
  return outAspect < 1 ? 'vertical' : 'horizontal'
}

export function syncedDualSlots(outAspect, reframe) {
  return splitOrientationFor(outAspect, reframe) === 'vertical' ? ['top', 'bottom'] : ['left', 'right']
}

export function containDest(slotW, slotH, srcW, srcH) {
  const scale = Math.min(slotW / Math.max(1, srcW), slotH / Math.max(1, srcH))
  const dw = srcW * scale
  const dh = srcH * scale
  return { dx: (slotW - dw) / 2, dy: (slotH - dh) / 2, dw, dh }
}
```

In `panning.js` `frameAt`:

- Helper `fitOf(k, fallback = 'cover')` → `'contain'` si `k.fit === 'contain'`, si no `'cover'`.
- En cada `return` incluir `fit` (vacío → `'cover'`; interpolación suave/directa: `fitOf(b)` en el tramo, igual que `pan_mode` de llegada).
- `drawReframe` no se cambia en esta task (Task 4).

- [ ] **Step 4: Espejo Python + schemas**

`backend/app/recipe_layout.py` — mismas funciones (`is_master_reframe`, `split_orientation_for`, `synced_dual_slots`, `contain_dest`).

`Keyframe` añade `fit: Optional[str] = None`.

`Reframe` añade `master: bool = False` y `split_layout: str = "auto"`.

`frame_at` en `reframe_math.py` añade `"fit"` con la misma regla. Clips viejos sin campo → `"cover"`.

`backend/tests/test_recipe_layout.py` y ampliar `test_reframe_math.py` con el caso contain→cover (manda el de llegada).

- [ ] **Step 5: Run tests**

```
node frontend/src/lib/recipeLayout.test.mjs
node frontend/src/lib/panning.test.mjs
```

Desde `backend/`: `python -m unittest tests.test_recipe_layout tests.test_reframe_math -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```
git add frontend/src/lib/recipeLayout.js frontend/src/lib/recipeLayout.test.mjs frontend/src/lib/panning.js frontend/src/lib/panning.test.mjs backend/app/recipe_layout.py backend/app/reframe_math.py backend/app/schemas.py backend/tests/test_recipe_layout.py backend/tests/test_reframe_math.py
git commit -m "feat: receta de layout auto y fit contain/cover en keyframes"
```

---

### Task 2: `addSplitTrack` y serializar capas ↔ Reframe

**Files:**
- Modify: `frontend/src/features/video/composeModel.js`
- Modify: `frontend/src/features/video/composeModel.test.mjs`

**Interfaces:**
- Consumes: `makeLayer`, `MAX_LAYERS`, `layersFromInitial`.
- Produces:
  - `addSplitTrack(layers) → layers | null` — duplica la única capa (mismos url/trim/keyframes copiados; ids de kf se dejan para el caller).
  - `recipeFromLayers(layers) → reframe` — `{ zoom, zoom2, pan_mode, dual_crop, split_layout: 'auto', master: true, keyframes, keyframes2 }`.
  - `isSyncedDual(layers) → boolean` — 2 capas, mismo `url`, no `isSequentialLayout`.

- [ ] **Step 1: Tests que fallan**

Añadir al final de `composeModel.test.mjs`:

```javascript
import { addSplitTrack, recipeFromLayers, isSyncedDual } from './composeModel.js'

const one = [makeLayer({ id: 1, url: 'http://x', trimIn: 0, trimOut: 8, keyframes: [{ t: 1, cx: 0.4, cy: 0.5, zoom: 0.7, fit: 'cover' }] })]
assert.equal(addSplitTrack([one[0], { ...one[0], id: 2 }]), null)
const split = addSplitTrack(one)
assert.equal(split.length, 2)
assert.equal(split[0].url, split[1].url)
assert.equal(split[0].trimOut, 8)
assert.equal(split[1].trimOut, 8)
assert.equal(split[0].keyframes[0].cx, 0.4)
assert.equal(split[1].keyframes[0].cx, 0.4)
assert.notEqual(split[1].id, split[0].id)
assert.equal(isSyncedDual(split), true)
assert.equal(isSyncedDual(cut), false)

const rf = recipeFromLayers(split)
assert.equal(rf.master, true)
assert.equal(rf.dual_crop, true)
assert.equal(rf.split_layout, 'auto')
assert.equal(rf.keyframes2[0].cx, 0.4)

const singleRf = recipeFromLayers(one)
assert.equal(singleRf.dual_crop, false)
assert.equal(singleRf.master, true)
assert.equal((singleRf.keyframes2 || []).length, 0)

console.log('composeModel split track ok')
```

Importar `makeLayer` en el test si no está. `cut` ya existe más arriba en el archivo.

- [ ] **Step 2: Run — FAIL**

Run: `node frontend/src/features/video/composeModel.test.mjs`

Expected: `addSplitTrack is not a function`.

- [ ] **Step 3: Implementar**

```javascript
export function isSyncedDual(layers) {
  if (!layers || layers.length !== 2) return false
  if (isSequentialLayout(layers)) return false
  return (layers[0].url || '') === (layers[1].url || '')
}

export function addSplitTrack(layers) {
  if (!layers || layers.length !== 1 || layers.length >= MAX_LAYERS) return null
  const src = layers[0]
  const kfs = (src.keyframes || []).map((k) => ({ ...k }))
  return [
    { ...src, slot: 'top' },
    {
      ...src,
      id: null,
      slot: 'bottom',
      keyframes: kfs,
      label: `${src.label || 'Pista'} · B`,
    },
  ]
}

export function recipeFromLayers(layers) {
  const L = layers[0]
  const dual = isSyncedDual(layers)
  return {
    zoom: L?.zoom ?? 1,
    zoom2: dual ? (layers[1].zoom ?? L.zoom) : undefined,
    pan_mode: L?.pan_mode ?? 'smooth',
    dual_crop: dual,
    split_layout: 'auto',
    split_orientation: 'vertical',
    master: true,
    keyframes: (L?.keyframes || []).map((k) => ({
      t: k.t, cx: k.cx, cy: k.cy, zoom: k.zoom, pan_mode: k.pan_mode, fit: k.fit || 'cover',
    })),
    keyframes2: dual
      ? (layers[1].keyframes || []).map((k) => ({
          t: k.t, cx: k.cx, cy: k.cy, zoom: k.zoom, pan_mode: k.pan_mode, fit: k.fit || 'cover',
        }))
      : [],
  }
}
```

En `layersFromInitial`, si `initial.split_layout` o `initial.master`, copiarlos no es obligatorio aquí (el taller trabaja en capas). Si `initial.dual_crop`, seguir creando 2 capas como ahora.

- [ ] **Step 4: Run — PASS**

Run: `node frontend/src/features/video/composeModel.test.mjs`

- [ ] **Step 5: Commit**

```
git add frontend/src/features/video/composeModel.js frontend/src/features/video/composeModel.test.mjs
git commit -m "feat: Dividir duplica pista sincronizada y serializa receta master"
```

---

### Task 3: Preview del taller (canvas + Dividir + fit)

**Files:**
- Modify: `frontend/src/lib/panning.js` — `drawReframe`
- Modify: `frontend/src/features/video/clipCanvas.js`
- Modify: `frontend/src/features/video/ClipEditor.jsx`
- Modify: `frontend/src/features/editor/editorModel.js` — `newReframe` incluye `master: false`, `split_layout: 'auto'`

**Interfaces:**
- Consumes: `splitOrientationFor`, `containDest`, `addSplitTrack`, `recipeFromLayers`, `isSyncedDual`.
- Produces: canvas de resultado con tamaño según formato de preview; botón Dividir; `fit` en `writeKf` / panel del punto.

Preview size: `project.timeline?.width/height` o 720×1280. Canvas interno: mantener ~270 de ancho y alto `round(270 * h / w)`.

`drawReframe` (montaje y dual legado):

1. Calcular `orient = splitOrientationFor(outAspect, reframe)` si `dual_crop`.
2. Por cada pista, `fr = frameAt(...)`.
3. Si `fr.fit === 'contain'`: `containDest` dentro del rectángulo de la mitad (o canvas entero); `drawImage` del vídeo **completo**.
4. Si no: crop+fill actual (`geomFor` + `clampCenter`).

`clipCanvas.drawLayerInto`: el mismo criterio usando `layer.keyframes` y un `fit` interpolado. Destino = `outputRect`. Si `env.outAspect` y `env.syncedDual`, sustituir slots por `syncedDualSlots`.

- [ ] **Step 1: Test de containDest ya cubre la matemática.** Añadir en `panning.test.mjs` un test de `splitOrientationFor` reexportado o importar `recipeLayout` (ya en Task 1). No hace falta test de canvas 2D.

- [ ] **Step 2: `drawReframe` contain + auto**

Sustituir el bloque dual de `drawReframe` para usar `splitOrientationFor` en lugar de solo `reframe.split_orientation`.

En el draw simple y en el `draw` interno:

```javascript
if (fr.fit === 'contain') {
  const box = containDest(dw, dh, vw, vh)
  try { ctx.drawImage(video, 0, 0, vw, vh, dx + box.dx, dy + box.dy, box.dw, box.dh) } catch { /* noop */ }
  return
}
```

(`dx,dy,dw,dh` son el hueco de esa pista.)

- [ ] **Step 3: `ClipEditor` UI**

- Importar `addSplitTrack`, `recipeFromLayers`, `isSyncedDual`, `syncedDualSlots`. Formato de preview desde `project.timeline`.
- Estado preview: `const outW = project?.timeline?.width || 720`, `outH = project?.timeline?.height || 1280`.
- Canvas: `width={270}` `height={Math.max(1, Math.round(270 * outH / outW))}`.
- Título: `Resultado ${outW}×${outH}` (o el id de formato si coincide con `FORMATS`).
- Pasar `outAspect: outW/outH` y `syncedDual: isSyncedDual(layers)` a `drawComposeFrame`.
- En `drawComposeFrame`, si `env.syncedDual`, `dest = slotRect(syncedDualSlots(env.outAspect, { split_layout: 'auto' })[i])`.
- Función `onSplitTrack`: `const next = addSplitTrack(layers); if (!next) return; next[1] = { ...next[1], id: idc.current++ }; setLayers(next); setActiveIdx(1)`.
- Botón **Dividir** junto a Cortar: `disabled={layers.length !== 1}`. Title: `Duplica el clip en una segunda pista sincronizada`.
- En el punto seleccionado, toggle Entero/Custom: `patchActive({ keyframes: kfs.map(k => k.id === selId ? { ...k, fit: mode } : k) })`. Default al crear punto: `'cover'`.
- `writeKf` / `addHere`: incluir `fit: ex?.fit || 'cover'`.
- `currentConfig()` debe devolver `recipeFromLayers(layers)` más trim/label (para reabrir).

Cortar no se modifica.

- [ ] **Step 4: `clipCanvas.js`** — `env.outAspect`, `env.syncedDual`; fill negro ya está.

- [ ] **Step 5: Run unit tests**

```
node frontend/src/lib/panning.test.mjs
node frontend/src/features/video/composeModel.test.mjs
node frontend/src/lib/recipeLayout.test.mjs
```

Expected: PASS. Verificar a mano: abrir taller, Dividir, dos chips de capa, preview apilado en proyecto 9:16.

- [ ] **Step 6: Commit**

```
git add frontend/src/lib/panning.js frontend/src/features/video/clipCanvas.js frontend/src/features/video/ClipEditor.jsx frontend/src/features/editor/editorModel.js
git commit -m "feat: Dividir en el taller y preview contain/auto según formato del proyecto"
```

---

### Task 4: Generar master (sin aplastar 9:16)

**Files:**
- Modify: `backend/app/clipper.py`
- Modify: `backend/app/compose.py` (`_shifted_keyframes` debe copiar `fit`)
- Modify: `frontend/src/features/video/ClipEditor.jsx` (`generate`)
- Test: `backend/tests/test_clipper_master.py` (filtro/código de corte, sin FFmpeg si se extrae función pura)

**Interfaces:**
- Consumes: `Reframe.master`, `recipeFromLayers`.
- Produces: MP4 recortado en resolución fuente; `ClipInfo.reframe` con receta.

- [ ] **Step 1: Extraer `_trim_copy_filter` o rama en `_cut_clip`**

Si `reframe is not None and reframe.master`:

```python
filt = ["-c:v", "libx264", "-crf", str(config.VIDEO_CRF), "-preset", config.VIDEO_PRESET,
        "-c:a", "aac", "-b:a", config.AUDIO_BITRATE]
```

sin `-vf` de crop 9:16. Mantener `-ss`/`-to`. No llamar `_reframe_filter`.

Si `master` es false y hay keyframes, comportamiento actual (bake 9:16) para no romper otros callers.

`generate_clips` ya asigna `reframe=clip_reframe` al `ClipInfo`. El frontend debe enviar `master: true`.

- [ ] **Step 2: Test unittest**

```python
# backend/tests/test_clipper_master.py
import unittest
from app.schemas import Reframe, Keyframe
from app.clipper import _cut_clip_uses_master_trim

# Extraer helper:
# def _uses_source_trim(reframe) -> bool:
#     return bool(reframe and reframe.master)
```

Implementar `_uses_source_trim(reframe) -> bool` y testear True/False. No hace falta ejecutar FFmpeg.

- [ ] **Step 3: `ClipEditor.generate`**

Si `layers.length === 1` **o** `isSyncedDual(layers)`:

```javascript
const recipe = recipeFromLayers(layers)
setGenJob(await createClipJob({
  url: layers[0].url,
  project_id: project.id,
  segments: [{ index: targetIndex, start: p.start, end: p.end, score: 1, duration: r2(p.end - p.start), label, description: ... }],
  crop_mode: 'smart_face',
  reframe: recipe,
}))
```

`payloadForLayer` para `start`/`end` del tramo (trim). **No** usar `composeClipJob` en el caso synced dual.

Si dos fuentes distintas o layout secuencial: dejar `composeClipJob` como está.

- [ ] **Step 4: `_shifted_keyframes` copia `fit=k.fit`**

- [ ] **Step 5: Run**

Desde `backend/`: `python -m unittest tests.test_clipper_master -v`

- [ ] **Step 6: Commit**

```
git add backend/app/clipper.py backend/app/compose.py backend/tests/test_clipper_master.py frontend/src/features/video/ClipEditor.jsx
git commit -m "feat: generar clip master en aspecto original y persistir receta"
```

---

### Task 5: Montaje copia receta y pinta/exporta al formato actual

**Files:**
- Modify: `frontend/src/features/editor/editorModel.js` — `makeClip`
- Modify: `frontend/src/features/editor/MaterialClipGrid.jsx` — `dragPayload`
- Modify: `frontend/src/features/editor/VideoEditor.jsx` — `addAsset`/`dropAsset`; quitar checkbox dual_crop
- Modify: `frontend/src/features/editor/EdCrops.jsx`
- Modify: `backend/app/compose.py` — `_reframe_cropscale` usa `recipe_layout.split_orientation_for` y contain
- Modify: `backend/tests/test_compose.py` o nuevo `tests/test_compose_recipe.py` si no existe test del cropscale (crear unittest del string de filtro con `Reframe(master=True, dual_crop=True, split_layout="auto")` y W,H 1280×720 → `hstack`)

**Interfaces:**
- Consumes: `isMasterReframe`, `withKfIds`, `drawReframe` (Task 3), `_single_reframe_filter` / pad.
- Produces: timeline clip con receta; export al `timeline.width/height`.

- [ ] **Step 1: `makeClip` copia receta master**

```javascript
import { isMasterReframe } from '../../lib/recipeLayout.js'

export function makeClip(assetKind, item, trackId, start, dur) {
  const kind = assetKind === 'clips' ? 'video' : 'audio'
  const fromLib = kind === 'video' && isMasterReframe(item.reframe)
  return {
    // ...campos actuales...
    reframe: kind === 'video'
      ? (fromLib ? withKfIds({ ...newReframe(), ...item.reframe }) : newReframe())
      : null,
  }
}
```

`newReframe`:

```javascript
export const newReframe = () => ({
  zoom: 1, pan_mode: 'smooth', dual_crop: false,
  split_orientation: 'vertical', split_layout: 'auto', master: false,
  keyframes: [], keyframes2: [],
})
```

- [ ] **Step 2: Test JS**

Create `frontend/src/features/editor/editorModel.test.mjs`:

```javascript
import assert from 'node:assert/strict'
import { makeClip, newReframe } from './editorModel.js'

const legacy = makeClip('clips', { index: 1, filename: 'a.mp4', end: 5, start: 0 }, 'V1', 0, 5)
assert.equal(legacy.reframe.dual_crop, false)
assert.equal(legacy.reframe.master, false)

const master = makeClip('clips', {
  index: 2, filename: 'b.mp4', end: 8, start: 0,
  reframe: { master: true, dual_crop: true, keyframes: [{ t: 0, cx: 0.3, cy: 0.5, zoom: 1 }], keyframes2: [{ t: 0, cx: 0.7, cy: 0.5, zoom: 0.5 }] },
}, 'V1', 0, 8)
assert.equal(master.reframe.master, true)
assert.equal(master.reframe.dual_crop, true)
assert.equal(master.reframe.keyframes[0].cx, 0.3)
assert.ok(master.reframe.keyframes[0].id)

console.log('makeClip reframe copy ok')
```

Run: `node frontend/src/features/editor/editorModel.test.mjs` — FAIL then implement.

- [ ] **Step 3: `dragPayload` incluye `reframe: item.reframe || null`.** `dropAsset` pasa `payload.reframe` en el objeto `item` de `makeClip`. `addAsset` ya recibe `item` de la biblioteca (tiene `reframe` si el API lo envía).

- [ ] **Step 4: Quitar el checkbox 📱 dual_crop** en `VideoEditor.jsx` (el bloque del input `dual_crop`).

- [ ] **Step 5: `EdCrops`** — si `clip.reframe.dual_crop`, estado local `track: 1|2`; la lista usa `keyframes` o `keyframes2`. `onPanMode`/`onDelete` deben actuar sobre el array activo (extender callbacks o pasar `which`). Mínimo viable: selector que cambia qué array se muestra; cablear `onPanMode`/`onDelete` en `VideoEditor` para parchear `keyframes2` cuando `track===2`.

- [ ] **Step 6: Export contain + auto split**

En `_reframe_cropscale`:

```python
from .recipe_layout import split_orientation_for

if not reframe.dual_crop:
    if (keyframes all contain at t=0 and no cover): use _plain_scale(W,H)
    else: _single_reframe_filter(...)
```

Más preciso: helper `_fit_at(reframe, which, t)` via `frame_at`. Si `fit == contain`, devolver cadena pad:

`scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`

(para una pista / un hueco).

Si dual: `orient = split_orientation_for(W/H, reframe)` y `vstack`/`hstack` como ahora, con cada mitad `W, H//2` o `W//2, H`. Cada mitad elige contain vs crop según `frame_at` de esa pista en t=0; si hay mix de fit en el tiempo, usar crop variable existente para cover y, para tramos contain, el pad estático del hueco (v1: si **cualquier** kf de esa pista es contain y ninguno cover, pad; si mix, cover — documentar; mejor: por pista, si el fit interpolado dominante… Spec pide coincidencia preview/export.

Implementación mix: muestrear como `_single_reframe_filter` variable. Para frames contain, `cw,ch = iw,ih` y `x,y=0` + scale pad. FFmpeg no cambia pad a crop frame a frame con facilidad.

**Regla v1 export mix:** si la pista tiene al menos un `fit=contain` y al menos un `cover`, tratar toda la pista como `cover` (zoom 1 ≈ casi entero). Preview sí interpola fit. Aceptable solo si es raro; preferible: `frame_at` hold de fit (como pan_mode) y construir `enable='between(t,t0,t1)'` con dos overlays. Hacer **enable por rangos de fit** si no alarga de más: rangos desde keyframes ordenados.

Rangos: para kfs ordenados, tramo `[a.t, b.t)` usa `fitOf(b)`. Último hold hasta `dur`.

```
[0:v]split=2[s0][s1];
[s0]{cover_filter},...enable
[s1]{contain_pad},...enable
```

Si una pista es 100% un fit, un solo filtro.

Test: dual auto 1280×720 contiene `hstack`; dual auto 720×1280 contiene `vstack`.

- [ ] **Step 7: Run**

```
node frontend/src/features/editor/editorModel.test.mjs
```

Desde `backend/`: `python -m unittest tests.test_compose_recipe tests.test_reframe_math -v` (crear `test_compose_recipe.py` que llame `_reframe_cropscale` con un Path dummy — `_single_reframe_filter` llama `detect.dims`; mockear o skip si no hay archivo.

Si `detect.dims` exige archivo real, testear solo `split_orientation_for(1280/720, Reframe(split_layout="auto")) == "horizontal"` (ya Task 1) y un test del ensamblado de `vstack`/`hstack` extrayendo la rama de orientación a `stack_filter(orient)` pura:

```python
def dual_stack_name(orient: str) -> str:
    return "vstack=inputs=2" if orient == "vertical" else "hstack=inputs=2"
```

en `recipe_layout.py`. Test unitario de ese string. `_reframe_cropscale` lo usa.

- [ ] **Step 8: Commit**

```
git add frontend/src/features/editor/editorModel.js frontend/src/features/editor/editorModel.test.mjs frontend/src/features/editor/MaterialClipGrid.jsx frontend/src/features/editor/VideoEditor.jsx frontend/src/features/editor/EdCrops.jsx backend/app/compose.py backend/app/recipe_layout.py backend/tests/test_compose_recipe.py
git commit -m "feat: montaje aplica receta master al formato de la timeline"
```

---

### Task 6: Cablear preview del taller al dibujo y verificación manual

**Files:**
- Modify: `frontend/src/features/video/ClipEditor.jsx` — loop de `drawComposeFrame` con `outAspect`.
- Modify: `frontend/src/features/editor/render/canvas.js` — no requiere cambios si `drawReframe` ya hace contain/dual auto (verificar `drawComposite`).

- [ ] **Step 1:** En el `useEffect`/rAF que pinta el canvas del taller, pasar `{ layers, preps, outAspect: outW/outH, syncedDual: isSyncedDual(layers) }`.

- [ ] **Step 2:** En Main del montaje, `cropWindow` para contain: si `frameAt.fit === 'contain'`, overlay de recuadro = fotograma completo (wf=1, hf=1) para que el usuario vea Entero. Modify `cropWindow` in `clipLayout.js`:

```javascript
const fr = frameAt(...)
if (fr.fit === 'contain') return { cx: 0.5, cy: 0.5, wf: 1, hf: 1 }
```

- [ ] **Step 3:** Test en `clipLayout.test.mjs`:

```javascript
const containClip = { layout: 'fill', reframe: { keyframes: [{ t: 0, cx: 0.2, cy: 0.2, zoom: 0.4, fit: 'contain' }] } }
const w = cropWindow(containClip, 16/9, 9/16, 0)
assert.equal(w.wf, 1)
assert.equal(w.hf, 1)
```

Run: `node frontend/src/lib/clipLayout.test.mjs`

- [ ] **Step 4: Verificación manual (obligatoria antes de cerrar)**

1. Taller: un clip, puntos Custom, Generar. El archivo no debe ser 9:16 forzado (ffprobe aspect ≈ fuente).
2. Soltar en montaje, cambiar 9:16 ↔ 16:9: el encuadre se recalcula.
3. Taller: Dividir, pista 1 Entero, pista 2 Custom. Preview apilado en 9:16.
4. Generar, soltar, formato 16:9: lado a lado.
5. Cortar en taller y Dividir en montaje (S) siguen cortando tiempo.
6. Un clip viejo 9:16 de la biblioteca sigue viéndose sin receta extra.

- [ ] **Step 5: Commit**

```
git add frontend/src/lib/clipLayout.js frontend/src/lib/clipLayout.test.mjs frontend/src/features/video/ClipEditor.jsx
git commit -m "fix: Entero usa el fotograma completo en Main y en el taller"
```

---

## Self-review (plan vs spec)

| Spec | Task |
|---|---|
| Taller Dividir = duplicar pista | 2, 3 |
| Cortar tiempo intacto | 3 (no se cambia) |
| Entero/Custom (`fit`) | 1, 3, 6 |
| Formato solo en montaje; preview taller usa timeline | 3 |
| Master sin bake 9:16 | 4 |
| Montaje cambia formato en vivo | 5 (`drawReframe`) |
| Export misma receta | 5 |
| No copiar receta de clips legado | 5 `isMasterReframe` |
| Auto 9:16 stack / 16:9 row | 1, 3, 5 |
| Quitar dual_crop checkbox montaje | 5 |
| Agregar material 2 fuentes / compose bake | sin cambios (fuera de alcance) |
| Dividir montaje = corte tiempo | sin cambios |
