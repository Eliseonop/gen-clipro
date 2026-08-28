import { useState, useEffect } from 'react'
import { listVoices, createTtsJob, getJob, getSettings, putSettings } from './api'
import Icon from './Icon'

export default function AudioTab({ project, onChange }) {
  const [engines, setEngines] = useState([])
  const [engine, setEngine] = useState('kokoro')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('ef_dora')
  const [voice2, setVoice2] = useState('')
  const [blend, setBlend] = useState(0.5)
  const [speed, setSpeed] = useState(1.0)
  const [pause, setPause] = useState(0.4)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [copied, setCopied] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')

  const curEngine = engines.find((e) => e.id === engine) || null
  const voices = curEngine?.voices || []
  const available = curEngine?.available ?? true
  const isKokoro = engine === 'kokoro'
  const anyAvailable = engines.some((e) => e.available)

  useEffect(() => {
    (async () => {
      let loaded = []
      try {
        const v = await listVoices()
        loaded = v.engines || [{ id: 'kokoro', label: 'Kokoro', available: v.available, voices: v.voices || [] }]
        setEngines(loaded)
      } catch { /* backend no listo */ }
      try {
        const s = await getSettings()
        if (s.tts) {
          if (s.tts.engine) setEngine(s.tts.engine)
          setVoice(s.tts.voice || 'ef_dora')
          setVoice2(s.tts.voice2 || '')
          setBlend(s.tts.blend ?? 0.5)
          setSpeed(s.tts.speed ?? 1.0)
          setPause(s.tts.pause ?? 0.4)
        }
      } catch { /* usa defaults */ }
    })()
  }, [])

  // Al cambiar de motor, asegura que la voz elegida exista en ese motor.
  useEffect(() => {
    if (!voices.length) return
    if (!voices.some((v) => v.id === voice)) setVoice(voices[0].id)
    if (!isKokoro) setVoice2('')
  }, [engine, engines])

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') {
      if (job?.status === 'done') onChange?.()
      return
    }
    const id = setInterval(async () => {
      try { setJob(await getJob(job.id)) } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
  }, [job?.id, job?.status])

  function buildPrompt() {
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

  async function copyPrompt() {
    try {
      await navigator.clipboard?.writeText(buildPrompt())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) { setError(e.message) }
  }

  async function generate() {
    setError('')
    if (!text.trim()) { setError('Escribe o pega el texto a narrar.'); return }
    putSettings({ tts: { engine, voice, voice2: voice2 || null, blend, speed, pause } }).catch(() => {})
    try {
      setJob(await createTtsJob({
        project_id: project.id, text, engine, voice,
        voice2: isKokoro ? (voice2 || undefined) : undefined, blend, speed, pause,
        name: name.trim() || undefined,
      }))
    } catch (e) { setError(e.message) }
  }

  const busy = job && (job.status === 'pending' || job.status === 'running')

  if (engines.length > 0 && !anyAvailable) {
    return (
      <section className="card">
        <h2>Audio</h2>
        <div className="warn">Faltan los modelos de Kokoro en <code>backend/models</code>. Descárgalos (ver README).</div>
      </section>
    )
  }

  return (
    <div className="audio-grid">
      <section className="card">
        <div className="tx-head">
          <h3>Narrador (texto → voz)</h3>
        </div>

        <div className="prompt-box">
          <label className="field"><span>Mi guion debe hablar de esto</span>
            <input
              className="time-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="ej. cómo el silicio de la arena termina en una GPU"
            />
          </label>
          <button className="ghost small" onClick={copyPrompt} title="Copia un prompt listo para pedirle el guion a una IA">
            <Icon name={copied ? 'check' : 'content_copy'} size={16} /> {copied ? 'Copiado' : 'Copiar prompt'}
          </button>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
            Copia el prompt, pídeselo a una IA, y pega el guion que te devuelva abajo.
          </p>
        </div>

        <label className="field"><span>Este es mi guion (texto a narrar)</span>
          <textarea
            className="tts-text"
            placeholder="Pega o escribe aquí el guion que se va a narrar…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
          />
        </label>
        <div className="tts-controls">
          <label className="field"><span>Motor</span>
            <select className="select" value={engine} onChange={(e) => setEngine(e.target.value)}>
              {engines.map((e) => (
                <option key={e.id} value={e.id} disabled={!e.available}>
                  {e.label}{e.available ? '' : ' — no instalado'}
                </option>
              ))}
            </select>
          </label>
          <label className="field"><span>Voz</span>
            <select className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          {isKokoro && (
            <label className="field"><span>Mezclar con (voz 2)</span>
              <select className="select" value={voice2} onChange={(e) => setVoice2(e.target.value)}>
                <option value="">— sin mezcla —</option>
                {voices.filter((v) => v.id !== voice).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
          )}
          {isKokoro && voice2 && (
            <label className="field"><span>Mezcla: {Math.round(blend * 100)}% / {Math.round((1 - blend) * 100)}%</span>
              <input type="range" min="0" max="1" step="0.05" value={blend}
                onChange={(e) => setBlend(Number(e.target.value))} />
            </label>
          )}
          <label className="field"><span>Velocidad: {speed.toFixed(2)}×</span>
            <input type="range" min="0.5" max="1.5" step="0.05" value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))} />
          </label>
          <label className="field"><span>Pausa entre frases: {pause.toFixed(2)}s</span>
            <input type="range" min="0" max="1" step="0.05" value={pause}
              onChange={(e) => setPause(Number(e.target.value))} />
          </label>
          <label className="field"><span>Nombre (opcional)</span>
            <input className="time-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="intro" />
          </label>
        </div>

        <p className="muted" style={{ fontSize: 13 }}>
          {isKokoro
            ? 'Consejo: frases cortas y saltos de línea suenan más natural que cualquier parámetro. Mezclar dos voces crea un timbre propio.'
            : 'Voces en español mexicano (Piper). Consejo: velocidad 0.95–1.0 y frases cortas para el tono más natural.'}
        </p>

        {!available && (
          <div className="warn">
            El motor <strong>{curEngine?.label || engine}</strong> no está instalado.
            {engine === 'piper'
              ? <> Ejecuta <code>python get_piper.py</code> en la carpeta <code>backend/</code> y reinicia el backend.</>
              : <> Faltan los modelos en <code>backend/models</code> (ver README).</>}
          </div>
        )}

        {error && <div className="error">⚠️ {error}</div>}

        <button className="primary big" onClick={generate} disabled={busy || !available}>
          {busy ? 'Generando…' : '🔊 Generar audio'}
        </button>

        {busy && (
          <>
            <div className="progress" style={{ marginTop: 14 }}><span style={{ width: `${(job.progress || 0) * 100}%` }} /></div>
            <p className="muted">{job.message || 'Iniciando…'}</p>
          </>
        )}
        {job?.status === 'error' && <div className="error">⚠️ {job.error}</div>}
      </section>

      <section className="card">
        <h3>Audios del proyecto</h3>
        {(!project.audios || project.audios.length === 0)
          ? <div className="empty">Aún no hay audios. Genera el primero.</div>
          : (
            <div className="audio-list">
              {project.audios.slice().reverse().map((a) => (
                <div className="audio-item" key={a.id}>
                  <div className="audio-meta">
                    <strong>{a.filename}</strong>
                    <span className="muted">{a.voice} · {a.speed}× · {a.duration}s</span>
                  </div>
                  <audio src={a.url} controls preload="metadata" />
                  <a className="ghost small dl" href={a.url} download><Icon name="download" size={16} /> Descargar</a>
                </div>
              ))}
            </div>
          )}
      </section>
    </div>
  )
}
