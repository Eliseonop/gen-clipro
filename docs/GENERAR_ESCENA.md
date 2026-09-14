# Generar Escena — spec

> "Generar Motion" pasa a ser **Generar Escena**: se da a la IA una idea, un fragmento de guion y una
> duración; la IA pregunta lo necesario y **construye una escena** combinando los recursos de Motion
> Studio (stickman, gráficos, texto animado, imágenes, vídeo) bajo una **dirección creativa bloqueada**.
> La escena queda editable por partes, sin regenerarla entera.

Referencia conceptual: el montaje de `project-hail-mary` (acd16fc5), que Claude hizo por MCP. Cada
frase del guion se convirtió en un *beat* con el recurso que mejor lo contaba: bloque html (01 Intro
Tierra→Sol, 06 Diagrama misión), stickman (Científico: ¿imposible?), clip del tráiler, paper-animation
de foto NASA, imagen de cierre. Esta spec convierte ese razonamiento implícito en un sistema explícito,
modular e interactivo.

---

## 1. Problemas que resuelve

| Hoy | Con Generar Escena |
|---|---|
| Un prompt → un motion graphic suelto | Brief → preguntas → **plan por beats** → escena |
| El estilo cae en dark + neón + HUD + sci-fi (o, tras el parche, en "Tailwind UI" genérico) | **Creative Direction Lock**: 16 direcciones con materiales, paleta, composición, tipografía, lenguaje de movimiento, texturas y prohibiciones explícitas |
| La IA ejecuta literalmente | La IA **decide la combinación de recursos** según el contenido, dentro de los límites del brief (obligatorio / auto / prohibido) |
| Un JSON grande en un tool call (los modelos fallan) | Generación **por beat**: cada beat es una llamada pequeña; si falla, se reintenta o cae a un fallback determinista |
| Regenerar = rehacer todo | Cada beat guarda su fuente (bloque, storyboard, imagen) → se retoca o regenera solo ese beat |

## 2. Flujo (modal "Generar Escena")

```
[1 Escena]  →  [2 Preguntas]  →  [3 Plan]  →  [4 Vista previa]  →  Agregar / Editar en Studio
 brief +        la IA pregunta     beats          borrador con
 presets        (opcional)         editables      preview real
```

1. **Escena (brief)** — rango de tiempo y duración, guion del tramo (precargado del contexto, editable),
   idea, intención (explicativa · narrativa · cinematográfica · gráfica), **dirección creativa**,
   recursos (cada uno *Auto* / *Obligatorio* / *No*), ritmo, densidad de texto, fondo (escena opaca u
   overlay), elementos obligatorios, libertad de la IA y notas. Barra de **presets** (built-in +
   guardados por el usuario; cargar, guardar como, sobrescribir, borrar). Todo sigue editable tras cargar.
2. **Preguntas** — la IA lee brief + guion y devuelve 0–4 preguntas *relevantes* con opciones (chips) y
   respuesta libre. Se pueden saltar. Las respuestas viajan al plan.
3. **Plan** — la IA devuelve título, logline, *por qué* esta combinación y los **beats**:
   `kind` (stick · graphic · text · image · video), tramo, propósito, contenido en pantalla, cómo se ve
   y se mueve, asset (imagen) o acción (stick). El usuario reordena, cambia tipo/tiempos/textos, borra,
   añade, o pide otra propuesta. Nada se genera hasta aprobar.
4. **Vista previa** — se construye el borrador beat a beat (progreso por beat) y se previsualiza con el
   motor real. Regenerar · Editar en Motion Studio · Agregar al timeline (ruta existente: se hornea a
   vídeo con alfa del material).

## 3. Modelo de datos

La escena es una `MotionComposition` normal. La **fuente de verdad** vive en `metadata.scene`
(mismo patrón que `metadata.stick`); las capas se **derivan** de ella con `scene.build_composition`.

```jsonc
metadata.scene = {
  "version": 1,
  "brief": {
    "idea": "", "script": "", "duration": 8.0,
    "intent": "explicativa|narrativa|cinematografica|grafica",
    "direction": "sketchbook",
    "direction_overrides": { "accent": "#e11d48", "notes": "" },
    "resources": { "stick": "auto|required|off", "graphic": "...", "text": "...",
                   "image": "...", "video": "..." },
    "pace": "calmo|medio|dinamico", "text_density": "minimo|medio|alto",
    "background": "opaque|transparent", "transitions": true,
    "must_include": ["..."], "ai_freedom": "alta|media|baja", "notes": ""
  },
  "answers": [{ "question": "", "answer": "" }],
  "plan": { "title": "", "logline": "", "rationale": "" },
  "beats": [{
    "id": "b1", "kind": "stick|graphic|text|image|video",
    "start": 0.0, "end": 2.4,
    "purpose": "por qué existe este beat", "content": "texto/idea en pantalla",
    "visual": "cómo se ve y se mueve", "asset_id": null, "action": "qué hace el stickman",
    // --- fuente generada (una de):
    "block": { "html": "", "css": "", "js": "" },      // graphic / text
    "stick": { /* storyboard normalizado de stick.py */ },  // stick
    "fallback": false
  }]
}
```

