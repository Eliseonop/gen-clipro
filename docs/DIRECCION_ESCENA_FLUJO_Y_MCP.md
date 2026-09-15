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
  - `build_pack` (`app/scene_direction.py:358`): voz del tramo, subtítulos con tiempos relativos, frase
    antes/después, dirección (modo+instrucción+strict), materiales elegidos (o **5 candidatos** por
    relevancia con `rank_materials`), referencia, vecinos **y `style`** (formato + estilo de subtítulo).
  - `pack_text` (`:405`): el texto compacto EXACTO que recibe la IA (la UI lo muestra: nada oculto), con
    presupuesto de caracteres (`BUDGET`) y `estimate_tokens`.
  - `skeleton_beats`: beats ya cortados por palabras (fin de frase / coma / ritmo) → la IA solo rellena
    **qué se ve** en cada beat.
  - `brief_defaults`: valores iniciales del brief de Generar Escena para ese tramo.
- ⚠️ **Corrección importante (safe area de subtítulos):** `style_context` (`app/motion/segment_context.py:389`)
  YA calcula una safe-area rudimentaria y la mete en `pack["style"]`: `captionZoneY` (la `y` del subtítulo,
  0.86 por defecto) y `avoidY = [y-0.07, y+0.07]`. **Pero `pack_text()` NO renderiza `style` en el texto** →
  hoy la IA recibe la safe-area en el JSON pero **no la ve** en el prompt que realmente lee. Además es una
  banda fija ±0.07 desde UN subtítulo cercano, no la caja real por beat. Ver §3.2.

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

> **Actualización 2026-09-14:** ya existe `backend/app/mcp_server/tools_scene.py` (dominio `scene`, **16
> tools**): lectura/dirección (`scene_direction_get/_status/_pack/_auto_split/_update_segment/_set`,
> `scene_rank_materials`), capa editorial (`scene_set_material_meta`, `scene_place_material`), Generar
> Escena bloqueante (`motion_scene_directions/_questions`, `motion_plan_scene`, `motion_build_scene`,
> `scene_reuse_reference`) y **verificación** (`scene_validate_segment`, `render_timeline_frame`). El pack
> incluye safe-area, ocupación de timeline, uso de materiales, metadata semántica, plan editorial y
> composición híbrida. **Cubre A–E de §2.2 + toda la capa editorial (§3): Fases 1-4 completas.** Flujos de
> punta a punta: [`FLUJOS_ESCENA_MCP.md`](FLUJOS_ESCENA_MCP.md).

### 2.2 Checklist — herramientas MCP que faltan

#### A. Dirección de escena / escaleta (lectura y edición del guion dirigido)
- [x] `scene_direction_get(project_id)` — devuelve escaleta + `script_source` + `units` + `modes` +
      catálogo de materiales. *(envuelve `GET /scene-direction`)*
- [x] `scene_direction_auto_split(project_id, segments?)` — propone tramos conservando los dirigidos.
- [x] `scene_direction_update_segment(project_id, segment_id, patch)` — modo, instrucción, strict,
      materials, reference_id, start/end, status… *(envuelve el `PATCH`; filtra a campos permitidos)*
- [x] `scene_direction_set(project_id, segments)` — guardar la escaleta entera *(envuelve el `PUT`)*.
- [x] `scene_direction_pack(project_id, segment)` — **clave**: devuelve `pack`+`text`+`tokens`+
      `skeleton`+`brief_defaults`. El `text` ya incluye la safe-area. Falta enriquecerlo (§3.1).

#### B. Generar Escena por MCP (el equivalente a F4 de la spec)
> Las 3 etapas hoy son **SSE**. El MCP necesita variantes **bloqueantes** (esperar al resultado final y
> devolver el JSON) o convertirlas en jobs (`get_job`/`wait_for_job`), no streaming.
- [x] `motion_scene_directions(project_id)` — catálogo de las 16 direcciones + opciones del brief.
- [x] `motion_scene_questions(project_id, direction_id|start/end, brief?)` — 0–4 preguntas (bloqueante).
- [x] `motion_plan_scene(project_id, direction_id?, brief?, answers?)` — devuelve el plan de beats editable.
- [x] `motion_build_scene(project_id, plan, direction_id?, …)` — construye la escena (`MotionComposition`)
      beat a beat y guarda el borrador; con `direction_id` enlaza el tramo (status 'generated'). Devuelve
      `composition_id`. *(las 3 son versiones BLOQUEANTES de las etapas SSE; espejo de `_scene_request`)*
- [ ] `motion_regenerate_beat(project_id, composition_id, beat_id, hint?)` — regenerar UN solo beat
      *(depende de F3: edición por beats en Studio; hoy no existe ni en HTTP)*.

#### C. Acciones deterministas ya listas en backend, sin envoltura MCP
- [x] `scene_place_material(project_id, segment_id, material?, role, source?, size?, pos?, opacity?,
      transform?)` — coloca material con rol/fragmento/transform *(envuelve `place-material` extendido)*.
- [x] `scene_reuse_reference(project_id, segment_id)` — *(envuelve `reuse-scene`)*.
- [ ] `motion_scene_add_to_timeline(...)` — ya se puede con `motion_add_to_timeline`; falta ligarlo al
      `status` del tramo (`generated`→`placed`) para que la IA sepa qué queda por montar.

#### D. Materiales (lo que la IA lee para decidir)
- [ ] `library_set_material_info(id, title, description)` — *(envuelve `PATCH /api/library/{id}`)*. Sin
      esto, la IA no puede **escribir** las descripciones que luego usa para elegir material. Comprobar si
      `set_clip_ai_description` ya cubre los clips de proyecto o si hace falta también para imágenes y
      biblioteca.
- [x] `scene_rank_materials(project_id, text, limit?)` — expone `rank_materials`
      (`app/scene_direction.py`) para pedir candidatos por relevancia a demanda.
