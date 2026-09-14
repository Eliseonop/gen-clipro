# Flujos de trabajo — Dirección de escena por MCP

> Estado a **2026-09-14**. Guía **práctica** de lo que una IA (o una persona) puede hacer HOY con las
> tools del dominio `scene` del MCP para **dirigir y montar** un vídeo tramo a tramo, sin tocar la UI.
> Complementa a [`DIRECCION_ESCENA_FLUJO_Y_MCP.md`](DIRECCION_ESCENA_FLUJO_Y_MCP.md) (el porqué y el
> roadmap) y a [`GENERAR_ESCENA.md`](GENERAR_ESCENA.md).

**Principio:** la app hace lo mecánico (cortar el guion, preparar contexto, colocar clips); la IA solo
**decide qué se ve**. Todo el contexto llega **compacto y ya decidido** (`pack`, ≈300-500 tokens), así que
funciona con cualquier modelo, incluso pequeño. Descubre todo esto en caliente con
`describe_capabilities("scene")` y `help://scene`.

---

## 1. Las tools del dominio `scene` (16)

| Tool | Acceso | Para qué |
|---|---|---|
| `scene_direction_status(project_id)` | read | **El mapa**: tramos, estado, `pending`, `counts` |
| `scene_direction_get(project_id)` | read | Escaleta completa + guion en frases + modos + catálogo de materiales |
| `scene_direction_pack(project_id, segment)` | read | **El pack de UN tramo** (lo único que necesitas para decidir) |
| `scene_rank_materials(project_id, text)` | read | Materiales por relevancia a demanda |
| `scene_direction_auto_split(project_id)` | read | Propone la escaleta (no guarda) |
| `scene_direction_set(project_id, segments)` | write | Guarda la escaleta entera |
| `scene_direction_update_segment(project_id, id, patch)` | write | Dirige un tramo / marca su estado |
| `scene_set_material_meta(project_id, kind, id, meta)` | write | Metadata semántica de un material |
| `scene_place_material(project_id, id, …)` | write | Coloca material con rol/fragmento/transform |
| `scene_reuse_reference(project_id, id)` | write | Repite la escena de un tramo de referencia (sin IA) |
| `motion_scene_directions(project_id)` | read | Catálogo de las 16 Direcciones Creativas |
| `motion_scene_questions(project_id, …)` | read | La IA pregunta lo que falta (0–4) — bloqueante |
| `motion_plan_scene(project_id, …)` | read | Plan por beats editable — bloqueante |
| `motion_build_scene(project_id, plan, …)` | write | Construye la escena (borrador) — bloqueante |
| `scene_validate_segment(project_id, …)` | read | **Valida** la composición (colisiones/off-screen/solapes) sin render |
| `render_timeline_frame(project_id, at_time)` | read | **Frame REAL** del compuesto de la timeline (los "ojos") |

Tools de apoyo de otros dominios que entran en estos flujos:
- `motion_add_to_timeline(project_id, composition_id, start)` — hornea una escena en la timeline (dominio `motion`).
- `motion_segment_frames` / `get_frame` — ojos: ver qué hay en pantalla / en una composición (dominios `motion`/`vision`).
- `undo` — toda edición estructural es deshacible (dominio `history`).

---

## 2. Estados de un tramo

```
empty ──dirigir──► ready ──generar escena──► generated ──añadir a timeline──► placed
  │                  │                                                          ▲
  │                  └── place_material / reuse_reference ───────────────────────┘
  └── no_visual=true (decidido: mantener plano, no cuenta como pendiente)
```
`scene_direction_status.pending` = tramos en `empty`/`ready` que aún necesitan visual (los `no_visual`
quedan fuera). El objetivo de un montaje autónomo es **vaciar `pending`**.

---

## 3. Flujos de trabajo

