# Voltear horizontal / vertical (#7)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es la primera pieza del truco
> *«texto con reflejo»* (copia volteada + máscara + modo de fusión, #8).

## Qué hay

Cualquier clip visual —**vídeo, imagen, figura o texto**— se puede voltear:

- **Inspector → Transformación → Voltear**: dos botones, *horizontal* (espejo) y
  *vertical* (reflejo). Se encienden en azul cuando están activos. En las figuras
  están en su panel de *Propiedades*.
- **Clic derecho sobre el clip** en la timeline: *Voltear horizontal* /
  *Voltear vertical*.
- Con **varios clips seleccionados** se voltean todos (quedan al revés que el
  clip principal).
- **Copiar / pegar atributos** incluye el volteo.

Como en CapCut, el volteo **no se anima** (no tiene keyframes) y es un espejo en los
**ejes del propio clip**: un clip girado 30° y volteado se refleja sobre su eje
girado, no sobre el de la pantalla. La caja de selección, los tiradores y las
**máscaras no se voltean** (la máscara sigue donde la dibujaste). En los textos, la
**sombra sigue cayendo hacia el mismo lado de la pantalla**.

### Reflejo de un título (truco 7)

1. Duplica el texto y ponle **Voltear vertical**.
2. Bájalo para que quede justo debajo del original.
3. Dale una máscara lineal con pluma para que se desvanezca, y baja su opacidad o
   usa un modo de fusión (#8).

## Modelo de datos

```jsonc
// en el clip (cualquier tipo visual)
{ "flip_h": true, "flip_v": false }
```

Clips antiguos: sin estas claves = sin voltear.

## Cómo está implementado (preview = export)

| Tipo | Vista previa | Export |
|---|---|---|
| Vídeo / imagen | `canvas.js`: `scale(±1, ±1)` dentro de la pose (tras girar y escalar, antes de dibujar la fuente) | `hflip`/`vflip` justo **después del recorte** (tamaño fijo) y antes de escalar y girar (`clip_layout.flip_filters`). Detrás de un `scale=eval=frame` no se puede: congela la escala animada |
| Figura | `flipGeometry` refleja los puntos (0–100) antes de colocarlos | `shapes.flip_geometry` al rasterizar (mismos puntos) |
| Texto | `drawTextClip`: espejo alrededor del centro del bloque, solo del dibujo (sombra, caja y letras) | libass: `\frx180` (vertical) / `\fry180` (horizontal) con `\org` en el centro del bloque |

- **libass**: a 180° el plano vuelve a quedar plano, así que `\frx180`/`\fry180`
  son un espejo exacto (sin perspectiva). libass aplica el giro en Z **antes** que
  el de X/Y, y el preview voltea antes de girar: como `giro(a)·espejo =
  espejo·giro(−a)`, con un solo volteo `\frz` cambia de signo; con los dos, es un giro
  de 180°. Con la aparición *Deslizar arriba* y volteo vertical se invierte el
  recorrido del `\move` (libass también lo refleja).
- **Borrador de Eliminar fondo**: el pincel deshace el volteo al pasar del lienzo a
  la fuente (`canvasToSourceNorm`), así que se sigue pintando donde está el cursor.
- Medido con render real de FFmpeg: texto volteado (1 y 2 líneas, alineado a la
  izquierda, con sombra y con giro de 30°) = espejo exacto del sin voltear
  (0 píxeles distintos); imagen libre y de fondo volteadas = espejo exacto.

## Arreglado de paso: imágenes y vídeos girados perdían las esquinas en el export

El filtro `rotate` recibía `ow=rotw(iw)`, que calcula el tamaño para un giro de
**`iw` radianes** (300 rad en una imagen de 300 px) en vez del ángulo real: toda
imagen o vídeo **girado** salía recortado por los lados en el vídeo exportado (a 20°
se perdía el 26 % de la imagen; en la vista previa se veía entera). Ahora el giro
fijo usa `rotw(ángulo)` y el animado la diagonal (`hypot(iw,ih)`). Medido: área
completa y centrada a 20° y 45°.

## MCP

`update_clip(clip_id, {"flip_h": true})` / `{"flip_v": true}` (vídeo, imagen,
figura o texto). `describe_capabilities` lista `clip.flip:h|v` y el resumen del clip
incluye `flip` cuando está volteado.

## Tests

`backend/tests/test_clip_flip.py` y `frontend/src/lib/clipFlip.test.mjs`.