- [x] **Metadata semántica de material** (más allá de título+descripción): sujetos, acción, entorno, mood,
      composición, uso sugerido, prioridad visual. Campo `semantic` + `scene_set_material_meta`. Ver §3.3;
      alimenta el matching de §3.6 y el reuse de §3.8.

#### E. Orquestación de alto nivel (el "monta el vídeo entero")
- [x] `scene_direction_status(project_id)` — resumen: tramos, modo, status (`empty/ready/generated/
      placed`), `counts` y `pending`. Es el "mapa" que una IA autónoma recorre. *(`status_summary`)*
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
| Capa | HTTP hoy | MCP hoy | Falta |
|---|---|---|---|
| Escaleta (dirección) | ✅ completo | ✅ get/set/auto-split/update/status | — (Fase 1 hecha) |
| Pack de contexto | ✅ | ✅ `scene_direction_pack` | enriquecer pack (§3.1) |
| Safe-area de subtítulos | ✅ en `pack.style` **y** en `pack_text` | ✅ (via pack) | por-beat + hacerla dura (§3.2) |
| Metadata semántica de material | ✅ `semantic` + `scene_set_material_meta` | ✅ | poblar por visión (§3.3) |
| Generar Escena (Q/plan/build) | ✅ (SSE) | ✅ bloqueantes (`motion_scene_questions`/`_plan_scene`/`_build_scene`) | regenerar beat (F3 Studio) |
| Regenerar beat | ❌ (ni HTTP) | ❌ | F3 primero |
| place-material / reuse | ✅ | ✅ `scene_place_material` + `scene_reuse_reference` | zoom/pan animado (§3.7) |
| Composición híbrida (broll+motion+stick) | ⚠️ posible a mano | ⚙️ modelo `components` en tramo | ejecutar el plan en un paso (§3.5) |
| Editar info de material | ✅ (`PATCH /library`) | parcial (`set_clip_ai_description`) | imágenes + biblioteca |
| Historial de uso de material | ✅ `material_usage` en pack | ✅ (via pack) | reuse con variación (§3.8) |
| Render de frame compuesto de timeline | ✅ `compose.render_frame` | ✅ `render_timeline_frame` | optimizar seek (§3.13) |
| Validación de composición | ✅ geometría (`validate_segment`) | ✅ `scene_validate_segment` | legibilidad + auto-fix 1 paso (§3.14) |
| Motion (composición/stick) | ✅ | ✅ | — |

**Orden sugerido (mecánica):** primero **A + D** (que la IA pueda leer la escaleta, el pack y escribir
descripciones de material), luego **B** (generar por MCP con etapas bloqueantes), luego **C + E** (montaje
autónomo), y **F** en paralelo como envoltura/documentación. El §5 fusiona este orden con la **capa
editorial** del §3 en un roadmap por fases.

---

## 3. De "herramientas" a "director": la capa editorial

> El §2 cierra el gap **mecánico** (que una IA pueda leer/escribir el pipeline por MCP). Pero aunque
> exponga todo, la IA seguiría **eligiendo mal** el material y la composición, porque no tiene criterio
> editorial ni forma de verificar el resultado. Este es el hueco real. Aquí cada mejora va anotada con
> **[ya existe]** (reutilizar), **[parcial]** (completar) o **[net-new]** (construir), para no reimplementar
> lo que ya hay.

### 3.1 Contexto completo del tramo — CRÍTICO · [parcial]
La IA debe recibir, por tramo: narración exacta, frase anterior/siguiente, subtítulos con timestamps,
beat a beat, dirección existente, modo (`propose/explain/represent/reinforce/material`), `strict`,
materiales elegidos, candidatos relevantes, dirección visual global, referencia visual, estado del tramo,
**qué ya existe en la timeline** en ese instante y **qué materiales se usaron hace poco**.

- **Ya lo cubre `build_pack`:** voz, antes/después, subtítulos con tiempos, dirección, modo, strict,
  materiales, candidatos (`rank_materials`), referencia, vecinos, `style`. Los `skeleton_beats` van aparte
  en el endpoint `/pack`.
- **Falta añadir al pack:** (a) **dirección visual global** — hoy el *Creative Direction Lock*
  (`app/motion/directions.py`, 16 direcciones) se inyecta solo en `build`, no en el pack; debería estar en
  el contexto de decisión. (b) **qué hay ya en la timeline en ese rango** (§3.9). (c) **historial de uso
  reciente de materiales** (§3.8). (d) **estado del tramo** (`status`) explícito en `pack_text`.
- **Acción MCP:** `scene_direction_pack` (§2.2 A) debe devolver el pack **completo** con estos 4 añadidos,
  no solo lo de hoy.

### 3.2 Zona de subtítulos como restricción estructural — CRÍTICO · [parcial]
Sube de "detalle visual" a **restricción dura**. Antes de componer hay que calcular el espacio libre:
`subtítulos → zona protegida → composición → materiales`, nunca `generar → subtitular → descubrir que
tapamos todo`.

- **Ya existe (rudimentario):** `style_context` mete `captionZoneY` + `avoidY=[y±0.07]` en `pack.style`.
- **Correcciones necesarias:**
  1. **Surfacing:** `pack_text()` NO imprime `style` → meterlo como bloque explícito (ver formato abajo).
  2. **Por beat, no global:** la zona ocupada cambia con cada subtítulo (texto largo ocupa más alto). Hoy
     es una banda fija desde UN caption cercano. Calcular la caja real (x/y/w/h) por beat a partir del texto
     y el estilo (`textstyles.js` subtítulo: `y:0.86, size:0.048`).
  3. **Contrato duro:** la validación (§3.12) debe rechazar composiciones que invadan la zona.
