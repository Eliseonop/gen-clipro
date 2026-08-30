# Timeline de secuencia en el taller de clips

Fecha: 2026-08-29

Complementa [2026-08-29-clip-multitrack-design.md](./2026-08-29-clip-multitrack-design.md). No lo reemplaza: master, `fit`, `dual_crop` y el montaje siguen igual.

## Problema

El `ClipEditor` edita 1–2 capas como una sesión suelta. El usuario no ve la secuencia, no puede recorrer varios bloques sin “terminar y salir”, y Generar produce un clip a la vez. El toggle Sobrescribir aparece en clips que aún no existen en `project.clips`.

## Flujo aprobado

```
YouTube / biblioteca → taller (timeline 2 pistas, N bloques) → preview de la secuencia
                    → Generar (un ClipInfo) → biblioteca → montaje
```

- La timeline del taller es la fuente de verdad de la **sesión**.
- `project.clips[index]` es la fuente de verdad **persistida** tras Generar.
- Un Generar = un archivo = un `index`. No se genera bloque a bloque.

## Decisiones cerradas

- Enfoque A: no hay tipo `project.sequences`. No se clona el `VideoEditor`.
- Misma pista: **sin solapes**. Lo simultáneo va a la pista 2.
- Huecos en una pista = vacíos (negro en preview/export).
- Entero/Custom se siguen guardando como `keyframe.fit` (`contain` / `cover`) + `cx`/`cy` (`zoom` si Custom). No se añade `reframe.mode`.
- Identidad persistida = `index` presente en `project.clips`. Sin toggle Sobrescribir / Guardar como nuevo.
- Legacy: `master` ausente o `false` no se reinterpreta.

## Modelo de sesión

```
sequence = {
  persistedIndex: number | null,
  generatedHash: string | null,
  tracks: [
    { clips: Block[] },  // pista 1
    { clips: Block[] },  // pista 2
  ]
}

Block = {
  id,                  // solo UI; no entra al hash ni al JSON persistido
  url, segStart, segEnd,
  trimIn, trimOut,
  tlStart,             // inicio en la secuencia (segundos)
  zoom, pan_mode,
  keyframes,           // t relativo a la fuente (igual que hoy)
  slot, customRect,    // solo compose multi-fuente / hueco explícito
  label
}
```

Duración de un bloque: `trimOut - trimIn` (mínimo 0.3 s, `MIN_SPLIT_GAP`).

Fin en timeline: `tlStart + (trimOut - trimIn)`.

Duración de la secuencia: máximo de esos fines. Si no hay bloques, 0.

### Invariantes

- Máximo 2 pistas.
- En una misma pista, ` [tlStart, tlEnd) ` de dos bloques no se solapan. Se permite contacto en el borde (`tlEnd == next.tlStart`).
- Total de bloques (pista 1 + pista 2) ≤ 8 (límite actual de `compose_clip`).
- Pista 2 puede coincidir en tiempo con pista 1.

### Correspondencia con el modelo actual

| Hoy (`layers`) | Secuencia |
|---|---|
| 1 capa `full` | 1 bloque en pista 1, `tlStart = 0` |
| Cortar (2× `full`) | 2 bloques en pista 1, el segundo con `tlStart = duración del primero` |
| Dividir (mismo URL, slots T/B) | 1 bloque en cada pista, mismo `tlStart` y misma duración |
| 2 URLs + slots | 1 bloque por pista; `slot` / `customRect` como ahora |

`layersFromInitial` / `addSplitTrack` / `cutLayerAt` se reexpresan sobre bloques + pistas. La semántica de Cortar y Dividir no cambia.

## Playhead y preview

- Playhead global `t` ∈ `[0, sequenceDuration]`.
- Reproducir recorre la secuencia completa. Las dos pistas van al mismo `t`.
- Clip activo = bloque seleccionado. Si no hay selección, el bloque de pista 1 bajo el playhead (si no hay, el de pista 2).
- Preview en un instante: por cada pista, el bloque cuyo intervalo contiene `t`, o vacío.
- Dos bloques simultáneos: mismo preview dual de hoy (`split_layout: auto` si mismo URL; slots si no).
- Trim, keyframes, Entero, Custom, zoom y paneo siguen editando **solo el bloque seleccionado**.

