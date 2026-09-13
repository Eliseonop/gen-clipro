# Checklist — "Generar Motion" contextual desde la timeline

> **Objetivo:** clic derecho en la timeline → la IA recibe **solo el contexto de ese tramo** → propone → genera → preview → se inserta **editable** en su sitio exacto. Usable desde el chat del editor y desde Claude por MCP.
> **Plan aprobado:** `C:\Users\Edu\.claude\plans\warm-skipping-gizmo.md` · **Motor:** el existente (composición JSON → HTML/GSAP → Playwright). Ni HyperFrames ni Remotion.

**Decisiones fijadas**

| Tema | Decisión |
|---|---|
| IA | Chat actual (proveedor configurado) **+** tools MCP para Claude |
| Rango | Teclas **I / O** (Alt+X borra). Sin rango: clic + 5 s, editable |
| Fotogramas | Apagados por defecto; casilla en el modal |

**Leyenda**

| Marca | Significado |
|---|---|
| `[ ]` | Pendiente |
| `[~]` | Hecho a medias / falta verificar |
| `[x]` | Hecho y verificado |
| `[!]` | Riesgo o deuda a vigilar |
| `[-]` | Descartado |

**Estado:** Fase 1 hecha (falta probarla en la UI) · Fases 2–5 pendientes.

---

## 0. Bloqueos y operación

- [ ] 0.1 **Reiniciar el backend**: la ventana "video-yt backend" quedó colgada tras el `--reload` (espera a que cierren las conexiones de `mcp-remote`). Cerrarla y relanzar `start.bat`.
- [x] 0.2 `start.bat`: añadido `--timeout-graceful-shutdown 3` para que no se repita (uvicorn 0.52.4 lo soporta).
- [ ] 0.3 Hacer commit de este trabajo **aparte** del resto de cambios sin commitear de la rama `bgremove`.

## 1. Fase 1 — Acción, rango y contexto

**Backend**
- [x] 1.1 `backend/app/motion/segment_context.py`: `build_segment_context(proj, start, end, playhead, clip_id)`.
  - [x] Guion anterior / actual / siguiente, por prioridad: subtítulos (tiempos por palabra) → transcripción del material → texto del audio (estimado).
  - [x] `keyTerms`, `activeClip`, `existingElements`, `motionInRange` (solape), `availableAssets` ordenados por coincidencia, `style` (formato, fuente/acento de subtítulos, `avoidY`).
  - [x] Compacto: ≈2,3 KB en DESCUBRIMIENTO 27,12–32,12.
- [x] 1.2 Foco del editor en memoria (`set_focus` / `get_focus`).
- [x] 1.3 `GET /api/projects/{pid}/motion/segment-context` y `POST /api/projects/{pid}/motion/focus` (declarados antes de `/motion/{comp_id}`).
- [x] 1.4 Tool MCP `motion_segment_context` (sin tiempos usa el foco del editor).
- [x] 1.5 Dominio `motion` en `help_content.py` (`TOOL_DOMAINS` + guía `HELP["motion"]`), visible en `describe_capabilities`.
- [x] 1.6 Tests `backend/tests/test_motion_context.py` (12). Suite completa: 827 OK.

**Frontend**
- [x] 1.7 `features/editor/motionTarget.js` (+ `motionTarget.test.mjs`): `setMark`, `hasMarkRange`, `resolveGenerateTarget`, `withDuration`, `motionClipName`, `fmtMoment`.
- [x] 1.8 `EdTimeline.jsx`: prop `markRange` (franja en la regla + sombreado), `onContextLane` (hueco de pista y regla), `onContextClip` recibe el tiempo del clic.
- [x] 1.9 `VideoEditor.jsx`: teclas I / O / Alt+X (solo modo Main), "Generar Motion" en el menú del clip y en el menú de pista/regla, `openGenerateMotion` (guarda la timeline antes de abrir).
- [x] 1.10 `features/motion/useGenerateMotion.js` + `GenerateMotionModal.jsx`, paso 1: momento, duración, guion resaltado, términos, en pantalla, aviso de motion existente, casilla de fotogramas, indicación.
- [x] 1.11 Estilos `.ed-mark-range`, `.ed-mark-shade`, `.gm-*` en `editor.css`. Build Vite OK.

