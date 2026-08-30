# Velocidad de clip (tipo CapCut)

Fecha: 2026-08-30

## Problema

Los clips de vídeo y audio en el montaje siempre duran `out_point - in_point` en la timeline. No hay forma de reproducir el mismo recorte de fuente más rápido o más lento. El recorte (`in`/`out`) no es velocidad: acelera el contenido y acorta (o alarga) la barra.

## Decisiones cerradas

- Aplica a **vídeo y audio**. El **texto ignora** `speed` (siempre 1).
- `in_point` / `out_point` / `start` no cambian al cambiar la velocidad.
- Duración en timeline: `(out_point - in_point) / speed`.
- Al cambiar `speed`, el clip **encoge o crece por la derecha**.
- Rango constante: **0.1x–10x**. Default `1`.
- `keep_pitch` (Tono): default `false` (el tono sube/baja con la velocidad, como `playbackRate` del navegador). `true` = atempo / voz estable.
- `reverse`: default `false`. La duración no cambia por reversa.
- `speed_curve`: `null` en esta entrega. El campo existe para no romper JSON después. Sin UI ni motor de curva.
- Proyectos viejos: campo ausente = `1` / `false` / `null` (default Pydantic; no hace falta subir `schema_version`).
- Receta del taller (`ClipEditor` / `reframe.master`) no se toca.

## Modelo

En `TimelineClip`:

| Campo | Tipo | Default |
|---|---|---|
| `speed` | float | `1` |
| `keep_pitch` | bool | `false` |
| `reverse` | bool | `false` |
| `speed_curve` | optional dict | `null` |

Helpers (JS `editorModel.js`, Python `app/clip_speed.py`):

- `clipSpeed(c)` — texto o inválido → `1`; si no, clamp `[0.1, 10]`.
- `clipSourceDur(c)` — `max(0, out - in)`.
- `clipDur(c)` — timeline: `clipSourceDur / clipSpeed`.
- `timelineToSource(c, t)` — con reverse: `out - (t - start) * speed`; si no: `in + (t - start) * speed`.
- `sourceToTimeline(c, src)` — inversa.

## Preview

- Elemento `<video>`/`<audio>`: `playbackRate = clipSpeed(c)` si no hay reverse.
- `currentTime` = `timelineToSource(c, playhead)` (clamp al media).
- Reverse: no usar `playbackRate` negativo; pausar el elemento y asignar `currentTime` cada tick.
- Efectos appear/exit siguen en **tiempo de timeline** (`head - start` vs `clipDur`).

## Recorte, split, compactar

- Trim izquierda/derecha sigue editando `in_point`/`out_point` (fuente). La barra se recalcula con `clipDur`.
- Split en el playhead: cortar en `timelineToSource(clip, at)`, no `in + (at - start)`.
- Compactar usa `clipDur` (ya lo hace).
- Puntos de encuadre en la barra: mapear con `clipSourceDur`, no con `clipDur`.

## Export (ffmpeg)

Orden vídeo (tras `trim=in:out,setpts=PTS-STARTPTS`):

1. cropscale / reframe en **tiempo de fuente** (`clipSourceDur` para clamp de keyframes).
2. `fps`.
3. `reverse` si `reverse`.
4. `setpts=PTS/SPEED` si `speed ≠ 1`.
5. fx de aparición/salida en **tiempo de timeline**.
6. colocar con `setpts=PTS-STARTPTS+start/TB`.

Audio: `atrim`, `areverse` si reverse, luego `asetrate`+`aresample` (tono sigue a speed) o cadena `atempo` (keep_pitch), luego volume/adelay.

## UI

En Propiedades (vídeo y audio):

- Presets: 0.3, 0.5, 1, 1.5, 2, 3, 5, 10.
- Slider 0.1–10 y valor `2.0x`.
- Tono (`keep_pitch`), Reversa (`reverse`).
- Badge `2x` en el clip de la timeline si `clipSpeed !== 1`.

`onChangeFx` debe aplicar a vídeo **y** audio (hoy el mute de audio no pega si el patch exige `kind === 'video'`).

## Fuera de esta entrega

- Editor de curva (puntos, gráfica).
- Velocidad en clips de texto.
- `ClipEditor` / receta.
