# Máscaras y ajustes estilo CapCut

> Referencia: vídeo *«10 formas fáciles de usar MÁSCARAS | CAPCUT»* (Tribu MKD,
> <https://www.youtube.com/watch?v=v_u9Vu2bZYo>). Todo lo que ese vídeo hace con
> CapCut se puede hacer en el editor con las piezas de este documento.

## Qué hay

| Pieza | Dónde está en el editor | Qué hace |
|---|---|---|
| Máscara **Rollo de película** (`film`) | Video → Máscara | Banda de alto ajustable, infinita a lo ancho. Se gira, se difumina y anima como las demás. Barras de cine, brillos en diagonal, transiciones. |
| **Máscara de ajuste** (`target: "adjust"`) | Máscara → *Aplicar a: Ajustes*, o Ajustar → *Aplicar solo en una zona* | Los ajustes de color del clip solo actúan DENTRO de la forma; el clip se ve entero. Es el "Ajustar → Máscara" de CapCut. |
| Ajustes **Exposición, Blancos, Temperatura, Tono** | Video → Ajustar (y panel Efectos) | Nuevos, junto a Brillo/Contraste/Saturación. *Blancos* = subir el punto blanco de las curvas; *Tono* = círculo cromático. |
| **Máscara en textos** | Texto seleccionado → pestaña *Máscara* | Un clip de texto admite máscara. Sustituye al "clip combinado" (Alt+G) que CapCut necesita para revelar un texto. |
| **Seguir cara** | Máscara → *Seguir cara* (clips de vídeo) | La máscara se mueve con la cara del vídeo: crea keyframes de posición a partir del seguimiento de caras del material. |

Las máscaras que ya existían siguen igual: división (`linear`), círculo, rectángulo
(con esquinas), estrella, corazón, texto y pincel; con pluma, invertir, opacidad,
giro y keyframes.

## Cómo se usa

1. Selecciona el clip (vídeo, imagen, figura o **texto**).
2. **Video → Máscara** (en un texto: pestaña **Máscara**). Elige la forma.
3. *Editar en el preview* te deja moverla, girarla (círculo de arriba), cambiar su
   tamaño (esquina/lados) y su pluma (círculo de la izquierda) sobre el reproductor.
4. **Aplicar a**:
   - **Clip** → solo se ve la parte del clip dentro de la máscara (lo de siempre).
   - **Ajustes** → el clip se ve entero y lo que pongas en **Ajustar** (exposición,
     tono, temperatura, brillo…) solo cambia dentro de la máscara.
5. Para animarla, pon keyframes con el rombo (Posición, Ancho, Alto, Escala, Girar,
   Pluma). Solo anima la **primera** máscara de la lista.
6. **Seguir cara** analiza (o reutiliza del caché) el seguimiento de caras del
   material y rellena keyframes de posición para que la máscara acompañe a la cara.

## Las 10 recetas del vídeo en este editor

| # | Efecto | Pasos |
|---|---|---|
| 1 | **Brillo de objeto** | Duplica el clip. En la copia: Ajustar → *Blancos* al máximo (o Exposición alta). Máscara **Rollo de película**, pluma alta, gírala en diagonal y llévala a una esquina → keyframe. Avanza unos segundos, muévela a la esquina opuesta → keyframe. |
| 2 | **Neblina** | Duplica el vídeo. En la copia: Eliminar fondo → pincel sobre lo que NO quieres borrar. Añade una **figura** rectángulo gris que cubra el vídeo, ponle máscara **Rollo de película** con mucha pluma y déjala entre ambos vídeos (pista intermedia). |
| 3 | **Colorización con seguimiento** | Máscara **Pincel**, *Aplicar a: Ajustes*, pinta la prenda. En Ajustar mueve **Tono** (círculo cromático). Solo cambia de color lo pintado. |
| 4 | **Iluminar rostro** | Ajustar → *Aplicar solo en una zona* (crea un círculo de ajuste). Ajústalo a la cara, sube **Exposición**, sube la **pluma**. Pulsa **Seguir cara**. |
| 5 | **Transición con máscara** | Clip nuevo en una pista por encima. En el punto de la transición: máscara **Rollo de película** fina con pluma → keyframe. Avanza, gírala y ábrela (Alto de la banda) hasta cubrir la pantalla → keyframe. |
| 6 | **Barras de cine** | Máscara **Rollo de película** sobre el vídeo, alto de banda que deje 1-2 cm negros arriba y abajo → keyframe en el momento en que aparecen. Al inicio, agrándala hasta toda la pantalla → keyframe. |
| 7 | **Revelar texto** | Crea el texto (fuente, color, sombra). Pestaña **Máscara** del texto → **División**, gírala y llévala al inicio de la palabra → keyframe. Avanza mientras pasa el objeto y ve moviendo la línea con keyframes. |
| 8 | **Resaltar texto** | Captura del texto como imagen. Duplícala. En la copia: máscara **Rectángulo** sobre la frase, algo de pluma. En la original: keyframe de **Opacidad** 100 % → avanza → keyframe al 50 %. |
| 9 | **Transición con persona** | Vídeo que se descubre abajo y el de la persona encima. Corta en el cruce y duplica. En la capa de la persona: Eliminar fondo → pincel sobre la persona. En la copia: máscara **División** al inicio → keyframe; avanza hasta que la persona cruza → keyframe (añade más si hace falta). |
| 10 | **Pantalla en tres** | Tres vídeos en tres pistas. En los dos primeros: máscara **División** girada ~75° y colocada; el tercero solo se recoloca a un lado. |

## Modelo de datos

Una máscara es un objeto dentro de `clip.masks` (lista; se combinan por intersección):

```jsonc
{
  "id": "m…", "type": "film",          // linear | film | circle | rectangle | star | heart | text | brush
  "enabled": true,
  "x": 0.5, "y": 0.5,                  // centro, fracción del ancho/alto de salida
  "w": 2.4, "h": 0.3,                  // tamaño en unidades de ALTO de salida (film: h = alto de la banda)
  "scale_x": 1, "scale_y": 1, "rotation": 0,
  "feather": 0.06,                     // pluma, unidades de alto (máx 0.25)
  "invert": false, "opacity": 1, "radius": 0,
  "target": "clip"                     // "clip" (qué se ve) | "adjust" (dónde actúan los ajustes)
}
```

Ajustes nuevos, en `clip.effects` (junto a `brightness/contrast/saturation`):

| Clave | Rango | Efecto |
|---|---|---|
| `exposure` | −1…1 | Pasos de diafragma: ganancia ×2^e |
| `whites` | −1…1 | Punto blanco: >0 ganancia 1/(1−0.6·w), <0 ×(1+0.4·w) |
| `temperature` | −1…1 | R ×(1+0.18·t), B ×(1−0.18·t) |
| `hue` | −180…180 | Rotación de tono (matriz `hueRotate` de CSS/SVG) |

## Cómo está implementado (preview = export)

- **Espejo JS ↔ Python**: `frontend/src/lib/clipMask.js` ↔ `backend/app/clip_mask.py`
  (geometría y alfa) y `frontend/src/lib/clipAdjust.js` ↔ `backend/app/clip_adjust.py`
  (matriz de color y pasadas). Ambos lados deben dar el mismo resultado.
- **Rollo de película**: `pathFilm` / `_film_points` (banda ±hh, infinita a lo ancho).
- **Ajustes de color**: se reducen a UNA matriz 3×3 sobre RGB en gamma
  (`M = Tono · diag(temperatura) · k`). Preview: filtro SVG `feColorMatrix` con
  `color-interpolation-filters="sRGB"` enganchado al `ctx.filter` del canvas
  (`url(#vy-adj-N)`). Export: `colorchannelmixer` con los mismos coeficientes, al
  final de la cadena de efectos (`clip_fx.effects_ffmpeg`).
- **Máscara de ajuste**: el clip se pinta en **dos pasadas**: la base sin ajustes de
  color y encima un "fantasma" con los ajustes, recortado por las máscaras de ajuste
  (intersecadas con las del clip). Preview: `adjustPasses` en `drawComposite`. Export:
  `expand_adjust_passes(timeline)` en `compose.render`/`render_frame` (el fantasma es
  otro clip `<id>__adj`, mudo, justo encima), así que reutiliza el `maskedmerge` de siempre.
- **Keyframes**: siguen animando `masks[0]` aunque sea de ajuste. `clip_masks_at`
  / `clipMasksAt` filtran las de ajuste DESPUÉS de animar (con `include_adjust` /
  `{ includeAdjust: true }` las devuelven todas: lo usa el editor para editarlas).
- **Máscara en texto (export)**: los textos con máscara salen del `.ass` global; cada
  uno se dibuja en su propio `.ass` sobre una capa transparente
  (`color=black@0 … ,ass=…:alpha=1`), su alfa se multiplica por la máscara
  (`alphaextract` → `blend=multiply` → `alphamerge`) y se superpone. Quedan debajo de
  los textos sin máscara.
- **Seguir cara**: `POST /api/projects/{pid}/clips/{id}/face-track` (seguimiento de
  caras del material, cacheado) → `followTrackMaskKeys` convierte cada punto de la
  cara (espacio de la fuente) al lienzo con el recorte, escala, posición y giro del
  clip (`sourcePointToOutput`) → keyframes `mx/my` (como mucho uno cada 0,2 s).

## MCP

- `set_clip_masks(project_id, clip_id, masks)` — sustituye la lista de máscaras (mismo
  modelo de arriba; `[]` las quita). Vale para vídeo, imagen, figura y texto.
- `set_clip_effects(…, effects={"exposure": 0.5, "hue": 40, …})` — los ajustes nuevos
  entran por la misma tool (merge).
- `describe_capabilities("clips")` lista `mask_types` y los `visual_fx` nuevos.

## Límites conocidos

- Solo la **primera** máscara anima con keyframes (el resto son estáticas).
- **Seguir cara** necesita un vídeo del material del proyecto (no de biblioteca o
  colecciones) y que se detecte una cara; sigue la cara principal. No hay seguimiento
  de objetos arbitrarios.
- Con **aparición/salida en fundido**, la zona con máscara de ajuste funde un poco
  distinto (se superponen dos capas semitransparentes).
- Un texto con máscara no muestra su recuadro de selección en el preview mientras
  tiene la máscara (sus tiradores siguen funcionando).
- El "clip combinado" de CapCut no existe como tal: se cubre con la máscara en textos
  y figuras.

## Tests

- Backend: `backend/tests/test_clip_adjust.py` (banda, `target`, matriz, pasadas,
  grafo del texto con máscara) y `test_clip_mask.py`.
- Frontend: `frontend/src/lib/clipAdjust.test.mjs` (mismos números que Python +
  seguimiento) y `clipMask.test.mjs`.