### W1 · Montar el vídeo entero (autónomo)
El bucle que recorre toda la escaleta:
```
1. scene_direction_status(pid)                 → ¿qué tramos hay y cuáles faltan? (pending)
2. Si no hay escaleta:
   scene_direction_auto_split(pid) → scene_direction_set(pid, segments)
3. Por cada tramo pendiente:
   a. scene_direction_pack(pid, segment)        → contexto compacto (voz, subs, safe-area,
                                                   ocupación, materiales, uso reciente…)
   b. DECIDE con la regla EDIT > COMBINE > GENERATE (ver §4):
      · sirve un material  → scene_place_material(...)             (rol full/pip/side_panel/…)
      · varios/ híbrido    → update_segment(components=[...]) y colócalos (W4)
      · hay que crear algo → motion_plan_scene → motion_build_scene → motion_add_to_timeline (W5)
      · no hace falta nada → update_segment(no_visual=true)        (W7)
   c. VERIFICA (W9): scene_validate_segment(pid, id) → si hay issues, corrige (re-coloca) y revalida.
   d. scene_direction_update_segment(pid, id, {status:"placed"|"generated", ...})
4. Repite status hasta pending == [].
```

### W2 · Dirigir un solo tramo
```
scene_direction_pack(pid, {start, end, mode?, instruction?})   → lee el contexto
scene_direction_update_segment(pid, id, {
   mode, instruction, strict?, complexity?, composition_intent? })
```
Modos: `propose` (propón el enfoque) · `explain` (haz entender) · `represent` (metáfora visual, sin texto)
· `reinforce` (repite reference_id) · `material` (el protagonista es el material). `strict=true` = seguir el
guion frase a frase.

### W3 · Elegir y colocar un material con ROL
Cuando un material existente ya cuenta el tramo. El material **no es solo "clip a pantalla completa"**:
```
scene_rank_materials(pid, "narración o idea del tramo")     → candidatos por relevancia
scene_place_material(pid, segment_id,
    material={kind:"clips"|"images", id, scope},   # sin él, usa el elegido en el tramo
    role="full|broll|overlay|pip|side_panel|circular|background|reference",
    source={in, out},        # fragmento del material (≠ tramo)
    size=0.4, pos="top_right",   # roles overlay: fracción del ancho + ancla
    opacity=0.9, transform={x,y,scale,rotation})   # override exacto opcional
```
Anclas (`pos`) siempre por encima de la franja de subtítulos: `center/top/top_left/top_right/left/right/
bottom/bottom_left/bottom_right`. La escala overlay es exacta con imágenes; en vídeo asume fuente≈salida.

### W4 · Composición híbrida (b-roll + motion + stickman)
Un tramo puede **combinar** recursos, no elegir uno. Planifícalo y ejecútalo pieza a pieza:
```
# 1) PLAN (SCENE PLAN) — se guarda en el tramo:
scene_direction_update_segment(pid, id, {components:[
   {source:"material", material:{kind:"clips", id:"5"}, role:"background"},
   {source:"graphic",  role:"overlay", note:"gráfico 100x"},
   {source:"stickman", role:"side_panel"} ]})

# 2) EJECUCIÓN:
scene_place_material(pid, id, material={kind:"clips",id:"5"}, role="background")
motion_build_scene(...) → motion_add_to_timeline(...)     # el gráfico (W5)
motion_create_stick_scene(...) → motion_add_to_timeline(...)   # el stickman (dominio motion)
```

### W5 · Generar una escena desde cero (cuando ningún material sirve)
Motion graphics / stickman por IA, con dirección creativa bloqueada:
```
motion_scene_directions(pid)                 → elige una direction_id (estilo)
motion_scene_questions(pid, direction_id)    → 0–4 preguntas (bloqueante)
motion_plan_scene(pid, direction_id, answers=[...], brief={structure:"script"?})
                                             → título + logline + BEATS editables
# (revisa/edita los beats)
motion_build_scene(pid, plan, direction_id)  → crea el BORRADOR (composition_id); con
                                               direction_id lo enlaza al tramo (status "generated")
motion_add_to_timeline(pid, composition_id, start)   → lo hornea en la timeline (status "placed")
```
Sin `direction_id` puedes generar por rango: pasa `start`/`end` + `brief`. Necesita un proveedor de IA
configurado (si no, error `configuration_error`).

