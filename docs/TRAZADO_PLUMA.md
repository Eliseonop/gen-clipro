# Pluma, trazo punteado y «dibujar trazo» (#14)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es el truco *«ruta de
> ubicaciones»*: una línea curva punteada que se va dibujando sobre un mapa.

## Cómo se usa

### Trazar con la pluma

1. **Materiales → Figuras → Pluma**.
2. Clic en el visor para cada punto. La curva **pasa por todos** los puntos y se ve en
   azul mientras dibujas (sigue al puntero).
3. **Doble clic** o **Enter** termina. **Clic en el primer punto** (con 3 o más) cierra
   el trazado. **Supr / Retroceso** quita el último punto. **Esc** cancela.

El trazado es una figura más (tipo *Trazado*): se mueve, escala, gira, voltea y anima
como las demás, y entra en la pista de vídeo en el cursor.

### Editar los puntos

Con el trazado seleccionado, **Editar puntos** (en sus propiedades) muestra las anclas:

- **Arrastrar** un ancla la mueve.
- **Clic en la línea** discontinua que une las anclas añade una.
- **Alt+clic** en un ancla la quita (quedan al menos 2).
- **Listo** o **Esc** termina. Al soltar, la caja de la figura se reajusta a los puntos
  (salvo si la figura tiene keyframes: ahí su posición la mandan ellos).

*Cerrado* une el último punto con el primero (y permite relleno); *Curvo* apagado une
los puntos con rectas.

### Trazo punteado (todas las figuras)

**Trazo**: *Continuo*, *Discontinuo* (guiones de 3 grosores con huecos de 1) o
*Punteado* (puntos redondos del grosor del trazo, separados otro tanto). El patrón
crece con el grosor.

### Dibujar trazo

Sección **Dibujar trazo** de la figura:

- **Dibujado** (0–100 %): cuánto de cada línea se ve. Con el rombo se anima con
  keyframes, con sus curvas, como cualquier otra propiedad.
- **Animar: se dibuja al aparecer**: keyframes de 0 a 100 % en 1,5 s desde el inicio
  del clip (ease-in-out), conservando el resto de su animación.

Cada línea o contorno se dibuja a la vez desde su principio. En figuras con relleno, el
relleno aparece gradualmente con la misma fracción. Con trazo punteado, los guiones
no se mueven: se van descubriendo.

## Modelo de datos

```jsonc
"shape": {
  "type": "path",
  "x": 0.5, "y": 0.5, "w": 0.8, "h": 0.6,      // caja (fracciones del cuadro)
  "points": [[0, 100], [37.5, 0], [100, 50]],  // anclas en el viewBox 0–100 de la caja
  "closed": false, "smooth": true,
  "dash": "dot",                                // solid | dash | dot (todas las figuras)
  "draw": 1                                     // trazo dibujado fijo 0–1 (todas)
}
// keyframes: props.draw (0–1) anima el trazo dibujado
```

## Cómo está implementado

- **Geometría** (`frontend/src/lib/shapes.js` ↔ `backend/app/shapes.py`): `pathPoints`
  / `path_points` (Catmull-Rom uniforme, 12 muestras por tramo; mismos números en los
  dos lados), `pathShape` / `path_shape` (caja desde puntos del cuadro),
  `trimPolyline` / `trim_polyline` (recorte por longitud en píxeles).
- **Preview**: `drawShapeClip` recorta cada línea (`draw`) y usa `setLineDash` con el
  patrón `dashPattern` (múltiplos del grosor, extremos redondos).
- **Export**: el rasterizador trocea la línea con `dash_runs` (mismo patrón, empezando
  por un tramo «on» como el canvas; los puntos son círculos del grosor) sobre OpenCV,
  cuyas líneas gruesas también tienen extremos redondos. Si `draw` cambia con el
  tiempo, `rasterize_timeline_shapes` escribe una **secuencia PNG** (un fotograma por
  fotograma del proyecto, reutilizando los iguales) que entra en FFmpeg con
  `-framerate` en lugar del PNG en bucle; la pose se sigue aplicando en compose.
  Medido con FFmpeg real: el trazo acaba donde toca en cada instante (±1 fotograma),
  guiones de 64 px y huecos de 21 px con grosor 21 px.
- **Pluma y anclas**: `interactions.js` (`handlePenPointer`, `handlePathEditPointer`),
  overlay en `render/canvas.js` (`drawPenOverlay`, `drawPathAnchors`); ida y vuelta
  pantalla ↔ anclas con `pathAnchorPoints` / `pathLocalPoint` (con giro y volteo) y
  `renormalizePath` al soltar.
- `draw` es una propiedad animable más (`KF_PROP_KEYS`), así que entra en *Pegar
  atributos* → Animación ([PEGAR_ATRIBUTOS.md](PEGAR_ATRIBUTOS.md)).

## MCP

- `add_shape(points=[[x, y], …], shape={stroke, strokeWidth, dash, closed, smooth})`:
  trazado libre con puntos en 0–1 del cuadro.
- `animate_clip(clip_id, "draw_in", duration=1.5)`: el trazo de una figura se dibuja.
  Los demás movimientos no tocan el trazo.
- `describe_capabilities("clips")` lista `shape_dash`.

## Tests

`frontend/src/lib/shapePath.test.mjs` y `backend/tests/test_shape_path.py` (incluye un
export real con FFmpeg del trazo a medio dibujar).
