# Estilo de texto avanzado

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md): funcionalidades de texto
> **#3** (sombra), **#4** (3D), **#5** (escala extrema) y **#6** (espaciado).
> Animación de textos en el export: [TEXTO_ANIMADO.md](TEXTO_ANIMADO.md).

## Sombra paralela (#3)

### Qué hay

La **Sombra** del texto (Texto → estilo → *Sombra*) ya no es un interruptor fijo:
al activarla aparecen sus controles, como en CapCut:

| Control | Rango | Qué hace |
|---|---|---|
| Color | — | Color de la sombra. |
| Opacidad | 0–100 % | Transparencia de la sombra (por defecto 60 %). |
| Desenfoque | 0–100 | Suavidad del borde (0 = sombra dura). 100 = medio tamaño de letra. |
| Distancia | 0–100 | Separación del texto. 100 = un tamaño de letra entero. |
| Ángulo | −180…180° | Hacia dónde cae: 0° derecha, 90° abajo, −90° arriba. |

La sombra es de la **silueta completa** (relleno + borde), escala con el texto (si el
texto crece por keyframes, la sombra se aleja en proporción) y cae siempre en la
dirección de la pantalla aunque el texto esté girado.

Arreglado de paso: antes la sombra **no se veía en la vista previa si el texto no
tenía borde** (el preset *Sombra* salía sin sombra en el editor y con sombra en el
vídeo exportado).

Con **Brillo** activado no hay sombra paralela: el brillo usa el mismo color y se
dibuja a su manera (sin cambios).

### Modelo de datos

En `style` del texto (o de la pista):

```jsonc
{ "shadow": true, "shadow_color": "#000000",
  "shadow_opacity": 0.6,     // 0–1
  "shadow_blur": 0.05,       // em (fracción del tamaño de letra), 0–1
  "shadow_distance": 0.06,   // em, 0–1
  "shadow_angle": 45 }       // grados; 0 = derecha, 90 = abajo
```

Los textos antiguos con solo `shadow: true` usan esos valores por defecto.

### Cómo está implementado (preview = export)

- **Parámetros**: `textShadow(st, fontPx)` (`frontend/src/lib/textstyles.js`) ↔
  `text_shadow(st, font_px)` (`backend/app/text_ass.py`) → desplazamiento en px,
  σ del desenfoque, color y opacidad.
- **Preview**: `drawTextShadow` dibuja la silueta (borde + relleno de cada palabra) en
  una capa aparte —así borde y relleno no se suman— y la compone con
  `ctx.filter = blur(σ)`, `globalAlpha` y el desplazamiento en espacio de pantalla.
  Orden: sombra → caja de fondo → texto.
- **Export**: cada texto con sombra lleva un **evento ASS extra** en la capa de
  debajo (`2i` la sombra, `2i+1` el texto) con estilo propio `sh<id>` (sin caja),
  la misma posición desplazada y `\blur` = σ / 0,85: medido con FFmpeg 9, `\blurN`
  de libass equivale a una gaussiana de σ ≈ 0,85·N. Textos animados: una sombra por
  fotograma, como el texto. Medido con render real: desplazamiento exacto (±0,7 px).

### MCP

`add_subtitles(..., style)` acepta las claves `shadow_*` en el estilo.

### Tests

`backend/tests/test_text_shadow.py` y `frontend/src/lib/textShadow.test.mjs`
(mismos números).

## Texto 3D (#4)

### Qué hay

Un texto se puede **inclinar** y **girar en 3D** con perspectiva real: el truco
*«texto 3D con sombra»* (el título "tumbado" sobre el paisaje) sin el apaño de CapCut
(línea de tiempo 8K + clip combinado + animación *Flip 3* + congelar fotograma).

En el inspector, texto → **Animación** (y en Efectos → *Transiciones*), sección
*Transformación*:

| Control | Rango | Qué hace |
|---|---|---|
| Inclinar 3D | −75…75° | Gira sobre el eje horizontal: con valores positivos la parte de **arriba** se aleja (el texto se tumba hacia el fondo). |
| Girar 3D | −75…75° | Gira sobre el eje vertical: con valores positivos la **derecha** se aleja. |
| Perspectiva | 0–100 % | Cuánto se nota la profundidad (0 = casi plano, 50 = por defecto, 100 = muy marcada). Aparece cuando el texto está girado. |

*Inclinar* y *Girar* tienen **keyframes** (rombo) y usan las curvas de velocidad
([CURVAS_ANIMACION.md](CURVAS_ANIMACION.md)): un texto puede "caer" hacia el suelo o
entrar volteándose. El giro es alrededor del centro de la caja del texto; la sombra,
el borde, la caja y la máscara del texto se giran con él.

### Modelo de datos

```jsonc
// style del texto
{ "rot_x": 60, "rot_y": 0, "perspective": 0.5 }
// y en keyframes, props.rot_x / props.rot_y
```

### Cómo está implementado (preview = export)

- **Geometría compartida**: `frontend/src/lib/text3d.js` ↔ `backend/app/text3d.py`
  (`planeProject` / `plane_project`, `focalOf` / `focal_of`, mismos números de
  referencia en los tests). Cámara a `f = alto / (0,25 + 1,5·perspectiva)` del plano.
- **Preview**: el texto se pinta en una capa del tamaño del canvas y
  `render/warp3d.js` la deforma con **WebGL** (un quad en coordenadas homogéneas:
  la GPU interpola con perspectiva correcta y recorta lo que quedaría detrás de la
  cámara). Sin WebGL el texto se ve plano. La caja de selección y los tiradores
  se proyectan igual, para poder seguir arrastrándolo.
