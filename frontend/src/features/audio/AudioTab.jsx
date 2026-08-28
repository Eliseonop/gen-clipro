import { useState, useEffect } from 'react'
import { listVoices, createTtsJob, getJob, getSettings, putSettings } from '../../services/api'
import Icon from '../../components/Icon'
import { buildScriptPrompt } from './scriptPrompt'
import TtsControls from './TtsControls'
import AudioProjectList from './AudioProjectList'

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

  async function copyPrompt() {
    try {
      await navigator.clipboard?.writeText(buildScriptPrompt(topic))
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

        <TtsControls
          engines={engines} engine={engine} setEngine={setEngine}
          voices={voices} voice={voice} setVoice={setVoice}
          voice2={voice2} setVoice2={setVoice2} isKokoro={isKokoro}
          blend={blend} setBlend={setBlend} speed={speed} setSpeed={setSpeed}
          pause={pause} setPause={setPause} name={name} setName={setName}
        />

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

      <AudioProjectList audios={project.audios} />
    </div>
  )
}