Capas derivadas (`MotionLayer.beat` enlaza capa ↔ beat):

| capa | z | vida | origen |
|---|---|---|---|
| `scene_bg` (backdrop de la dirección) | 0 | toda la escena | determinista (`directions.backdrop`) — omitida si `background=transparent` |
| `beat_<id>` | 10 | `[start, end]` del beat | `block` (IA) · `StickScene.mount(..., ctx.beat.stick)` · tratamiento de imagen determinista |
| `tr_<n>` (transición) | 50 | ±0.35 s en el corte entre beats | determinista según la dirección |

Runtime: `ctx.layer` y `ctx.beat` se exponen al js del bloque. Las imágenes del proyecto se referencian
como `asset:image/<id>`; el generador las **incrusta** como data URI reducido (`window.__ASSETS`), así
preview (iframe), `__rebuild` en vivo y render Playwright ven lo mismo sin red ni rutas.

## 4. Creative Directions

`backend/app/motion/directions.py`. Cada dirección es estructurada — no un nombre:

```
key, label, group, summary
identity            2–4 frases del mundo artístico
materials.use/avoid
palette             bg, surface, ink, secondary, accent (+ gradients: false)
composition         notes, prefer[], avoid[]
typography          display, body, hand (pilas CSS) + notes
motion              feel (metáfora física), examples[], avoid[], eases
transitions[]       ideas de transición en su idioma
texture             papel / grano / tinta / impresión
feel.is / is_not
rule                "ante la ambigüedad, prioriza X sobre el espectáculo"
test                art-direction test antes de dar por buena la composición
keywords[]
engine: backdrop, image_treatment, transition, stick_style, fonts[]
```

Catálogo inicial (16): Sketchbook · Editorial Magazine · Scientific Field Notes · Museum Archive ·
Newspaper · Paper Collage · Blueprint · Whiteboard · Retro Educational Film · Minimal Swiss ·
Infographic Newspaper · Investigation Board · Ink & Wash · Vintage Scientific Poster · Technical Manual ·
Modern Documentary. (Children's Science Book, Architectural Presentation, Stop-Motion Paper y Scientific
Illustration quedan como siguientes altas: basta añadir un dict.)

`compile_lock(direction, overrides)` produce el bloque **CREATIVE DIRECTION LOCK** (identidad, materiales,
color, composición, tipografía, movimiento, textura, feel, prohibiciones globales + propias, regla
creativa y test). Se inyecta en **todas** las llamadas de la escena (preguntas, plan, cada beat).

**Kit por dirección** (inyectado por el generador cuando la composición es una escena): variables CSS
(`--sc-bg --sc-ink --sc-accent --sc-font-display --sc-font-hand…`), clases utilitarias (`.sc-backdrop`,
`.sc-card`, `.sc-hand`, `.sc-display`, `.sc-label`, `.sc-highlight`, `.sc-tape`, `.sc-rule`) y un filtro SVG
`#sc-rough` (trazo imperfecto, semilla fija → determinista). La IA escribe el bloque *usando el kit*, de
modo que la textura y la paleta salen del sistema, no de su "comodín" visual.

Prohibiciones globales (siempre): neon · cyberpunk · HUD · mission control · sci-fi dashboard · hologram ·
glassmorphism · glowing outlines · futuristic interface · floating UI cards · purple-blue AI aesthetic ·
generic SaaS motion graphics (salvo que la dirección lo pida explícitamente — ninguna lo hace).

## 5. Presets

- Built-in (código): p. ej. *Divulgación — Pizarra*, *Explicación — Sketchbook*, *Documental*,
  *Historia con stickman*, *Dato editorial*, *Investigación*.
- Usuario: `backend/data/scene_presets.json` (global, entre proyectos). Un preset es un **brief parcial**
  (sin guion/idea/duración); al cargarlo se fusiona con el brief actual y todo sigue editable.

## 6. IA (backend `motion/scene_ai.py`)

Todas las llamadas usan el proveedor configurado, `history=[]`, sin tools (salvo fotogramas opcionales).

| Etapa | Salida | Robustez |
|---|---|---|
| `questions_stream` | JSON `{questions:[{id, question, why, options[], multi}]}` (0–4) | 1 reintento; sin preguntas = se salta |
| `plan_stream` | JSON `{title, logline, rationale, beats[]}` | normalización: tiempos contiguos que suman la duración, recursos *off* reconvertidos, *required* ausentes → aviso |
| `build_stream` | beat a beat: graphic/text → **formato con etiquetas** `<html>…</html><css>…</css><js>…</js>` (evita escapar HTML dentro de JSON); stick → storyboard JSON (reutiliza `stick_ai`); image → determinista | validador por beat + 1 reintento con el error; si falla → fallback determinista (tarjeta de texto en la dirección) marcado `fallback:true` |

Reglas técnicas del bloque (en el prompt): tiempo local 0..life · `tl.fromTo` siempre · sin
`Date.now/Math.random` · sin URLs externas · usar kit y variables · respetar `avoidY` si es overlay ·
no tapar el guion con texto redundante.

