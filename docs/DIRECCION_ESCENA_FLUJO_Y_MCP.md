# Dirección de escena — flujo actual y qué le falta al MCP

> Estado a **2026-09-14**. Complementa a [`GENERAR_ESCENA.md`](GENERAR_ESCENA.md) (spec de Generar Escena)
> y a su §10 (Dirección de escena). Aquí se documenta el **flujo de trabajo real de hoy** de punta a
> punta y un **checklist** de lo que el MCP necesitaría para que una IA externa pudiera dirigir y montar
> el vídeo entero sin tocar la UI.

---

## 1. El flujo de trabajo actual (end to end)

La idea es una cadena determinista donde **la app hace lo mecánico y la IA solo decide lo visual**, tramo
a tramo. Cada paso deja un artefacto persistente que el siguiente reutiliza.

```
 audio narrado
   │  transcribe / generate_subtitles
   ▼
 guion con tiempos  ──────────────►  (subtítulos → transcripción del material → texto del
   │                                  audio con tiempos estimados → nada)  · nunca se ASUME que hay subs
   ▼
 DIRECCIÓN DE ESCENA (escaleta)      Project.scene_directions  ·  app/scene_direction.py
   │  auto-split en tramos ≈6 s
   │  por tramo: modo + instrucción + strict + materiales + referencia
   ▼
 build_pack  (SOLO el contexto de UN tramo, ≈300-500 tokens)
   │  pack_text = lo EXACTO que ve la IA (visible en la UI)
   │  skeleton_beats = beats ya cortados por palabras/frases
   ▼
 GENERAR ESCENA por tramo           metadata.scene  ·  app/motion/scene*.py
   │  questions (SSE) → plan (SSE) → build (SSE, beat a beat)
   ▼
 MotionComposition (escena)         layers derivadas de metadata.scene
   │  add-to-timeline (se hornea a vídeo con alfa del material)
   ▼
 TIMELINE                           status del tramo: empty → ready → generated → placed
```

### 1.1 Preparación del guion
- El punto de partida es el **audio narrado** en la timeline. Con `transcribe` / `generate_subtitles`
  se obtiene el texto con tiempos.
- `scene_direction.script_units(proj)` construye las **frases con tiempo** buscando, en este orden:
  1. subtítulos (`captions`), 2. transcripción del material, 3. texto del audio con tiempos
  proporcionales, 4. nada. **Nunca asume subtítulos**: un tramo sin voz sigue siendo dirigible con
  instrucción + materiales.

### 1.2 La escaleta (Dirección de escena)
- UI: botón **Dirección de escena** en la barra de la timeline y en los menús contextuales →
  `frontend/src/features/direction/SceneDirectionWorkspace.jsx` (workspace casi a pantalla completa:
  escaleta · tramo · "lo que recibe la IA").
- **auto-split** (`POST /scene-direction/auto-split`) agrupa las frases en tramos de ≈6 s sin dejar
  huecos y **conservando** los tramos que ya tienen dirección.
- Cada tramo (`normalize_segment`) guarda:
  `{start, end, text, mode, instruction, strict, materials[], reference_id, status, composition_id, placed_clip_id}`.
- **Modos** (`MODES`): `propose` (necesita propuesta) · `explain` · `represent` · `reinforce`
  (con `reference_id`) · `material`. `strict` = seguir el guion frase a frase.
- **Materiales**: clic derecho → *Editar información* (título + descripción) sobre clips e imágenes de
  proyecto y guardados (`PATCH /api/library/{id}`). **Esa descripción es lo que la IA lee** para elegir.

### 1.3 El paquete de contexto (lo único que ve la IA)
- `POST /scene-direction/pack` devuelve, para UN tramo:
  - `build_pack`: voz del tramo, subtítulos con tiempos relativos, frase antes/después, dirección,
    materiales elegidos (o **5 candidatos** por relevancia con `rank_materials`), referencia y vecinos.
  - `pack_text`: el texto compacto EXACTO que recibe la IA (la UI lo muestra: nada oculto), con
    presupuesto de caracteres (`BUDGET`) y `estimate_tokens`.
  - `skeleton_beats`: beats ya cortados por palabras (fin de frase / coma / ritmo) → la IA solo rellena
    **qué se ve** en cada beat.
  - `brief_defaults`: valores iniciales del brief de Generar Escena para ese tramo.

### 1.4 Generar Escena por tramo
- Modal **Generar Escena** (`frontend/src/features/motion/GenerateSceneModal.jsx`), o disparado desde un
  tramo con `direction_id`.
