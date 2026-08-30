# Receta viva: taller de clips + formato en el montaje

Fecha: 2026-08-29

## Problema

El editor de clip recorta YouTube y **aplasta el resultado a 720×1280**. El montaje vuelve a reencuadrar ese archivo. Hay tres sistemas para lo mismo (`dual_crop`, capas del taller, encuadre mitad del montaje). “Cortar/Dividir” parte el tiempo, no duplica encuadres simultáneos.

## Flujo aprobado

```
YouTube → taller (tiempo, paneos, Dividir) → biblioteca (master + receta)
        → montaje (formato 9:16 / 16:9 / …, textos, audio) → export
```

- El **taller** define qué zona de la fuente se ve, en una o dos pistas sincronizadas.
- El **montaje** define el marco de publicación. Cambiar formato no obliga a volver al taller.
- **Generar** no hornea un Shorts. Corta el tramo en aspecto original y guarda la receta.

## Modelo de datos

Se extiende `Reframe` / keyframes actuales. No hay un tipo paralelo.

### Keyframe

Campos actuales: `t`, `cx`, `cy`, `zoom?`, `pan_mode?`.

Nuevo:

- `fit`: `"cover"` | `"contain"`. Ausente = `"cover"` (clips viejos).
- La interpolación de `fit` sigue la misma regla que `pan_mode`: manda el punto de **llegada**. Preview y export usan esa misma regla (un filtro por tramo de fit, o un solo filtro si la pista es uniforme).

**contain (Entero):** el fotograma completo cabe en el hueco de la pista (letterbox/pillarbox). Se ignoran zoom y recorte.

**cover (Custom):** ventana sobre la fuente (centro + zoom actuales) que **llena** el hueco. Es el comportamiento de hoy.

### Reframe

Campos actuales: `zoom`, `keyframes`, `pan_mode`, `dual_crop`, `split_orientation`, `zoom2`, `keyframes2`, `crop_w`, `crop_h`.

Nuevos:

- `master`: `true` si el archivo de biblioteca es el tramo en aspecto original y la receta se aplica al ver/exportar. Ausente o `false` = clip legado ya recortado a 9:16; el montaje **no** copia esa receta al soltarlo (evitar doble recorte).
- `split_layout`: `"auto"` | `"vertical"` | `"horizontal"`. Default en clips nuevos: `"auto"`.
  - `auto` + `dual_crop`: si `outWidth/outHeight < 1` → apilado (arriba/abajo); si no → lado a lado.
  - Clips viejos con solo `split_orientation`: se respeta esa orientación.

`dual_crop` sigue significando “dos pistas del mismo material”. Pista 1 = `keyframes`/`zoom`. Pista 2 = `keyframes2`/`zoom2`. Máximo 2 pistas en esta oleada.

## Comportamiento por superficie

### Taller (`ClipEditor`)

- **Cortar:** sigue partiendo el tiempo (secuencia). No se redefine.
- **Dividir:** si hay una sola capa, duplica URL, trim y puntos a una segunda pista sincronizada; `dual_crop` efectivo. Si ya hay 2, el botón se desactiva.
- Cada pista tiene su timeline de puntos. El punto seleccionado muestra Entero/Custom, posición, zoom (si Custom), suave/directo.
- Preview del resultado usa el formato del proyecto (`timeline.width/height`). Si no hay timeline, 9:16.
- Misma fuente + 2 pistas: los huecos de preview siguen `split_layout` auto según el formato de preview. No hace falta elegir Arriba/Abajo vs Izquierda/Derecha para el caso Dividir.
- **Agregar material** (otra fuente) y **Cortar** secuencial no cambian de contrato en esta oleada: siguen el compose bake 9:16 actual.

### Generar (misma fuente, 1 o 2 pistas)

FFmpeg recorta `[start, end]` **sin** crop a 9:16 (copia o recodifica manteniendo el fotograma fuente).

`ClipInfo.reframe` guarda la receta completa con `master: true`.

No se llama a `compose_clip` para dos pistas del mismo URL.

### Montaje (`VideoEditor`)

- Al añadir/soltar un clip de biblioteca con `reframe.master === true`, `makeClip` copia esa receta (con ids de keyframes).
- Clips legado: `newReframe()` vacío, el archivo ya es 9:16.
- El selector de formato existente recompone en vivo (`drawReframe` + canvas de resultado).
- **Dividir** del montaje (tecla S) sigue cortando en el tiempo. No se toca.
- Quitar el checkbox 📱 `dual_crop` del montaje: la doble pista nace en el taller. El usuario puede seguir editando puntos de la pista activa en el montaje.
- `EdCrops` lista los puntos de la pista 1; si `dual_crop`, un selector Pista 1 / Pista 2 para ver/editar `keyframes2`.

### Export (`compose.py`)

Usa `timeline.width/height`. Si `dual_crop` y `split_layout === auto`, apila o junta según aspecto. `contain` en una pista = `scale+pad` al hueco; `cover` = crop+scale actual. Preview y export deben coincidir.

## Fuera de alcance

- Más de 2 pistas, PiP extra, cuartetos.
- Selector de formato propio en el taller.
- Cambiar el significado de Dividir en el montaje.
- Receta viva para composiciones de **dos fuentes distintas** (siguen horneándose).
- Dimensiones Custom de aspecto libre (`crop_w`/`crop_h` por keyframe). Custom v1 = zoom + centro de hoy.

## Compatibilidad

- MP4s 9:16 existentes: se reproducen a pantalla del formato (letterbox si el marco no es 9:16).
- `dual_crop` legado en un archivo ya horneado: no se reaplica al soltar en el montaje (`master` ausente).
- Tests actuales de overlay, Cortar secuencial y slots explícitos siguen pasando.
