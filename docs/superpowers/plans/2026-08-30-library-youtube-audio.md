# Biblioteca global y YouTube → Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraer audio de YouTube como material de proyecto y promover clips/audios a una biblioteca global reusable, con metadata que el MCP pueda distinguir del metraje del proyecto.

**Architecture:** Catálogo `data/library/library.json` + archivos en `data/library/{audio,video}/`. Generar sigue siendo del proyecto; Guardar mueve archivo y reescribe la timeline (`asset_scope: library`). Colecciones disjuntas. DTO `material_dto` con `scope`, `is_saved`, `source`, `origin`, `resource_type`.

**Tech Stack:** FastAPI/Pydantic, unittest desde `backend/` (`python -m unittest tests.<modulo>`), React (Vite), Node `assert` tests (`node archivo.test.mjs`).

## Global Constraints

- Guardar sustituye a la estrella en clips/audios. SFX no se toca.
- Colecciones disjuntas: un ítem no está en proyecto y biblioteca a la vez.
- YouTube→Audio no se auto-guarda; audio completo; archivo m4a.
- `asset_kind` no cambia. `asset_scope` default `"project"`. Sin `schema_version` 3.
- Favoritos viejos de audio se ignoran (no se migran).
- Spec: `docs/superpowers/specs/2026-08-30-library-youtube-audio-design.md`.
- No tocar `git config`. No commitear salvo petición explícita.

---

## File map

- Create: `backend/app/library.py` — catálogo, save/unsave, DTO, inferencia.
- Create: `backend/app/youtube_audio.py` — validar URL, extraer m4a.
- Create: `backend/tests/test_library.py`
- Create: `backend/tests/test_youtube_audio.py`
- Modify: `backend/app/schemas.py` — provenance, `asset_scope`, requests.
- Modify: `backend/app/storage.py` — `resolve_library_media`.
- Modify: `backend/app/projects.py` — retarget timeline, enrich origin.
- Modify: `backend/app/jobs.py` — job YouTube audio; origin en TTS; subtitles `asset_scope`.
- Modify: `backend/app/clipper.py` / `compose_clip.py` — origin/source al crear clips.
- Modify: `backend/app/compose.py` — `_clip_path` respeta library.
- Modify: `backend/app/main.py` — endpoints.
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/features/audio/AudioTab.jsx`, `AudioProjectList.jsx`
- Modify: `frontend/src/features/editor/EdMaterial.jsx`, `MaterialClipGrid.jsx`, `editorModel.js`, `VideoEditor.jsx`
- Modify: `frontend/src/features/editor/hooks/useFavorites.js`, `useSubtitles.js`
- Modify: `frontend/src/lib/favorites.js` (+ test)

---

### Task 1: DTO + catálogo + Guardar/Unsave

**Files:** `backend/app/library.py`, `storage.py`, `schemas.py`, `projects.py`, `tests/test_library.py`

**Interfaces:**
- `material_dto(item: dict, scope: str) -> dict`
- `infer_origin_source(item: dict, resource_type: str) -> tuple[str, str]`
- `save_from_project(project_id, resource_type, ident) -> dict`
- `unsave(item_id) -> dict` / `LibraryInUseError`
- `list_library() -> {"clips": [], "audios": []}`
- `storage.resolve_library_media(kind, filename) -> Path | None`
- `projects.retarget_timeline_asset(pid, asset_kind, old_id, old_filename, new_id, new_filename)`

TDD: tests de inferencia, save (sale del proyecto, reescribe timeline, archivo en library), rollback, unsave 409 / ok.

### Task 2: YouTube URL + job de extracción

**Files:** `youtube_audio.py`, `jobs.py`, `main.py`, `tests/test_youtube_audio.py`

**Interfaces:**
- `is_youtube_url(url: str) -> bool`
- `youtube_id_from_url(url: str) -> str | None`
- `extract_audio(url, out_path, on_progress) -> {duration, title, video_id}`
- `POST /api/youtube-audio` `{project_id, url, name?}`
- `YouTubeAudioRequest`

TDD: hosts válidos/inválidos; 400 sin job; job mockeado crea AudioInfo `origin=youtube` en el proyecto.

### Task 3: API library + media + compose/subtitles

**Files:** `main.py`, `compose.py`, `jobs.py`

- `GET /api/library`, `POST /api/library/save`, `DELETE /api/library/{id}`, `GET /api/library/media/{kind}/{filename}`
- `_clip_path` usa library si `asset_scope == library`
- Subtítulos aceptan `asset_scope`

### Task 4: Origin al generar TTS/clips

TTS `origin=tts`; clipper `youtube/external`; compose_clip `compose/generated`. `AudioInfo.voice` opcional.

### Task 5: Frontend

Tabs Narrador | YouTube → Audio. Bookmark Guardar. Filtro Todos/Guardados. `makeClip`/`mediaUrl`/`dragPayload` con `asset_scope`. Quitar estrella de audios. Tests JS de `makeClip` library y `mediaUrl`.