Al seleccionar un bloque no se cierra ni se reinicia el taller. El playhead puede saltar a `tlStart` del bloque si el gesto es un click en el bloque (no al arrastrar).

## Acciones de timeline

- **Agregar:** inserta un bloque al final de la pista 1, o en la pista seleccionada si hay hueco que lo cabe a partir del playhead. Si no cabe sin solapar, error visible.
- **Cortar:** parte el bloque seleccionado en el playhead (tiempo de secuencia). Las dos mitades quedan en la misma pista, pegadas. Inactivo si el corte queda a menos de 0.3 s de un extremo.
- **Dividir:** copia el bloque seleccionado a la otra pista, mismo `tlStart` y duración, mismo URL, keyframes clonados. Inactivo si la otra pista solapa esa ventana o si ya hay 8 bloques.
- **Eliminar:** quita el bloque seleccionado. No recompacta a la fuerza (los huecos quedan).
- Mover horizontal: cambia `tlStart` con snap al borde de vecinos; rechaza solape.
- Trim de bloque: igual que hoy (`trimIn`/`trimOut`); al acortar no se crea solape; al alargar, se para en el vecino.

No hay lock/mute/hide de pistas. No hay zoom de filas estilo montaje.

## Persistencia de Entero / Custom

Fuente de verdad: cada keyframe.

```
{ "t", "cx", "cy", "zoom?", "pan_mode?", "fit": "contain" | "cover" }
```

- Entero: `fit: "contain"`. Preview ignora zoom/recorte; posición por defecto `cx=0.5`, `cy=0.5` si el usuario no movió el punto.
- Custom: `fit: "cover"` + ventana (`cx`, `cy`, `zoom`).
- `fit` ausente = `cover` (clips viejos).

No se añade `reframe.mode` ni un objeto `position` duplicado. Al reabrir, la UI deriva Entero/Custom del keyframe seleccionado o de `frameAt(...).fit`.

`recipeForFile` ya empaqueta `fit`. El camino compose debe hacer lo mismo: `buildKfList` / `CompLayer.keyframes` incluyen `fit`, y el filtro de `compose_clip` respeta `contain` (letterbox al hueco).

## Cómo se persiste la secuencia

Nuevos campos opcionales en `ClipInfo` (`schemas.py`):

```
sequence: Optional[ClipSequence] = None
generated_hash: Optional[str] = None
```

`ClipSequence` es `{ version: 1, tracks: [{ clips: SequenceBlock[] }, { clips: SequenceBlock[] }] }`. Los bloques persistidos **no** llevan `id` de UI.

`Reframe` no se migra. Sigue siendo la receta que entiende el montaje.

### Al generar

**Camino master** (`createClipJob`) — un bloque, o dos bloques mismo URL y misma ventana temporal:

- Archivo: trim en aspecto fuente (`master: true`), como ahora.
- `reframe`: receta actual (`keyframes` / `keyframes2`, `dual_crop`, `split_layout`, `fit`).
- `sequence`: la sesión completa (para reabrir la timeline).
- `generated_hash`: hash de la sesión.

**Camino compose** (`composeClipJob`) — cualquier otro caso (varios bloques en el tiempo, URLs distintas, huecos que no caben en un solo trim):

- Flatten: cada bloque → `CompLayer` con `start`/`end` de fuente, `delay = tlStart`, slot según dual/auto o el `slot` del bloque.
- Bake 9:16, igual que hoy (sin receta viva multi-fuente).
- `reframe`: `null` (el montaje lo trata como legado).
- `sequence` + `generated_hash`: sí se guardan, para reabrir el taller con Entero/Custom/keyframes.

### Al reabrir

1. Si `clip.sequence` existe → esa es la timeline.
2. Si no, derivar 1–2 bloques desde `reframe` + `start`/`end`/`source_url` (comportamiento actual de `layersFromInitial`).
3. `persistedIndex = clip.index`.
4. `generatedHash = clip.generated_hash` si está; si falta, `null` (Generar queda habilitado).

Clips legacy (`master` ausente/false, sin `sequence`): un bloque fill, receta vacía. El montaje no cambia.