- Tres llamadas **SSE** (streaming), todas con el bloque **Creative Direction Lock** inyectado
  (`app/motion/directions.py`, 16 direcciones):
  1. `POST /motion/scene/questions` → 0–4 preguntas relevantes.
  2. `POST /motion/scene/plan` → título, logline, rationale y **beats** editables.
  3. `POST /motion/scene/build` → construye beat a beat (`graphic`/`text` como bloque html+GSAP, `stick`
     como storyboard, `image` determinista); cada beat valida + 1 reintento + fallback determinista.
- Resultado: una `MotionComposition` cuyas capas se **derivan** de `metadata.scene`
  (`scene.build_composition`). Editable por partes sin regenerar entera.

### 1.5 Acciones deterministas (sin IA) e inserción
- `place_material` (`POST /scene-direction/{sid}/place-material`): coloca el vídeo (recortado al tramo)
  o la imagen en una pista de vídeo libre. Deshacible.
- `reuse_scene` (`POST /scene-direction/{sid}/reuse-scene`): para modo `reinforce`, copia la escena del
  tramo de referencia reescalada a la nueva duración. Sin IA.
- Inserción de la escena en la timeline: `POST /motion/{cid}/add-to-timeline` (se hornea a vídeo con
  alfa). El estado del tramo pasa a `generated` / `placed`.

### 1.6 Endpoints HTTP hoy
```
# Dirección de escena (escaleta)
GET/PUT  /api/projects/{pid}/scene-direction
POST     /api/projects/{pid}/scene-direction/auto-split
POST     /api/projects/{pid}/scene-direction/pack
PATCH    /api/projects/{pid}/scene-direction/{sid}
POST     /api/projects/{pid}/scene-direction/{sid}/place-material
POST     /api/projects/{pid}/scene-direction/{sid}/reuse-scene

# Generar Escena
GET      /api/projects/{pid}/motion/scene/directions
GET/POST /api/projects/{pid}/motion/scene/presets   ·   DELETE .../presets/{id}
POST     /api/projects/{pid}/motion/scene/questions   (SSE)
POST     /api/projects/{pid}/motion/scene/plan        (SSE)
POST     /api/projects/{pid}/motion/scene/build       (SSE)   · acepta direction_id
```

---

## 2. Qué le falta al MCP para "controlar todo con IA"

**El hueco principal:** hoy el MCP expone las piezas de **Motion** (composiciones y stickman) pero **no
expone nada de Dirección de escena ni de Generar Escena**. Toda esa cadena vive solo en HTTP + UI. Una IA
externa por MCP puede montar una escena "a mano" (como en `project-hail-mary`) pero **no** puede usar el
sistema de escaleta + pack + lock + build por beats.

### 2.1 Lo que YA existe en el MCP (Motion)
`backend/app/mcp_server/tools_motion.py` → `motion_segment_context`, `motion_segment_frames`,
`motion_list_templates`, `motion_get_composition`, `motion_get_frame`, `motion_create_composition`,
`motion_update_composition`, `motion_stick_library`, `motion_create_stick_scene`, `motion_add_to_timeline`.

Sirven para crear/editar composiciones y stickman y meterlas en la timeline. **No** conocen tramos,
direcciones creativas, packs ni el pipeline de escena.

### 2.2 Checklist — herramientas MCP que faltan

#### A. Dirección de escena / escaleta (lectura y edición del guion dirigido)
- [ ] `scene_direction_get(project_id)` — devuelve escaleta + `script_source` + `units` + `modes` +
      catálogo de materiales. *(envuelve `GET /scene-direction`)*
- [ ] `scene_direction_auto_split(project_id, segments?)` — propone tramos conservando los dirigidos.
- [ ] `scene_direction_update_segment(project_id, segment_id, patch)` — modo, instrucción, strict,
      materials, reference_id, start/end, status… *(envuelve el `PATCH`; DTO con enum de modos)*
- [ ] `scene_direction_set(project_id, segments)` — guardar la escaleta entera *(envuelve el `PUT`)*.
- [ ] `scene_direction_pack(project_id, segment)` — **clave**: devolver `pack_text` + `tokens` +
      `skeleton` + `brief_defaults`. Es el contexto compacto que una IA pequeña necesita para decidir.

