# Texto animado en el export

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (funcionalidad **#1**).

## Qué hay

Los textos animados salen en el vídeo exportado **igual que en la vista previa**:
posición, escala, giro y opacidad, fotograma a fotograma. Vale para:

- keyframes puestos a mano (rombo de *Transformación* con el texto seleccionado);
- animaciones del MCP (`animate_clip` sobre un texto);
- pistas `anim` antiguas de proyectos viejos.

Antes el export tomaba la pose del **segundo 0** y el texto salía quieto: un título
que crecía con el zoom de la cámara o que "atravesabas" solo se veía bien en el
editor.

De paso se corrigieron tres diferencias que afectaban también a textos quietos:

| Antes | Ahora |
|---|---|
| El texto girado salía girado **al revés** (el canvas gira en sentido horario y `\frz` en antihorario). | Mismo sentido que el preview. |
| Un texto alineado a izquierda/derecha giraba alrededor de su borde. | Gira alrededor del centro de su caja, como en el preview. |
| La posición se recortaba a 0–1: un texto que entra desde fuera del cuadro salía pegado al borde. | Admite posiciones fuera del cuadro (−4…5). |

## Cómo se usa

No hay nada nuevo que aprender: anima el texto como cualquier clip (rombo de
keyframe en *Transformación*, mueve/escala/gira en el reproductor) y exporta.

## Cómo está implementado

Todo en `backend/app/text_ass.py` (el `.ass` que FFmpeg quema con libass):

- **¿Se anima?** `text_animates(clip, fps)` muestrea la pose en cada fotograma con
  `clip_anim.clip_pose` — espejo de `clipPose` del preview (keyframes o pistas
  `anim`) — y compara posición, escala, giro y opacidad.
- **Texto quieto** → la ruta de siempre: un evento (o uno por palabra con karaoke).
- **Texto animado** → `animated_dialogues`: **un evento por fotograma** de la
  composición con `\pos`, `\fs` (tamaño × escala), `\org` + `\frz` (giro) y el alfa
  de ESE fotograma. Los fotogramas consecutivos idénticos (tramos quietos, *hold*)
  se funden en un solo evento.
  - El fotograma `k` (t = k/fps) cae en el evento `[floor(k/fps), floor((k+1)/fps))`
    en centésimas. FFmpeg pasa a libass el tiempo del frame truncado a ms, así que
    nunca toma la pose del fotograma vecino (test con 24/25/30/60 fps).
  - La **aparición de bloque** (fade, pop, slide…) se hornea con `clip_fx_at` —el
    mismo cálculo que `clipFxAt`— en vez de `\fad`/`\move`/`\t`, que al ser relativos
    al evento se repetirían en cada fotograma.
  - **Karaoke** y **typing** se recalculan por fotograma (palabra activa: espejo de
    `activeWordIndexFromWords`; revelado: espejo de `typingReveal`).
- `build_ass(..., fps=timeline.fps)`: `compose._prepare_texts` pasa los FPS del
  proyecto (export y `render_frame` / `render_timeline_frame`).

## Límites conocidos

- El grosor del borde no crece con la escala (tampoco en el preview).
- La escala de un texto sigue topada en 800 % en el editor; la escala extrema
  del truco "texto que atraviesas" es la funcionalidad **#5**.

## Tests

`backend/tests/test_text_ass_anim.py` (movimiento, escala, opacidad, giro, fotograma
exacto con varios fps, tramos quietos, pistas `anim`, aparición horneada, karaoke,
typing, posición fuera de cuadro).
