# Auditoría técnica + rediseño del MCP `video-yt`

> Documento de especificación. **No cambia código todavía.** Objetivo: transformar
> el MCP de "catálogo de 51 endpoints" en una **capa de capacidades para agentes**
> (descubrimiento progresivo, menos tokens, respuestas pequeñas, errores
> estructurados, workflows sensatos) sin perder flexibilidad ni ocultar potencia.
>
> Base auditada: rama `feat/clip-recipe-live`, `backend/app/mcp_server/*`, SDK
> `mcp==2.1.1` (framework tipo FastMCP), agente in-process en `backend/app/ai/*`.

---

## 0. Resumen ejecutivo (TL;DR)

**Lo que ya está bien** (no romper): DTO semántico que no vuelca datos crudos;
modelo transaccional con undo/redo/checkpoints (`timeline_store.apply_op`);
jobs asíncronos con `job_id → wait_for_job`; auditoría con niveles de acceso;
agente in-process que reusa el MISMO `MCPServer` (sin duplicar tools); contexto
en capas (`get_project_context` → `get_timeline` → `inspect_clip`).

**Los 6 problemas reales:**

1. **Superficie plana de 51 tools, siempre cargadas.** El cliente externo
   (Claude Desktop) y el agente interno reciben los 51 schemas en cada turno.
   No hay agrupación por dominio ni carga bajo demanda.
2. **Descripciones largas dentro de los schemas.** La documentación de uso vive
   en el campo `description` de cada tool (p. ej. `animate_clip`, `add_to_timeline`,
   `generate_subtitles`) → se paga en tokens en TODOS los turnos, se necesite o no.
3. **Configuración/capacidades no descubribles.** Modelos de transcripción,
   motores/voces TTS y su disponibilidad, `crop_mode`, aspectos, nombres de
   efectos/fx/motions, categorías de SFX y los *defaults* de Ajustes **no** se
   pueden consultar salvo leyendo el código. `capabilities[]` es una lista de
   strings sin parámetros ni valores válidos.
4. **Errores opacos.** Todo lanza `ValueError(str)` → el agente recibe texto libre
   sin código, sin `retryable`, sin "qué parámetro corregir".
5. **Niveles de acceso que no hacen nada.** `read/write/destructive` se auditan
   pero **no gatean**. No hay `dry_run` ni `confirm` para las 3 operaciones
   irreversibles reales (`delete_media` borra archivo; `export_project` consume
   render; `set_project_format` reescala todo). Undo cubre lo estructural, no esto.
6. **Granularidad desigual.** 6 setters escalares de clip (`set_clip_opacity`,
   `set_clip_speed`, `set_clip_transition`, `set_clip_layout`, `set_text_role`,
   parte de `set_clip_effects`) que un agente debe elegir uno a uno, frente a
   verbos ricos bien diseñados (`animate_clip`, `add_to_timeline`).

**Decisión de arquitectura central:** en `mcp 2.1.1` **no hay `tools/listChanged`
fiable**, así que *no* se puede filtrar dinámicamente la lista de tools por
intención dentro de una sesión y esperar que el cliente la refresque. El
descubrimiento progresivo **real y portable** se consigue con: (a) **consolidar**
la superficie (51 → ~34), (b) **mover la documentación larga fuera de los schemas**
a **resources** + una tool `help(domain)`, (c) **añadir `describe_capabilities`**
para configuración/valores válidos, y (d) para el **agente interno** (que sí
controlamos) hacer *routing por intención* cargando solo el dominio necesario.
Esto reduce el contexto donde más duele sin depender de un mecanismo que el
protocolo no garantiza.

---

## A. Arquitectura actual

```
Claude Desktop / Claude Code ──HTTP /mcp──┐
                                          ├──► MCPServer("video-yt")  (mcp 2.1.1)
Agente interno (ai/agent.py) ──in-process─┘        │
   Client(server.mcp) → list_tools()               │  registry.tool(access=…)
   vuelca 51 specs al LLM cada turno               │   └ _wrap: audit + timing + errores
                                                    ▼
                        tools_* (context/read/jobs/edit/media/audio/render/workflow/vision)
                                                    │  in-process, sin salto HTTP
                                                    ▼
     projects · timeline_store.apply_op (snapshot→validar→guardar, undo/redo/checkpoints)
     jobs (dict en memoria + threads daemon, cancel cooperativo)
     heatmap · transcribe · tts/piper/gemini · sfx · images · compose (export)
```

**Registro y política** (`registry.py`): cada tool se declara con
`@tool(mcp, access="read|write|destructive")`. El decorador envuelve la función
(`functools.wraps` preserva la firma → el schema se autogenera), audita entrada/
salida/errores, y si el retorno "parece job" lo trackea. El registro interno
`{name: ToolSpec}` existe para inspección; **la política hoy no bloquea nada**.

**DTO** (`dto.py`): traduce el schema interno a vistas compactas
(`project_context`, `timeline_detail`, `clip_summary` sin words/keyframes,
`clip_detail` completo, `job_dto`). `CAPABILITIES` es una lista fija de strings.

**Agente interno** (`ai/agent.py` + `ai/mcp_client.py`): abre un `Client` contra
el mismo `MCPServer`, hace `list_tools()` (los 51), poda el JSON-Schema a lo que
aceptan los proveedores y los pasa TODOS al LLM en cada turno. Auto-espera jobs
emitiendo progreso por SSE. El system-prompt reinyecta a mano gran parte de la
guía que ya está en las descripciones de las tools (duplicación).

**Async** (`jobs.py`): `create_job()` + `start_*_job()` lanzan un `threading.Thread`
daemon; estado en `dict` en memoria (se pierde al reiniciar); cancelación
cooperativa por `cancel_requested`. Patrón de consumo `job_id → get_job /
wait_for_job` (este último bloquea en el threadpool, no en el event loop). Bien.

**Inventario de tools (51):** 11 `read` / 37 `write` / 3 `destructive`.