**Verificación pendiente**
- [ ] 1.12 En la app (tras 0.1): DESCUBRIMIENTO → I en 27,12, O en 32,12 → clic derecho → el modal muestra "El modelo descubrió una forma de demostrar…".
- [ ] 1.13 Clic derecho en un hueco sin rango → tramo = clic + 5 s; cambiar la duración en el modal refresca el contexto.
- [ ] 1.14 Con el modal abierto, Espacio / Supr / I / O **no** actúan sobre la timeline; Esc cierra.
- [ ] 1.15 Por MCP: `motion_segment_context("93e6e48c", 27.12, 32.12)` responde, y sin tiempos usa el foco que dejó el modal.
- [!] 1.16 Limitación conocida: cambiar la duración en el modal no mueve la marca I/O (es a propósito, pero hay que confirmarlo contigo).

## 2. Fase 2 — Propuesta de la IA

- [x] 2.1 Refactor: helper compartido de extracción de fotograma en `backend/app/frame_grab.py` (`extract_frame`, `montage_jpeg`); `tools_vision.get_frame` lo usa.
- [x] 2.2 Tool MCP `motion_segment_frames(project_id, start?, end?, n=3)` (read): vídeo superior en cada instante (`segment_context.top_video_source_at`) → fotograma de la fuente → `montage_jpeg`. Sin tiempos usa el foco (I/O). Añadido a `TOOL_DOMAINS` y a la guía `HELP["motion"]`.
  - [!] Limitación documentada en la tool: sale de la **fuente**, no del compuesto (sin textos ni overlays). Si no hay vídeo con archivo, devuelve nota sin imagen.
