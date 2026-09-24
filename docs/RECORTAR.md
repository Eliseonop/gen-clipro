# Recortar (estilo CapCut)

> Referencia: *«How to Crop Video in Capcut PC (2026)»*
> (<https://www.youtube.com/watch?v=j5Ul_qZPy3M>).

## Cómo se usa

1. Selecciona un clip de vídeo o imagen en la timeline.
2. Pulsa **Recortar** en el toolbar de la timeline (junto a Dividir · Duplicar · Eliminar).
3. Se abre un modal con el **fotograma completo** de la fuente:
   - Recuadro blanco con **círculos en las esquinas** y **barras en los lados**; fuera
     del recuadro se atenúa; guías de tercios punteadas.
   - Arrastra esquinas o lados para cambiar el tamaño; arrastra el interior para moverlo.
   - **Scrub** del clip debajo (`00:00:00:00 | duración`) para elegir el fotograma.
   - **Rotación** (deslizador + grados): gira el clip en el lienzo.
   - **Recorte**: Libre, Original, Proyecto, 16:9, 9:16, 1:1, 4:3, 3:4, 4:5, 2.35:1.
   - **Restablecer** (fotograma completo, libre, 0°) y **Confirmar**.
4. Nada cambia hasta **Confirmar**; Esc o la X cancelan. Todo el recorte es un único undo.

## Comportamiento

- Clip **estático**: el recorte es FIJO en todo el clip (como CapCut).
- Clip con keyframes o con **seguimiento de cara**: el recorte entra como keyframe en
  el cabezal, para no aplanar el movimiento.
- El clip conserva su posición y su escala: solo desaparece lo recortado.

Se retiró el modo antiguo: el toggle *Recortar* del inspector, la vista partida
recorte | **RESULTADO** y la edición del recuadro dentro del lienzo.

## Implementación

- Modal: `frontend/src/features/editor/EdCropModal.jsx` (canvas propio que dibuja el
  `<video>/<img>` oculto del editor).
- Abrir/confirmar: `openCrop` / `confirmCrop` en `VideoEditor.jsx`; botón en `EdTimeline.jsx`
  (`onCrop`, `cropDisabled`).
- Proporciones: `CROP_RATIOS`, `cropRatioNorm`, `fitCropRatio` en `frontend/src/lib/clipLayout.js`.
- Datos: `reframe.crop_w/crop_h` (tamaño de la ventana sobre la fuente, 0-1) + centro en
  `reframe.keyframes[0].cx/cy` (o en los keyframes del clip si está animado).

## MCP: `crop_clip`

```text
crop_clip(project_id, clip_ids?, track_id?, reset?, cx?, cy?, w?, h?)
```

- Ventana sobre la fuente en fracciones 0-1 (`cx, cy` = centro; `w, h` = tamaño), fija en
  todo el clip. La ventana se acota para no salirse de la fuente.
- `reset=true` = **Restablecer** (fotograma completo).
- `clip_ids` y/o `track_id` (toda la pista): una sola operación → **un solo undo**.
- Solo objetos libres (`layout: overlay`); para encuadre de clips *fill* usa `reframe_clip`.
- Operación: `timeline_ops.crop_clip`; tests en `backend/tests/test_timeline_ops.py` (`CropClipTest`).

Ejemplo — restablecer todos los recortes de V1:

```json
{"project_id": "7f2e6aa8", "track_id": "V1", "reset": true}
```
