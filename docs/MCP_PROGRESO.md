# MCP para el editor de vídeo — Seguimiento de progreso

Checklist vivo del desarrollo del MCP (capa de control para que una IA opere el
editor). Se actualiza conforme se avanza. Leyenda: `[x]` hecho · `[~]` en curso · `[ ]` pendiente.

> **Objetivo:** que una IA pueda operar el editor como usuario avanzado (YouTube →
> clips → timeline → 9:16 → subtítulos → preview/export), reutilizando lo que ya
> existe, sin duplicar lógica y manteniendo el editor funcionando igual.

---

## Análisis y arquitectura (aprobado)

- [x] Análisis completo del proyecto (frontend/backend/servicios/modelos)
- [x] 2ª revisión de arquitectura
- [x] **Decisión: Opción D** — `timeline_ops.py` como fuente única de operaciones
      estructurales; gestos interactivos en JS; render math espejado JS↔Python con tests de paridad
- [x] **Capa DTO semántica** para la IA (verbos: `position: top`, `reframe: auto`…) con `capabilities[]` para escalar entre versiones
- [x] Clasificación de tools (core / secundarias / workflows) y definición del MVP 1

---

## FASE 0 — Modelo de datos (COMPLETA) ✅ · commit `80a6dba`

- [x] `words[]` reales de Whisper (`Word` model, `TranscriptSegment.words`, `word_timestamps=True`, `shape_words`)
- [x] Versionado + migración (`migrations.py`, `schema_version=2`, migración lazy al leer)
- [x] `TimelineClip.words[]` + export con karaoke real (`text_ass.word_windows`, fallback a reparto uniforme)
- [x] Fragmentación productor→consumidor en `editorModel.js` (words[] por fragmento + `origin`)
- [x] Preview del editor con timing real (`activeWordIndexFromWords`)
- [x] Herencia pista→texto (`effective_text_style` / `effectiveTextStyle`, `build_ass` con tracks)
- [x] `TimelineClip.origin` en el schema (persiste el `origin` que el frontend ya escribía; antes se descartaba en `PUT /timeline`)
- [x] Tests: 95 backend + 13 archivos JS, lint 0

---

## ETAPA 1 — `timeline_ops.py` (núcleo estructural, fuente única) ✅ COMPLETA · commits `3ae72e0` → `15958ca` → `a376252` → `72b279d` → adaptador

Contrato: funciones puras `Timeline → EditResult{timeline, changed, warnings}`, no mutan la entrada;
precondición inválida → `ValueError`; estado inválido → `validate_timeline`.

- [x] `add_track` / `remove_track` (remove arrastra sus clips)
- [x] `add_clip` (valida pista + kind, genera id) / `move_clip` / `remove_clip`
- [x] `split_clip` (corte por tiempo + reparte `words[]`, regla de borde determinista)
- [x] `set_clip_layout` (position top/bottom/full + timing)
- [x] `set_project_format` (aspect 9:16… o w/h/fps; `FORMATS` espejo de editorModel.js)
- [x] `validate_timeline` + `track_overlaps`
- [x] `add_subtitles` — port a Python de la fragmentación (`fragment.py`, espejo de editorModel.js) + **golden fixtures** compartidos (`shared/fragmentation_cases.json`) verificados por Python Y JS
- [x] Tests: 30 timeline_ops+fragment, suite backend 125 OK · 14 archivos JS (incl. golden) · lint 0
- [x] `reframe_clip` (center / manual con paneo+zoom / keyframes explícitos; `auto` se orquesta como job en la capa de tool)
- [x] Capa de snapshot / undo / redo / checkpoints (`timeline_history.py`, core puro)
- [x] Adaptador stateful `timeline_store.py` (liga proyecto + ops + historial; snapshot→aplicar→validar→guardar; solo rechaza errores NUEVOS; historial en `data/history/<pid>.json`)
- [x] Endpoints HTTP: `POST .../timeline/op` · `/undo` · `/redo` · `/checkpoint` · `/restore`
- [x] Tests: 15 timeline_ops + 5 fragment + 9 history + 6 store; **suite backend 148 OK**; 14 archivos JS; lint 0
- [ ] (pendiente frontend, a tu ritmo) migrar botones estructurales del editor para consumir estos endpoints (elimina la duplicación estructural)

---

## ETAPA 2 — MCP Server base ✅ COMPLETA

Topología: MCP montado en el **mismo proceso FastAPI** (SDK oficial `mcp` 2.x,
`MCPServer`), expuesto en `POST http://localhost:8000/mcp` (streamable-HTTP). Las
tools llaman in-process a `projects`/`timeline_store`/servicios → comparten el
estado vivo con el editor del humano (jobs en memoria incluidos). Spec:
`docs/superpowers/specs/2026-08-30-mcp-server-base-design.md`.

- [x] Esqueleto `backend/mcp_server/` con el SDK `mcp` (`server.py` monta la
      sub-app; lifespan del session-manager cableado al de FastAPI en `main.py`)
