# Congelar fotograma (#11)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es una pieza del truco *«texto 3D
> con sombra»* (CapCut congela la toma para colocar el título) y de muchos cortes de
> efecto (pausa dramática, presentar a un personaje).

## Qué hay

Con un clip de **vídeo** seleccionado y el cursor encima:

- Botón **Congelar** en la barra de la timeline (junto a *Recortar*), o **clic derecho
  → Congelar fotograma**.
- El clip se **parte en el cursor** y en medio entra una **imagen fija de ese
  fotograma** de **3 s**; la segunda mitad y todo lo que venía detrás **en esa
  pista** se desplazan 3 s. Las otras pistas no se mueven.
- La imagen se ve **exactamente** como el vídeo en ese instante: misma posición,
  escala y giro (si el vídeo está animado, con el valor de ese momento), mismo
  recorte/encuadre, efectos, filtro, máscaras, volteo y modo de fusión.
- La imagen queda también en el **material del proyecto** (*«… · congelado 2.35s»*),
  para reutilizarla.
- Si el cursor está pegado al principio o al final del clip, la imagen va delante o
  detrás (no se parte).
- Es un solo paso de **deshacer**. La duración se cambia como la de cualquier imagen.

## Cómo está implementado

- **Fotograma**: `POST /api/projects/{id}/freeze-frame` (`backend/app/freeze.py`)
  extrae con FFmpeg el fotograma del ARCHIVO (`timelineToSource`: tiene en cuenta
  velocidad e invertido) a **resolución nativa**, así que la transformación del clip
  se copia tal cual (1 px de fuente = 1 px de fuente). Con el mismo color que el
  export: un vídeo sin etiqueta de color se lee como BT.709. Pasado el último
  fotograma, devuelve el último.
- **Timeline**: `frontend/src/lib/freezeFrame.js` → `frozenClipFrom` (clip de imagen
  con la pose de `clipPose` en ese instante, el encuadre fijo de ese momento y el resto
  de propiedades) e `insertFreeze` (parte, inserta y desplaza). Espejo en Python:
  `timeline_ops.freeze_frame` (para el MCP).
- **Eliminar fondo automático** no se copia (su recorte es del vídeo y habría que
  recalcularlo sobre la imagen); el **chroma key** sí.

## Arreglado de paso: partir clips

- Al **partir** un clip con **keyframes**, la segunda mitad **reiniciaba la animación**
  desde el principio (los keyframes van en tiempo local del clip). Ahora continúa
  donde iba (editor y MCP).
- Partir un clip **invertido** intercambiaba mal la entrada y la salida (editor y MCP).
- `split_clip` del MCP **ignoraba la velocidad** del clip (a 2x cortaba en otro
  sitio).

## MCP

`freeze_frame(project_id, clip_id, at_time, duration=3)`: extrae el fotograma, lo
guarda como imagen y aplica la op `freeze_frame` (un undo).

## Tests

`backend/tests/test_freeze_frame.py` (op, bordes, velocidad, keyframes, recorte,
extracción real con FFmpeg) y `frontend/src/lib/freezeFrame.test.mjs`.