#### B. Generar Escena por MCP (el equivalente a F4 de la spec)
> Las 3 etapas hoy son **SSE**. El MCP necesita variantes **bloqueantes** (esperar al resultado final y
> devolver el JSON) o convertirlas en jobs (`get_job`/`wait_for_job`), no streaming.
- [ ] `motion_scene_directions(project_id)` — catálogo de las 16 direcciones + tokens de UI.
- [ ] `motion_scene_questions(project_id, brief|direction_id)` — 0–4 preguntas (bloqueante).
- [ ] `motion_plan_scene(project_id, brief, answers, direction_id?)` — devuelve el plan de beats editable.
- [ ] `motion_build_scene(project_id, brief, plan, answers, direction_id?)` — construye la escena
      (`MotionComposition`) beat a beat. Devuelve `composition_id`.
- [ ] `motion_regenerate_beat(project_id, composition_id, beat_id, hint?)` — regenerar UN solo beat
      *(depende de F3: edición por beats en Studio; hoy no existe ni en HTTP)*.

#### C. Acciones deterministas ya listas en backend, sin envoltura MCP
- [ ] `scene_place_material(project_id, segment_id, material?)` — *(envuelve `place-material`)*.
- [ ] `scene_reuse_reference(project_id, segment_id)` — *(envuelve `reuse-scene`)*.
- [ ] `motion_scene_add_to_timeline(...)` — ya se puede con `motion_add_to_timeline`; falta ligarlo al
      `status` del tramo (`generated`→`placed`) para que la IA sepa qué queda por montar.

#### D. Materiales (lo que la IA lee para decidir)
- [ ] `library_set_material_info(id, title, description)` — *(envuelve `PATCH /api/library/{id}`)*. Sin
      esto, la IA no puede **escribir** las descripciones que luego usa para elegir material. Comprobar si
      `set_clip_ai_description` ya cubre los clips de proyecto o si hace falta también para imágenes y
      biblioteca.
- [ ] `scene_rank_materials(project_id, text)` — exponer `rank_materials` para que la IA pida candidatos
      por relevancia a demanda (hoy solo salen dentro del pack).

#### E. Orquestación de alto nivel (el "monta el vídeo entero")
- [ ] `scene_direction_status(project_id)` — resumen: tramos, modo, status (`empty/ready/generated/
      placed`), cuáles faltan. Es el "mapa" que una IA autónoma recorre.
- [ ] Un tool o receta que encadene: `auto_split` → por cada tramo `pack` → (`plan`+`build`) o
      `reuse`/`place_material` → `add_to_timeline` → `update_segment(status)`. Puede ser guía en
      `help_content` (dominio `scene`) en vez de un tool monolítico.

#### F. Soporte transversal (rediseño "capa de capacidades")
- [ ] **Dominio `scene`** en `help_content.py` + recurso `capabilities://scene` (patrón de las Fases 1-2
      del rediseño MCP): descripciones 1-línea, el flujo, los enums de modos/direcciones.
- [ ] **Errores estructurados** (`MCPError`/`ToolError`, F3 del rediseño ya hecho) para los casos:
      tramo no encontrado, sin guion, material inexistente, dirección sin escena de referencia.
- [ ] **DTOs semánticos** para segmento, brief, beat y dirección (evitar volcar el JSON crudo de
      `metadata.scene`, que es grande y los modelos fallan al escribirlo entero).
- [ ] Registrar todo en `registry.py` con `access` correcto (read: get/pack/directions/status;
      write: update/plan/build/place/reuse; destructive: ninguno nuevo salvo borrar tramos).

### 2.3 Resumen del gap
| Capa | HTTP hoy | MCP hoy | Falta en MCP |
|---|---|---|---|
| Escaleta (dirección) | ✅ completo | ❌ nada | get/set/auto-split/update/pack/status |
| Pack de contexto | ✅ | ❌ | `scene_direction_pack` (crítico para modelos pequeños) |
| Generar Escena (Q/plan/build) | ✅ (SSE) | ❌ | versiones bloqueantes o como job |
| Regenerar beat | ❌ (ni HTTP) | ❌ | F3 primero |
| place-material / reuse | ✅ | ❌ | envolturas |
| Editar info de material | ✅ (`PATCH /library`) | parcial (`set_clip_ai_description`) | imágenes + biblioteca |
| Motion (composición/stick) | ✅ | ✅ | — |

**Orden sugerido:** primero **A + D** (que la IA pueda leer la escaleta, el pack y escribir descripciones
de material), luego **B** (generar por MCP con etapas bloqueantes), luego **C + E** (montaje autónomo), y
**F** en paralelo como envoltura/documentación.