- **Formato propuesto para el `pack_text`** (coordenadas en fracción 0–1 del canvas 1080×1920):
  ```
  VIDEO 1080x1920
  SUBTITLE SAFE AREA  (no colocar contenido esencial aquí)
    x:0.05–0.95  y:0.80–0.94   (zona base del subtítulo)
  ZONA OCUPADA POR BEAT:
    0.00–2.50s  «¿Podrías sobrevivir solo en Marte?»   y:0.80–0.92
    2.50–5.80s  «Mark Watney quedó atrapado…»          y:0.78–0.90
  EVITAR en la safe area: texto/gráficos importantes, caras, sujeto principal, stickman.
  ```

### 3.3 Material como biblioteca semántica — CRÍTICO · [net-new sobre parcial] · ✅ base hecha (2026-09-14)
> **Implementado:** campo `semantic` en `ClipInfo`/`ImageInfo` (y en items de biblioteca);
> `scene_direction.normalize_semantic` (subjects/actions/environment/mood/composition/visual_content/
> suggested_usage/visual_priority∈{protagonista,apoyo,fondo}); `set_material_meta(project_id, kind, id,
> meta, scope)` + tool MCP `scene_set_material_meta`. `material_catalog` lo lee, `rank_materials` puntúa
> sobre él (§3.6) y `pack_text` muestra una pista compacta por material. Falta: **poblarlo por IA de
> visión** sobre un frame (hoy se escribe a mano/por tool) y exponerlo en la UI de *Editar información*.
Hoy: `title + description` libre (`PATCH /api/library/{id}`), y esa descripción es lo que la IA lee. Ampliar
a un esquema semántico opcional por material:
```
MATERIAL
├── id · title · description · type · duration · aspect_ratio
├── visual_content   (qué se ve)
├── subjects[]       (astronauta, Marte)
├── actions[]        (caminar)
├── environment      (superficie marciana)
├── mood             (solitario, épico)
├── composition      (sujeto centrado / espacio negativo a la izquierda)
├── suggested_usage  (b-roll / establishing / transition)
└── visual_priority  (protagonista | apoyo | fondo)
```
- **Cómo poblarlo:** (a) manual desde *Editar información* (§4); (b) auto por IA de visión sobre un frame
  (encaja con el matte/visión ya presentes). Guardar en `library` junto a `title/description`.
- **Para qué:** habilita el matching semántico (§3.6), el reuse inteligente (§3.8) y decidir el **rol** del
  material (§3.4). `rank_materials` debería puntuar sobre estos campos, no solo sobre la descripción.

### 3.4 El material no es solo "clip" — decidir su ROL · [net-new] · ✅ base hecha (2026-09-14)
> **Implementado:** vocabulario `MATERIAL_ROLES` (full/broll/overlay/pip/side_panel/circular/background/
> reference/…). `place_material(role, size, pos, opacity, transform)` mapea el rol a `layout`/`frame`/
> `transform`: roles "fill" exactos; roles overlay escalados a `size` (fracción del ancho) sobre la franja
> de subtítulos. Escala px-fuente→px-salida: exacta con dimensiones (imágenes; vídeo asume fuente≈salida).
> Tool MCP `scene_place_material`. Falta: probe de dimensiones de vídeo (`detect.dims`) para PiP exacto en
> clips no-verticales, y la máscara circular real de `circular`.
La mejora conceptual más importante. El MCP debe poder colocar un material como: *full screen · b-roll ·
overlay · picture-in-picture · side panel · circular crop · background · reference image · motion element ·
transition · supporting visual*. Es decir, **el material se vuelve un componente de la composición**, no un
plano que ocupa toda la pantalla. Ejemplo: "La atmósfera de Marte es 100× más delgada" → vídeo de Marte
como PiP con un gráfico "100×↓" encima, subtítulos abajo — no vídeo a pantalla completa.
- **Base técnica:** ya existe posicionado/escala de clips libres (memoria `editor-main-workspace`: todo clip
  visual es objeto libre) y capas de overlay/PIP (`overlay-export-invariantes`). Falta que `place_material`
  acepte un **rol + layout** (posición, escala, crop, forma) en vez de "pista libre a pantalla".

### 3.5 Composición híbrida — CRÍTICO · [net-new] · ✅ modelo hecho (2026-09-14)
> **Implementado:** campo `components` por tramo (lista): cada componente `{source: material|motion|
> stickman|text|graphic|keep, role, material?, source_range?, note}` (`normalize_component`). Es el SCENE
> PLAN híbrido; entra al pack ("COMPOSICIÓN PLANIFICADA") y al status (`has_components`). **Falta:** la
> EJECUCIÓN de un plan híbrido completo en un paso (hoy se ejecuta pieza a pieza: `scene_place_material`
> por material + tools de motion para motion/stickman).
No debe ser decisión binaria `material OR stickman OR motion`. Debe poder ser `b-roll + motion + stickman`
cuando tenga sentido (p.ej. b-roll de Marte + stickman lateral explicando + gráfico arriba). Un beat/tramo
= **lista de componentes con roles y layout**, no un único recurso.
- **Acción:** el resultado de `plan_scene` debe permitir varios componentes por beat, cada uno con su rol
  (§3.4) y origen (material_id | motion | stick). `build_scene` los compone en una sola `MotionComposition`.

### 3.6 Matching semántico narración ↔ material · [parcial] · ⚙️ mejorado (2026-09-14)
> **Avance:** `rank_materials` ya puntúa sobre la metadata semántica (§3.3), no solo título+descripción, y
> un material con metadata desempata por encima de uno sin ella. **Sigue faltando** la expansión de la
> consulta a conceptos/sinónimos (narración → concepto → intención → acción → emoción) vía IA o léxico.
No buscar solo `"Marte" → material con "Marte"`, sino
`narración → concepto → intención → acción → emoción → material`. "Watney tiene que cultivar su comida"
debe poder encontrar *papas / agricultura / invernadero / cultivo / supervivencia* aunque la descripción no
diga literalmente "cultivar comida".
- **Hoy:** `rank_materials` hace matching léxico por términos del guion+instrucción. **Falta:** expandir la
  consulta a conceptos/sinónimos (via IA o un léxico) y puntuar contra la metadata semántica (§3.3).

