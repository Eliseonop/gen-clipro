# MCP del editor — Guía de uso y conexión

Cómo conectar una IA (Claude Code / Claude Desktop) al editor de vídeo por MCP y
qué puede hacer. El MCP va **montado en el mismo backend FastAPI**, así que la IA
y tú operáis **el mismo editor vivo** (mismos proyectos, jobs y timeline).

Endpoint: **`http://127.0.0.1:8000/mcp`** (transporte streamable-HTTP).

---

## 1. Arrancar el backend

El MCP solo existe si el backend está levantado:

```bash
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

(o simplemente `start.bat`, que abre backend + frontend). Al arrancar, el log de
diagnóstico dice qué motor usa cada parte (GPU/CPU) y el encoder efectivo.

## 2. Conectar el cliente MCP

**Claude Code (CLI)** — soporta transporte HTTP nativo:

```bash
claude mcp add --transport http video-yt http://127.0.0.1:8000/mcp
```

Compruébalo con `claude mcp list` (debe decir *connected*) y en una sesión con
`/mcp`.

**Claude Desktop** — su config usa procesos stdio; para un MCP HTTP se usa un
puente. En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "video-yt": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:8000/mcp"]
    }
  }
}
```

Reinicia Claude Desktop tras editar el archivo.

## 3. Qué puede hacer la IA — catálogo de tools (44)

Toda tool declara un nivel de política (`read` / `write` / `destructive`) y queda
**auditada** en `backend/data/mcp_audit.jsonl` (tool, nivel, proyecto, claves de
params —nunca valores—, estado y ms).

**Lectura / orientación**
- `get_project_context(project_id)` — resumen: formato, material, timeline,
  historial y `capabilities[]` (verbos disponibles). **Empieza siempre por aquí.**
- `get_timeline` · `inspect_clip` (un clip completo) · `list_media`
- `get_job` · `wait_for_job(job_id, timeout_s)` · `list_jobs`

**Media / ingesta**
- `analyze_youtube(url, …)` — tramos del heatmap (síncrono)
- `create_clips_from_segments(project_id, url, segments, crop_mode)` — job de recorte
- `fetch_image(project_id, url)` — trae una imagen al proyecto
- `delete_media` *(destructive)*

**Edición estructural**
- `add_to_timeline` (clip/audio/imagen) · `move_clip` · `split_clip` ·
  `remove_clip` *(destructive)*
- `set_clip_layout` (top/bottom/full) · `reframe_clip` (center/manual) ·
  `set_project_format` (9:16…)
- `add_track` · `remove_track` *(destructive)* · `add_shape` · `duplicate_clip`
- `link_tracks` / `unlink_track`
- `add_subtitles(source_clip_id, segments)`

**Propiedades por-clip**
- `set_clip_opacity` · `set_clip_speed` (speed/keep_pitch/reverse)
- `set_clip_transition` (fade/dissolve/wipe/zoom/slide/pop)
- `set_clip_effects` (blur/grayscale/sepia/brightness…) · `set_clip_audio_fx`
  (eq/compressor/reverb)
- `set_text_role` (caption/free) · `set_clip_keyframes` (x/y/scale/rotation/opacity)

**Transcripción / audio**
- `transcribe(project_id, source|clip_index, model?)` · `generate_subtitles`
- `generate_voice(text, engine=kokoro|piper|gemini, …)` · `search_sfx` *(read)*

**Render / jobs / historial**
- `export_project` · `cancel_job`
- `undo` · `redo` · `checkpoint` · `restore_checkpoint`

**Workflows de una sola llamada**
- `create_short_from_youtube(project_id, url, …)`
- `make_short_from_library(project_id, asset_id, …)`

## 4. Los 3 flujos objetivo

Los jobs (recorte, transcripción, export) devuelven `{id, status}` → espera con
`wait_for_job(job_id)`.

**A) YouTube → short (automático)**
```
create_short_from_youtube(project_id, url)  → job
wait_for_job(job.id)                        → result.export_url
```

**B) Biblioteca → short**
```
make_short_from_library(project_id, asset_id)  → job → wait_for_job → export_url
```

**C) Pilotaje manual (control total)**
```
get_project_context(pid)
analyze_youtube(url)                        → segments
create_clips_from_segments(pid, url, segments)   → job → wait_for_job
add_to_timeline(pid, "clips", "0")          → clip_id
set_project_format(pid, aspect="9:16")
transcribe(pid, clip_index="0")             → job → wait_for_job
add_subtitles(pid, source_clip_id=clip_id, segments=…)
export_project(pid)                         → job → wait_for_job → export_url
```
Si algo sale mal: `undo` (o `restore_checkpoint`).

## 5. Notas operativas

- **Coherencia**: la IA y tú compartís el mismo proceso. Un job lanzado por la IA
  lo ves en el editor y viceversa (`list_jobs`).
- **Seguridad**: toda edición es transaccional (snapshot→aplicar→validar→guardar)
  y **deshacible** (`undo`/`redo`/checkpoints).
- **GPU**: se auto-detecta (whisper CUDA + FFmpeg NVENC con sonda real). Forzar
  CPU con `VIDEOYT_GPU=0`. (En esta máquina NVENC está bloqueado por driver NVIDIA
  viejo; actualizarlo lo activa solo.)
- **Voz gemini**: `generate_voice(engine="gemini")` requiere la API key
  configurada; si falta, la tool lo dice.
- **Modelo de transcripción**: `model` opcional; si se omite usa el de Ajustes
  (`transcribe_settings`).

## 6. E2E manual (validación de punta a punta)

Con red + ffmpeg + whisper reales (no automatizable en CI):

1. Backend arrancado; cliente MCP *connected*.
2. Crea un proyecto (por el editor o `POST /api/projects`).
3. Flujo A: `create_short_from_youtube` con una URL con heatmap → `wait_for_job`
   → abre `export_url`. Verifica: clip vertical 9:16 + subtítulos + vídeo final.
4. Flujo C paso a paso; entre pasos, mira el editor (se actualiza en vivo).
5. Prueba `undo` y `cancel_job` a mitad de un export.
6. Revisa `backend/data/mcp_audit.jsonl`: cada acción de la IA quedó registrada.