| Dominio (módulo) | Tools |
|---|---|
| context | `get_project_context` |
| read | `get_timeline` · `inspect_clip` · `list_media` · `search_transcript` |
| jobs | `get_job` · `wait_for_job` · `list_jobs` |
| edit (clips) | `add_to_timeline` · `move_clip` · `split_clip` · `remove_clip`⚠ · `duplicate_clip` · `set_clip_layout` · `reframe_clip` · `set_clip_opacity` · `set_clip_speed` · `set_clip_transition` · `set_clip_effects` · `set_clip_audio_fx` · `set_clip_volume` · `set_clip_keyframes` · `animate_clip` · `set_text_role` · `add_shape` · `add_subtitles` |
| edit (tracks) | `add_track` · `rename_track` · `remove_track`⚠ · `link_tracks` · `unlink_track` · `set_track_audio` |
| edit (proyecto) | `set_project_format` |
| edit (historial) | `undo` · `redo` · `checkpoint` · `restore_checkpoint` |
| media | `analyze_youtube` · `create_clips_from_segments` · `fetch_image` · `delete_media`⚠ |
| audio | `transcribe` · `generate_subtitles` · `generate_voice` · `search_sfx` |
| render | `export_project` · `list_jobs`(dup lógico) · `cancel_job` |
| workflow | `create_short_from_youtube` · `make_short_from_library` |
| vision | `get_frame` · `set_clip_ai_description` |

⚠ = `destructive`.

---

## B. Problemas (detallado)

### B1 · Coste de tokens de la superficie plana
Los 51 schemas + descripciones se envían siempre. Estimación de orden de magnitud:
descripciones de 1–3 frases × 51 + JSON-Schema de params ⇒ **~6–10k tokens de
solo-tools por turno**, tanto en Claude Desktop como en cada iteración del agente
interno (peor: el agente itera hasta 8 veces por mensaje). Para "parte este clip
en el segundo 10" se pagan los schemas de transcripción, TTS, export, visión, etc.

### B2 · Documentación en el sitio equivocado
El "cómo se usa" (ejemplos, listas de valores, avisos) está en `description`.
Ejemplos que se pagan siempre: `animate_clip` (12 líneas), `add_to_timeline`,
`generate_subtitles`, `set_clip_keyframes`. Debería estar en **resources**/`help`,
consultables solo cuando el agente entra en ese dominio.

### B3 · Capacidades no introspectables
No hay forma programática de saber: qué modelos whisper existen y cuál es el
default (`transcribe_settings.MODEL_INFO`), qué motores TTS están **disponibles**
en esta máquina (`gemini_tts.unavailable_reason()`, `piper_tts.available()`,
`tts.available()`), qué `crop_mode`/aspectos/efectos/`audio_fx`/`motion`/categorías
de SFX son válidos. El agente adivina y falla con `ValueError`.

### B4 · Errores no estructurados
`raise ValueError("Proyecto no encontrado: …")` en ~30 sitios. El agente no puede
distinguir "parámetro inválido" (corrige y reintenta) de "recurso no existe"
(replantea) de "dependencia no instalada" (avisa al humano) de "job en curso".

### B5 · Seguridad simbólica
`access` se audita pero no gatea; no hay `dry_run` ni `confirm`. Las 3 operaciones
**no deshacibles** por undo (borra archivo / gasta CPU de render / reescala todo)
se ejecutan igual que un `move_clip`. El foundation transaccional (undo/redo/
checkpoints) ya existe para lo estructural: la brecha es solo estas 3.

### B6 · Granularidad y duplicación
- 6 setters escalares donde 2 tools bastarían (§ Fase 12).
- `list_jobs` está en `render` y `jobs` conceptualmente; `wait_for_job` +
  `get_job` + polling manual del agente coexisten (el agente reimplementa el
  poll en vez de usar `wait_for_job`).
- `analyze_youtube` marcada `read` pero descarga red y es cara (no es "lectura").

---

## C. Arquitectura propuesta

Modelo de **3 capas de descubrimiento** + **superficie por dominios** +
**chokepoint único** para errores/política.

```
Capa 0  MANIFIESTO (siempre, minúsculo)
        · instructions del server (2–3 frases)
        · tool  describe_capabilities(domain?)   → verbos + valores válidos + config
        · resource  capabilities://index          → mapa de dominios (para clientes que leen resources)
        · get_project_context(project_id)          → estado del proyecto + qué se puede hacer

Capa 1  DOMINIOS (tools atómicas, descripciones CORTAS de 1 línea)
        project · media · transcription · timeline · clips · audio · text · render · vision · history

Capa 2  DETALLE BAJO DEMANDA (resources + help)
        · resource  help://<domain>                → guía de uso + ejemplos (lo que hoy infla descriptions)
        · get_timeline / inspect_clip / list_media → detalle de estado
        · describe_capabilities("transcription")   → modelos, default, formatos…

Transversal
        · Workflows (jobs de una llamada): create_short_from_youtube, make_short_from_library, …
        · registry._wrap = ÚNICO chokepoint: audit + errores estructurados + política (dry_run/confirm)
        · Async: job envelope estándar + wait_for_job (ya existe)
```

**Por qué así y no "tool-filtering dinámico":** `mcp 2.1.1` expone `add_tool`/
`remove_tool` pero **no emite `notifications/tools/list_changed`** (no aparece en
`server.py`), y `tools/list` no está parametrizado por el cliente. Mutar la lista
en caliente dejaría a los clientes con un catálogo desincronizado. Los primitivos
**sí soportados y estándar** para "cargar detalle bajo demanda" son **resources**
y **prompts**. Por tanto:

- **Cliente externo (Claude Desktop / Code):** la lista de tools es estática; el
  ahorro viene de **consolidar** (menos tools) + **descripciones de 1 línea** +
  **detalle en resources**. El agente pide `help://clips` solo cuando edita clips.
- **Agente interno (nuestro):** control total sobre qué specs se pasan al LLM ⇒
  **routing por intención real** (Capa 0 siempre + el/los dominios detectados).
  Aquí está el mayor ahorro y no depende del protocolo.

**Etiquetado por dominio:** cada tool lleva `meta={"domain": "...", "access": "..."}`
y `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`). `meta` y
`annotations` YA los soporta `MCPServer.tool(...)` en 2.1.1 (verificado). Sirven
para (a) que `describe_capabilities` agrupe, (b) que clientes capaces marquen las
destructivas, (c) que el router interno filtre por dominio.