### 3.7 Elegir QUÉ parte del material y con qué edición · [parcial] · ⚙️ mejorado (2026-09-14)
> **Avance:** `scene_place_material` acepta `source={in,out}` (fragmento del origen ≠ tramo), `size`,
> `pos`, `opacity` y `transform` explícito → recorte/escala/posición/opacidad. **Falta:** zoom/pan
> animados (keyframes), speed, freeze y transiciones — con el límite de qué anima el export FFmpeg.
No basta "usar material X": la IA debe decidir el **fragmento origen** y su **colocación**:
```
material X   source: 00:04.2 → 00:08.7   timeline: 13.50 → 18.00
edición: trim · crop · scale · position · zoom · pan · speed · freeze · opacity · rotation · transition
```
- **Hoy:** `place_material` recorta el vídeo al tramo y lo pone en una pista libre. **Falta** exponer el
  control editorial (source in/out distinto del tramo, crop/zoom/pan/position/speed/freeze/opacity) para que
  la IA sea de verdad "directora". Encaja con el extractor de segmentos (`clip-extractor-segmentos`) y con
  keyframes (`keyframes-redisenio`) para zoom/pan animados — con el límite de qué anima el export FFmpeg.

### 3.8 Reutilización inteligente + historial de uso · [net-new] · ✅ base hecha (2026-09-14)
> **Implementado:** `scene_direction.material_usage(proj)` mapea `"{kind}:{id}" → [rangos]` desde la
> timeline; `recent_materials(...)` lista lo usado en los ≤20 s previos al tramo. El pack anota cada
> material con `used` y añade `recent_materials`; `pack_text` los imprime. Falta: reusar con variación
> automática (otro crop/zoom) y la prioridad EDIT>COMBINE>GENERATE como regla ejecutable.
El MCP debe conocer el `MATERIAL USAGE HISTORY` (dónde y cuándo se usó cada material) para decidir "ya lo
usé hace 13 s; busco otro" o reutilizarlo con **otra función** (crop/zoom/duración distintos). Prioridad:
```
1. material existente          4. material + motion
2. material existente + edición 5. material + stickman
3. varios materiales            6. motion/stickman nuevo   7. escena nueva  (último recurso)
```
Regla **EDIT > COMBINE > GENERATE**: generar es la última opción, no la primera.
- **Falta:** un índice `material_usage(project_id)` derivado de la timeline (qué clip/material aparece en qué
  rangos) y meterlo en el pack (§3.1) + en el status (§3.10).

### 3.9 Analizar la composición existente antes de añadir · [net-new] · ✅ base hecha (2026-09-14)
> **Implementado:** el pack ahora trae `timeline.existing` (+`motion_in_range`) reutilizando
> `segment_context.timeline_context`, y `pack_text` lo imprime como "YA EN LA TIMELINE EN ESTE TRAMO".
> Falta: cálculo de **espacio libre por zonas del canvas** (no solo lista de elementos) y detección de
> elementos que ya compiten visualmente.
Antes de insertar algo, preguntar *¿qué hay ya en este instante?* El MCP debe detectar en el rango: vídeo,
motion, stickman, subtítulos, overlays, espacios libres y elementos que ya compiten. Así evita apilar
`b-roll + b-roll + stickman + motion + texto + otro motion` cuando ya está lleno.
- **Base:** la timeline ya tiene las pistas/clips por rango; falta un `timeline_at(project_id, t)` (o incluir
  "ocupación actual" en el pack) que resuma qué ocupa cada zona del canvas en ese instante.

### 3.10 Presupuesto y ritmo visual · [net-new] · ✅ presupuesto hecho (2026-09-14)
> **Implementado:** campo `complexity` (1–5) por tramo (`normalize_segment`), con `COMPLEXITY_LABELS`;
> entra al pack ("COMPLEJIDAD OBJETIVO: X/5") y al status (por tramo + agregado). Falta el **ritmo**
> (analizar duración de cada recurso en pantalla, sincronizar cambios con palabras clave).
- **Visual Complexity Budget (1–5):** `1 simple · 2 simple+apoyo · 3 composición · 4 explicación compleja ·
  5 clímax`. La IA asigna por tramo (Hook 4, Explicación 3, Dato 4, Transición 1, Conclusión 3) para no tener
  un vídeo donde "cada segundo explotó After Effects".
- **Ritmo visual:** evitar planos estáticos demasiado largos y cortes cada 0.5 s sin motivo; cambiar
  composición cuando cambia la idea; mantener plano cuando el contenido pide concentración; sincronizar
  cambios visuales con palabras importantes. Se apoya en los `skeleton_beats` (ya cortados por ritmo/palabras).

### 3.11 Detectar "no necesito nada" · [net-new] · ✅ hecho (2026-09-14)
> **Implementado:** flag `no_visual` por tramo. En el pack sale como "SIN VISUAL NUEVO: mantén el plano
> + subtítulos"; en el status cuenta aparte y NO deja el tramo como `pending` (ya está decidido).
Permiso explícito para decidir `NO ADDITIONAL VISUAL`. Hay frases ("Pero la historia no termina ahí") donde
basta mantener plano / pequeño zoom / transición / subtítulos. Evita sobreeditar. Debe ser una salida válida
de `plan_scene`, no un hueco a rellenar por obligación.