## Identidad: nuevo vs existente

Un clip es **existente** solo si, al abrir el taller, `project.clips` contiene un item con ese `index`.

| Apertura | `persistedIndex` |
|---|---|
| Biblioteca / `seedClip` con `index` en `project.clips` | ese `index` |
| Segmento recomendado, recorte manual, compose vacío | `null` |
| Tras Generar OK | `job.clips[0].index` |

Reglas de Generar:

- `persistedIndex == null` → índice nuevo (`100000 + …`). Nunca el `index` del segmento de heatmap.
- `persistedIndex != null` → ese índice (upsert en `add_clips`).

Se elimina el selector Sobrescribir / Guardar como nuevo. `layers.length > 1` ya no fuerza un índice nuevo.

Tras un clip nuevo generado: el estado local adopta el `index` del job. El siguiente Generar, si no hay cambios, no corre; si hay cambios, sobrescribe ese mismo clip.

## Hash y botón Generar

`sequenceHash(sequence, { label, description })` es SHA-256 hex de un JSON canónico (claves ordenadas, sin `id` de UI, números redondeados a 3 decimales de tiempo y 4 de centro/zoom).

Entra al hash:

- Por bloque: `url`, `segStart`, `segEnd`, `trimIn`, `trimOut`, `tlStart`, `zoom`, `pan_mode`, keyframes sin `id`, `slot`, `customRect`, `label` de bloque
- `label` y `description` del clip de biblioteca

No entra: playhead, selección, ids de UI, `_seeded`, jobs de proxy, URLs de proxy, `persistedIndex`, `generatedHash`.

- `currentHash === generatedHash` y `generatedHash != null` → Generar deshabilitado (o texto “Sin cambios”).
- Cualquier campo hasheable distinto → habilitado.
- Tras Generar OK → `generatedHash = currentHash` y se persiste en `ClipInfo.generated_hash`.

## Toast

Usar el `Toast` existente. Solo cuando el job llega a estado terminal:

- `done` → “Clip generado correctamente”
- `error` → “No se pudo generar el clip” + `job.error` (o `job.message` si no hay error)

No tostar al pulsar Generar ni mientras `pending`/`running`.

## UI

El taller deja de ser “una capa + una minibarra”. Estructura:

```
Preview (resultado de la secuencia en t)
Timeline 2 pistas (bloques con material, tlStart, duración)
Transporte: Play / Pausa / Agregar / Dividir / Eliminar
Propiedades del bloque seleccionado: Entero, Custom, puntos, trim…
[Generar clip]
```

La timeline es un componente nuevo del taller (`ClipTimeline`), más simple que `EdTimeline`: sin lock, mute, compactar, ni pistas de audio/texto.

Atajos actuales del taller (Tab, Enter, Delete sobre keyframes) se mantienen cuando hay un punto seleccionado. Delete con bloque seleccionado y sin punto borra el bloque.

## Fuera de alcance

- Más de 2 pistas; más de 8 bloques.
- Receta viva (master) para multi-fuente o para varios tramos no expresables como 1 trim + dual.
- Solapes en la misma pista.
- Selector de formato propio en el taller.
- Cambiar Dividir/Cortar del **montaje**.
- `reframe.mode` / `position` duplicados.
- Migración masiva de clips viejos.

## Compatibilidad

- `composeModel` pasa a operar sobre `tracks`. Los tests de Cortar, Dividir, slots y `recipeFromLayers` se reescriben contra bloques/pistas (mismos asserts de semántica). No se mantiene un modelo `layers[]` paralelo.
- `makeClip` del montaje: sin cambios. Master copia `reframe`; legado no.
- `compose.py` (export del proyecto): sin cambios en esta oleada.
- MP4s 9:16 existentes siguen siendo legado.

## Riesgos

- Usar el `index` del segmento de heatmap en un clip nuevo pisaría un clip `#n` existente. Por eso los nuevos siempre reciben índice fresco.
- Compose hoy guarda `reframe=None` y tira `fit`. Hay que persistir `sequence` y respetar `contain` en el bake, o Entero se pierde al reabrir compuestos.
- El hash no debe incluir ids de React o el botón Generar se reactivará solo.