---

## D. Tools — mantener / modificar / eliminar

Leyenda acción: **M**antener · **m**odificar · **F**usionar · **E**liminar/renombrar.

| Tool | Dominio | Acción | Motivo |
|---|---|---|---|
| get_project_context | project | m | Sacar `capabilities[]` del payload (va a `describe_capabilities`). |
| get_timeline · inspect_clip · list_media | project | M | Capas de detalle correctas. |
| search_transcript | project/text | M | Verbo "editar por contenido" valioso. |
| get_job · wait_for_job | jobs | M | Patrón async correcto. Promover `wait_for_job`. |
| list_jobs | jobs | m | Mover a dominio `jobs` (quitar de render); añadir `project_id?` filtro. |
| cancel_job | jobs | M | Correcto. |
| add_to_timeline | timeline | M | Verbo rico, resuelve pista/SFX. Descripción → `help`. |
| move_clip · split_clip · duplicate_clip | clips | M | Atómicos, distintos. |
| remove_clip | clips | m | `destructive`+undo ya; añadir `dry_run` opcional. |
| **set_clip_opacity** | clips | **F** | → `update_clip(patch)`. |
| **set_clip_speed** | clips | **F** | → `update_clip(patch)` (mantiene keep_pitch/reverse en el patch). |
| **set_clip_transition** | clips | **F** | → `update_clip(patch)`. |
| **set_clip_layout** | clips | **F** | → `update_clip(patch)` (position + timing). |
| **set_text_role** | text | **F** | → `update_clip(patch)` (solo texto). |
| set_clip_effects | clips | M | Dict con MERGE + validación propia: NO fusionar. |
| set_clip_audio_fx | audio | M | Dict con MERGE: NO fusionar. |
| set_clip_volume | audio | M | Semántica fade/keyframes: mantener. |
| set_track_audio | audio | M | Nivel-pista, distinto de clip. |
| set_clip_keyframes | clips | M | Escape hatch experto; descripción → `help`. |
| animate_clip | clips | M | Verbo de alto nivel excelente. |
| reframe_clip | clips | M | Encuadre de fuente, distinto de animación. |
| add_shape | clips | M | Material nuevo. |
| add_subtitles | text | M | Verbo compuesto valioso. |
| add_track · rename_track · link_tracks · unlink_track | timeline | M | Atómicos. |
| remove_track | timeline | m | `destructive`+undo; `dry_run` opcional. |
| set_project_format | project | m | `destructive`-ish (reescala): añadir `dry_run` (preview del efecto). |
| undo · redo · checkpoint · restore_checkpoint | history | M | Base transaccional; no tocar. |
| analyze_youtube | media | m | Reclasificar acceso: no es `read` puro (red/coste). |
| create_clips_from_segments | media | M | Job correcto. |
| fetch_image | media | M | Correcto. |
| delete_media | media | m | **Único destructivo sin undo**: exigir `confirm` o `dry_run`. |
| transcribe · generate_subtitles · generate_voice | transcription/audio | m | `model`/`engine` validables contra `describe_capabilities`; errores estructurados de disponibilidad. |
| search_sfx | audio | M | Lectura sin proyecto. |
| export_project | render | m | No deshacible + caro: `dry_run` (estimación) recomendable. |
| create_short_from_youtube · make_short_from_library | workflow | M | Workflows válidos. Ver §E. |
| get_frame · set_clip_ai_description | vision | M | Correctas. |
| **describe_capabilities** | manifest | **NUEVA** | Config + valores válidos + defaults + disponibilidad. |
| **update_clip** | clips | **NUEVA** | Absorbe los 5 setters escalares marcados **F**. |
| **help** (o resources `help://`) | manifest | **NUEVA** | Guía por dominio; descarga las descriptions. |

**Balance:** 51 → **~34 tools** ( −5 por fusión en `update_clip`, +2 nuevas
manifest/help, list_jobs recolocada). Ninguna capacidad se pierde; se gana
`update_clip`, descubrimiento de config y guía bajo demanda.

**Sobre la fusión (Fase 12, decisión justificada):** se fusionan **solo** los
setters de **escalares homogéneos sin semántica especial**
(opacity/speed/transition/layout/text_role) en `update_clip(clip_id, patch)`,
donde `patch` es un objeto con esas claves opcionales y validación por-clave.
**No** se fusionan `set_clip_effects`/`set_clip_audio_fx`/`set_clip_volume`/
`set_clip_keyframes` porque tienen (a) forma de diccionario anidado, (b)
semántica de MERGE vs REPLACE, (c) validación de rangos por efecto, y (d)
`set_track_audio` opera a otro nivel. Meterlos en un `update_clip` genérico
crearía parámetros ambiguos y errores del modelo — justo lo que queremos evitar.
Es decir: **consolidación quirúrgica, no una mega-tool**.

---

## E. Workflows que deben existir

Criterio: un workflow existe si (1) encadena ≥3 tools que casi siempre van juntas,
(2) el orden/parametrización es propenso a error si lo hace el agente a mano, y
(3) puede correr como **un solo job** con progreso. Si no, se deja como tools
atómicas para no imponer rigidez.

**W1 · `create_short_from_youtube`** (ya existe — mantener)
- Objetivo: URL de YouTube → short 9:16 subtitulado y exportado.
- Tools internas: heatmap → recorte crop → timeline 9:16 → transcribe → subtítulos → export.
- Entradas: `url`, `crop_mode`, `count`, `model?`, `language?`, `subtitles`, `export`, `min_score`, `max_duration`, `padding`.
- Resultado: job → `result.export_url`.
- Usar cuando: "haz un short de este vídeo". No usar cuando: el usuario quiere
  elegir manualmente los tramos o iterar clip a clip.

**W2 · `make_short_from_library`** (ya existe — mantener)
- Igual que W1 pero desde un clip ya en el proyecto (sin descarga).