### 3.12 Separar dirección de ejecución + registrar la decisión · [net-new] · ⚙️ parcial (2026-09-14)
> **Avance:** el campo `composition_intent` por tramo es el germen del SCENE PLAN (qué es principal, qué
> acompaña, qué dejar libre) y ya viaja en el pack. **Falta:** el EXECUTION PLAN estructurado (ids/source/
> layout) y el DECISION log (why/subtitle conflict/complexity) — llegan con el rol de material (§3.4) y la
> generación por MCP (§2.2 B).
La IA primero produce un **SCENE PLAN** (qué y por qué), y el MCP lo traduce a **EXECUTION PLAN** (ids,
source, timeline, scale, position). Reduce muchísimo los errores.
```
SCENE PLAN  13.5–18.0 → b-roll papas + stickman lateral + gráfico arriba + subtítulos abajo
EXECUTION   b-roll: material_id=X source=04.2–08.7 timeline=13.5–18
            stickman: composition_id=Y position=right scale=.35
            motion:   composition_id=Z position=top
            subtitle: protected
```
Además, cada tramo debería emitir un **DECISION log** interno (para debugging, no necesariamente visible):
```
DECISION  Visual: b-roll Marte + gráfico atmosférico.
          Why: el b-roll contextualiza; el gráfico comunica la diferencia de presión; sin stickman (no aporta).
          Subtitle conflict: ninguno.   Complexity: 3/5.
```

### 3.13 Render del frame compuesto real — EL SALTO · [net-new] · ✅ hecho (2026-09-14)
> **Implementado:** `compose.render_frame(project, timeline, out, at_time)` reutiliza la tubería del export
> (subtítulos/formas/máscaras/overlays) con `build_command(frame_at=t)` → un único PNG del compuesto real.
> Tool MCP `render_timeline_frame(project_id, at_time)` (devuelve la imagen). Más lento que un preview;
> puntual. Falta: cachear/optimizar el seek para tramos tardíos.
Hoy hay preview de composición/material (`motion_get_frame`) pero **no** una forma de pedir el frame REAL de
la timeline compuesta en un instante. El bucle que convierte esto en un "director que revisa su montaje":
```
montar → render_timeline_frame(project_id, t) → verificar → detectar conflicto → corregir → re-render
```
- **Base técnica disponible:** `compose.render()` (`app/compose.py:1045`) ya renderiza la timeline a archivo,
  y el motor **HyperFrames** (`app/motion/renderer/hyperframes.py`) captura PNG por frame con alfa. Un
  `render_timeline_frame` sería un render de UN frame (rápido, sin exportar todo el vídeo).
- **Por qué es enorme:** la IA puede afirmar "el gráfico está arriba" y descubrir al renderizar "pero el
  personaje también está arriba". Sin el frame real, la validación de §3.14 es a ciegas.

### 3.14 Validación automática + auto-corrección · [net-new] · ✅ base hecha (2026-09-14)
> **Implementado:** `scene_direction.validate_segment(proj, start, end)` detecta por GEOMETRÍA (sin render):
> `subtitle_collision` (overlay dentro de `avoidY`), `offscreen`, `overlap` (solape fuerte entre overlays) y
> `empty`; devuelve issues con severidad + sugerencias accionables. Tool MCP `scene_validate_segment`.
> **Auto-corrección:** la IA corre el bucle `validar → scene_place_material (recolocar/reducir) → validar`
> (no hay op para fijar `transform` en `update_clip`, así que la corrección es re-colocar). Falta: checks de
> legibilidad de texto/densidad y auto-fix determinista de un paso.
Antes de dar un tramo por terminado, correr checks sobre el frame (§3.13):
```
CHECK  subtitle collision · visual collision · off-screen · overlap excesivo · texto ilegible ·
       contenido importante tapado · densidad visual excesiva · zonas vacías · aspect ratio · timing
```
Especialmente **subtitle collision**:
```
if elemento_importante ∩ subtitle_safe_area:
    reposition() OR resize() OR crop() OR change_material()   # no dejarlo pasar
```
Iterar hasta que el tramo quede limpio. Esto es lo que sube el MCP de "herramientas para editar" a "editor
que dirige y revisa su propio montaje".

### 3.15 Flujo completo (objetivo)
```
AUDIO → TRANSCRIPCIÓN/SUBS → SCENE DIRECTION → SEGMENT/BEAT
   ├── SUBTITLE SAFE AREA ──┐
   └── VISUAL INTENT ───────┴→ MATERIAL SEARCH → SEMANTIC MATCHING → COMPOSITION PLAN
                                   ├── B-ROLL ──┐
                                   ├── STICKMAN ┼→ TIMELINE EDIT → RENDER FRAME → VALIDATION
                                   └── MOTION ──┘                                    ├─ OK ──→ NEXT BEAT
                                                                                     └─ CORRECT ─┘
```

---

## 4. UX/UI del sistema

> Todo esto tiene que ser **legible y editable por una persona**, no solo consumible por la IA. El sitio
> natural es el `SceneDirectionWorkspace` (`frontend/src/features/direction/`) y el chat IA del editor
> (`ai-chat-nativo`). Principio rector: **la IA propone, la persona ve el porqué y ajusta en un clic**.

### 4.1 Overlay de safe-area en el preview
- Dibujar la **zona de subtítulo** como banda semitransparente sobre el canvas del tramo (reutiliza
  `captionZoneY`/`avoidY`; §3.2). Marcar en rojo cualquier elemento que la invada (feedback de §3.14).
- Toggle "mostrar zonas protegidas" en la barra del workspace.

### 4.2 Panel "lo que recibe la IA" = pack visible
- Ya existe la columna "lo que recibe la IA" con el `pack_text`. Añadir ahí, en bloques colapsables: la
  **safe-area**, la **dirección visual global** activa, los **candidatos** con su score, y el **historial de
  uso** del material. Nada oculto: lo que ve la IA lo ve la persona (invariante ya presente en el pack).

