# Sonorizar una escena con IA (#17)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Automatiza el truco *«diseño
> sonoro»*: el viento de la montaña, el helicóptero que pasa, el grito del águila.

## Cómo se usa

1. Clic derecho en un clip de **vídeo o imagen** de la timeline → **Sonorizar con IA**.
2. La IA piensa qué debería sonar en esa escena y cuándo (unos segundos; el aviso de
   abajo dice por dónde va).
3. Se abre **Sonorizar la escena** con las propuestas: qué es (p. ej. *Viento de
   montaña*), el archivo de tu biblioteca que se usará, si es **Ambiente** (fondo
   continuo, volumen bajo) o **Puntual** (en su momento), y cuándo empieza, cuánto dura
   y a qué volumen. **▶** lo escucha; desmarca lo que no quieras y pulsa **Añadir**.
4. Los sonidos se colocan en pistas de audio **SFX** (se crea «SFX 2», «SFX 3»… si hace
   falta para no pisar nada). El ambiente entra y sale con un fundido corto. Cada clip
   lleva como nota lo que representa. Todo se deshace con Ctrl+Z.

Si la IA pide algo que **no está en tu biblioteca** (p. ej. *olas*), lo dice al pie del
diálogo en vez de poner otro sonido cualquiera: añádelo en la pestaña **SFX** y vuelve a
sonorizar.

## Qué ve la IA

- Con **Foundry** configurado (Ajustes → IA), **tres fotogramas** de la escena, además
  del contexto de texto.
- Sin Foundry, con el **proveedor de chat** configurado (Gemini, OpenRouter, Groq…):
  solo el contexto de texto — la **nota** del clip, el nombre y la descripción del
  material (la de *Analizar material* si la hay) y lo que se **dice** en ese tramo
  (los textos y subtítulos que coinciden). El diálogo indica cuál de los dos se usó.

## Cómo está implementado

- `backend/app/sound_design.py`: `build_prompt` (contexto, categorías de la
  biblioteca con su uso y reglas: máx. 6 sonidos, tiempos desde el inicio del clip,
  palabras clave en inglés y español porque los archivos se llaman casi todos en
  inglés), `parse_sounds` (sanea tiempos, volúmenes y tipos), `match_sounds`
  (emparejamiento **local** por palabras clave: frase entera en el nombre > palabra
  suelta > categoría/uso; sin repetir archivo; lo que no llega al mínimo va a
  `missing`) y `propose` (la llamada a la IA + duración real de cada archivo).
  Con la biblioteca real, «viento / águila / helicóptero / golpe» dan *Whoosh Wind*,
  *EAGLE RAHHH*, *helicopter helicopter* y *Pan Hit*.
- Job `POST /api/projects/{id}/sound-design` (`job.result = {sounds, missing, mode}`).
- Colocación: `frontend/src/lib/soundDesign.js` (`placeSoundDesign`) ↔
  `timeline_ops.add_sound_design` (mismo resultado en los dos lados): el sonido dura lo
  pedido sin pasar del archivo ni del final de la escena.
- Editor: `EdSoundDesign.jsx` (el diálogo), `soundDesignFor` / `applySoundDesign` en
  `VideoEditor.jsx`.

## MCP

`sound_design(clip_id, apply=True)`: job (`wait_for_job`). Con `apply` coloca los
sonidos emparejados; `result.missing` lista lo que falta en la biblioteca.

## Tests

`backend/tests/test_sound_design.py` (respuesta de la IA, emparejamiento, colocación, la
propuesta con visión y con chat —IA simulada— y la tool MCP de punta a punta) y
`frontend/src/lib/soundDesign.test.mjs` (mismo caso de colocación).