**W3 · `create_subtitled_clip`** (NUEVA — opcional, valor medio)
- Objetivo: un clip del material → en timeline 9:16 + transcrito + subtitulado
  (sin export). Es el 80% de W2 sin el paso de render.
- Tools: add_to_timeline → set_project_format(9:16)? → transcribe(clip) → add_subtitles.
- Usar cuando: "mete este clip con subtítulos" sin querer exportar aún.
- **Recomendación:** implementarla solo si en el uso real se repite ese encadenado;
  si no, dejar que el agente combine las 3 tools (ya es fácil). *No crear por crear.*

**W4 · `extract_highlights`** (NO crear como tool nueva)
- `analyze_youtube` + `create_clips_from_segments` ya cubren esto en 2 llamadas,
  y el humano suele querer ver los segmentos antes de recortar. Mantener atómico.

**Regla general:** el catálogo de workflows se queda en **W1+W2** (+ W3 si el uso
lo pide). Todo lo demás permanece componible. Esto respeta "no conviertas todo en
workflows".

---

## F. Descubrimiento de capacidades (cómo, técnicamente)

**F1 · `describe_capabilities(domain: str | None = None)`** — tool `read`.
- Sin `domain`: mapa compacto de dominios y sus verbos (≈ el árbol de §C, ~40
  líneas), + defaults activos (formato del proyecto, modelo whisper de Ajustes,
  motores TTS disponibles).
- Con `domain` (`"transcription"`, `"audio"`, `"clips"`, `"media"`, …): SOLO ese
  dominio con **valores válidos y estado**:
  ```json
  {
    "domain": "transcription",
    "verbs": ["transcribe", "generate_subtitles"],
    "models": [{"id":"base","label":"Base","hint":"...", "default": true}, ...],
    "languages": "auto|es|en|...",
    "notes": "words[] reales; whisper local"
  }
  ```
  ```json
  {
    "domain": "audio",
    "tts_engines": [
      {"id":"kokoro","available":true,"voices":["ef_dora",...]},
      {"id":"piper","available":false,"reason":"no instalado (get_piper.py)"},
      {"id":"gemini","available":false,"reason":"falta API key"}
    ],
    "audio_fx": ["eq","compressor","reverb","echo","denoise","distortion"],
    "sfx_categories": ["whoosh","impact",...]
  }
  ```
- Fuentes (ya existen, solo hay que exponerlas): `transcribe_settings.MODEL_INFO`
  + `.load()`; `tts.available()` / `piper_tts.available()` /
  `gemini_tts.unavailable_reason()` + tabla de voces; `schemas.CropMode`;
  `dto.CAPABILITIES`; `sfx.search(...).categories`; catálogo de `motion` de
  `animate_clip`; nombres de `effects`/`audio_fx`.

**F2 · Resources (para clientes que los leen — Claude Desktop sí):**
- `capabilities://index` → el mapa de dominios (espejo de `describe_capabilities()`).
- `help://<domain>` → la guía larga con ejemplos que HOY vive en las `description`.
- `config://runtime` → GPU (whisper CUDA / NVENC sonda real), rutas de datos,
  límites (max_duration, tamaños), providers de IA activos.

**F3 · `instructions` del server:** recortar a 2–3 frases + "usa
`describe_capabilities()` para ver modelos/voces/valores y `get_project_context`
para el estado". La guía extensa deja de vivir en el prompt del server.

**Flujo de una IA que no conoce el MCP:**
```
get_project_context(pid) → ve estado + "puedo: media/transcription/clips/…"
   ↓ (intención: "subtitula")
describe_capabilities("transcription") → modelos + default, sin cargar TTS/visión
   ↓
transcribe(...) → wait_for_job → add_subtitles(...)
```

---

## G. Eficiencia de tokens (cómo baja)

| Palanca | Antes | Después |
|---|---|---|
| Nº tools siempre visibles | 51 | ~34 |
| Descripciones | 1–3 frases × 51 en cada turno | 1 línea × 34; detalle en `help://` bajo demanda |
| Config/valores válidos | inferidos (o error+reintento) | 1 llamada `describe_capabilities(domain)` puntual |
| Reintentos por valor inválido | frecuentes (`ValueError`) | raros (errores estructurados con `param`+valores) |
| **Agente interno** | 51 specs × hasta 8 iteraciones | Capa 0 (~4 tools) + dominio(s) detectado(s) |
| Duplicación prompt/description | guía repetida en system-prompt y en cada tool | guía única en `help://` |

El mayor ahorro concreto y bajo nuestro control es el **agente interno**: hoy
`ai/mcp_client.tool_specs()` devuelve los 51; con routing por intención pasa a
enviar Capa 0 + 1–2 dominios (≈ 8–12 tools). Es un cambio local en `agent.py`/
`mcp_client.py`, sin tocar el protocolo.

---

## H. Gestión de contexto (proyecto/timeline/clips/jobs/config/resultados)

Mantener el **modelo en capas ya existente** y formalizarlo:

| Nivel | Tool | Devuelve | Cuándo |
|---|---|---|---|
| Resumen proyecto | `get_project_context` | formato + inventario + timeline resumida + historial | Orientación inicial (1×). |
| Timeline | `get_timeline` | pistas + clips (summary, sin words/keyframes) | Antes de editar la timeline. |
| Clip | `inspect_clip` | clip COMPLETO (reframe/keyframes/words) | Solo el clip que se va a tocar. |
| Material | `list_media` | inventario detallado | Elegir asset. |
| Config | `describe_capabilities` | modelos/voces/valores/defaults | Antes de usar un dominio nuevo. |
| Jobs | `get_job`/`wait_for_job`/`list_jobs` | envelope de job | Operaciones largas. |
| Resultados pesados | `result_ref` en el job | id para pedir detalle (ver §I) | Solo si el agente lo necesita. |

**Cambios menores:** sacar `capabilities[]` de `project_context` (→
`describe_capabilities`); `get_project_context` gana `sections?: string[]` para
pedir solo `["timeline"]` o `["media"]` cuando se quiera aún menos.

---

## I. Jobs asíncronos (estrategia)

El patrón actual es correcto; se estandariza y se pule:

