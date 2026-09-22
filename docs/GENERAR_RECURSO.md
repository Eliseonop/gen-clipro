# Generar recurso

> El camino rápido para poner un **recurso visual** en un tramo de la timeline sin salir del
> editor. La IA lee el contexto sola y propone qué dibujar. El usuario pulsa una propuesta y
> el recurso se genera **a partir de una plantilla**, con el contenido y los PNG reales del
> proyecto.
>
> Sustituye como entrada principal al wizard de 4 pasos de [Generar Escena](GENERAR_ESCENA.md).
> Ese wizard y la escaleta de [Dirección de escena](DIRECCION_ESCENA_FLUJO_Y_MCP.md) siguen
> existiendo para dirigir el guion entero tramo a tramo.

```
Timeline ─ tramo marcado (I/O) o 5 s desde el cursor
   │
   ▼  Toolbar «Generar recurso» · clic derecho «Generar recurso aquí»
Modal rápido
   ├─ contexto (1 línea; se despliega si se pide)
   ├─ propuestas: primero las del guion (al instante), luego las de la IA
   ├─ chips de tipo: Diagrama · Timeline · Comparación · Lista · Gráfico · Imágenes · Señalar
   └─ instrucción propia (opcional)
   │
   ▼  clic en una propuesta
Plantilla + contenido → borrador (sin IA, instantáneo) → vista previa en bucle
   │
   ▼  «Agregar al timeline» (render HyperFrames → clip de vídeo editable)
```

## 1. Qué recibe la IA

Lo construye `motion/segment_context.build_segment_context`, el mismo contexto compacto de Generar Motion:

| Señal | Origen |
|---|---|
| Guion antes / ahora / después | subtítulos → transcripción → texto del audio |
| Lo que hay en pantalla | clips del tramo, con **su nota de contexto** (§4) |
| Imágenes del material | id + etiqueta, marcadas si encajan con el guion |
| Formato, duración, acento, franja de subtítulos | timeline y estilo de los subtítulos |

## 2. Cómo se decide el recurso (`motion/resource_ai.py`)

1. **Heurísticas del guion**, instantáneas y sin IA (`heuristic_suggestions`). Solo usan contenido que
   pueden leer con seguridad:
   - años → timeline;
   - «frente a» con dos nombres propios → comparación;
   - un porcentaje → cifra;
   - imágenes que encajan → assets protagonistas;
   - tres o más nombres → lista apilada.

   Los nombres salen de `entities()`, no de `keyTerms`, que son solo palabras largas ("realmente"). Sin
   señales no proponen nada: es preferible a rellenar con "Idea A".
2. **IA** (`suggest_stream`): recibe el catálogo compacto de plantillas (`templates.catalog()`:
   `best_for`, `tags`, `slots`) y devuelve JSON con plantilla + huecos rellenos. `normalize_suggestions`:
   - descarta plantillas inventadas;
   - sanea los ids de imagen (quita prefijos `id=` y vacía ids inexistentes, que darían una imagen rota);
   - recorta los textos largos;
   - fuerza la duración y el acento del tramo.
3. **Composición libre** solo si la IA devuelve `template: null` con un `concept`. Se delega en
   `generate.create_stream`.

Una **instrucción escrita** sigue el mismo camino: se piden propuestas con ese texto como petición y se
construye la primera de la IA. No se va directo a «componer desde cero».

### Proveedor lento

Con `openrouter/free` cada petición va a un modelo gratuito distinto. Medido: 14–51 s por respuesta, con
hasta 44 s sin emitir nada, y alguno devuelve su veredicto de moderación («User Safety: safe») en vez de
la respuesta. Por eso:

- hay límites de tiempo: `AI_TIMEOUT` 90 s en sugerencias, 60 s en notas y `CREATE_TIMEOUT` 180 s en
  composición libre;
- mientras la IA piensa, el modal enseña las propuestas del guion, y al agotarse el tiempo se quedan con
  un aviso;
- las notas basura se filtran (`clip_notes.usable`).

Un modelo fijo y rápido evita casi todo esto.

## 3. Biblioteca de plantillas visuales (`motion/templates/visual.py`)

Son composiciones **parametrizables**: reciben contenido (`items=[{label, sublabel?, image?}]`, `steps`,
`events`, `data`…) y deciden cómo presentarlo y animarlo.

| Categoría | Plantillas |
|---|---|
| Listas | `stack_list` (caen y se apilan de abajo arriba), `card_grid`, `sequence_rows` |
| Comparaciones | `versus`, `before_after` |
| Diagramas | `flow_steps` (vertical en 9:16, horizontal en apaisado), `decision_tree`, `concept_map` |
| Datos | `line_graph` (trazo que se dibuja) · heredadas: `bar_chart`, `stat` |
| Tiempo | `timeline_track` |
| Assets | `asset_showcase` (PNG como protagonistas, overlay transparente) |
| Conceptuales | `annotate` (flecha sobre el vídeo), `assemble` (piezas que convergen) |

Reglas comunes (`templates/base.py`):

