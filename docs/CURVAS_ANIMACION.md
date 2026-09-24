# Curvas de animación (keyframes)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (funcionalidad **#2**). Es la
> «animación de velocidad variable» de CapCut que usan los trucos *texto que acompaña
> el zoom* y *texto que atraviesas* ("cubic in" para que el texto crezca a la vez que
> la cámara avanza).

## Qué hay

Cada keyframe tiene una **curva de velocidad**: cómo llega la animación a ese punto
desde el keyframe anterior.

| Curva | Qué hace |
|---|---|
| Linear | Velocidad constante. |
| Ease In / Ease Out / Ease In-Out | Arranca suave / frena suave / ambas (cuadráticas). |
| **Cúbica In / Out / In-Out** | Igual pero más marcadas (el "cubic in" del vídeo). |
| **Rebote** | Se pasa un poco del destino y vuelve (≈10 %). |
| **Personalizada** | Curva bézier con dos tiradores, como `cubic-bezier()` de CSS. Admite pasarse y retroceder. |
| Hold | Se queda quieto y salta al llegar al keyframe. |

Además, **el export ahora respeta las curvas** en vídeo, imagen y figura. Antes
FFmpeg interpolaba en línea recta entre keyframes: Ease In, Ease Out y Hold solo se
veían en la vista previa.

De paso se arreglaron dos fallos de export en **figuras**:

- Una figura animada salía **desplazada** (y con el giro y la opacidad dobles) si
  se había colocado antes de animarla: el PNG llevaba ya su posición y encima se
  aplicaba la pose.
- La **escala** de una figura sin animar no llegaba al vídeo exportado.

## Cómo se usa

1. Selecciona un clip animado y el keyframe (o deja el cabezal antes de él).
2. En **Transiciones** (o *Animación* en el inspector) aparece **Curva de velocidad**:
   - pulsa un preset (cada uno con su miniatura), o
   - arrastra los **dos tiradores** del editor: la curva pasa a *Personalizada*.
3. La curva del **primer** keyframe no se usa (no hay tramo que llegue a él); el panel
   lo avisa.

Los keyframes nuevos heredan la curva del anterior, y copiar/pegar/duplicar un
keyframe conserva su curva personalizada. Arrastrar un tirador es un solo paso de
deshacer.

## Modelo de datos

```jsonc
{ "id": "k…", "t": 1.2, "props": { "x": 0.8 },
  "interpolation": "bezier",            // linear | ease-in | ease-out | ease-in-out |
                                        // cubic-in | cubic-out | cubic-in-out |
                                        // back-out | bezier | hold
  "bezier": [0.1, 0.9, 0.2, 1.0] }      // solo cuenta con "bezier"; x 0–1, y −1…2
```

## Cómo está implementado (preview = export)

- **Espejo JS ↔ Python**: `easeT` / `bezierY` / `normalizeBezier` en
  `frontend/src/lib/clipKeyframes.js` ↔ `ease_t` / `bezier_y` / `normalize_bezier` en
  `backend/app/clip_keyframes.py`. La bézier se resuelve igual en los dos (Newton y,
  si no converge, bisección). Los tests comparan los mismos números en ambos lados.
- **Export de pose (vídeo/imagen/figura)**: FFmpeg recibe una expresión lineal a
  trozos (`clipper._pw_expr`). `pose_sample_times` añade un punto por fotograma (a
  30 fps, máx. 120 por tramo) en los tramos con curva y uno justo antes del salto en
  *hold*; en tramos lineales no añade nada. Medido con render real: ≤ 1,5 px de la
  vista previa en todas las curvas. `_pw_expr` escribe ahora 6 decimales (antes 2–3
  → hasta 3–4 px de error en la posición final).
- **Volumen** (`ffmpeg_envelope`): las cúbicas llevan su fórmula cerrada; bézier y
  rebote van muestreadas en tramos cortos.
- **Texto, máscaras**: ya se evalúan por fotograma con el mismo interpolador
  (ver [TEXTO_ANIMADO.md](TEXTO_ANIMADO.md)), así que usan la curva sin más.
- **Figuras**: `shapes.export_pose` — sin keyframes la pose estática (con escala) va
  horneada en el PNG; con keyframes el PNG es neutro y `compose` aplica la pose
  siempre (`fill_pose`).
- **UI**: `frontend/src/features/editor/EdCurve.jsx` (`KfCurvePanel`, `CurveEditor`,
  `CurveThumb`), montado por `KfTransitionSelect` en `EdEffects.jsx` / `EdInspector.jsx`.

## MCP

`set_clip_keyframes` acepta los valores nuevos de `interpolation` y `bezier` en cada
item (documentado en `help://clips`). `animate_clip` no cambia.

## Límites

- Una curva por keyframe para **todas** sus propiedades. Curvas distintas para escala,
  X e Y (como el editor de CapCut) es la Fase D de
  [KEYFRAMES_REDISENO.md](KEYFRAMES_REDISENO.md).
- Los efectos de audio animados siguen saliendo constantes en el export (es la
  funcionalidad **#16**).

## Tests

`backend/tests/test_keyframe_curves.py` y `frontend/src/lib/clipKeyframesCurves.test.mjs`
(mismos valores de referencia), `backend/tests/test_overlay_export.py`.
