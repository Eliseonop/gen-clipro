# Capa de ajuste (#19)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es la otra mitad del truco
> *«etalonaje de cine»*: un solo clip que da el mismo color a toda una escena, por
> encima de varios vídeos.

## Cómo se usa

1. **Materiales → Efectos → Capa de ajuste**. Se añade en el cursor, 5 s, en la pista de
   vídeo de arriba si está libre en ese tramo (si no, en una pista nueva encima de todas).
2. Selecciónala: el inspector muestra **Capa de ajuste**:
   - **Intensidad** (0–100 %): cuánto se nota todo lo de la capa.
   - **Color**: brillo, contraste, saturación, exposición, blancos, temperatura y tono.
   - **Filtros**: la misma galería y pila que en los clips ([FILTROS_COLOR.md](FILTROS_COLOR.md)).
3. Muévela, recórtala o alárgala en la timeline como cualquier clip: afecta a lo que
   tiene **debajo** mientras dura. Se desactiva con **V**.

Afecta a los **vídeos, imágenes y figuras** de las pistas de vídeo de debajo. Los
**textos no**: en este editor siempre van por encima de las pistas de vídeo (también
en el export).

## Cómo está implementado

- Clip nuevo `kind: "adjustment"` (sin archivo, en pista de vídeo, duración libre como
  una figura) con `filters`, `effects` (solo los de color) y `opacity` = intensidad.
- Solo lleva **operaciones de matriz**, así que la capa entera es una matriz 3×4
  (`adjustmentMatrix` en `lib/clipFilters.js` ↔ `adjustment_matrix` en
  `clip_filters.py`, comparadas en un test): la pila de filtros, luego brillo, contraste
  y saturación (como los filtros CSS), luego exposición/blancos/temperatura/tono
  (`clipAdjust`), y la intensidad interpola todo con la identidad.
- **Vista previa** (`render/canvas.js`, `applyAdjustmentLayer`): al llegar a su capa, copia
  el cuadro ya compuesto y lo vuelve a pintar a través de la matriz (`feColorMatrix`).
- **Export** (`compose.py`): entra en la cadena de overlays en su capa y aplica
  `colorchannelmixer` (desplazamiento en la columna del alfa) con
  `enable='between(t,inicio,fin)'` sobre lo compuesto. Medido: ≤2/255 respecto a la
  matriz exacta tras pasar por YUV, y fuera de su tramo el vídeo sale idéntico.
- Arreglado durante el desarrollo: un clip sin archivo (`filename` vacío) resolvía a la
  carpeta del proyecto, que existe, y la capa se aplicaba dos veces.
- *Pegar atributos → Filtro, efectos y ajustes* funciona entre capas de ajuste y clips.

**Limitaciones**: la intensidad no se anima (sin keyframes) y la capa no lleva
desenfoque ni otros efectos que no sean de color.

## MCP

`add_adjustment_layer(start=0, duration=5, filters?, effects?, intensity=1)`; después se
edita con `set_clip_effects` (efectos de color y `filters`) y `update_clip`
(`opacity` = intensidad).

## Tests

`backend/tests/test_adjustment_layer.py` (matriz = la del editor vía node, op, grafo y
render real con FFmpeg) y `frontend/src/lib/adjustmentLayer.test.mjs`.