1. **Envelope único** para toda operación larga (ya casi lo es en `dto.job_dto`):
   ```json
   {"id":"job_…","status":"pending|running|done|error|cancelled",
    "progress":0-100,"message":"…",
    "result":{"kind":"export|clips|transcript|audio",
              "export_url":"…" | "clips":3 | "transcript_id":"…"},
    "error":{"code":"…","message":"…"} }
   ```
2. **Preferir `wait_for_job`** (bloquea en threadpool con timeout) sobre polling
   manual. Documentarlo en `help://jobs`. El agente interno debe dejar de
   reimplementar el poll y llamar `wait_for_job` (menos llamadas MCP).
3. **`result_ref` para resultados pesados:** el job nunca vuelca el timeline ni la
   transcripción completa; devuelve ids (`transcript_id`, `clips: N`) y el agente
   pide detalle con `list_media`/`inspect_clip` **solo si lo necesita**.
4. **Toda operación cara es job** (ya): transcribe, subtitles, tts,
   create_clips, export, workflows. `analyze_youtube` es síncrona pero rápida;
   dejarla así pero reclasificar su `access`.
5. **Limitación conocida a documentar:** los jobs viven en memoria del proceso →
   se pierden al reiniciar el backend. Aceptable para uso local mono-usuario; si
   se quisiera persistencia, sería una fase posterior (no ahora).

---

## J. Sistema de errores

Un **único punto**: `registry._wrap`. Se define un `MCPError` con código y se
serializa como contenido de error estructurado (JSON) en vez de texto libre.

```python
class MCPError(Exception):
    def __init__(self, code, message, *, hint=None, retryable=False, param=None):
        ...
# _wrap: except MCPError → devuelve {"error":{code,message,hint,retryable,param}}
#        except ValueError → mapear a invalid_parameter/resource_not_found por heurística
#        except Exception  → processing_error (retryable=false) + audita traza
```

**Enum de códigos** (cerrado, corto):

| code | Significado | retryable | El agente debe… |
|---|---|---|---|
| `invalid_parameter` | valor/forma mal | sí | corregir `param` (ver valores en `describe_capabilities`). |
| `resource_not_found` | clip/track/asset/job inexistente | no | releer estado (`get_timeline`/`list_media`). |
| `operation_not_allowed` | p. ej. speed en texto | no | usar otra tool. |
| `configuration_error` | falta API key / modelo | no | avisar al humano (qué configurar). |
| `dependency_error` | Piper/Kokoro/ffmpeg ausente | no | avisar al humano. |
| `processing_error` | fallo interno del job/ffmpeg | a veces | reintentar 1× o reportar. |
| `temporary_error` | red/timeout | sí | reintentar con backoff. |
| `job_running` | acción en curso | sí | `wait_for_job` y reintentar. |

Migración concreta: los ~30 `raise ValueError("Proyecto no encontrado")` →
`raise MCPError("resource_not_found", …, hint="usa get_project_context")`; los
`crop_mode inválido`/`asset_kind inválido` → `invalid_parameter` con
`param` y lista de válidos; las comprobaciones de TTS/whisper →
`dependency_error`/`configuration_error`. **Cambio local por tool, riesgo bajo**,
gracias al chokepoint.

---

## K. Seguridad, confirmación y dry-run

**Estado:** `access` se audita pero no gatea; undo/redo cubre lo estructural.
Solo **3** operaciones son verdaderamente peligrosas/irreversibles:

| Operación | Riesgo | Undo | Propuesta |
|---|---|---|---|
| `delete_media` | borra el ARCHIVO del disco | ❌ no | `confirm: true` **obligatorio** o `dry_run` (qué se borraría). |
| `export_project` | render caro (CPU/tiempo) | n/a | `dry_run` → estimación (duración, nº clips, resolución) sin renderizar. |
| `set_project_format` | reescala/reencuadra todo | ✅ (undo estructural) | `dry_run` → cuántos clips se ven afectados. |
| `remove_clip`/`remove_track` | estructural | ✅ undo | dejar directo; `dry_run` opcional. |
| Workflows (W1/W2) | descargan+renderizan | n/a | `export: false` ya permite frenar antes del render. |

**Mecanismo (en el chokepoint, no por tool):**
- El decorador `tool(..., access="destructive")` puede exigir `confirm=True` si
  una política de servidor lo activa (`REQUIRE_CONFIRM_DESTRUCTIVE`), devolviendo
  `operation_not_allowed`/`invalid_parameter` con `hint:"reenvía con confirm=true"`.
- `dry_run: bool = False` se acepta en las tools listadas; con `dry_run` la tool
  calcula y devuelve el **efecto previsto** sin aplicar (no crea job, no borra).
- `annotations.destructiveHint=True` en esas tools → los clientes MCP que lo
  respetan piden confirmación al humano automáticamente. Es la vía **portable**
  (mejor que inventar un protocolo de confirmación propio).
- **No** añadir undo a `delete_media`/`export`: no aplica (archivo/render). La
  protección correcta ahí es `confirm`/`dry_run`, no historial.

**Undo/transacciones (Fase 14):** ya resuelto para lo estructural por
`timeline_store.apply_op` (snapshot→validar→guardar) + `undo/redo` +
`checkpoints`. No hace falta una capa transaccional nueva; sí **documentar** en
`help://history` que TODA edición de timeline es deshacible y que un `checkpoint`
antes de un cambio grande es la red de seguridad recomendada para el agente.

---

## L. Punto de entrada: el PROYECTO (no la tool)

Requisito: el usuario dice *qué quiere*, nunca *qué tool/MCP/workflow*. El punto
de entrada es el proyecto (`ae0c63c0`), y el agente resuelve proyecto → intención
→ capacidades → operaciones. Antes de diseñar hay que separar **dos entradas
reales** que este código ya tiene, porque se resuelven distinto:

### L1 · Dos puntos de entrada, dos formas de resolver el proyecto

**(a) Chat interno del editor** (`/api/ai/chat` → `ai/agent.py`). **Ya cumple el
requisito.** La UI inyecta `project_id` + `context` (`selected_clip_id`,
`selected_track_id`, `current_time`) en cada turno (`main.py:801`,
`agent._system_prompt`). El usuario **nunca** teclea el `project_id`: es el
proyecto que tiene abierto. Aquí "el punto de entrada es el proyecto" es literal.