- [x] 2.3 `backend/app/motion/generate.py` → `propose_stream(pid, *, ctx, hint, frames)` (async gen SSE):
  - [x] `provider.run` con `tools=[]` (+ `motion_segment_frames` solo si `frames`), `history=[]` (sin historial).
  - [x] Salida JSON estricta `{type, title, concept, duration, background: transparent|opaque, elements[]}`, `_extract_json` (tolera ``` y prosa) + `_normalize`; un reintento (`MAX_ATTEMPTS=2`) forzando JSON puro sin fotogramas.
  - [x] Reutiliza `help_content.guide("motion")` en el system prompt (sin duplicar `ai/agent.py`).
- [x] 2.4 Endpoint SSE `POST /api/projects/{pid}/motion/generate/propose` (reconstruye el contexto desde la timeline guardada; no toca la timeline).
- [x] 2.5 `services/api.js`: `streamSSE(url, body, onEvent, signal)` extraído de `aiChat`; `proposeMotion(...)` lo reutiliza.
- [~] 2.6 Modal, paso 2 (`GenerateMotionModal` + `useMotionProposal`): tarjeta **Tipo / Duración**, título y concepto editables, lista de elementos; botones [Atrás] [Otra idea] [Generar] ([Generar] queda desactivado hasta la Fase 3 vía prop `onGenerate`). Streaming del texto mientras propone. Estilos `.gm-card/.gm-field/.gm-stream…`. Build OK. **Falta probar en la app.**
- [x] 2.7 Tests `backend/tests/test_motion_generate.py` (13): JSON válido, inválido→reintento, todo inválido→error, frames on/off (tool ofrecida), sin historial, normalización, hint, `_extract_json`. Suite completa: 838 OK (arreglado el patch de `tools_vision.shutil` → `frame_grab`).
- [ ] 2.8 Verificar con el proveedor configurado (Groq/OpenRouter) y por MCP con Claude (`motion_segment_frames`, propose end-to-end).

## 3. Fase 3 — Generación y preview (antes de insertar)

- [x] 3.1 `motion_create_composition(…, for_range={start, end})` **y** `motion_update_composition(…, for_range?)`: helper `_apply_for_range` fuerza `duration = end − start`, el formato del proyecto (`_project_format`) y `metadata = {source:"generate_motion", range, draft:true, title, created_at}`.
- [x] 3.2 `generate.create_stream(pid, *, ctx, proposal, variant_of?)` (async gen SSE, patrón queue+worker como `ai/agent`):
  - [x] Tools filtradas (`_CREATE_TOOLS`): `motion_list_templates`, `motion_create_composition`, `motion_update_composition` (sin add_to_timeline). `for_range` se inyecta en `call_tool` (no lo expone al modelo).
  - [x] Captura `composition_id` en `state["cid"]`; los errores (MCPError del validador) vuelven a la IA como texto para que corrija; `max_iters=6`.
  - [x] Prompt obliga a usar TEMPLATE para diagramas complejos (reutiliza `HELP["motion"]`).
- [x] 3.3 Endpoint SSE `POST /api/projects/{pid}/motion/generate/create`; `variant_of` = **Regenerar**: `call_tool` redirige el `create` a `update` sobre el mismo id (nunca crea otra composición).
- [~] 3.4 Modal, paso 3 (`GenerateMotionModal` + `useMotionDraft`): preview con `MotionCanvas` + transporte (play/pausa + scrubber); [Atrás] [Regenerar] [Editar en Motion Studio] [Agregar al timeline]. **[Agregar]** queda desactivado hasta la Fase 4 (prop `onAddToTimeline`); **[Editar en Studio]** cableado en VideoEditor (`onEditInStudio → goMotionTab(cid)`). Build OK. **Falta probar en la app.**
- [x] 3.5 Cancelar / cerrar (Esc, X, click fuera) sin insertar → `useMotionDraft.discard` borra el borrador (`deleteMotion`); también al desmontar. `keep()` evita el borrado al insertar / editar en Studio.
- [x] 3.6 `motion_service.cleanup_generate_drafts(pid, max_age_s=7200)`: borra borradores `generate_motion` huérfanos (viejos y no usados por ningún clip). Se llama de forma oportunista al inicio del endpoint `create`.
- [x] 3.7 Tests (en `test_motion_generate.py`, +5): `for_range` fuerza duración/formato/draft; create emite `created` con la duración forzada; regenerar reutiliza el mismo borrador (1 sola composición); cleanup borra viejos huérfanos y conserva recientes. Suite completa: **844 OK**.
- [ ] 3.8 Verificar en la app y por MCP: proponer → Generar → preview → Regenerar → Editar en Studio; y que cerrar sin insertar borra el borrador.

## 4. Fase 4 — Materiales y timeline

**Preview principal de clips motion** (hoy un clip motion NO se ve)
- [x] 4.1 `GET /api/projects/{pid}/motion/{cid}/asset` → WebM (con alfa) de la versión actual (404 si no está renderizado). Usa `service.asset_path`.
- [x] 4.2 `VideoEditor.jsx` `HiddenMedia`: `kind==='video'||'motion'` → `<video playsInline muted={motion}>` (antes montaba `<audio>` para motion).
- [x] 4.3 `editorModel.mediaUrl`: motion → `/api/projects/${pid}/motion/${composition_id}/asset` + `?v=${media_version}` (antes `/api/media/...` → 404).
- [x] 4.4 `lib/clipLayout.videosAt`: acepta `kind==='motion'`. NO añadido a `VISUAL_CLIP_KINDS` (sin recorte/reframe/quitar fondo). El loop de sync de reproducción ya trata cualquier clip con `<video>`.
- [ ] 4.5 Verificar en la app que el alfa VP9 del `<video>` se dibuja transparente en el canvas (ruta overlay de `render/canvas.js`).

**Inserción**
- [x] 4.6 `jobs._run_motion_add` / `motion_add_to_timeline` / endpoint:
  - [x] Parámetros `end`, `mode: add | replace`, `replace_clip_ids` (validados en tool y REST).
  - [x] Pista **"Motion"** (kind video) = último track → compone encima; se crea si falta. `mode='add'` sobre pista Motion ocupada en el tramo → pista Motion nueva (`_pick_motion_track`).
  - [x] Nombre `motion_002_007`, `media_version = str(comp.version)`, se quita `draft` de la metadata, `out_point/source_duration = comp.duration` (= rango). `job.motion_add` trae `{clip_id, track_id, composition_id, start}`.
- [x] 4.7 UI "Agregar al timeline" (`addMotionDraftToTimeline` en VideoEditor, prop `onAddToTimeline` del modal): guarda la timeline → job con progreso (toast) → `reloadTimeline` → selecciona el clip nuevo → cursor a su inicio. `useMotionDraft.keep()` evita borrar el borrador insertado.
- [~] 4.8 Materiales: `MotionElements` → sección "En este proyecto" (`ProjectCompositions`): composiciones no borrador con duración, insignia "en timeline" (prop `timelineCompIds` desde EdMaterial), clic → abre en Motion Studio (`loadComp`), × → confirma y `deleteMotion`. **Falta probar en la app.**
- [x] 4.9 `EdChat.jsx`: el sondeo de auditoría detecta la escritura MCP **externa** más reciente (access write/destructive, `source !== 'ai_chat'`) y llama a `onReload` (evita que el autoguardado pise lo que inserte Claude por MCP). Línea base en el primer sondeo (no recarga de golpe).
- [ ] 4.10 Verificar en la app: el clip queda en el tramo, se ve en el preview, **Ctrl+Z** lo quita y el **export** lo incluye.
- [!] 4.11 Revisar la interacción entre el historial del frontend (`useEditorHistory`) y la inserción hecha por el backend + recarga (la inserción son varias ops de `timeline_store`; el frontend recarga y re-snapshota).
- [x] 4.12 Tests `test_motion_generate.py` (`MotionAddTest`, +5, renderer simulado): crea pista Motion + clip, `media_version`, quita draft, add-sobre-ocupada crea pista nueva, replace borra los clips dados. Suite **849 OK**.

## 5. Fase 5 — Iteración, duplicados y edición

- [ ] 5.1 `motionTarget.motionOverlaps` (+ tests) y aviso en el modal: **Reemplazar / Agregar encima / Cancelar**.
- [ ] 5.2 Menú de un clip motion → **"Editar con IA…"** → mini prompt → `POST …/motion/{cid}/refine`:
  - [ ] Tools `motion_get_composition` / `motion_update_composition` **fijadas a ese `cid`** (rechazar otro id); sin tools de timeline.
  - [ ] Re-render + subir `media_version` en el clip.
- [ ] 5.3 "Editar en Motion Studio" (`goMotionTab(cid)`) → al volver a Main, re-render si cambió la versión y actualizar el clip.
- [ ] 5.4 Tool MCP `motion_delete_composition` (destructive).
- [ ] 5.5 Actualizar `HELP["motion"]` con `for_range`, `mode`, `refine` y el flujo completo.
- [ ] 5.6 Tests del flujo: refine no toca otros clips ni composiciones; replace deja un único clip en el rango.

## 6. MCP (uso con Claude)

- [x] 6.1 `motion_segment_context` + dominio `motion` en `describe_capabilities`.
- [ ] 6.2 `motion_get_frame` y `motion_segment_frames` devuelven la imagen como **texto base64** (≈60 KB de texto): devolver contenido de imagen MCP si `registry._wrap` lo permite.
- [ ] 6.3 `motion_list_compositions` (read): localizar composiciones y borradores sin leer el proyecto entero.
- [ ] 6.4 Esquema tipado para el parámetro `composition` (hoy sin schema: la IA tiene que adivinar).
- [!] 6.5 Unificar la guía: el prompt de `ai/agent.py` (surface `motion_studio`) duplica `HELP["motion"]`.

## 7. Motion Studio — pendientes previos

- [x] 7.1 Reloj único timeline ↔ preview (`motionTime` / `motionSeek`), `__rebuild` conserva el instante, hitbox de la capa seleccionada visible fuera de su tramo.
- [ ] 7.2 En modo Motion, **Dividir** / **Duplicar** de la timeline actúan sobre las capas y pueden desincronizarlas → desactivarlos o convertirlos en no-op.
- [ ] 7.3 Composición "Singularidad — Navier-Stokes" (`mg_6bd94f2d`, DESCUBRIMIENTO) creada pero **no insertada**: decidir fondo (opaco o transparente) e insertarla en 27,12 s. Sirve de prueba real para la Fase 4.
- [ ] 7.4 Proyecto "VIAJE EN EL TIEMPO": 19 composiciones, casi todas duplicadas → decidir limpieza.
- [~] 7.5 Calidad visual: fuentes limpias (Segoe UI) probadas; faltan plantillas minimalistas (títulos, lower third, diagramas) con un único acento.

## 9. Calidad "pro" / Híbrido (el usuario: los motion salían básicos)

> Enfoque elegido: **híbrido** (catálogo + temas + capa `html` avanzada) y **prompts de generación detallados/profesionales**. Referencia: kit HyperFrames (tarjetas HTML+GSAP con tokens+slots; la IA elige y rellena, no dibuja geometría).

- [x] 9.1 **Capa `type:'html'`** (bloque HTML+GSAP escrito por la IA): `models` (html/css/js), `validator` (exige html|js, prohíbe `<script>` en html, cap 20k), `runtime.buildHtmlLayer` (timeline hija anidada en la master → seekable/determinista; `new Function(tl,root,gsap,ctx)`). Desbloquea conteos, barras que se llenan, stagger por letra, flips, reveals.
- [x] 9.2 **Temas/tokens** `motion/themes.py` (dark/editorial/light; bg/surface/text/muted/accent + fuentes + radio; `resolve_theme(name, accent)` usa el acento del proyecto).
- [x] 9.3 **Fuentes de calidad** por CDN (Montserrat/Oswald/Inter/Archivo Black, display=block) + `.mg-html` CSS en `generator`.
- [x] 9.4 **Plantillas nuevas**: `pro_title` (kicker+título que envuelve+subrayado, editable), `bullet_list` (título+bullets escalonados, editable), `bar_chart` (bloque html+GSAP: barras que crecen + conteo). Renderizadas con el motor real → se ven profesionales (capturas enviadas).
- [x] 9.5 **Prompt de generación PRO**: `MOTION_PHILOSOPHY` + `_theme_brief` (marca) + guía de 3 vías (plantilla / capa html / composition) en `generate._create_system_prompt`; `propose` apunta más alto. `HELP["motion"]` documenta plantillas + capa html + diseño pro.
- [x] 9.6 Tests `test_motion_richblocks.py` (+12). Suite **861 OK**. (GOTCHA: `runtime.js`/`generator` cacheados con lru_cache → reiniciar backend.)
- [ ] 9.7 Más plantillas del kit (el usuario dio prompts detallados): stat/número grande que cuenta, comparación antes/después, reloj/countdown con flip, reveal de producto (imagen), intro de logo.
- [ ] 9.8 Verificar con el proveedor real que la IA elige bien plantilla vs capa html y que el resultado sale pro de forma consistente.
- [!] 9.9 La capa `html` ejecuta JS de la IA en el render (Chromium local, single-user) y en el preview (iframe sandbox). Aceptable ahora; revisar si el editor se comparte.

## 10. Motion → vídeo del material (decisión del usuario)

> El clip motion salía "bloqueado" (no se podía ver/mover/cortar). Decisión: al **Agregar al proyecto**, hornearlo a **vídeo del material con alfa** (como Paper Animator) e insertarlo como clip de **vídeo normal** → editable con todo el pipeline.

- [x] 10.1 `jobs._run_motion_add`: renderiza el WebM (alfa) → `videos.import_video(proj, "motion_XXX.webm", …, origin="motion")` lo registra como **material de vídeo** → inserta un clip **kind='video'** (asset_kind='clips', layout='overlay', frame='free', transform centrado) en la pista "Motion". `job.motion_add` añade `material_index`. Ya NO inserta kind='motion'.
- [x] 10.2 `clip_kind.ffmpeg_input_args`: fuerza `libvpx-vp9` para CUALQUIER `.webm` (no solo kind='motion') → el alfa VP9 se respeta en el export también para el motion horneado y para los WebM transparentes de Paper (bug latente arreglado).
- [x] 10.3 Frontend `addMotionDraftToTimeline`: tras el job llama `onChange()` (refresca Materiales) + `reloadTimeline` + selecciona el clip. Verificado E2E con render real (material creado, clip kind=video, alfa forzado). Suite 861 OK.
- [~] 10.4 Compat: los clips `kind='motion'` ya insertados (proyectos viejos) siguen funcionando (se conserva su ruta en compose/preview). Los nuevos son vídeo.
- [ ] 10.5 Probar en la app: agregar → aparece en Materiales (Vídeos) y en la timeline como clip que se ve/mueve/escala/corta; export respeta la transparencia. (Reiniciar backend por el cache de runtime/generator.)
- [!] 10.6 El clip horneado NO es la composición viva: "Editar en Motion Studio" desde ese clip ya no aplica (es vídeo). Para cambiarlo: editar la composición (Motion/Materiales) y volver a agregar. Pendiente decidir si el menú del clip ofrece "regenerar desde su composición".

## 8. Verificación final (E2E)

- [ ] 8.1 `.venv/Scripts/python.exe -m pytest backend/tests -q` → todo verde.
- [ ] 8.2 `node` sobre `motionTarget.test.mjs` + `editorModel.test.mjs`; `npx vite build`; `npx oxlint` en los archivos tocados.
- [ ] 8.3 Flujo en la app: I/O → clic derecho → Proponer → editar concepto → Generar → preview → Regenerar → Agregar → clip en la pista Motion 27,12–32,12 → visible → Ctrl+Z / Ctrl+Y → export con el motion.
- [ ] 8.4 Flujo con Claude por MCP: `motion_segment_context` (foco) → `motion_create_composition(for_range)` → `motion_get_frame` → `motion_add_to_timeline` → el editor abierto lo muestra sin recargar a mano.
- [ ] 8.5 Proyecto sin subtítulos (solo audio TTS) → contexto `audio_text_estimate` razonable.
- [ ] 8.6 Doble clic en el clip motion → Motion Studio → editar → volver → el preview y el export reflejan la nueva versión.
