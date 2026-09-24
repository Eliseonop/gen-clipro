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

## 3. Qué puede hacer la IA — catálogo de tools (52)

Total: **14 read / 35 write / 3 destructive**.

Toda tool declara un nivel de política (`read` / `write` / `destructive`) y queda
**auditada** en `backend/data/mcp_audit.jsonl` (tool, nivel, proyecto, claves de
params —nunca valores—, estado y ms). Cada tool lleva además `meta.domain` y
`annotations` (read-only / destructive hints).

**Errores estructurados:** un fallo devuelve `is_error` con JSON
`{"error":{code,message,retryable,param?,hint?}}`. Códigos: `invalid_parameter`,
`resource_not_found`, `operation_not_allowed`, `configuration_error`,
`dependency_error`, `processing_error`, `temporary_error`, `job_running`.

**Descubrimiento (empieza aquí si no conoces el editor o el proyecto)**
- `describe_capabilities(domain?)` — sin `domain`, mapa de dominios + verbos +
  defaults; con `domain` (transcription/audio/clips/media/…), los **valores
  válidos** (modelos, voces disponibles, motions, crop_modes…) y la guía.
- `list_projects()` — proyectos del editor (id, nombre, formato, duración).
- `resolve_project(query)` — resuelve por id/prefijo o nombre → `{project_id}` o
  `candidates[]` si es ambiguo. El `project_id` es obligatorio en el resto.

**Resources (estado de solo lectura, para clientes que los leen)**
- `capabilities://index` · `config://runtime` · `help://<domain>`
- `project://<pid>` · `project://<pid>/timeline` · `project://<pid>/clip/<cid>` ·
  `project://<pid>/media`

**Lectura / orientación**
- `get_project_context(project_id)` — resumen: formato, material, timeline,
  historial. **Primer paso para orientarte en un proyecto.**
- `get_timeline` · `inspect_clip` (un clip completo) · `list_media`
- `get_frame(clip_id, at)` — extrae un frame para que el modelo lo *mire* (ojos de la IA)
- `search_transcript(query)` — busca en el guion para editar por contenido
- `get_job` · `wait_for_job(job_id, timeout_s)` · `list_jobs`

**Media / ingesta**
- `analyze_youtube(url, …)` — tramos del heatmap (síncrono)
- `create_clips_from_segments(project_id, url, segments, crop_mode)` — job de recorte
- `fetch_image(project_id, url)` — trae una imagen al proyecto
- `delete_media` *(destructive)*

**Edición estructural**
- `add_to_timeline` (clip/audio/imagen) · `move_clip` · `split_clip` ·
  `remove_clip` *(destructive)*
- `freeze_frame(clip_id, at_time, duration=3)` — congela el fotograma de un vídeo
  (ver [CONGELAR_FOTOGRAMA.md](CONGELAR_FOTOGRAMA.md))
- `detect_beats(clip_id, every=1)` · `set_timeline_markers(markers)` — beats de la
  música y marcadores de la timeline (ver [BEATS_MARCADORES.md](BEATS_MARCADORES.md))
- `apply_recipe(recipe, clip_ids?, params?)` — un truco completo en un paso (etalonaje,
  reflejo, texto que atraviesas, franjas al ritmo, sujeto; ver [RECETAS.md](RECETAS.md))
- `add_cinema_bars(ratio, start?, duration?, animate?)` — barras de cine encima de todo
  (ver [BARRAS_CINE.md](BARRAS_CINE.md))
- `add_adjustment_layer(start, duration, filters?, effects?, intensity?)` — capa de ajuste
  sobre todo lo de debajo (ver [CAPA_AJUSTE.md](CAPA_AJUSTE.md))
- `sound_design(clip_id, apply=True)` — sonoriza una escena con SFX de la biblioteca (job;
  ver [SONORIZAR_IA.md](SONORIZAR_IA.md))
- `track_object(clip_id, box, at_time, follower_clip_id?, mode?)` — sigue un objeto de un
  vídeo y hace que otro clip lo acompañe (job; ver [SEGUIMIENTO_OBJETOS.md](SEGUIMIENTO_OBJETOS.md))
- `paste_clip_attributes(source_clip_id, target_clip_ids, groups?)` — pega atributos
  de un clip en otros eligiendo qué grupos (ver [PEGAR_ATRIBUTOS.md](PEGAR_ATRIBUTOS.md))
- `reframe_clip` (center/manual) · `crop_clip` (recorte fijo o `reset`, por clips o pista; ver [RECORTAR.md](RECORTAR.md)) · `set_project_format` (9:16…)
- `add_track` · `remove_track` *(destructive)* · `add_shape` · `duplicate_clip`
  (`add_shape(points=[[x,y],…])` traza una ruta libre y `shape.dash` la hace discontinua
  o punteada; ver [TRAZADO_PLUMA.md](TRAZADO_PLUMA.md))
- `rename_track` (nombrar líneas: A1 / SFX / Voz)
- `link_tracks` / `unlink_track`
- `add_subtitles(source_clip_id, segments, style?)` — `style` admite la sombra completa
  (`shadow_*`, ver [TEXTO_ESTILO.md](TEXTO_ESTILO.md))

**Propiedades por-clip**
- `update_clip(clip_id, patch)` — escalares en una operación (un solo undo):
  `patch` = opacity, speed/keep_pitch/reverse, appear/exit, position/start/duration,
  role (caption/free), flip_h/flip_v (voltear; ver [VOLTEAR.md](VOLTEAR.md)),
  blend_mode (modo de fusión; ver [MODOS_FUSION.md](MODOS_FUSION.md)), disabled
  (desactivar sin borrar; ver [DESACTIVAR_CLIP.md](DESACTIVAR_CLIP.md))
- `set_clip_effects` (blur/grayscale/sepia/brightness… + exposure/whites/temperature/hue; `filters`
  = pila de filtros de color con intensidad, ver [FILTROS_COLOR.md](FILTROS_COLOR.md)) · `set_clip_masks` (máscaras: film, target adjust, texto; ver [MASCARAS.md](MASCARAS.md)) · `set_clip_audio_fx`
  (eq/compressor/reverb… y filtros underwater/telephone/radio/megaphone/muffled; `ramp` anima
  la intensidad; ver [FILTROS_SONIDO.md](FILTROS_SONIDO.md))
- `set_clip_keyframes` (x/y/scale/rotation/opacity)
- `set_clip_ai_description` — describe el material con IA (para búsqueda/orientación)

**Audio**
- `set_clip_volume` (0–2, mute, fade in/out) · `set_track_audio` (toda una pista)

**Animación**
- `animate_clip` (zoom / giro / slide / aparecer con un SFX; `draw_in` dibuja el trazo de
  una figura) — vía recomendada;
  **no** escribas keyframes a mano. En **textos** la animación también sale en el
  export ([TEXTO_ANIMADO.md](TEXTO_ANIMADO.md))
- `set_clip_keyframes` (experto): cada item admite `interpolation` (cúbicas, `back-out`,
  `bezier` + `bezier:[x1,y1,x2,y2]`…) — ver [CURVAS_ANIMACION.md](CURVAS_ANIMACION.md); en textos, `props.rot_x/rot_y`
  giran en 3D ([TEXTO_ESTILO.md](TEXTO_ESTILO.md#texto-3d-4))

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
