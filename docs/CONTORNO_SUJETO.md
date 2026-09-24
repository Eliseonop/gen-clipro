# Contorno / halo del sujeto recortado (#9)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md): la pieza que faltaba del truco
> *«sujeto recortado»* (la persona aparece recortada, con borde blanco, sobre la toma
> anterior). El recorte en sí es **Eliminar fondo** ([EDITOR.md](EDITOR.md#eliminar-fondo)).

## Qué hay

**Video → Eliminar fondo → Contorno** (con el fondo ya eliminado, automático o chroma
key):

| Control | Rango | Qué hace |
|---|---|---|
| Activado | — | Dibuja un borde de color alrededor de la silueta, **detrás** del sujeto. |
| Color | — | Color del borde (blanco por defecto, como en el truco). |
| Grosor | 0–100 % | 100 % = 5 % del alto del material (54 px en 1080p). |
| Difuminado | 0–100 % | Suaviza el borde hasta convertirlo en un **halo** (100 % = difuminado igual al grosor). |
| Opacidad | 0–100 % | Transparencia del borde. |

El contorno sigue a la silueta fotograma a fotograma (también las correcciones a
pincel), y se escala, gira y voltea con el clip: está en el espacio del material. Lo
que el contorno salga del material se recorta en su borde (igual que el sujeto).

## Modelo de datos

```jsonc
// clip.bg_removal
{ "outline": { "enabled": true, "color": "#FFFFFF",
               "width": 0.3,      // × 5 % del alto del material
               "soft": 0,         // halo: σ = soft × grosor
               "opacity": 1 } }
```

## Cómo está implementado (preview = export)

Una dilatación «suave» con la misma receta en los dos lados:

1. Alfa del recorte → **desenfoque gaussiano** σ = grosor / 1,5.
2. **Umbral** en 17/255 (= Φ(−1,5)): en un borde recto el alfa difuminado cae a
   17/255 justo a 1,5·σ = **grosor** del sujeto. Rampa de ~1,5 px para el antialias:
   `alfa = clamp((v − 17) · ganancia)`, ganancia = σ / (1,5 · 0,1295).
3. Ese alfa, en el color elegido y con su opacidad (y, si hay halo, otro
   desenfoque σ = difuminado × grosor), va **debajo** del sujeto.

- **Parámetros**: `outlineParams` / `outlineAlpha` (`frontend/src/lib/clipBg.js`) ↔
  `outline_params` (`backend/app/clip_bg.py`), mismos números en los tests.
- **Preview** (`features/editor/bgCutout.js → withOutline`): silueta blanca sobre negro
  → `ctx.filter = blur(σ)` → una lectura de píxeles con la tabla → color → halo con
  `blur` → recorte encima. Se cachea por fotograma (como el recorte).
- **Export** (`clip_bg.outline_ffmpeg_steps`, justo después del alfa de Eliminar
  fondo): `alphaextract → gblur(σ, steps=3) → lut` (misma tabla) → `alphamerge`
  sobre un color sólido (`lutrgb`) → `overlay` del sujeto encima.
- Medido con render real (sujeto 150×120 sobre croma verde): grosor exportado 8 / 15 /
  9 px para 7,5 / 15 / 9 px pedidos. Con `gblur` de un paso el borde quedaba 1 px
  corto con σ = 20; con `steps=3`, a 0,5 px de la gaussiana ideal.

## Límites

- Alrededor de detalles **muy finos** (pelo, una barra de 3 px) el contorno puede
  variar un par de píxeles entre la vista previa y el export: el umbral cae en la cola
  del desenfoque y cada motor la aproxima distinto.
- Las esquinas salientes quedan redondeadas (es una dilatación suave, no un trazo
  vectorial).

## MCP

La operación `set_clip_bg_removal` fusiona la sección `outline` como `auto` y `chroma`.

## Tests

`backend/tests/test_bg_outline.py` y `frontend/src/lib/clipBgOutline.test.mjs`.
