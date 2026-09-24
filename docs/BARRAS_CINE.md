# Barras de cine en un clic (#20)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Completa el truco *«etalonaje de
> cine»* junto con los filtros ([FILTROS_COLOR.md](FILTROS_COLOR.md)) y la capa de
> ajuste ([CAPA_AJUSTE.md](CAPA_AJUSTE.md)).

## Cómo se usa

**Materiales → Efectos → Barras de cine** y elige la proporción de lo que quedará
visible: **2,39:1** (cine), **2:1**, **1,85:1** o **16:9**. Con un clic:

- Se añaden dos barras negras (arriba y abajo) **de principio a fin** de la timeline,
  **encima de todo** (en la pista de vídeo de arriba si está libre; si no, en una nueva).
- El grosor sale del formato del proyecto: en un vídeo 16:9, 2,39:1 da barras del
  12,8 % del alto; en un vertical 9:16 las barras son mucho más gruesas (38 %), así que
  ahí 16:9 (34 %) o un grosor a mano suelen quedar mejor.

Las barras son una figura: en el inspector se cambia el **Grosor** (0–45 % del alto
cada una) y el color (Relleno), se recortan o mueven en la timeline, y en **Entrada de
las barras** → *Animar: las barras entran al aparecer* entran desde los bordes en 1,5 s
(o con el deslizador *Dentro* y keyframes, como el «dibujar trazo» de
[TRAZADO_PLUMA.md](TRAZADO_PLUMA.md)). Los textos quedan por encima de las barras.

## Cómo está implementado

- Figura `type: "letterbox"` (`frontend/src/lib/shapes.js` ↔ `backend/app/shapes.py`):
  caja = el cuadro entero y dos rectángulos de alto `bar` (un poco más anchos que el
  cuadro para que el antialias no deje rendija). `cinemaBar` / `cinema_bar`:
  `bar = (1 − aspecto_salida / proporción) / 2`, con tope de 0,45.
- La entrada animada reutiliza la propiedad animable `draw` (#14): en las barras
  escala su alto en lugar de recortar un trazo, así que el export animado es la misma
  secuencia PNG de las figuras con «dibujar trazo». Medido con FFmpeg: el alto de las
  barras coincide con el esperado en cada instante (±2 px).

## MCP

`add_cinema_bars(ratio="2.39", start=0, duration?, animate=False)`: sin `duration` llega
al final de la timeline; `ratio` admite también un número. Si con ese formato no quedan
barras (el vídeo ya es más ancho), da error.

## Tests

`backend/tests/test_cinema_bars.py` (grosor, figura, op, animación y export real) y
`frontend/src/lib/cinemaBars.test.mjs` (mismos números).
