# Pila de clips en una misma pista (timeline del montaje)

Fecha: 2026-08-30

## Problema

En `EdTimeline`, cada pista es una franja de altura fija. Los clips se posicionan solo en X (`start × pps`, `duración × pps`) y comparten el mismo `top`/`bottom`. Si dos o más clips de **la misma pista** se cruzan en el tiempo, el que va después en el array (o el seleccionado, `z-index: 3`) tapa al resto. El modelo ya permite solapes (`track_overlaps` avisa; compactar los elimina). No hay agrupación visual ni pistas extra: el solape es legal y casi invisible.

Hace falta ver que hay varios clips en el mismo intervalo **sin crear pistas** y **sin mover `start`**.

## Decisiones cerradas

- Aplica a **todas** las pistas (vídeo, audio, texto).
- Una pista sigue siendo una pista. No se crean lanes de modelo ni se cambia `track_id`.
- Visual: **bandas en tiempo real**, no un número/icono “N clips”, no cartas desplazadas genéricas, no cinta decorativa solo en el hueco.
- Al abrir: la pista **crece a lo alto** y los clips del grupo pasan a mini-filas (cajón). Al cerrar, vuelve a la altura normal con las bandas.
- Se abre **solo ese grupo**. Otros grupos de la misma pista siguen contraídos. La pista crece lo justo para el grupo abierto.
- Contraído: el clip de delante se selecciona, mueve y recorta con normalidad. Clic en una banda de detrás **abre** el grupo (no selecciona el oculto).
- Cerrar: control explícito en el grupo abierto **y** clic en otro sitio de la timeline (otra pista, vacío, clip de otro grupo, regla). Clic en un clip del grupo abierto no cierra. Abrir otra pila cierra la anterior.
- Abierto/cerrado es **solo UI** (`expandedClusterId`). No se persiste en la timeline JSON.
- Preview, export y el taller (`ClipEditor`) no se tocan.

## Comportamiento

### Solape

Dos clips se solapan si y solo si:

- mismo `track_id`, y
- `a.start < clipEnd(b)` y `b.start < clipEnd(a)` (intervalos abiertos por la derecha, igual que el resto del editor).

Si solo se tocan en el borde (`clipEnd(A) === B.start`), **no** hay pila.

### Grupo

Componente conexo del grafo de solape **dentro de una pista**. Si A pisa a B y B pisa a C, A+B+C es un solo grupo aunque A no pise a C.

Id estable del grupo: ids de sus clips ordenados y unidos (p. ej. `c1|c2|c3`). Clave de expandir/cerrar.

Tras cada mutación se recalculan los grupos. Si había uno abierto:

- existe un grupo con el mismo id → se mantiene;
- un grupo **contiene todos** los ids anteriores (creció) → se actualiza al id nuevo y sigue abierto;
- un grupo comparte **≥2** ids con el anterior (encogió pero sigue siendo pila) → se actualiza y sigue abierto;
- si no, se cierra.

### Contraído

- **Delante:** último clip del grupo en el array `clips` (mismo orden de pintura de hoy). Si hay clips del grupo en `selectedClipIds`, el de delante es el último en `clips` que esté a la vez en el grupo y en la selección.
- Ese clip ocupa la franja normal, **dejando un margen inferior** (~10–14 px) para las bandas. Las bandas no se pintan debajo del hit-target del de delante: viven en ese margen, para que el clic distinga “mover el de delante” vs “abrir”.
- Cada clip oculto deja una **banda baja** en su `start` y duración reales (mismo `ClipBlock`, más bajo, sin handles de trim, sin waveform ni keyframes: color + nombre recortado). En A 0–10 y B 3–7: 0–3 y 7–10 son solo A a altura normal de pila; 3–7 es A + banda de B.
- Como máximo se pintan **2 bandas** de detrás (las de los 2 clips ocultos más al frente). Si hay más, esas 2 bandas ganan 1–2 px de “lomo” extra, sin cifra.
- Clips de la pista que no pertenecen a ningún grupo: altura y posición actuales (`top`/`bottom` 5 px).
- Otros grupos contraídos en una pista alta (porque otro grupo está abierto) se quedan **arriba**, a altura de franja normal; no se estiran.

### Abierto

- Solo los clips de ese grupo pasan a mini-filas.
- Empaquetado: coloreado greedy de intervalos (ordenar por `start`, asignar la fila más baja que no solape). Minimiza altura. A y C que no se pisan pueden compartir fila.
- Cada mini-fila es un clip normal: seleccionar, mover, recortar, cortar (S), borrar, menú contextual, doble clic.
- Altura de pista (y de su cabecera) = lo justo para esas mini-filas. El resto de pistas no cambian de `--ed-row-h` global.
- Control chevron / “cerrar” anclado al grupo abierto (no a la cabecera de pista, para no chocar con mute/lock/compactar).