**(b) Cliente MCP externo** (Claude Desktop/Code por `mcp-remote`). **No** hay
proyecto ambiente: el humano lo nombra ("Editor ae0c63c0") y **toda tool exige
`project_id`**. Hoy falta la pieza para resolver "abre mi proyecto Editor" por
nombre: existe `projects.list_projects()` pero **no está expuesto como tool MCP**.

### L2 · `current_project`: por qué NO puede ser estado global del servidor

Tentación: guardar `current_project` en el `MCPServer` y que las tools lo usen si
falta `project_id`. **Es inseguro en esta arquitectura** y hay que descartarlo
explícitamente: el **mismo objeto `MCPServer` in-process lo comparten a la vez**
el agente del editor y el/los clientes externos (§A). Un `current_project` global
provocaría *cross-talk*: el chat cambia el "actual" y una tool disparada por
Claude Desktop editaría **otro** proyecto. Justo el "modificar accidentalmente
otro proyecto" que el requisito prohíbe.

**Solución correcta — `current_project` con alcance de conversación, `project_id`
explícito en el límite del protocolo:**

- El `project_id` sigue siendo **obligatorio en toda tool mutadora** (defensa en
  profundidad; ya es así). El protocolo nunca "adivina" el proyecto.
- El "actual" vive en la **conversación**, no en el servidor:
  - entrada (a): lo pone la UI (autoritativo; el texto del chat NUNCA lo pisa).
  - entrada (b): el agente lo fija UNA vez por conversación (vía `resolve_project`)
    y lo reinyecta en cada llamada. Es memoria del agente, no estado compartido.
- Cambio de proyecto explícito ("trabaja con ae0c63c0") = re-resolver y actualizar
  la variable de conversación; jamás un flag mutable de proceso.

### L3 · Piezas nuevas para la entrada-por-proyecto (mínimas)

| Pieza | Tipo | Qué hace | Para quién |
|---|---|---|---|
| `list_projects()` | tool `read` | `[{id,name,format,duration,updated}]` compacto | externo (elegir/desambiguar). |
| `resolve_project(query)` | tool `read` | id-prefix o nombre → `{project_id}` o `candidates[]` si ambiguo | externo ("abre mi proyecto Editor"). |
| `project://{id}` (+ `/timeline`, `/clip/{cid}`, `/media`) | **resource** | estado direccionable de solo-lectura | clientes que leen resources. |

`resolve_project` ambiguo **no adivina**: devuelve candidatos y el agente pregunta
al humano (satisface "qué información adicional pedir, solo si es necesaria").

### L4 · Recursos vs Tools (separación MCP idiomática, con su límite real)

Buena práctica MCP: **Resources** = estado direccionable de **solo lectura, sin
efectos** (app-controlled); **Tools** = operaciones con efecto (y lecturas que
requieren cómputo/parámetros). Mapa propuesto:

```
RESOURCES (estado, pull)                 TOOLS (operaciones, push)
  project://{id}                           get_project_context / get_timeline / inspect_clip  (lecturas fiables)
  project://{id}/timeline                  update_clip / move_clip / split_clip / …           (mutaciones)
  project://{id}/clip/{cid}                transcribe / add_subtitles / export_project        (jobs)
  project://{id}/media                     describe_capabilities / resolve_project            (descubrimiento)
  capabilities://index · help://<domain>
```

**Límite real que impide "solo resources":** muchos clientes (incl. Claude
Desktop) **no cargan resources en contexto automáticamente** — son de selección
manual del usuario/cliente. Y el agente interno consume **tools** de forma fiable,
no resources. Conclusión honesta: los resources se añaden para clientes capaces,
pero **se mantienen las tools de lectura** (`get_project_context`, `get_timeline`,
`inspect_clip`) como camino garantizado. No se elimina lectura de la superficie
de tools por depender de resources.

### L5 · Router de intención (dónde vive y cómo, técnicamente)

El "descubrir capacidades y cargar solo lo relevante" **solo es implementable de
verdad en el cliente que controlamos: el agente interno.** (Un cliente externo
genérico recibe la lista de tools estática; §C/§M). Pipeline para `ai/agent.py`:

```
project_id (de la UI o resolve_project)
   → get_project_context (contexto mínimo, ya compacto tras Fase 1)
   → clasificar intención → dominio(s)          [router]
   → ensamblar tool_specs SOLO de Capa 0 + dominio(s)   ← aquí baja el token cost
   → 1 llamada al LLM con ~8–12 tools (no 51)
   → ejecutar tool/workflow → resultado compacto
```

Clasificador de intención (barato → caro, con fallback):
1. **Mapa de palabras clave → dominio** (determinista, 0 tokens): "volumen/audio/
   fade" → `audio`; "subtítulos/transcribe/guion" → `transcription`+`text`;
   "short/mejores momentos" → `workflow`; "zoom/gira/aparece" → `clips`; etc.
2. **Fallback LLM barato**: si el mapa no decide, una primera pasada con SOLO
   Capa 0 (`get_project_context`, `describe_capabilities`, `list_jobs`) donde el
   LLM elige dominio con `describe_capabilities(domain)`; luego se expande.
3. Regla de seguridad: ante duda, cargar el dominio **más** probable + `clips`
   (el más común). Nunca cargar los 51.

Ejemplos de mapeo (del requisito):
```
"pon el volumen del audio A1 al 50%"   → resource A1(track) · intent set_volume
                                         · domain audio · op set_track_audio
"crea un Short con los mejores momentos"→ intent complex · WORKFLOW create_short_*
                                         · (no construir el pipeline a mano)
```
El router prefiere **workflow** cuando la intención es un objetivo completo con
job de una llamada (§E); si no, compone tools atómicas.

---

## M. Comparativa de arquitecturas (A–E)

Contexto que condiciona todo (verificado, §Anexo): `mcp 2.1.1` **sin
`tools/listChanged`**; `tools/list` **estático por sesión**; **un único
`MCPServer` in-process** compartido por editor interno + externos; Claude Desktop
**carga en contexto todas las tools de todos los servidores** configurados.

