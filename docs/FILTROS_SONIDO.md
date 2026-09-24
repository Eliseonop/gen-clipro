# Filtros de sonido y efectos de audio con intensidad animable (#16)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es el truco *«música bajo el
> agua»*: al sumergirse la cámara, la música se va apagando como si se oyera desde
> dentro del agua, y vuelve al salir.

## Cómo se usa

Clip de audio o vídeo → **Audio** (inspector o panel Efectos):

- **Filtros de sonido**: *Bajo el agua*, *Teléfono*, *Radio antigua*, *Megáfono* y
  *Amortiguado* (la música de la habitación de al lado).
- **Efectos**: *Brillo (EQ)*, *Compresor*, *Reverberación*, *Eco*, *Reducir ruido* y
  *Distorsión*.

Un clic activa el filtro al 100 %; el deslizador es su **intensidad**. Con keyframes
(el rombo de la sección, como el volumen) la intensidad se **anima**: por ejemplo 0 %
en el segundo 2 y 100 % en el 3,5 para «entrar al agua». **Ahora se oyen en la vista
previa**, igual que en el vídeo exportado.

## Qué cambió respecto a antes

- Los efectos de audio **no se oían en la vista previa** (solo en el export): ahora sí.
- El export **ignoraba los keyframes** de los efectos (usaba el valor fijo): ahora los
  sigue.
- La intensidad es una **mezcla** entre la señal original y la señal con el efecto
  entero, igual en la vista previa y en el export. Los proyectos que ya tenían efectos
  suenan parecido, no idéntico: *Distorsión* pasa de reducir bits a saturar (tanh), la
  *Reverberación* y el *Eco* mezclan la repetición en vez de alargarla.

## Cómo está implementado

- **Definición única** (`frontend/src/lib/audioFx.js` ↔ `backend/app/audio_fx.py`; un
  test compara las dos ejecutando node): cada efecto son una o más **etapas**, cadenas
  de nodos:
  - biquads del *Audio EQ Cookbook* (paso bajo/alto, pico, estantes), que son los
    mismos en Web Audio y en FFmpeg (`lowpass`, `highpass`, `equalizer`, `lowshelf
    t=s:w=1`). Ojo: en Web Audio la Q del paso bajo/alto va **en dB**
    (Butterworth = −3,01 dB).
  - eco de una repetición = `aecho` (Web Audio: ganancia directa + retardo).
  - compresor: `DynamicsCompressor` ↔ `acompressor`, con la compensación que Web Audio
    aplica sola (`(1/ganancia a 0 dBFS)^0,6`) puesta a mano en FFmpeg (`makeup`).
  - saturación `tanh(k·x)/tanh(k)`: `WaveShaper` ↔ `aeval`.
- **Intensidad k**: con una etapa, `(1 − k)·seco + k·efecto`. Con N etapas (*Bajo el
  agua*: paso bajo a 2500, 900 y 380 Hz; *Amortiguado*: 3500, 1600 y 900 Hz),
  `p = k·N` y cada etapa j pesa `max(0, 1 − |p − j|)`: el paso bajo se va cerrando
  poco a poco en vez de mezclar de golpe (con ruido blanco, la proporción de agudos
  baja 0,86 → 0,31 → 0,08 → 0,04 a lo largo de la rampa).
- **Export** (`audio_fx_graph` en compose): los efectos van en serie; cada uno es un
  `asplit` → etapas → `volume` (fijo, o con la envolvente de los keyframes y
  `eval=frame`) → `amix normalize=0`.
- **Vista previa** (`frontend/src/features/editor/audioGraph.js`): solo el `<video>` /
  `<audio>` de un clip con algún efecto pasa por Web Audio (`MediaElementSource`); el
  resto suena directo. El `AudioContext` arranca al pulsar reproducir (con otro gesto
  no puede) y en cada fotograma se ajustan los pesos de las etapas.

## MCP

`set_clip_audio_fx(clip_id, audio_fx, replace=False, ramp?)` admite los filtros
(`underwater`, `telephone`, `radio`, `megaphone`, `muffled`) y rechaza claves que no
existen. `ramp = {start, end, from=0}` (segundos del clip) anima la intensidad:
«la música se hunde al entrar al agua» = `set_clip_audio_fx(id, {"underwater": 1},
ramp={"start": 2, "end": 3.5})`.

## Tests

`backend/tests/test_audio_fx.py` (definiciones JS = Python, grafo, rampa, y FFmpeg
real: cada efecto, la rampa de *Bajo el agua* y un export completo) y
`frontend/src/lib/audioFx.test.mjs` + `frontend/src/features/editor/audioGraph.test.mjs`
(el grafo de Web Audio con un `AudioContext` simulado).
