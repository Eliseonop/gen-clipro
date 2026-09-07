// Plantilla del prompt que el usuario copia para pedirle a una IA el guion del vídeo,
// optimizado para que un TTS en español lo pronuncie de forma natural.

// Convierte los clips del material del proyecto en un listado numerado con su
// descripción y duración, para que la IA guionista sepa qué escenas existen y
// pueda asignar una a cada frase del narrador.
function buildClipList(clips) {
  const rows = (clips || [])
    .map((c) => {
      const desc = String(c?.description || c?.label || c?.filename || '').trim()
      if (!desc) return null
      const start = Number(c?.start)
      const end = Number(c?.end)
      const dur = Number.isFinite(start) && Number.isFinite(end) && end > start
        ? end - start
        : Number(c?.duration) || 0
      const durTxt = dur > 0 ? ` (${dur.toFixed(1)}s)` : ''
      return { id: c?.index, desc, durTxt }
    })
    .filter(Boolean)

  if (!rows.length) return null

  return rows
    .map((r, i) => {
      const id = r.id != null ? `Clip ${r.id}` : `Clip ${i + 1}`
      return `[${id}] ${r.desc}${r.durTxt}`
    })
    .join('\n')
}

export function buildScriptPrompt(topic, clips = []) {
  const tema = topic.trim() || '[ESCRIBE AQUÍ EL TEMA DEL VIDEO]'
  const clipList = buildClipList(clips)

  const materialBlock = clipList
    ? `MATERIAL DISPONIBLE (CLIPS QUE TENGO):

Estos son los clips que ya tengo grabados/descargados, con su descripción y su duración aproximada. Debes construir el montaje USANDO SOLO estos clips, referenciándolos por su identificador (por ejemplo [Clip 3]).

${clipList}

`
    : ''

  const montajeBlock = clipList
    ? `MONTAJE (MUY IMPORTANTE):

Además del guion hablado, quiero que actúes como editor y me digas QUÉ ESCENA PONER en cada frase o en cada tramo de segundos del narrador.

Reglas del montaje:

Asigna a cada frase del guion uno o varios clips de la lista de arriba, referenciados por su identificador.
Cuando un clip dure más que la frase, indica qué fracción o momento del clip mostrar (por ejemplo "primeros 2 segundos" o "la parte final").
No inventes escenas que no estén en la lista. Si falta material para una frase, dilo claramente con "FALTA CLIP: ..." describiendo qué haría falta grabar.
Sería bueno que propongas pequeñas PAUSAS del narrador en momentos clave, para dejar que una fracción de la escena se vea y se aprecie mejor antes de seguir hablando. Indica la duración aproximada de cada pausa (por ejemplo "pausa de un segundo").

`
    : ''

  return `Necesito que escribas el guion para un video corto de YouTube Shorts, en formato vertical.

El texto se convertirá directamente en voz usando un modelo TTS en español, como Kokoro.

MUY IMPORTANTE: escribe pensando en CÓMO EL TTS VA A PRONUNCIAR LAS PALABRAS, no necesariamente en cómo se escriben originalmente.

Cuando aparezcan nombres, palabras o términos en inglés, NO los escribas en inglés si eso hace que el TTS los pronuncie mal.

Escríbelos de forma fonética, usando letras del español, para que un hablante hispanohablante los pronuncie lo más parecido posible al inglés.

Ejemplos:
McFly → Macflai
Marty → Marti
Rick → Ric
Morty → Morti
Justin → Yastin
Dan Harmon → Dan Jarmon
Brown → Braun

No traduzcas los nombres. Solo adapta su escritura para conseguir una pronunciación natural.

TONO Y VOZ:

Quiero que suene como una persona real que acaba de descubrir algo increíble y se lo está contando a un amigo.

Amigable: 9/10
Natural: 9/10
Expresivo: 8/10
Sorpresa: 7/10
Energía: 7/10
Autoridad: 5/10
Dramatismo: 3/10

NO quiero una voz de documental.
NO quiero una voz de enciclopedia.
NO quiero un narrador formal.
NO quiero frases que parezcan escritas por una IA.

Debe sonar espontáneo, curioso, cercano y ligeramente sorprendido.

Ejemplo del tono correcto:
"Oye, ¿sabías que esto empezó casi como una broma?"

Ejemplo incorrecto:
"Esta producción tuvo sus orígenes en un proyecto audiovisual desarrollado por sus creadores."

REGLA DE ORO:

Escribe como HABLA una persona, no como escribe un artículo.

Usa frases cortas.
Una idea por frase.
Evita palabras innecesariamente complicadas.
Usa expresiones naturales.
Haz que cada frase sea fácil de pronunciar.

FORMATO PARA EL TTS:

Cada frase debe estar en su propia línea.

Usa puntuación limpia.
Usa comas y puntos para controlar naturalmente el ritmo.
Usa signos de interrogación y exclamación cuando correspondan.

No abuses de los puntos suspensivos.

NO uses:
Emojis.
Hashtags.
Markdown.
Asteriscos.
Viñetas.
Acotaciones como "pausa", "tono emocionado" o similares DENTRO del texto del guion.

Escribe los números con palabras.

Evita trabalenguas.
Evita palabras extranjeras innecesarias.
Cuando una palabra extranjera sea necesaria, escríbela fonéticamente para que el TTS en español la pronuncie correctamente.

ESTRUCTURA:

La primera frase debe ser un gancho fuerte.

Después desarrolla la historia rápidamente, revelando información interesante poco a poco.

Incluye curiosidad, sorpresa o pequeños giros dentro de la narración.

El cierre debe dejar al espectador con ganas de saber qué pasó después.

DURACIÓN:

Aproximadamente cuarenta segundos.
Entre noventa y ciento diez palabras.

TEMA:

${tema}

${materialBlock}${montajeBlock}Antes de entregar el guion, revisa mentalmente cómo sonaría cada frase pronunciada por un TTS en español.

Si un nombre en inglés probablemente será pronunciado mal por el TTS, reemplázalo por una escritura fonética en español.

FORMATO DE LA RESPUESTA:

Primero, bajo el título GUION, escribe únicamente el guion final: cada frase en su propia línea, sin acotaciones ni anotaciones de escena.
${clipList ? 'Después, bajo el título MONTAJE, escribe la lista de frases numeradas y, para cada una, qué clip mostrar (por su identificador), qué fracción del clip usar y las pausas sugeridas.' : ''}`
}