| Dimensión | A · MCP único (hoy) | B · MCP por dominios (N servidores) | C · MCP + discovery/router (meta-tools) | D · MCP + workflows + discovery progresivo | **E · Núcleo fino + router en el agente propio (recomendada)** |
|---|---|---|---|---|---|
| **Idea** | 1 server, 51 tools planas | Separar en `project`/`video`/`audio`/… servers | 1 server + `describe_capabilities`/`help`/resources | C + workflows de 1 llamada | D + router de intención en `ai/agent.py` + `resolve_project`/`current_project` de conversación |
| **Ventajas** | Simple; todo en un sitio; sharing in-process trivial | Menor superficie *por servidor*; límites de dominio claros | Descubrimiento + doc bajo demanda sin romper clientes; 1 solo server | Menos round-trips en objetivos complejos; menos decisiones del modelo | Máximo ahorro real de tokens (donde SÍ controlamos el cliente); entrada-por-proyecto segura; extensible |
| **Desventajas** | Todos los schemas siempre; doc en descriptions | **No baja tokens en Claude Desktop** (carga todos los servers); rompe el sharing in-process (¿N objetos MCPServer?); workflows cross-server; N configs | La lista de tools sigue estática para externos (ahorro solo por consolidación/descr.) | Riesgo de workflows rígidos si se abusa | Más lógica en el agente (router, memoria de proyecto); el ahorro pleno es solo para el agente interno |
| **Complejidad** | Baja | **Alta** (infra, despliegue, orquestación cross-server) | Media-baja | Media | Media (concentrada en `agent.py`/`registry.py`) |
| **Tokens** | Peor (51 × turnos) | Igual o **peor** en Desktop; mejor solo si el user activa pocos servers | Mejor (descr. cortas + detalle en resources); tool-list intacta para externos | Como C + menos llamadas por objetivo | **Mejor**: interno ~8–12 tools/turno; externo = C (consolidado a ~34) |
| **Escalabilidad** | Mala (crece la lista plana) | Buena por dominio, cara en infra | Buena (añadir dominio = tag + help) | Buena | **Muy buena** (nuevo dominio: tag + help + entrada en el mapa del router) |
| **Facilidad IA** | Media (mucho ruido) | Baja-media (cross-server confunde) | Alta | Alta (objetivos directos) | **Alta** (ve pocas tools relevantes + valores válidos) |
| **Mantenimiento** | Fácil pero degrada | **Difícil** (N despliegues, versiones) | Fácil | Fácil-medio | **Fácil-medio**, todo en un repo/proceso |

**Descartada B (split en N servidores MCP):** no resuelve el problema de tokens
en el cliente típico (Claude Desktop carga *todas* las tools de *todos* los
servidores configurados a la vez), y **rompe la ventaja arquitectónica actual**:
el agente interno y el editor comparten el MISMO `MCPServer` in-process (sin salto
HTTP, sin tools duplicadas, estado vivo compartido). Trocearlo obligaría a N
objetos/servidores y a orquestar workflows entre dominios. Coste alto, beneficio
nulo o negativo aquí. (Sí tendría sentido si algún día hubiera dominios
verdaderamente independientes y despliegues separados — no es el caso.)

**Recomendación: Arquitectura E** = **un solo MCP (Arch A como base física) +
capa de descubrimiento/consolidación (C) + workflows medidos (D) + router de
intención y entrada-por-proyecto en el agente que sí controlamos.**

Justificación técnica:
1. **Respeta los límites reales del protocolo.** No inventa tool-hiding dinámico
   que `mcp 2.1.1` no soporta de forma fiable. El ahorro pleno de tokens se logra
   donde el protocolo lo permite: **nuestro** agente (control total del `tool_specs`).
2. **Para clientes externos** (que no controlamos) baja el coste por la vía
   portable: **consolidar** (51→34), **descripciones de 1 línea**, **detalle en
   resources/`help`**, **valores válidos en `describe_capabilities`**. No promete
   un ahorro que el cliente no puede dar.
3. **Preserva la mejor decisión ya tomada**: un único `MCPServer` in-process
   compartido. E se construye encima, sin romperlo.
4. **Entrada-por-proyecto segura**: `project_id` explícito en el límite +
   `current_project` de conversación (no global) → cero cross-talk entre el
   editor y Claude Desktop sobre el mismo proceso.
5. **Extensible**: añadir una capacidad nueva = una tool con su `meta.domain`, una
   entrada en `help://` y una línea en el mapa del router. Sin nuevos servidores.

En una frase: **no dividimos el MCP; hacemos el MCP descubrible y ponemos la
inteligencia de routing en el agente**, porque es el único punto donde el ahorro
de tokens y el "el usuario no elige la tool" se pueden implementar de verdad.

---

## Plan de implementación por fases

Orden por **beneficio/coste**. Cada fase es autónoma y no rompe clientes previos.

> **Estado:** ✅ Fase 1 · ✅ Fase 2 · ⬜ Fases 3–6.

### ✅ Fase 1 — Quick wins de tokens (riesgo BAJO) — HECHA (2026-09-04)
- **Archivos:** `mcp_server/server.py` (recortar `INSTRUCTIONS`), todos los
  `tools_*.py` (descripciones a 1 línea), `dto.py` (sacar `capabilities` de
  `project_context`).
- **Cambios:** mover el "cómo" de las descripciones a un borrador de `help://`.
- **Dependencias:** ninguna. **Resultado:** −40–60% tokens de descripciones sin
  tocar comportamiento ni firmas.
- [x] `INSTRUCTIONS` recortado (~9 → 5 líneas).
- [x] 51 descripciones a 1 línea (≈8.1k→4.4k chars, ~2.0k→~1.1k tokens, −45%;
  0 multilínea).
- [x] `capabilities[]` fuera del payload de `get_project_context` (función
  `dto.capabilities()` conservada).
- [x] Nuevo `help_content.py` con la guía larga por dominio + `TOOL_DOMAINS`.
- [x] Tests actualizados (`test_mcp_context`, `test_mcp_dto`); **123 MCP + 10 IA OK**.

