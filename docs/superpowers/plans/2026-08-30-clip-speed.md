# Clip Speed Implementation Plan

> **For agentic workers:** Execute in this session. TDD. Do not commit unless the user asks.

**Goal:** Velocidad constante tipo CapCut en clips de vídeo/audio: misma fuente, barra más corta o larga, preview y export.

**Architecture:** `in`/`out` siguen siendo fuente. `clipDur` pasa a `(out-in)/speed`. Helpers puros en JS y Python. Preview usa `playbackRate` + `timelineToSource`. FFmpeg aplica `setpts`/`atempo`/`asetrate` después del reframe.

**Tech Stack:** React, `editorModel.js`, FastAPI/`TimelineClip`, ffmpeg via `compose.py`.

## Global Constraints

- Texto: `clipSpeed` siempre 1.
- Rango speed: 0.1–10. Default 1.
- `keep_pitch` default false. `reverse` default false. `speed_curve` null, sin UI.
- No tocar receta / `ClipEditor` / `reframe.master`.
- No subir `schema_version` (defaults Pydantic).
- Al cambiar speed, `start` fijo; crece/encoge por la derecha.
- No commits salvo que el usuario lo pida.

## File map

- `frontend/src/features/editor/editorModel.js` — helpers + `makeClip` + split
- `frontend/src/features/editor/editorModel.test.mjs` — tests
- `backend/app/clip_speed.py` — helpers Python
- `backend/tests/test_clip_speed.py`
- `backend/app/schemas.py` — campos
- `backend/app/compose.py` — duración timeline + filtros
- `frontend/src/lib/clipLayout.js` — `videosAt` usa `clipEnd`
- `frontend/src/features/editor/VideoEditor.jsx` — preview, split, onChangeFx audio
- `frontend/src/features/editor/EdCrops.jsx` + `editor.css` — UI
- `frontend/src/features/editor/EdTimeline.jsx` — badge, keyframes con source dur

---

### Task 1: Helpers JS de velocidad y duración

**Files:**
- Modify: `frontend/src/features/editor/editorModel.js`
- Test: `frontend/src/features/editor/editorModel.test.mjs`

**Produces:** `SPEED_MIN`, `SPEED_MAX`, `SPEED_PRESETS`, `clipSpeed`, `clipSourceDur`, `clipDur`, `clipEnd`, `timelineToSource`, `sourceToTimeline`, `splitClipAt`

- [ ] Write failing tests at the top of `editorModel.test.mjs` (import the new names). Then implement.

```js
import {
  SPEED_MIN, SPEED_MAX, SPEED_PRESETS,
  clipSpeed, clipSourceDur, clipDur, clipEnd,
  timelineToSource, sourceToTimeline, splitClipAt,
} from './editorModel.js'

const v = { kind: 'video', start: 10, in_point: 2, out_point: 6, speed: 2 }
assert.equal(clipSourceDur(v), 4)
assert.equal(clipDur(v), 2)
assert.equal(clipEnd(v), 12)
assert.equal(clipSpeed(v), 2)
assert.equal(clipSpeed({ kind: 'text', speed: 4 }), 1)
assert.equal(clipSpeed({ kind: 'video' }), 1)
assert.equal(clipSpeed({ kind: 'audio', speed: 99 }), SPEED_MAX)
assert.equal(clipSpeed({ kind: 'video', speed: 0 }), 1)
assert.equal(timelineToSource(v, 10), 2)
assert.equal(timelineToSource(v, 12), 6)
assert.equal(sourceToTimeline(v, 4), 11)
const rev = { ...v, reverse: true }
assert.equal(timelineToSource(rev, 10), 6)
assert.equal(timelineToSource(rev, 12), 2)
assert.deepEqual(SPEED_PRESETS, [0.3, 0.5, 1, 1.5, 2, 3, 5, 10])
assert.equal(SPEED_MIN, 0.1)
assert.equal(SPEED_MAX, 10)

const parts = splitClipAt(v, 11, 'c-right')
assert.equal(parts.left.out_point, 4)
assert.equal(parts.right.in_point, 4)
assert.equal(parts.right.start, 11)
assert.equal(parts.right.speed, 2)
assert.equal(splitClipAt(v, 10.02, 'x'), null)
```

Run: `node frontend/src/features/editor/editorModel.test.mjs` — must fail first.

Implementation sketch:

```js
export const SPEED_MIN = 0.1
export const SPEED_MAX = 10
export const SPEED_PRESETS = [0.3, 0.5, 1, 1.5, 2, 3, 5, 10]

export function clipSpeed(c) {
  if (!c || c.kind === 'text') return 1
  const s = Number(c.speed)
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, s))
}
export const clipSourceDur = (c) => Math.max(0, (c?.out_point ?? 0) - (c?.in_point ?? 0))
export const clipDur = (c) => clipSourceDur(c) / clipSpeed(c)
export const clipEnd = (c) => c.start + clipDur(c)

export function timelineToSource(c, t) {
  const sp = clipSpeed(c)
  const local = (t - c.start) * sp
  if (c.reverse) return c.out_point - local
  return c.in_point + local
}
export function sourceToTimeline(c, src) {
  const sp = clipSpeed(c)
  if (c.reverse) return c.start + (c.out_point - src) / sp
  return c.start + (src - c.in_point) / sp
}

export function splitClipAt(c, at, rightId) {
  const src = timelineToSource(c, at)
  if (src <= c.in_point + 0.1 || src >= c.out_point - 0.1) return null
  const cut = +src.toFixed(3)
  return {
    left: { ...c, out_point: cut },
    right: { ...c, id: rightId, in_point: cut, start: +at.toFixed(3) },
  }
}
```

`makeClip` / `makeTextClip`: `speed: 1`, `keep_pitch: false`, `reverse: false`, `speed_curve: null`.

