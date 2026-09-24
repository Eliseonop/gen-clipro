# Seguimiento de objetos (#15)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es el «Tracking» de CapCut:
> un texto, una flecha o un sticker que acompaña a algo que se mueve en el vídeo
> (truco 5, *texto que acompaña el zoom de la cámara*).

## Cómo se usa

1. Selecciona el clip que tiene que **acompañar** al objeto (texto, figura, imagen u
   otro vídeo) y colócalo donde quieras respecto al objeto.
2. Pon el cursor en un momento en que el objeto se vea en el vídeo de debajo.
3. **Animación → Seguimiento**: elige qué seguir (*Posición*, *Posición y escala* o
   *Posición, escala y giro*) y pulsa **Seguir un objeto del vídeo**.
4. Dibuja un **recuadro** sobre el objeto en el visor (Esc cancela).
5. El objeto se sigue **hacia delante y hacia atrás** en todo el tramo del vídeo; al
   terminar, el clip lleva keyframes que lo mueven con él.

- En el instante en que marcaste el recuadro el clip **no se mueve**: a partir de ahí se
  desplaza (y escala / gira) lo mismo que el objeto **en pantalla**, contando también la
  posición, escala, giro, recorte, volteo y animación del propio vídeo.
- Los keyframes que el clip tenía dentro del tramo seguido se sustituyen; los de fuera
  se quedan. Se pueden retocar después como cualquier keyframe.
- El vídeo que se usa es el de **más arriba** bajo el cursor (sin contar el propio clip).
- Funciona mejor con objetos con textura (una cara, un cartel, un coche). Un recuadro
  liso (cielo, pared blanca) no tiene nada que seguir y lo avisa. Los fotogramas en
  que se pierde el objeto se mantienen en la última posición y el aviso final los cuenta.

## Cómo está implementado

- **Tracker** (`backend/app/object_track.py`, solo OpenCV, sin modelos): puntos buenos
  del recuadro (`goodFeaturesToTrack`) seguidos con flujo óptico **Lucas-Kanade**
  piramidal, con comprobación ida-vuelta (error < 1 px); con los que quedan, una
  **semejanza** por fotograma (`estimateAffinePartial2D` + RANSAC) da desplazamiento,
  escala y giro. Si quedan pocos puntos se vuelven a sembrar en el recuadro actual.
  Fotogramas a 640 px de ancho como mucho; hacia atrás, por bloques de 150 fotogramas
  (sin cargar el tramo entero); al final, media móvil centrada de ±2 fotogramas.
  - Medido con un vídeo sintético (objeto con textura que se desplaza 600 px, crece un
    50 % y gira 30° sobre un fondo con textura): error de posición mediano 0,75 px
    (máx. 1,8), escala 0,2 %, giro 0,1°; 4 s de 720p en ~0,5 s.
- **Recorrido** (`job.result.track`): `[{t, cx, cy, s, rot, ok}]` en tiempo de ARCHIVO y
  0–1 de la fuente, con escala y giro relativos al recuadro inicial.
- **A keyframes** (`frontend/src/lib/objectTrack.js` ↔ `object_track.follow_keys`):
  para cada punto se proyectan a pantalla el centro del objeto y el extremo de su eje
  con `sourcePointToOutput` / `source_point_to_output` (mismo cálculo en los dos lados);
  la diferencia respecto al instante marcado se suma a la pose del clip. Un keyframe
  lineal cada 0,1 s como mucho.
- **Editor**: `VideoEditor.jsx` (`startTrackPick`, `runTrack`), recuadro en
  `interactions.js` (`handleTrackBoxPointer`: las esquinas pasan a la fuente con
  `canvasToSourceNorm`) y en `render/canvas.js`; endpoint
  `POST /api/projects/{id}/track-object` (job).

**Arreglado de paso:** `sourcePointToOutput` no tenía en cuenta el **volteo** ni los
clips **fill**; *Seguir cara* de las máscaras quedaba desplazado en esos casos.

## MCP

`track_object(clip_id, box, at_time, follower_clip_id?, mode="position_scale")`:
`box = {cx, cy, w, h}` en 0–1 del fotograma **fuente** del vídeo en `at_time` (s de
timeline; `get_frame` para verlo). Devuelve un job (`wait_for_job`); con
`follower_clip_id` ese clip acompaña al objeto al terminar (un solo undo). Sin él, el
recorrido queda en `result.track`.

## Tests

`backend/tests/test_object_track.py` (tracker con vídeo sintético real, espejos y la tool
MCP de punta a punta) y `frontend/src/lib/objectTrack.test.mjs` (mismos números).
