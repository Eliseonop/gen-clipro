// Plantilla del prompt que el usuario copia para pedirle a una IA el guion del vídeo,
// optimizado para que un TTS en español lo pronuncie de forma natural.
export function buildScriptPrompt(topic) {
  const tema = topic.trim() || '[ESCRIBE AQUÍ EL TEMA DEL VIDEO]'
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
Acotaciones como "pausa", "tono emocionado" o similares.

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

Antes de entregar el guion, revisa mentalmente cómo sonaría cada frase pronunciada por un TTS en español.

Si un nombre en inglés probablemente será pronunciado mal por el TTS, reemplázalo por una escritura fonética en español.

DEVUELVE ÚNICAMENTE EL GUION FINAL.

Cada frase debe estar en su propia línea.`
}
