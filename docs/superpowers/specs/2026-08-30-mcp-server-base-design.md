# Etapa 2 — MCP Server base (diseño)

_Fecha: 2026-08-30 · Rama: `feat/clip-recipe-live`_

## Objetivo

Levantar la infraestructura del MCP (capa de control para que una IA opere el
editor) sobre el backend existente, sin duplicar lógica y sin cambiar el
comportamiento del editor. Esta etapa entrega el **andamiaje** + una única tool
de LECTURA real (`get_project_context`) para probar la tubería de punta a punta.

Las tools de lectura/edición restantes son Etapas 3-4 y quedan fuera de alcance.

## Topología (decidida)

MCP montado en el **mismo proceso FastAPI**, expuesto en
`http://localhost:8000/mcp` (transporte streamable-HTTP del SDK oficial `mcp`).
Las tools llaman **in-process** a `projects`, `timeline_store`, `jobs` y
servicios → comparten el estado vivo con el editor del humano (jobs en memoria
incluidos). Un solo servidor que arrancar.

SDK: `mcp` 2.x (`MCPServer`, antes `FastMCP`). Añadido a `requirements.txt`.

### Montaje / lifespan

`MCPServer.streamable_http_app(streamable_http_path="/")` devuelve una app
Starlette cuyo lifespan corre el session-manager. Montar una sub-app en FastAPI
**no** ejecuta su lifespan, así que el lifespan de FastAPI entra en
`mcp.session_manager.run()`. Se reemplaza el `@app.on_event("startup")` actual
por un `lifespan` que (1) corre el diagnóstico de arranque y (2) abre el session
manager. La sub-app se monta en `/mcp`.

## Estructura nueva `backend/mcp_server/`

| Módulo | Responsabilidad |
|---|---|
| `audit.py` | Log append-only JSONL en `data/mcp_audit.jsonl`. Registra `ts, tool, access, project_id, param_keys, status, ms, error`. Guarda **claves** de params, nunca su valor (no vuelca transcripciones ni texto). Ruta calculada desde `config.DATA_DIR` en cada llamada → aislable en tests. |
| `registry.py` | Registro de tools + **política**. Decorador `tool(mcp, access=...)` con `access ∈ {read, write, destructive}`. Envuelve la fn (con `functools.wraps`, que preserva la firma para la introspección de MCP), abre auditoría, cronometra, captura errores → `status=error`. Mantiene un registro `{name: ToolSpec(access, fn)}` para inspección/política futura. En esta etapa no bloquea (solo hay una tool `read`); el punto de control queda listo. |
| `dto.py` | Traductores schema interno → **DTO semántico** eficiente + `capabilities()`. |
| `tools_context.py` | La tool real `get_project_context`. |
| `server.py` | Crea el `MCPServer`, importa/registra las tools, construye `asgi_app` (para montar) y expone `session_lifespan` (para cablear en `main.py`). |

## `get_project_context(project_id)` → DTO

Resumen semántico, no vuelca keyframes/words/segmentos completos:

```
project:  {id, name, created_at, folder}
format:   {aspect, width, height, fps}      # aspect derivado de w:h
media:    {clips: N, audios: N, transcripts: N,
           clip_list: [{index, label, duration, has_transcript}],   # breve
           audio_list: [{id, label, duration}]}
timeline: {present: bool, tracks: [{id, kind, name}],
           clip_count, duration, kinds: {video, audio, text}}
history:  {can_undo, can_redo, checkpoints: [...]}
capabilities: [...]   # ver abajo
```

`project_id` inexistente → error MCP claro ("Proyecto no encontrado"), auditado
con `status=error`. Nada muta (tool `read`).

## `capabilities[]`

Verbos que deja al agente adaptarse entre versiones del editor (no el schema
crudo). Refleja lo que HAY hoy en el editor tras los últimos cambios:

```
clip.position:top|bottom|full
clip.reframe:center|manual|keyframes|auto
clip.look:bw|cinematic|vintage|contrast|warm|cool|saturated
clip.speed:0.1-10|keep_pitch|reverse
clip.appear|exit:fade|zoom|slide|pop
subtitles.fragmentation:max_words
format:9:16|1:1|16:9|custom
media.library                     # biblioteca cross-proyecto
history.undo_redo|checkpoints
```

## Flujo de datos

Cliente IA → `POST /mcp` → tool → `registry` (marca access + abre auditoría) →
función in-process (`projects.get_project`, `timeline_store`) → `dto.build_*` →
respuesta; `audit.log` cierra con `status`+`ms`.

## Tests (unittest, `backend/tests/`)

Aíslan `config.DATA_DIR`/`projects._FILE` a un tmpdir (patrón de `test_library`).

- `test_mcp_dto`: `get_project_context` devuelve el DTO correcto sobre un
  proyecto fixture con timeline (counts, aspect derivado, listas breves);
  `capabilities()` incluye los verbos esperados (position, reframe, speed,
  library).
- `test_mcp_audit`: `audit.log` añade una línea JSONL con los campos, guarda
  `param_keys` y no el valor; aislado en tmpdir.
- `test_mcp_registry`: el decorador registra la tool con su `access`; rechaza
  `access` inválido y nombres duplicados; el wrapper audita ok y error.
- `test_mcp_context`: `project_id` inexistente → error; tool listada por MCP con
  su input schema (introspección viva).

Suite backend sigue verde salvo el fallo **preexistente** de aislamiento en
`test_youtube_audio` (lee la biblioteca real en disco; ajeno a esta etapa).

## Fuera de alcance (Etapas 3-4)

`get_timeline`, `list_media`, `inspect_clip`, `get_job`/`wait_for_job` y todas
las tools de edición.