## 7. API

```
GET    /api/projects/{pid}/motion/scene/directions         catálogo (resumen + tokens para la UI)
GET    /api/projects/{pid}/motion/scene/presets            built-in + usuario
POST   /api/projects/{pid}/motion/scene/presets            crear/actualizar {id?, name, brief}
DELETE /api/projects/{pid}/motion/scene/presets/{id}
POST   /api/projects/{pid}/motion/scene/questions   (SSE)  {start,end,brief}
POST   /api/projects/{pid}/motion/scene/plan        (SSE)  {start,end,brief,answers}
POST   /api/projects/{pid}/motion/scene/build       (SSE)  {start,end,brief,answers,plan,variant_of?}
```
La inserción reutiliza `POST /motion/{cid}/add-to-timeline`.

## 8. Fases

- **F1 (esta entrega)** — directions + lock + kit; brief, presets; preguntas; plan editable; build por
  beat de **stick, graphic, text, image** con backdrop y transiciones; modal "Generar Escena"; tests.
- **F2 — vídeo** — beat `video`: fragmento del material (in/out elegido por la IA con descripción/
  transcripción). Preview: póster del fragmento en la escena; al insertar, el backend coloca el clip real
  recortado en la pista bajo el overlay y la escena deja ese tramo transparente.
- **F3 — edición por beats en Motion Studio** — pestaña *Escena*: lista de beats, retiming arrastrando
  (re-deriva capas), cambiar tipo/asset/texto, **regenerar un solo beat**, cambiar dirección y
  re-aplicar kit sin regenerar contenido.
- **F4 — MCP** — `motion_scene_directions`, `motion_plan_scene`, `motion_build_scene`,
  `motion_regenerate_beat`; dominio `scene` en `help_content`. Un Claude externo puede montar como en
  hail-mary pero con el mismo sistema.
- **F5 — calidad** — completar las 20 direcciones, test visual por dirección (capturas de referencia),
  auto-crítica opcional con `motion_get_frame` (la IA mira el frame y corrige el beat).

## 9. Nota sobre "Framer Motion"

El motor de render es GSAP dentro de Chromium (seek determinista por frame). Framer Motion es una
librería de React ligada al reloj real; no se puede *seekear* frame a frame en el render sin reescribir
el motor. En la UI y en esta spec, "gráficos tipo Framer Motion" = beats `graphic`/`text` escritos como
bloques html+GSAP. Como bien decías: el motor solo pone la física; la dirección creativa decide qué y
cómo se ve.


---

## 10. Dirección de escena (etapa previa a generar) — implementado 2026-09-14

Flujo de trabajo: **audio narrado → transcripción → subtítulos → Dirección de escena → Generar escena por tramo**.

- **Escaleta** (`Project.scene_directions`, `app/scene_direction.py`): tramos
  `{start, end, text, mode, instruction, strict, materials[], reference_id, status, composition_id}`.
  Modos: *propose* (necesita propuesta) · *explain* · *represent* · *reinforce* (con tramo de referencia) · *material*.
  `strict` = seguir el guion frase a frase.
- **Nunca se asume que hay subtítulos**: guion desde subtítulos → transcripción del material → texto del audio con tiempos estimados → nada.
  Un tramo sin voz sigue siendo dirigible (instrucción + materiales).
- **Dividir guion en tramos**: frases con tiempo agrupadas ≈6 s, sin huecos, conservando lo ya dirigido.
- **Pipeline apto para modelos pequeños** (la app hace lo determinista, la IA solo decide lo visual):
  1. el tramo exacto; 2. `build_pack` = SOLO su contexto (voz, subtítulos del tramo con tiempos, frase antes/después,
  dirección, materiales elegidos o 5 candidatos por relevancia, referencia y vecinos) ≈300-500 tokens;
  3. `pack_text` = texto exacto que recibe la IA, visible en la UI; 4. estructura **script**: `skeleton_beats` corta los beats
  por palabras (fin de frase / coma / ritmo) y la IA solo rellena qué se ve en cada uno (1 llamada; si falla, el plan se rellena con texto);
  5. construcción por beat (ya existente).
- **Acciones sin IA**: colocar el material (vídeo recortado al tramo / imagen) en una pista libre (deshacible); reutilizar la escena del tramo de referencia reescalada.
- **Materiales**: clic derecho → *Editar información* (título + descripción) para proyecto y guardados (`PATCH /api/library/{id}`). Es lo que la IA lee.
- API: `GET/PUT /scene-direction`, `POST /scene-direction/auto-split` y `/pack`, `PATCH /scene-direction/{sid}`,
  `POST /scene-direction/{sid}/place-material` y `/reuse-scene`; `/motion/scene/{questions,plan,build}` aceptan `direction_id`.
- UI: botón **Dirección de escena** en la barra de la timeline y en los menús contextuales; workspace a pantalla completa
  (escaleta · tramo · lo que recibe la IA); Generar Escena ahora es casi pantalla completa con columna de contexto fija.