---

### Task 2: Helpers Python

**Files:**
- Create: `backend/app/clip_speed.py`
- Test: `backend/tests/test_clip_speed.py`

```python
SPEED_MIN = 0.1
SPEED_MAX = 10.0

def clip_speed(clip) -> float:
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    if kind == "text":
        return 1.0
    raw = clip.get("speed") if isinstance(clip, dict) else getattr(clip, "speed", None)
    try:
        s = float(raw)
    except (TypeError, ValueError):
        return 1.0
    if s <= 0 or s != s:
        return 1.0
    return min(SPEED_MAX, max(SPEED_MIN, s))

def clip_source_duration(clip) -> float:
    inp = float(clip["in_point"] if isinstance(clip, dict) else clip.in_point)
    out = float(clip["out_point"] if isinstance(clip, dict) else clip.out_point)
    return max(0.0, round(out - inp, 3))

def clip_timeline_duration(clip) -> float:
    src = clip_source_duration(clip)
    return max(0.0, round(src / clip_speed(clip), 3))

def keep_pitch(clip) -> bool:
    if isinstance(clip, dict):
        return bool(clip.get("keep_pitch"))
    return bool(getattr(clip, "keep_pitch", False))

def clip_reverse(clip) -> bool:
    if isinstance(clip, dict):
        return bool(clip.get("reverse"))
    return bool(getattr(clip, "reverse", False))

def atempo_chain(speed: float) -> str:
    parts = []
    s = float(speed)
    while s > 2.0 + 1e-9:
        parts.append("atempo=2.0")
        s /= 2.0
    while s < 0.5 - 1e-9:
        parts.append("atempo=0.5")
        s /= 0.5
    parts.append(f"atempo={s:.5f}")
    return ",".join(parts)

def video_speed_filters(clip) -> str:
    bits = []
    if clip_reverse(clip):
        bits.append("reverse")
    sp = clip_speed(clip)
    if abs(sp - 1.0) > 1e-3:
        bits.append(f"setpts=PTS/{sp:.6f}")
    return ",".join(bits)

def audio_speed_filters(clip) -> str:
    bits = []
    if clip_reverse(clip):
        bits.append("areverse")
    sp = clip_speed(clip)
    if abs(sp - 1.0) > 1e-3:
        if keep_pitch(clip):
            bits.append(atempo_chain(sp))
        else:
            bits.append(f"asetrate=48000*{sp:.6f},aresample=48000")
    return ",".join(bits)
```

Tests: duration 4s @ 2x → 2; text ignores speed; atempo 4 → `atempo=2.0,atempo=2.00000`; video_speed_filters reverse+2x contains `reverse` and `setpts=PTS/2`.

Run: `.venv/Scripts/python.exe -m pytest backend/tests/test_clip_speed.py -q`

---

### Task 3: Schema + compose

**Files:**
- Modify: `backend/app/schemas.py` (`TimelineClip` docstring + fields)
- Modify: `backend/app/compose.py` — `_clip_duration` = timeline; reframe usa source dur; insert speed filters

```python
speed: float = 1.0
keep_pitch: bool = False
reverse: bool = False
speed_curve: Optional[dict] = None
```

In `compose.py`:

```python
from .clip_speed import clip_source_duration, clip_timeline_duration, video_speed_filters, audio_speed_filters

def _clip_duration(clip):
    return clip_timeline_duration(clip)
```

Reframe/overlay: pass `clip_source_duration(c)` as `dur` into `_shifted_keyframes` / `_reframe_cropscale` / `_overlay_video_filter`.

Video filter: after `{cropscale},fps={fps}` insert speed (reverse+setpts), then `{fx_part}`, then place. `video_fx_chain(c, timeline_dur, ...)`.

Audio: after `asetpts=PTS-STARTPTS` insert `audio_speed_filters`.

Add a test that `build_command` is not required if files missing — instead test that composing filter strings via the helpers is enough; optionally import `_clip_duration` if exported. Keep `_clip_duration` using the new helper so total length shortens.

If there is no existing compose timeline unit test, add `backend/tests/test_compose_speed.py` that constructs a `TimelineClip` and asserts `clip_timeline_duration` + that a small helper on compose could be tested by importing `build_command`... skip full ffmpeg. Assert `video_speed_filters` used conceptually.

Optional: extract the video filter line builder — don't over-refactor. Patch the string in `build_command` carefully.

---

### Task 4: Preview, split, videosAt, keyframes, load

**Files:**
- `VideoEditor.jsx` tick + split + `onChangeFx` + load defaults
- `clipLayout.js` `videosAt`
- `EdTimeline.jsx` keyframe mapping + badge

Preview expected: `timelineToSource(c, head)` clamped. `el.playbackRate = clipSpeed(c)` unless reverse.

Split: use `splitClipAt` (preserve reframe remap as today).

`onChangeFx`: `c.kind !== 'text'`.

Load: `speed: clipSpeed(c)` or `c.speed ?? 1`.

Keyframe: `clipSourceDur`.

Badge: if `clipSpeed(clip) !== 1` show `{n}x` on the label.

---

### Task 5: UI Propiedades

**Files:** `EdCrops.jsx`, `editor.css`

Full-width speed block: presets, range input 0.1–10 step 0.1, Tono + Reversa buttons like mute.

`onChangeFx({ speed: n })` etc.

---

### Task 6: Verify

- `node frontend/src/features/editor/editorModel.test.mjs`
- `.venv/Scripts/python.exe -m pytest backend/tests/test_clip_speed.py backend/tests/test_clip_fx.py backend/tests/test_migrations.py -q`
- Browser: clip vídeo a 2x → barra a la mitad, preview más rápido, audio igual; pequeño encima de grande no es este feature.