- **Lienzo de diseño de 720×1280** escalado al formato real (`design_box`). Se ven igual a 720p y a
  1080p, y en 16:9 caben sin desbordar.
- **Estética editorial clara** por defecto, con tema `dark` sobrio disponible y sin neón.
- **Contraste garantizado** (`themes.resolve_theme`): `accent_ink` es el acento usado como texto o trazo,
  oscurecido si no se lee sobre la tarjeta. `accent_text` es el texto que va sobre el acento. Esto
  importa porque el acento del proyecto suele ser el amarillo de los subtítulos.
- **PNG reales**: `image` = id del material → `asset:image/<id>`, que el generador incrusta. Sin imagen se
  pone un monograma, nunca un logo inventado. `save_composition` marca `metadata.project_id`; sin eso no
  se resuelven.
- **JS determinista**: solo `tl.fromTo`, sin `Math.random` ni `Date.now` (lo cubren los tests).
- Al crear para un tramo, la plantilla se instancia **ya con el formato del proyecto**
  (`motion_create_composition`). Instanciarla a otro tamaño y forzar el formato después la dejaba
  escalada y recortada.

Hojas de contacto usadas para validar: capturas con Chrome headless de cada plantilla en 720×1280,
1080×1920 y 1920×1080, en su fotograma final y en uno intermedio.

## 4. Notas de contexto por material (`TimelineClip.note`)

Una nota dice **qué representa el fragmento en la historia**, no qué archivo es: «el científico escribe la
ecuación». Por ejemplo, un recorte 00:12→00:17 de un vídeo de 30 s.

- **Dónde se ve**: en el inspector, sección «Contexto / Nota» (la primera). En el clip de la timeline hay
  un indicador, y la nota aparece en el tooltip.
- **Cómo se guarda**: es una propiedad del clip y va por el guardado normal de la timeline, así que se
  puede deshacer. `note_source` vale `user` o `ai`. Por MCP se escribe con `update_clip(id, {note})`.
- **Propuesta de la IA** (`app/clip_notes.py`): lee el guion del tramo, el material, el fragmento usado y
  las notas de los clips vecinos.
  - Al seleccionar un clip visual **sin nota**, se pide sola tras 900 ms y aparece con «Usar / Editar /
    Descartar». **No se guarda hasta aceptarla.**
  - Se cachea por clip y fragmento (`start`, `in`, `out`), así que al recortar o mover el clip se propone
    de nuevo.
  - El botón «Proponer» la pide a mano y la vuelca en el cuadro para retocarla.
- **Dónde se usa**: `segment_context._element` la añade como `existingElements[].note`, y el prompt de
  sugerencias la presenta como «qué representa lo que ya hay en pantalla».

## 5. Plantillas del usuario (`motion/templates/user.py`)

Cierra el punto 16: *composición libre → validarla → guardarla como plantilla*. Con el uso, la biblioteca
crece.

- **Guardar**: en la vista previa de una composición libre aparece «Guardar como plantilla». Pide nombre
  y «cuándo usarla», que es lo que lee la IA para elegirla.
  - Se guarda en `DATA_DIR/motion_user_templates.json`.
  - Sus imágenes se copian a la **Biblioteca** (ids `lib_…`), así la plantilla funciona en cualquier
    proyecto.
- **Variables sin marcarlas a mano**: las ranuras son los **textos** y las **imágenes** que contiene la
  composición. Al instanciarla se pasan
  `params={"texts": {"original": "nuevo"}, "images": {"lib_x": "id_nuevo"}}`. El catálogo le enseña a la
  IA la lista de textos e imágenes originales.
- **Formato**: se escala al tamaño de destino. Las capas html se envuelven en un lienzo escalado, las de
  texto y forma escalan posiciones y tamaños, y con otra proporción se centran.
- **Dónde aparecen**: en el catálogo de la IA (`templates._all()` las lee en cada llamada) y en Motion
  Studio → Plantillas → «Mis plantillas», que se puede borrar con ×.

## 6. API

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/projects/{id}/motion/resource/suggest` | SSE `start / seed / suggestions / done` |
| POST | `/api/projects/{id}/motion/resource/build` | plantilla + params + tramo → borrador (sin IA) |
| POST | `/api/projects/{id}/motion/generate/create` | composición libre (ya existía; ahora con límite de tiempo) |
| POST | `/api/projects/{id}/clip-notes/suggest` | SSE `note / error / done` para 1..12 clips; no guarda |
| POST | `/api/projects/{id}/motion/templates/user` | `{composition_id, name, best_for}` → plantilla del usuario |
| DELETE | `/api/projects/{id}/motion/templates/user/{key}` | borra una plantilla del usuario |

## 7. Límites conocidos

- En 16:9 las plantillas de columna (listas, timeline) se ven estrechas. Las que tienen variante
  apaisada (`flow_steps`) la eligen solas; el resto no.
- La composición libre depende de que el modelo llame a herramientas. Con `openrouter/free` suele fallar;
  las plantillas no tienen ese problema.
- Las ranuras de una plantilla de usuario se sustituyen por coincidencia exacta de texto. Si el mismo
  texto aparece dos veces, cambian las dos.