### W6 · Reforzar / repetir una escena previa
Para un tramo `reinforce` con `reference_id` que ya tiene escena:
```
scene_direction_update_segment(pid, id, {mode:"reinforce", reference_id:"sd_ref"})
scene_reuse_reference(pid, id)     → copia la escena de referencia reescalada a este tramo (sin IA)
motion_add_to_timeline(pid, composition_id, start)
```

### W7 · "No necesito nada" (evitar sobreeditar)
Frases donde basta mantener el plano:
```
scene_direction_update_segment(pid, id, {no_visual:true})
```
El tramo deja de contar como `pending`; el pack se lo dice a la IA ("SIN VISUAL NUEVO").

### W8 · Enriquecer materiales (mejores decisiones futuras)
Metadata semántica más allá de título+descripción → mejora el ranking y el pack:
```
scene_set_material_meta(pid, "clips"|"images", material_id, {
   subjects:[...], actions:[...], environment, mood, composition,
   visual_content, suggested_usage, visual_priority:"protagonista|apoyo|fondo" }, scope="project|library")
```

### W9 · Verificar y corregir el montaje (el bucle de calidad)
Antes de dar un tramo por bueno, comprueba que nada tapa los subtítulos ni se sale:
```
scene_validate_segment(pid, segment_id)         → issues + sugerencias + ok
# si hay issues:
#   subtitle_collision → scene_place_material(..., pos="top_*", size menor)   # súbelo/redúcelo
#   offscreen          → scene_place_material(..., pos/transform dentro de 0–1)
#   overlap            → separa (pos distinto) o reduce uno
scene_validate_segment(pid, segment_id)         → repite hasta ok:true
render_timeline_frame(pid, at_time)             → (opcional) mira el frame REAL compuesto
```
`validate` razona por geometría (rápido, sin render); `render_timeline_frame` da la imagen real (más
lento, úsalo puntualmente para confirmar).

---

## 4. Reglas editoriales que aplican en todos los flujos

- **EDIT > COMBINE > GENERATE** — antes de generar algo nuevo:
  `1) material existente · 2) material + edición (crop/zoom/fragmento) · 3) varios materiales ·
   4) material + motion · 5) material + stickman · 6) motion/stickman nuevo · 7) escena nueva.`
- **Safe-area de subtítulos** — el `pack` trae `LIENZO` + `ZONA DE SUBTÍTULOS` (banda a dejar libre). No
  coloques ahí texto/caras/sujeto principal; los roles overlay ya se anclan por encima.
- **Presupuesto de complejidad** (`complexity` 1–5) — no revientes cada tramo; reparte 1 (simple) … 5
  (clímax). El pack lo muestra como "COMPLEJIDAD OBJETIVO".
- **Ritmo / reutilización** — el pack avisa de lo que "YA ESTÁ EN LA TIMELINE" y lo "USADO HACE POCO";
  varía crop/zoom/duración en vez de repetir el mismo plano.
- **Intención de composición** (`composition_intent`) — descríbela en lenguaje natural (qué es principal,
  qué acompaña, qué zona dejar libre); viaja en el pack.

---

## 5. Qué NO hay todavía (para no prometer de más)

- **Auto-corrección determinista de un paso**: `scene_validate_segment` detecta y sugiere, pero la
  corrección la aplica la IA re-colocando (`update_clip` no fija `transform`). El bucle validar→corregir→
  revalidar funciona (W9); no hay un "arréglalo tú" de una llamada.
- **Zoom/pan animados y transiciones** en `scene_place_material` (§3.7): hoy hay fragmento + crop/scale/
  posición/opacidad estáticos, no keyframes de zoom/pan.
- **Validación de legibilidad/densidad de texto** y **escala exacta de PiP en vídeo no-vertical** (asume
  fuente≈salida; exacto para imágenes y clips verticales).
- **Ejecutar un plan híbrido en un paso**: `components` es el plan; la ejecución es pieza a pieza (W4).
- **Poblar la metadata semántica por IA de visión**: hoy se escribe con `scene_set_material_meta`.

Ver el roadmap completo (Fases 1-4, todas hechas) en
[`DIRECCION_ESCENA_FLUJO_Y_MCP.md`](DIRECCION_ESCENA_FLUJO_Y_MCP.md) §5.