### 4.3 Editor de `composition_intent` por tramo
- Además de `mode/instruction`, un campo **composition_intent** en lenguaje natural: *"Clip de Marte como
  elemento principal, stickman pequeño a la derecha explicando, gráfico de presión arriba, zona inferior
  libre por subtítulos."* Mucho más útil que "usar stickman para explicar la atmósfera". Se guarda en el
  segmento (`normalize_segment`) y entra al pack.

### 4.4 Indicador de complejidad y ritmo
- Chip **1–5** por tramo (§3.10) editable, con color, para ver de un vistazo la curva de intensidad del vídeo
  entero en la escaleta. Aviso suave si hay muchos tramos ≥4 seguidos.

### 4.5 Badges de validación por tramo
- En la escaleta, cada tramo muestra su `status` (`empty→ready→generated→placed`) **y** un badge de
  validación: ✅ limpio · ⚠️ colisión con subtítulo · ⚠️ densidad alta · ⛔ elemento fuera de pantalla
  (§3.14). Clic → salta al conflicto en el preview.

### 4.6 Preview del frame compuesto bajo demanda
- Botón "ver frame a los Ns" que llama a `render_timeline_frame` (§3.13) y muestra el compuesto real, con la
  safe-area superpuesta. Es el cierre del bucle ver→corregir para la persona igual que para la IA.

### 4.7 Log de decisión legible
- El **DECISION log** (§3.12) por tramo, colapsado por defecto ("¿por qué esta composición?"). Da confianza y
  hace depurable el montaje autónomo.

### 4.8 Mapa global del montaje
- Vista de barra/línea de tiempo con el `scene_direction_status` (§2.2 E): tramos hechos vs. pendientes,
  con conflicto, con material, con motion. Un clic recorre "voy por el tramo 7 de 14; estos 3 aún necesitan
  visual".

---

## 5. Roadmap por fases (mecánica + editorial)

> Fusiona el orden A–F (§2) con la capa editorial (§3). No implementar las ~20 mejoras de golpe.

### Fase 1 — Imprescindible: que la IA LEA bien
> **Estado 2026-09-14: primer corte IMPLEMENTADO.** Módulo `app/mcp_server/tools_scene.py` (7 tools,
> dominio `scene` en `help_content` + `capabilities`/`help://scene`), envolturas finas de
> `app/scene_direction.py`. Tests: `backend/tests/test_tools_scene.py`.
- [x] `scene_direction_get` / `scene_direction_status` (§2.2 A/E) — `status_summary` nuevo en
      `scene_direction.py` (counts + `pending`).
- [x] **Safe-area en `pack_text`** (§3.2): helper `_safe_area_lines` → imprime `LIENZO` y `ZONA DE
      SUBTÍTULOS` (antes iban solo en `pack["style"]`). Corrige la omisión.
- [x] `scene_direction_pack` (envuelve el ensamblado del endpoint) + `scene_direction_auto_split` /
      `scene_direction_update_segment` / `scene_direction_set`.
- [x] Acceso completo a materiales + `scene_rank_materials` (§2.2 D).
- [x] Pack enriquecido: **ocupación de timeline** (§3.9, `pack["timeline"]` vía `sc.timeline_context`) e
      **historial de uso de materiales** (§3.8, `material_usage` + `recent_materials`); ambos ya en
      `pack_text` (bloques "YA EN LA TIMELINE", "[YA USADO en …]", "USADO HACE POCO").
- [ ] `scene_direction_pack` **completo** (§3.1): falta la **dirección visual global** (Creative Direction
      Lock) dentro del pack — hoy no hay una dirección global persistida a nivel de proyecto (decisión
      pendiente: ¿guardarla en el proyecto o pasarla por parámetro?).
- [x] **Metadata semántica de material** (§3.3): esquema `semantic` en clips/imágenes/biblioteca +
      `scene_set_material_meta` + lectura en catálogo/ranking/pack. Falta poblarla por IA de visión.
- **Corregido/validado:** la safe-area sale en el texto (no solo en el JSON); `status` explícito por tramo.

### Fase 2 — Inteligencia editorial: que la IA DECIDA mejor
> **Estado 2026-09-14: casi completa.** Hechos el plan editorial, el modelo de composición híbrida, el rol
> del material y la selección de fragmento. Queda el pulido (zoom/pan animados, DECISION log estructurado).
- [x] Visual Complexity Budget + decisión `NO ADDITIONAL VISUAL` (§3.10, §3.11): campos `complexity`/
      `no_visual` en tramo + pack + status.
- [x] `composition_intent` por tramo (§4.3) — germen del SCENE PLAN; falta el DECISION log estructurado (§3.12).
- [x] Historial de uso de materiales operativo (§3.8) y matching semántico sobre metadata (§3.6).
- [x] Composición híbrida material+motion+stickman (§3.5, campo `components`) y **rol** del material:
      overlay/PiP/side panel/background (§3.4, `scene_place_material`).
- [x] Selección de fragmento (`source={in,out}`) + size/pos/opacity/transform en `place_material` (§3.7);
      falta zoom/pan animados.

### Fase 3 — Autonomía: que la IA MONTE · ✅ HECHA (2026-09-14)
- [x] `motion_scene_questions` / `motion_plan_scene` / `motion_build_scene` (BLOQUEANTES) (§2.2 B).
- [x] `scene_place_material` / `scene_reuse_reference`; `motion_add_to_timeline` (dominio motion) inserta y
      `motion_build_scene(direction_id)` liga el `status` del tramo a 'generated' (§2.2 C).
- [x] Separación SCENE PLAN (`components`/`composition_intent`) → EXECUTION (`place_material`/build) (§3.12).
- Flujos de trabajo de punta a punta: ver [`FLUJOS_ESCENA_MCP.md`](FLUJOS_ESCENA_MCP.md).

### Fase 4 — El salto: que la IA REVISE su montaje · ✅ HECHA (2026-09-14)
- [x] `render_timeline_frame(project_id, at_time)` (§3.13) — frame REAL del compuesto vía
      `compose.render_frame` + `build_command(frame_at=t)`.