### Clics (resumen)

| Zona | Acción |
|---|---|
| Clip de delante (contraído) | Selección / mover / trim actuales |
| Banda de detrás (contraído) | Abrir ese grupo |
| Clip de un grupo abierto | Selección / mover / trim; la pila **no** se cierra |
| Chevron cerrar | Cerrar ese grupo |
| Otra pista, vacío de esta, clip de otro grupo, regla | Cerrar el grupo abierto |
| Abrir otra pila | Cierra la anterior (como máximo una abierta) |

Cursor en banda de detrás: affordance de “abrir”, no `grab`.

### En vivo

- Al mover o recortar, los grupos se recalculan en cada mutación.
- Si el grupo abierto se vacía o queda con un solo clip, se cierra y la pista baja.
- Un clip que cambia de `track_id` sale de su grupo.
- Compactar pista elimina solapes → desaparecen pilas.

## Arquitectura

Solo frontend del montaje. El backend sigue advirtiendo solapes; no hay campo nuevo en clips/tracks.

```
clips[] (sin cambiar start / track_id)
    → overlapClusters(clips, trackId)
    → por grupo: frontClipId, bandas o packClusterLanes
    → EdTimeline pinta lane height + ClipBlock
    → expandedClusterId (React, no persistido)
```

### Funciones puras (`editorModel.js`)

| Función | Contrato |
|---|---|
| `clipsOverlap(a, b)` | `true` solo si misma pista e intervalos cruzados. `false` si distinta pista, si se tocan en el borde, o si alguno dura 0. |
| `overlapClusters(clips, trackId)` | Lista de grupos `{ id, clipIds }` en esa pista, cada uno con ≥2 clips. Orden de grupos: `start` mínimo. |
| `packClusterLanes(clips)` | `Map<clipId, laneIndex>` (0…n-1) con el mínimo de filas sin solape vertical. |
| `frontClipId(clusterClipIds, clips, selectedIds)` | Id del clip de delante: último en `clips` del grupo, o último en `clips` que esté también seleccionado si la selección pisa el grupo. |

No se añade `z_index` al clip.

### UI (`EdTimeline.jsx`, `editor.css`)

- Estado: `expandedClusterId: string | null`.
- Altura **por pista**: el wrap sigue teniendo `--ed-row-h`; cada `.ed-lane` / `.ed-track-head` puede overridear `height`/`min-height`/`max-height` cuando esa pista tiene un grupo abierto. Cabecera y lane de la misma pista siempre iguales (el scroll vertical de cabeceras ya copia el de las lanes).
- Posición Y de clips: dejar de usar solo `top: 5px; bottom: 5px` en grupos. Coordenadas explícitas (`top` + `height`) según contraído / fila empaquetada.
- Bandas = `ClipBlock` con modificador CSS (altura ~8–10 px, sin handles de trim, `pointer-events` para abrir). No es un icono aparte.
- El playhead y el drop-ghost no cambian de contrato.

### Fuera de alcance

- Persistencia del abierto/cerrado.
- Z-order guardado en JSON.
- Auto-abrir al solapar.
- Número o badge “N clips”.
- `ClipEditor` / timeline del taller.
- Cambiar preview, `videosAt`, `topVideoAt` o export (el clip “que se ve” en el compuesto sigue siendo el de pista más al frente; dentro de la misma pista, el orden actual del array).

## Pruebas

**Unitarias** (`editorModel.test.mjs`):

- No solape: hueco, borde exacto, distinta pista.
- Solape parcial y contención (B dentro de A).
- Grupo conexo A–B–C vs dos grupos disjuntos en la misma pista.
- `packClusterLanes`: dos clips que se pisan → 2 filas; A y C sin pisarse con B en medio que pisa a ambos → 2 filas (A y C pueden compartir).
- `frontClipId`: sin selección = último en `clips`; con selección en el grupo = ese.

**Manual / navegador:**

- Contraído: se ve la banda solo donde hay solape; el de delante se arrastra.
- Clic en banda abre; chevron y clic fuera cierran.
- Mini-filas: seleccionar, recortar, borrar cada clip; `track_id` y `start` no saltan de pista.
- Mover hasta que no se pisen → la pila desaparece.
- Audio y texto igual que vídeo.
- Dos grupos en una pista: abrir uno no abre el otro; la pista crece; el grupo cerrado se queda arriba.
