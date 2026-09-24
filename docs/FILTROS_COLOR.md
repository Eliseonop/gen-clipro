# Filtros de color con intensidad, apilables (#18)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es media parte del truco
> *«etalonaje de cine»*: varios filtros uno encima de otro, cada uno con su intensidad.

## Cómo se usa

Clip de vídeo o imagen → **Efectos → Video** (o la biblioteca de **Efectos** del panel
de materiales):

- La galería agrupa los filtros en **Color** (Alto contraste, Vivo, Cálido, Hora dorada,
  Frío), **Cine** (Cine, Naranja y turquesa, Noche, Verde Matrix), **Retro** (Sepia,
  Vintage, Desvaído, Mate) y **Blanco y negro** (B/N, Noir). Cada tarjeta muestra cómo
  quedan cuatro colores de referencia (piel, cielo, vegetación, gris).
- **Clic** añade el filtro a la pila (otra vez, lo quita). El número de la tarjeta es su
  orden.
- En **Aplicados** cada filtro tiene su **intensidad** (0–100 %), se reordena con ↑ ↓ y
  se quita con ✕. El orden importa: se aplican de arriba abajo.
- Sale **igual en el export** que en la vista previa.

Los proyectos antiguos con un *Estilo* (el `look` de antes) lo ven como ese filtro al
100 %. **Cambia un poco su color**: antes la vista previa y el export los calculaban de
forma distinta (p. ej. *Vintage* llevaba sepia solo en la vista previa); ahora los dos
usan la misma definición.

## Cómo está implementado

- `frontend/src/lib/clipFilters.js` ↔ `backend/app/clip_filters.py` (un test compara las
  matrices de los dos lados ejecutando node). Cada filtro es una **matriz de color afín
  3×4** sobre RGB en gamma, construida con operaciones en orden (saturación y sepia con
  las matrices del estándar CSS, contraste alrededor de 0,5, brillo, tinte por canal,
  levantar negros).
- **Intensidad k**: `I + k·(M − I)` = mezcla lineal exacta entre el original y el filtro.
  **Pila**: composición de matrices → toda la pila es UNA matriz.
- Vista previa: `feColorMatrix` (con la 4.ª columna de desplazamiento) vía
  `matrixFilterUrl`, donde antes iba el `look` en CSS.
- Export: `colorchannelmixer` con el desplazamiento en la **columna del alfa**
  (`ra`, `ga`, `ba`; alfa opaco = 1 en `gbrap`), para que haya un solo recorte a 0–255
  como en el `feColorMatrix`. Sumarlo después con `lutrgb` fallaba cuando la mezcla ya
  se había salido de rango (*Noir*: blancos a 198 en vez de 255). Medido con FFmpeg: los
  15 filtros y una pila de tres dan la matriz exacta con ≤1,5/255 de error (redondeo).
- Datos: `clip.filters = [{id, amount}]`; `clip.look` se sigue leyendo (y se pone a
  `none` al editar la pila). *Pegar atributos → Filtro, efectos y ajustes* copia la pila.

**No incluido**: LUT `.cube`. Para que la vista previa coincida con el export haría
falta un pase de WebGL por clip (el canvas no aplica LUT 3D); queda pendiente.

## MCP

`set_clip_effects(clip_id, filters=[{id, amount}, …])` sustituye la pila (`[]` la
quita; ids desconocidos dan error). `describe_capabilities("clips")` lista `filters`.

## Tests

`backend/tests/test_clip_filters.py` (matrices JS = Python, intensidad, orden, looks
antiguos, FFmpeg real contra la matriz, op y pegar atributos) y
`frontend/src/lib/clipFilters.test.mjs`.