- **Export**: el texto va en **capa propia** (como los textos con máscara): su
  `.ass` sobre una capa transparente → recorte de la región del texto → filtro
  **`perspective`** de FFmpeg (`sense=destination`) con las esquinas proyectadas por
  `text_ass.text_warp_spec` → capa del tamaño del cuadro (→ máscara, si la hay).
  Animado: `perspective:eval=frame` con un valor por fotograma (`in`).
- Por qué no `\frx`/`\fry` de libass: libass pone la cámara fija a 20 000 px, así
  que no hay perspectiva apreciable; el texto solo se aplasta.
- **Arreglado de paso**: si **todos** los textos iban en capa propia (máscara o
  3D), el export caía a `drawtext` y volvía a pintar esos textos planos y encima.

### MCP

`set_clip_keyframes` acepta `rot_x`/`rot_y` en `props` (textos) y `add_subtitles`
`style.rot_x/rot_y/perspective`.

### Límites

- Solo textos (vídeo, imagen y figuras no se giran en 3D).
- Los textos en capa propia (3D o con máscara) quedan por debajo de los textos
  normales.
- ±75° como máximo: más allá el texto queda de canto.

### Tests

`backend/tests/test_text3d.py` y `frontend/src/lib/text3d.test.mjs`.

## Escala extrema y uniforme (#5)

### Qué hay

- La **Escala** de un texto admite hasta **10 000 %** escribiendo el valor (el
  deslizador sigue llegando a 400 %). Es lo que pide el truco *«texto que
  atraviesas»*: con keyframes de 100 % → 6 000 % y curva *Cúbica In*
  ([CURVAS_ANIMACION.md](CURVAS_ANIMACION.md)) la cámara "vuela" a través de una letra.
  Figuras e imágenes siguen topadas en 800 %: se exportan como imagen escalada.
- **Cambio de comportamiento**: la escala agranda el texto **entero, caja de ajuste
  incluida** (como CapCut). Antes solo crecía la letra y un título de varias palabras
  se volvía a partir en líneas al agrandarlo (un salto visible en mitad de una
  animación). Ahora el reparto en líneas es el mismo a cualquier escala. Los
  tiradores de ancho de la caja siguen al ratón a cualquier escala.

### Cómo está implementado (preview = export)

- **Preview** (`drawTextClip`): ancho de la caja = `w · ancho · escala`.
- **Export**: la caja de ajuste de libass sale de los márgenes; con escala ≠ 1 cada
  evento lleva márgenes propios `(ancho − w·ancho·escala)/2`, **negativos** si la caja
  supera el cuadro (libass los acepta; medido). En textos animados, por fotograma
  (`_event_margins`, también con la escala de la aparición *pop/zoom*).
- libass dibuja la letra como vector: 90 fotogramas creciendo hasta 4 600 px de
  tamaño de letra se renderizan en menos de 1 s (medido).

### Tests

`backend/tests/test_text_scale.py`.

## Espaciado entre letras e interlineado (#6)

### Qué hay

Texto → estilo, debajo de *Opacidad*:

| Control | Rango | Qué hace |
|---|---|---|
| Espaciado | −50…100 | Espacio entre letras en centésimas del tamaño de letra (negativo = más juntas; el "decrease character" de CapCut que usa el vídeo en todos los títulos). |
| Interlineado | 0,60…3,00 | Distancia entre líneas en tamaños de letra (por defecto 1,22). |

### Arreglos de paso (afectan a TODOS los textos exportados)

- **La letra exportada salía más pequeña que en la vista previa**: Arial ~11 %,
  Impact ~18 %, Segoe UI Black ~25 %, **Anton ~43 %**. libass toma el tamaño de letra
  como el alto de línea de la fuente (métricas OS/2) y el canvas como el "em".
  Ahora el tamaño se convierte con las métricas reales de cada fuente
  (`font_metrics.ass_size_factor`): medido, la «H» mide igual en el export y en el
  canvas (72/72, 79/79, 86/86, 70/70 px).
- **Las líneas se repartían y separaban distinto**: libass partía el texto a su
  manera (reparto "equilibrado") y con el interlineado que dicta la fuente (Anton,
  1,73). Ahora el export reparte las palabras en líneas **igual que la vista previa**
  (`text_ass._rows`, midiendo con el mismo TTF) y pone **cada línea en su evento** a
  la altura `tamaño × interlineado`. Con el botón Exportar el navegador ya manda el
  texto partido (`wrappedText`, ahora con el espaciado); el reparto de Python usa un 2 %
  de margen para no volver a partirlo.
- Los textos alineados a izquierda/derecha llevan la misma sangría que en la vista
  previa (0,2 del tamaño de letra).

### Modelo de datos

```jsonc
// style del texto
{ "letter_spacing": -0.05,   // em, −0,5…1
  "line_height": 1.0 }       // × tamaño de letra, 0,6…3 (por defecto 1,22)
```

### Cómo está implementado (preview = export)

- **Preview**: `ctx.letterSpacing` (también cuenta al repartir las líneas) y
  `lineH = tamaño × interlineado` en `drawTextClip`; `letterSpacingPx` / `lineHeightOf`
  en `lib/textstyles.js`.
- **Export**: espaciado en el campo `Spacing` del estilo ASS (px) y `\fsp` por
  fotograma en textos animados; líneas con `_rows` + `_row_bodies` (un evento por
  línea, desplazado en el eje del texto para que gire con el bloque; `\org` en el
  centro del bloque) y márgenes `_NO_WRAP` para que libass no vuelva a partirlas.
  Medido con render real: distancia entre líneas exacta (57,5 / 78 / 115,2 px con
  0,9 / 1,22 / 1,8) y 0,3 em de espaciado = +7 × 19,2 px en «HHHHHHHH».

### Tests

`backend/tests/test_text_spacing.py` y `frontend/src/lib/textSpacing.test.mjs`.