- [x] Detección de colisiones con subtítulos + fuera de pantalla + solapes (`scene_validate_segment`, §3.14).
- [x] **Auto-corrección** por bucle `validar → re-colocar (scene_place_material) → validar` (la IA lo cierra;
      falta un auto-fix determinista de un paso, bloqueado por que `update_clip` no fija `transform`).
- Con esto el MCP pasa de "herramientas para que una IA edite" a **"un editor que dirige y revisa su propio
  montaje"**. Flujos de punta a punta: [`FLUJOS_ESCENA_MCP.md`](FLUJOS_ESCENA_MCP.md) (W1, §5).

### Fase 5 — Dirección global: que la IA DIRIJA el vídeo entero, no cada tramo · ⚙️ EN CURSO (paso 1 hecho 2026-09-14)

> **Estado 2026-09-14: paso 1 IMPLEMENTADO.** `Project.visual_blueprint` (schema + persistencia
> `projects.save_visual_blueprint`), `scene_direction.normalize_blueprint`/`load_blueprint`/
> `save_blueprint`, bloque **DIRECCIÓN GLOBAL** en `pack_text` (helper `_blueprint_lines`, entra vía
> `build_pack`), tools MCP `scene_get_blueprint`/`scene_set_blueprint` (+ dominio `scene` en
> `help_content`, paso 0) y HTTP `GET/PUT /scene-direction/blueprint`.
> **Paso 2 IMPLEMENTADO (2026-09-14):** generación por IA en una pasada barata —
> `scene_ai.blueprint_stream` (guion completo + material + catálogo de direcciones → JSON), tool MCP
> `scene_generate_blueprint(project_id, apply=True)` y HTTP `POST /scene-direction/blueprint/generate`.
> **Paso 3 IMPLEMENTADO (2026-09-14):** `scene_ai.plan_all_stream` (blueprint + escaleta con voz/tiempos
> + material → un patch editorial por tramo), `scene_direction.apply_plan_all` (merge por id, descarta
> valores inválidos, guarda de una vez), tool MCP `scene_plan_all(project_id, apply=True)` y HTTP
> `POST /scene-direction/plan-all`. Tests: `BlueprintTest` + `PlanAllTest` en
> `backend/tests/test_tools_scene.py`. **Falta** el paso 4 (UX).

> **Motivación.** Las Fases 1-4 dieron a la IA todo lo mecánico y editorial **por tramo** (pack local
> ~300-500 tokens, ideal para modelos pequeños). Falta la capa de arriba: una **dirección audiovisual
> global** que decida la identidad visual del vídeo entero *antes* de bajar tramo a tramo, para que el
> montaje sea coherente y para que la pregunta deje de ser "¿qué relleno este tramo?" y pase a ser
> "¿qué necesita ver el espectador y cuál es la mejor forma de contarlo en todo el vídeo?".
>
> **Principio de diseño (la tensión a respetar):** la capa global tiene que ser **barata y de una sola
> pasada** — una decisión de identidad + un mapa de intenciones — NO un planificador pesado que catalogue
> y priorice recursos de todo el vídeo (eso rompería el pipeline apto para modelos pequeños). *Blueprint
> ligero arriba, ejecución local abajo.* Por eso NO se introduce una entidad `VisualAsset` nueva: su
> contenido ya vive en `components` + `composition_intent` + `complexity` + `no_visual` por tramo (§3.4-3.12).
> La Fase 5 solo añade **la cabeza** que da criterio a esos campos y cierra el pendiente de Fase 1.

#### 5.1 `Project.visual_blueprint` (persistido a nivel de proyecto) · [net-new]
Cierra el único hueco abierto de la Fase 1 (§5, "dirección visual global"): hoy el *Creative Direction Lock*
se elige **por tramo** y se inyecta solo en `build`; no hay identidad para el vídeo entero.

```jsonc
Project.visual_blueprint = {
  "version": 1,
  "direction": "sketchbook",          // dirección creativa DOMINANTE (una de las 16 de directions.py)
  "direction_overrides": { "accent": "#e11d48", "notes": "" },
  "identity": "cinematográfico + educativo; paper animation como acento; motion contenido",
  "vocabulary": ["movie_footage", "paper_animation", "stickman", "diagram", "handwritten_word"],
  "rules": [                            // reglas duras que entran en TODOS los packs
    "una idea visual dominante por plano",
    "preferir material existente; generar solo si aporta",
    "recurso corto y fuerte > escena larga mediocre",
    "subtítulos siempre protegidos"
  ],
  "intensity_curve": "hook alto → explicación media → clímax alto → cierre medio",
  "source": "ai|manual",              // cómo se creó (traza)
  "updated_at": "..."
}
```
- **Derivación (1 llamada IA barata):** `blueprint_from_context(project)` a partir de audio+guion,
  `get_project_context`, el catálogo de material (`material_catalog`) y las 16 direcciones
  (`app/motion/directions.py`). Devuelve el dict de arriba. Editable a mano después.
- **Relación con el `direction_id` por tramo:** el blueprint fija la dirección **por defecto** de todo el
  proyecto; un tramo puede seguir sobre-escribiéndola (el lock por tramo gana si existe). Así la coherencia
  es el default y la excepción sigue siendo posible.
- **Entra al pack:** `build_pack`/`pack_text` (`app/scene_direction.py`) imprimen un bloque nuevo
  **DIRECCIÓN GLOBAL** (identidad + vocabulario permitido + reglas + posición del tramo en la curva de
  intensidad). Esto es lo que hoy falta en `pack_text` (§3.1 punto (a)).

  ```
  DIRECCIÓN GLOBAL
    identidad: cinematográfico + educativo · paper animation como acento
    vocabulario permitido: movie_footage · paper_animation · stickman · diagram · handwritten_word
    reglas: una idea dominante por plano · preferir material existente · corto y fuerte > largo mediocre
    este tramo en la curva: EXPLICACIÓN (intensidad media, objetivo complexity ≈3)
  ```

