# Beats automáticos y marcadores (#12)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es lo que agiliza el truco
> *«ubicaciones en franjas»* (cada vídeo entra en un golpe de la música).

## Qué hay

### Marcadores

- **M** (o el botón **Marcador** de la barra de la timeline) pone un marcador en el
  cursor; **M** sobre un marcador existente lo quita.
- Se ven como una bandera azul en la regla y una línea fina sobre las pistas.
- **Arrastrar** la bandera lo mueve; **clic** lleva el cursor ahí; **doble clic** le
  pone nombre; **clic derecho** lo quita.
- Entran en **deshacer** y se guardan con el proyecto. Solo en la timeline principal.

### Beats

- En un clip de **audio o vídeo**: **clic derecho → Detectar beats**, o **Audio →
  Beats → Detectar beats** en el inspector. Aparece un **punto amarillo** por golpe
  al pie del clip y un aviso con el número de beats y el tempo (BPM).
- **Marcas**: *Todos los beats*, *Uno de cada 2* o *Uno de cada 4* (el «Beat 1 / Beat
  2» de CapCut). Se cuentan desde el primer beat del tema, así que no cambian al
  recortar el clip.
- Siguen al clip: al moverlo, recortarlo o cambiar su velocidad, los puntos se quedan
  en su golpe.
- **Quitar beats** en el mismo menú o en el inspector.

### Imán y navegación

- Al **mover o recortar** un clip, sus bordes se **enganchan** a marcadores y beats
  (además de a los bordes de otras pistas), con la misma guía amarilla.
- **,** y **.** saltan al marcador o beat anterior / siguiente.

## Modelo de datos

```jsonc
// timeline
{ "markers": [{ "id": "m…", "t": 12.5, "label": "drop", "color": "#38bdf8" }] }
// clip de audio o vídeo
{ "beats": { "times": [0.853, 1.712, …],   // s del ARCHIVO
             "bpm": 69.9, "every": 1 } }   // uno de cada N (1 | 2 | 4)
```

## Cómo está implementado

- **Detección** (`backend/app/beats.py`, solo numpy; `POST /api/projects/{id}/beats`):
  1. Audio mono a 22 050 Hz con FFmpeg.
  2. **Fuerza de ataque**: flujo espectral positivo en **48 bandas logarítmicas**
     (30 Hz – 11 kHz), menos su media móvil. Con bandas lineales el hi-hat se
     llevaba todo el peso y los beats caían en el **contratiempo**.
  3. **Tempo**: autocorrelación entre 60 y 200 BPM con preferencia suave por 120.
  4. **Beats**: programación dinámica (Ellis 2007, la de librosa) que premia los
     ataques fuertes separados un periodo.
  5. **+65 ms**: retardo medido del flujo espectral respecto al golpe (el ataque pesa
     más a ¾ de la ventana de análisis), igual de 90 a 174 BPM.
  - Medido con pistas sintéticas (bombo + hi-hat a contratiempo, 90–174 BPM): tempo
    ±1 BPM, 100 % de los golpes a menos de 50 ms, desfase mediano ~0 ms. Un tema de
    2,5 min se analiza en ~0,4 s. Caché por archivo (ruta, tamaño y fecha en ns).
- **Editor** (`frontend/src/lib/beats.js`): `clipBeatTimes` pasa los beats a tiempo de
  timeline (`sourceToTimeline`: velocidad, invertido y recorte); `snapTargets` los
  convierte, con los marcadores, en puntos de imán para `timelineAlign.js`
  (pseudo-clips de duración cero en una pista propia: valen para todas las pistas).
  Al mover no cuentan los beats de los clips que se mueven; al recortar sí.

## MCP

- `detect_beats(clip_id, every=1)`: detecta y guarda los beats del clip (devuelve BPM
  y cuántos).
- `set_timeline_markers(markers)`: sustituye los marcadores (`[]` los borra).
- `get_timeline` devuelve `markers` y, por clip, `beats: {bpm, count, every}`.

## Tests

`backend/tests/test_beats.py` (detección con pistas sintéticas + ops) y
`frontend/src/lib/beats.test.mjs`.
