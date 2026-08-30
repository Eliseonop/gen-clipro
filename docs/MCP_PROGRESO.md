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

## ETAPA 1 — `timeline_ops.py` (núcleo estructural, fuente única) 🔨 · commit `3ae72e0`

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
- [~] Capa de snapshot / undo / redo / checkpoints (transacción para el agente)
- [ ] Adaptador HTTP: endpoints granulares que envuelven `timeline_ops`

---

## ETAPA 2 — MCP Server base

- [ ] Esqueleto `backend/mcp_server/` con el SDK `mcp`
- [ ] Registro de tools + capa de política (lectura/escritura/destructivas)
- [ ] Auditoría de acciones de la IA (log)
- [ ] Construcción del DTO semántico + `capabilities[]`

---

## ETAPA 3 — Tools de LECTURA

- [ ] `get_project_context` (resumen semántico eficiente)
- [ ] `get_timeline` (detalle) · `list_media` · `inspect_clip`
- [ ] `get_job` (+ `wait_for_job`)

---

## ETAPA 4 — Tools de EDICIÓN

- [ ] `add_to_timeline` · `move_clip` · `split_clip` · `remove_clip`
- [ ] `set_clip_layout` (top/bottom/full) · `reframe_clip`
- [ ] `add_subtitles` · `set_project_format`
- [ ] `undo` / `redo`

---

## ETAPA 5 — Media / YouTube

- [ ] `analyze_youtube` (heatmap) · `create_clips_from_segments` (job)
- [ ] `delete_media`

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

_Última actualización: 2026-08-30 — Etapa 1 en curso: `add_subtitles` + golden fixtures JS↔Python hechos. Sigue `reframe_clip`, snapshot/undo y el adaptador HTTP._
