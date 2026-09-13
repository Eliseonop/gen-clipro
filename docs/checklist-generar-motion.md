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

- [ ] 2.1 Refactor: helper compartido de extracción de fotograma (ffmpeg) sacado de `mcp_server/tools_vision.get_frame`.
- [ ] 2.2 Tool MCP `motion_segment_frames(project_id, start, end, n=3)` (read): clip visual superior en cada instante → fotograma de la fuente → montage (reutilizar `_montage` de `tools_motion.py`).
  - [!] Limitación a documentar: sale de la **fuente**, no del compuesto (sin textos ni overlays).
- [ ] 2.3 `backend/app/motion/generate.py` → `propose(pid, ctx, frames, hint)`:
  - [ ] `provider.run` con `tools=[]` (+ `motion_segment_frames` solo si la casilla está marcada), **sin historial** de conversación.
  - [ ] Salida JSON estricta: `{type, title, concept, duration, background: transparent|opaque, elements[]}`; un reintento si el JSON no es válido.
  - [ ] Reutilizar la guía `HELP["motion"]` en el system prompt, sin duplicar texto de `ai/agent.py`.
- [ ] 2.4 Endpoint SSE `POST /api/projects/{pid}/motion/generate/propose` (mismo patrón que `/api/ai/chat`).
- [ ] 2.5 `services/api.js`: cliente SSE para propose (reutilizar el parser de `aiChat`).
- [ ] 2.6 Modal, paso 2: tarjeta **Tipo / Duración / Concepto / Momento**; concepto y duración editables; botones [Otra idea] [Generar]; la casilla de fotogramas y la indicación ya se usan.
- [ ] 2.7 Tests `backend/tests/test_motion_generate.py` con proveedor simulado (JSON válido, inválido → reintento, frames on/off).
- [ ] 2.8 Verificar con el proveedor configurado (Groq/OpenRouter) y por MCP con Claude.

## 3. Fase 3 — Generación y preview (antes de insertar)

- [ ] 3.1 `motion_create_composition(…, for_range={start, end})`: `duration = end − start` exacto, formato del proyecto, `metadata = {source: "generate_motion", range, draft: true, title}`.
- [ ] 3.2 `generate.create(pid, ctx, proposal, variant_of?)`:
  - [ ] Tools filtradas: `motion_list_templates`, `motion_create_composition`, `motion_update_composition`.
  - [ ] Capturar `composition_id` del resultado; los errores del validador vuelven a la IA para corregir.
  - [ ] Plantillas procedurales para diagramas complejos (los modelos gratis fallan con JSON grandes).
- [ ] 3.3 Endpoint SSE `POST …/motion/generate/create`; `variant_of` = **Regenerar** actualizando el **mismo borrador** (no crear otro).
- [ ] 3.4 Modal, paso 3: preview con `MotionCanvas` + transporte; [Regenerar] [Editar en Motion Studio] [Agregar al timeline].
- [ ] 3.5 Cancelar o cerrar sin agregar → borrar el borrador (`deleteMotion`).
- [ ] 3.6 Limpieza de borradores huérfanos (`metadata.draft` y antigüedad) al abrir el proyecto o bajo demanda.
- [ ] 3.7 Tests: `for_range` fuerza la duración; regenerar no crea composiciones nuevas.

## 4. Fase 4 — Materiales y timeline

**Preview principal de clips motion** (hoy un clip motion NO se ve)
- [ ] 4.1 `GET /api/projects/{pid}/motion/{cid}/asset` → WebM cacheado de la versión actual (404 si no está renderizado).
- [ ] 4.2 `VideoEditor.jsx` `HiddenMedia`: `kind === 'motion'` → `<video muted playsInline>` (hoy monta `<audio>`).
- [ ] 4.3 `editorModel.mediaUrl`: motion → `/api/projects/${pid}/motion/${composition_id}/asset?v=${media_version}` (hoy apunta a `/api/media/...` → 404).
- [ ] 4.4 `lib/clipLayout.videosAt`: aceptar `kind === 'motion'`. **No** añadirlo a `VISUAL_CLIP_KINDS` (evita recorte, reframe y quitar fondo sobre motion).
- [!] 4.5 Verificar que el alfa VP9 del `<video>` se dibuja transparente en el canvas (ruta overlay de `render/canvas.js`).

**Inserción**
- [ ] 4.6 `jobs._run_motion_add` / `motion_add_to_timeline`:
  - [ ] Parámetros `end`, `mode: add | replace`, `replace_clip_ids`.
  - [ ] Pista **"Motion"** arriba del todo; se crea si falta. "Agregar encima" con la pista ocupada → nueva pista Motion encima.
  - [ ] Nombre `motion_027_032`, `media_version = comp.version`, se quita `draft`, y la duración debe coincidir con el rango.
- [ ] 4.7 UI "Agregar al timeline": guardar la timeline → job con progreso → `reloadTimeline` → seleccionar el clip nuevo → cursor a su inicio.
- [ ] 4.8 Materiales: `MotionElements` muestra "En este proyecto" (composiciones no borrador, duración, insignia "en timeline"). Clic → Motion Studio; menú → eliminar.
- [ ] 4.9 `EdChat.jsx`: el sondeo de auditoría llama a `onReload` ante escrituras MCP **externas** en el proyecto (evita que el autoguardado pise lo que inserte Claude).
- [ ] 4.10 Verificar: el clip queda en 27,12–32,12, se ve en el preview, **Ctrl+Z** lo quita y el **export** lo incluye.
- [!] 4.11 Revisar la interacción entre el historial del frontend (`useEditorHistory`) y una inserción hecha por el backend + recarga.

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

## 8. Verificación final (E2E)

- [ ] 8.1 `.venv/Scripts/python.exe -m pytest backend/tests -q` → todo verde.
- [ ] 8.2 `node` sobre `motionTarget.test.mjs` + `editorModel.test.mjs`; `npx vite build`; `npx oxlint` en los archivos tocados.
- [ ] 8.3 Flujo en la app: I/O → clic derecho → Proponer → editar concepto → Generar → preview → Regenerar → Agregar → clip en la pista Motion 27,12–32,12 → visible → Ctrl+Z / Ctrl+Y → export con el motion.
- [ ] 8.4 Flujo con Claude por MCP: `motion_segment_context` (foco) → `motion_create_composition(for_range)` → `motion_get_frame` → `motion_add_to_timeline` → el editor abierto lo muestra sin recargar a mano.
- [ ] 8.5 Proyecto sin subtítulos (solo audio TTS) → contexto `audio_text_estimate` razonable.
- [ ] 8.6 Doble clic en el clip motion → Motion Studio → editar → volver → el preview y el export reflejan la nueva versión.