#### 5.2 Pasada "intención por tramo" de una sola vez (el "plan de fabricación") · [net-new]
En lugar de un catálogo global de VisualAssets (caro, global), una única pasada rellena **toda la escaleta
a la vez** guiada por el blueprint: por cada tramo escribe `composition_intent` + `complexity` +
`no_visual` (+ opcionalmente `mode`). Es la escaleta ya poblada con criterio **antes de generar nada** —
el equivalente barato del "plan de fabricación", reutilizando campos que ya existen.
- La IA ve: blueprint + toda la escaleta (solo voz+tiempos de cada tramo, no el pack completo de cada uno) +
  resumen del material disponible. Devuelve un patch por tramo. Barato porque no compone, solo **decide qué
  y con qué densidad**.
- Aplica la regla de valor (§3.10-3.11): un tramo puede quedar `no_visual`, y la duración del recurso la
  manda la idea (un `composition_intent` puede pedir "gráfico 3s + mantener plano el resto"), no la longitud
  del tramo.

#### 5.3 Tools MCP y HTTP · [net-new]
- `scene_get_blueprint(project_id)` — lee `visual_blueprint` (read).
- `scene_set_blueprint(project_id, blueprint)` — guarda/edita (write). Valida `direction` contra el catálogo.
- `scene_generate_blueprint(project_id)` — 1 llamada IA que propone el blueprint desde el contexto (write).
- `scene_plan_all(project_id)` — la pasada §5.2; devuelve el patch por tramo y lo aplica a la escaleta (write).
- Dominio `scene` en `help_content.py` + `capabilities://scene`: documentar el flujo global
  (blueprint → plan_all → por tramo pack/build/place) y los enums (vocabulario, curva de intensidad).
- HTTP espejo: `GET/PUT /api/projects/{pid}/scene-direction/blueprint`,
  `POST /api/projects/{pid}/scene-direction/blueprint/generate`,
  `POST /api/projects/{pid}/scene-direction/plan-all`.

#### 5.4 UX (SceneDirectionWorkspace) · [net-new]
- Panel **Dirección global** arriba del workspace: dirección dominante, vocabulario (chips), reglas, curva de
  intensidad; botón "Proponer con IA" (`scene_generate_blueprint`) y edición a mano.
- Botón **"Planificar todo"** (`scene_plan_all`) que rellena `composition_intent`/`complexity`/`no_visual` de
  toda la escaleta de una vez; se ve reflejado en los chips de complejidad (§4.4) y en el mapa global (§4.8).
- El bloque **DIRECCIÓN GLOBAL** aparece también en "lo que recibe la IA" (§4.2): nada oculto.

#### 5.5 Orden de implementación
1. [x] Modelo `visual_blueprint` + `get/set` (MCP+HTTP) + bloque en `pack_text`. *(cierra el pendiente de Fase 1; 2026-09-14)*
2. [x] `scene_generate_blueprint` (la llamada IA barata). *(2026-09-14)*
3. [x] `scene_plan_all` (la pasada de intención por tramo). *(2026-09-14)*
4. [ ] UX del panel global + "Planificar todo".

---

## 6. Checklist maestro (trazabilidad)

| # | Mejora | Estado hoy | Sección | Fase |
|---|---|---|---|---|
| 1 | Contexto completo del tramo | parcial (`build_pack`) | §3.1 | 1 |
| 2 | Safe-area como restricción dura | parcial (`style`, no en texto) | §3.2 | 1 |
| 3 | Biblioteca semántica de material | ✅ base (schema+tool+rank+pack) | §3.3 | 1–2 |
| 4 | Material con ROL (overlay/PiP/…) | ✅ base (`scene_place_material`) | §3.4 | 2 |
| 5 | Composición híbrida | ✅ modelo (`components`) | §3.5 | 2 |
| 6 | Matching semántico | ⚙️ rank sobre metadata; falta expansión | §3.6 | 2 |
| 7 | Fragmento + edición del material | ⚙️ source/size/pos/opacity; falta zoom/pan | §3.7 | 2 |
| 8 | Reuse + historial de uso | ✅ base (usage+recent en pack) | §3.8 | 1–2 |
| 9 | Analizar composición existente | ✅ base (ocupación en pack) | §3.9 | 1 |
| 10 | Presupuesto/ritmo visual | ✅ presupuesto (`complexity`) | §3.10 | 2 |
| 11 | `NO ADDITIONAL VISUAL` | ✅ (`no_visual`) | §3.11 | 2 |
| 12 | Dirección vs ejecución + DECISION | ⚙️ `composition_intent`; falta EXECUTION/DECISION | §3.12 | 2–3 |
| 13 | Render de frame compuesto | ✅ `render_timeline_frame` | §3.13 | 4 |
| 14 | Validación + auto-corrección | ✅ base (`scene_validate_segment` + bucle) | §3.14 | 4 |
| 15 | UX/UI (overlay, badges, mapa) | net-new | §4 | 1–4 |
| 16 | Dirección visual GLOBAL (`visual_blueprint`) | ✅ base (schema+persistencia+normalize) | §5.1 | 5 |
| 17 | Blueprint dentro del pack (bloque DIRECCIÓN GLOBAL) | ✅ (`_blueprint_lines` en `pack_text`) | §5.1, §3.1(a) | 5 |
| 18 | Pasada "intención por tramo" (`scene_plan_all`) | ✅ (IA + `apply_plan_all`) | §5.2 | 5 |
| 19 | Tools blueprint (`scene_get/set/generate_blueprint` + `scene_plan_all`) | ✅ (MCP+HTTP) | §5.3 | 5 |
| 20 | UX panel dirección global + "Planificar todo" | ⬜ pendiente | §5.4 | 5 |