### ✅ Fase 2 — Descubrimiento + entrada-por-proyecto (riesgo BAJO) — HECHA (2026-09-04)
- **Archivos:** nuevo `mcp_server/tools_capabilities.py` (`describe_capabilities`,
  `list_projects`, `resolve_project`), nuevo `mcp_server/resources.py`
  (`capabilities://`, `help://`, `config://`, `project://{id}` + `/timeline`
  `/clip/{cid}` `/media`), nuevo `mcp_server/capabilities.py` (builders puros),
  `registry.py` (meta+annotations), registro en `server.py`.
- **Cambios:** exponer fuentes existentes (transcribe_settings, tts availability,
  CropMode, sfx categories, motions; `projects.list_projects`). Añadir
  `meta.domain`/`annotations` a cada `@tool`. `resolve_project` devuelve
  `candidates[]` si hay ambigüedad (no adivina). Ver §L3/§L4.
- **Dependencias:** Fase 1 (textos de `help`). **Resultado:** la IA descubre
  config/valores y **resuelve el proyecto por nombre/id** → cliente externo puede
  entrar por proyecto; menos reintentos.
- [x] `describe_capabilities(domain?)`: sin domain → dominios+verbos+defaults;
  con domain → valores válidos (modelos, voces disponibles, motions, crop_modes…)
  + guía. Fuente única en `capabilities.py`.
- [x] `list_projects()` + `resolve_project(query)` (id/prefijo/nombre; `candidates[]`
  si ambiguo; `ValueError` si nada coincide). Total MCP: 51 → **54 tools**.
- [x] Resources: `capabilities://index`, `config://runtime` (estáticos) +
  `help://{domain}`, `project://{pid}` (+`/timeline`, `/clip/{cid}`, `/media`)
  (plantillas). Se mantienen las tools de lectura (§L4).
- [x] `meta={domain,access}` + `annotations` (read_only/destructive hint) en las
  54 tools vía el chokepoint `registry.tool()`.
- [x] `help_content`: nuevo dominio `discovery`. Tests: `test_mcp_capabilities.py`
  (15). **138 MCP + 10 IA OK.**

### Fase 3 — Errores estructurados (riesgo MEDIO)
- **Archivos:** `mcp_server/registry.py` (clase `MCPError` + serialización en
  `_wrap`), sustituir `ValueError` por `MCPError` en `tools_*`.
- **Cambios:** enum de códigos §J; mantener retrocompat (texto sigue presente en
  `message`). **Dependencias:** ninguna. **Resultado:** recuperación fiable del
  agente; base para `retryable`.

### Fase 4 — Consolidación quirúrgica (riesgo MEDIO)
- **Archivos:** `tools_edit.py` (nueva `update_clip`; los 5 setters escalares
  pasan a llamar internamente al mismo `apply_op`, se deprecan o se eliminan),
  `dto.py` si cambia el resumen. Actualizar `docs/MCP_USO.md` y tests
  (`test_mcp_*`).
- **Cambios:** `update_clip(clip_id, patch)`; **mantener** effects/audio_fx/
  volume/keyframes/track_audio separados (justificado §D).
- **Dependencias:** Fase 3 (errores por-clave). **Resultado:** 51→~34 tools.

### Fase 5 — Router de intención + entrada-por-proyecto en el agente (riesgo MEDIO)
- **Archivos:** `ai/agent.py`, `ai/mcp_client.py`.
- **Cambios:** (1) `tool_specs()` acepta `domains: list[str]` (filtra por
  `meta.domain`); (2) router de intención §L5 (mapa de palabras clave →
  dominio(s), con fallback LLM sobre Capa 0); el agente arranca con Capa 0
  (`get_project_context` + `describe_capabilities` + jobs) y expande al/los
  dominio(s) detectado(s); (3) `current_project` de **conversación** §L2: la UI
  es autoritativa; el texto no lo pisa; `project_id` explícito en cada llamada;
  (4) usar `wait_for_job` en vez del poll manual.
- **Dependencias:** Fases 2 y 4. **Resultado:** el mayor ahorro de tokens real
  (~8–12 tools/turno en vez de 51), sin depender del protocolo; el usuario no
  elige tool ni conoce el `project_id`.

### Fase 6 — Seguridad + robustez de jobs (riesgo MEDIO)
- **Archivos:** `registry.py` (gate `confirm` para `destructive`, flag de
  política), `tools_media.py`/`tools_render.py`/`tools_edit.py` (`dry_run` +
  `annotations.destructiveHint`), `dto.py` (envelope de job + `result_ref`),
  opcional persistencia de jobs (fuera de alcance inicial).
- **Cambios:** §K y §I. **Dependencias:** Fase 3 (códigos de error).
  **Resultado:** operaciones irreversibles protegidas; jobs uniformes.

---

## Anexo — Verificaciones técnicas hechas

- SDK: `mcp 2.1.1` (framework tipo FastMCP). `MCPServer` soporta `tool`,
  `resource`/`add_resource`, `prompt`/`add_prompt`, `add_tool`/`remove_tool`,
  `middleware` (lista), `custom_route`, `completion`. **No** se encontró emisión
  de `notifications/tools/list_changed` → mutar tools en caliente no es fiable
  para clientes ⇒ progressive disclosure vía resources/help/consolidación.
- `MCPServer.tool(...)` acepta `annotations` (ToolAnnotations: readOnly/
  destructive/idempotent/openWorld hints) y `meta` (dict) → usados para dominios/
  política. Verificado por firma.
- Tool object expone `annotations`, `meta`, `input_schema`, `output_schema` →
  suficiente para etiquetado y `structured_output` futuro.
- `list_tools()` es estático por sesión (no filtra por cliente) → confirma la
  estrategia de §C/F.
- Agente interno reusa el MISMO `MCPServer` in-process y hoy vuelca los 51 specs
  por turno (`ai/mcp_client.tool_specs`) → punto de intervención de Fase 5.
- Jobs: `dict` en memoria + threads daemon + cancel cooperativo → correcto pero
  volátil al reiniciar (documentado en §I).
```