- [x] Registro de tools + capa de política (`registry.py`: `@tool(access=read|write|destructive)`, wrapper con `functools.wraps` que preserva la firma para la introspección de MCP; hoy no bloquea, punto de control listo)
- [x] Auditoría de acciones de la IA (`audit.py`: JSONL append-only en `data/mcp_audit.jsonl`; guarda claves de params, nunca valores)
- [x] Construcción del DTO semántico + `capabilities[]` (`dto.py`)
- [x] Tool de prueba de tubería: `get_project_context` (lectura) — verificada por handshake MCP real por HTTP (initialize → list_tools → call_tool)
- [x] Tests: 24 nuevos (audit/registry/dto/context); **suite backend 204** (1 fallo preexistente ajeno: aislamiento de biblioteca en `test_youtube_audio`)

---

## ETAPA 3 — Tools de LECTURA ✅ COMPLETA

Todas `access="read"`, registradas en el MCP. Módulos `tools_read.py` (proyecto/
timeline) y `tools_jobs.py` (jobs in-process). Builders en `dto.py`.

- [x] `get_project_context` (resumen semántico eficiente) — hecho en Etapa 2
- [x] `get_timeline` (detalle escaneable: formato+pistas+clips, sin words/keyframes)
- [x] `inspect_clip` (un clip COMPLETO: reframe/keyframes, words, transform, origin)
- [x] `list_media` (inventario detallado: clips/audios/transcripciones)
- [x] `get_job` (status/progreso + resumen del resultado)
- [x] `wait_for_job` (bloquea en threadpool hasta done/error o `timeout_s`; `timed_out`)
- [x] Tests: 12 nuevos (read/jobs); **suite backend 216 OK**

---

## ETAPA 4 — Tools de EDICIÓN ✅ COMPLETA

Wrappers semánticos sobre `timeline_store.apply_op` (transaccional: snapshot→
aplicar→validar→guardar). Módulo `tools_edit.py`. Resultado uniforme
`{ok, changed, warnings, can_undo, can_redo, checkpoints, timeline}` (timeline
resumido, no crudo). **Primeras tools `write`/`destructive`** → la política del
registry ya distingue niveles.

- [x] `add_to_timeline` (resuelve el asset del proyecto → clip; crea pista si falta) · `move_clip` · `split_clip` · `remove_clip` (destructive)
- [x] `set_clip_layout` (verbo `position: top/bottom/full`) · `reframe_clip` (center/manual con paneo+zoom)
- [x] `add_subtitles` (desde `segments`, con words[] reales) · `set_project_format` (aspect/w/h/fps)
- [x] `undo` / `redo`
- [x] Extra (alcance ampliado): `add_track` · `remove_track` (destructive) · `checkpoint` · `restore_checkpoint`
- [x] Tests: 16 nuevos (flujos + política de niveles); **suite backend 232 OK**. Total MCP: **20 tools** (6 read · 12 write · 2 destructive)

---

## ETAPA 5 — Media / YouTube ✅ COMPLETA

Módulo `tools_media.py`. Envuelven servicios existentes (heatmap síncrono, job de
recorte, borrado). Los jobs se esperan con `wait_for_job` (Etapa 3).

- [x] `analyze_youtube` (heatmap, síncrono → devuelve `video` + `segments`) · access read
- [x] `create_clips_from_segments` (lanza job de recorte, devuelve job dto; segments tal cual de analyze_youtube; crop_mode center/smart_face/split_*) · access write
- [x] `delete_media` (quita clip/audio del proyecto + borra archivo) · access destructive
- [x] Tests: 9 nuevos (mock de red/recorte); **suite backend 241 OK**. Total MCP: **23 tools** (7 read · 13 write · 3 destructive)

---

## ETAPA 6 — Transcripción / Audio

- [ ] `transcribe` (source / clip) · `generate_subtitles`
- [ ] `generate_voice` (TTS) · `search_sfx`

---

## ETAPA 7 — Render / Export + Jobs

- [ ] `render_frame` (verificar) · `render_preview` (draft) · `export_project` (final)
- [ ] `list_jobs` · `cancel_job` · persistencia de jobs

---

## ETAPA 8 — Workflows de alto nivel

- [ ] `create_short_from_youtube`
- [ ] `make_short_from_library`

---

## ETAPA 9 — Integración con IA + pruebas

- [ ] Config del cliente MCP + documentación de uso
- [ ] Pruebas E2E de los 3 flujos objetivo

---

## 🎯 MVP 1 — una IA crea un vídeo completo

Tools mínimas (~14): `get_project_context`, `get_timeline`, `analyze_youtube`,
`create_clips_from_segments`, `transcribe`, `add_to_timeline`, `split_clip`,
`set_clip_layout`, `reframe_clip`, `add_subtitles`, `set_project_format`,
`render_preview`/`export_project`, `get_job`(+`wait_for_job`), `undo`.

- [ ] MVP 1 alcanzado (pipeline analyze→clips→timeline→9:16→subtítulos→export operativo por IA)

---

_Última actualización: 2026-08-30 — **ETAPA 5 COMPLETA** (23 tools MCP: 7 lectura + 13 escritura + 3 destructivas; YouTube→clips vía job operativo por IA; 241 tests). Siguiente: Etapa 6 (Transcripción/Audio: `transcribe`, `generate_subtitles`, `generate_voice`, `search_sfx`) — con `transcribe` + `add_subtitles` (ya hecha) el bloque de subtítulos del MVP1 queda cerrado._
