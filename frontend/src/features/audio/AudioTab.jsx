import { useState, useEffect, useRef } from 'react'
import { listVoices, createTtsJob, createYoutubeAudioJob, getJob, getSettings, putSettings } from '../../services/api'
import Icon from '../../components/Icon'
import JobStatusBar from '../../components/JobStatusBar'
import Toast from '../../components/Toast'
import { buildScriptPrompt } from './scriptPrompt'
import TtsControls from './TtsControls'

export default function AudioTab({ project, onChange, initialYtUrl = '', sourceTitle = '' }) {
  const [mode, setMode] = useState('narrator')
  const [engines, setEngines] = useState([])
  const [engine, setEngine] = useState('kokoro')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('ef_dora')
  const [voice2, setVoice2] = useState('')
  const [blend, setBlend] = useState(0.5)
  const [speed, setSpeed] = useState(1.0)
  const [pause, setPause] = useState(0.4)
  const [style, setStyle] = useState('documentary')
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [copied, setCopied] = useState(false)
  const [ytUrl, setYtUrl] = useState(initialYtUrl || '')
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [toast, setToast] = useState(null)
  const [extractedKey, setExtractedKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const toastedRef = useRef(null)
  const jobKindRef = useRef(null)

  const curEngine = engines.find((e) => e.id === engine) || null
  const voices = curEngine?.voices || []
  const available = curEngine?.available ?? true
  const isKokoro = engine === 'kokoro'
  const isGemini = engine === 'gemini'
  const busy = job && (job.status === 'pending' || job.status === 'running')
  const readyYt = (initialYtUrl || '').trim()
  const extractLink = (readyYt || ytUrl).trim()
  const alreadyExtracted = !!extractedKey && extractedKey === extractLink

  useEffect(() => {
    if (initialYtUrl && !(ytUrl || '').trim()) setYtUrl(initialYtUrl)
  }, [initialYtUrl])

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
          if (s.tts.style) setStyle(s.tts.style)
        }
      } catch { /* usa defaults */ }
    })()
  }, [])

  useEffect(() => {
    if (!voices.length) return
    if (!voices.some((v) => v.id === voice)) setVoice(voices[0].id)
    if (!isKokoro) setVoice2('')
  }, [engine, engines])

  useEffect(() => {
    if (!job || (job.status !== 'pending' && job.status !== 'running')) {
      if (job?.status === 'done' && toastedRef.current !== job.id) {
        toastedRef.current = job.id
        onChange?.()
        if (jobKindRef.current === 'youtube') {
          setExtractedKey(jobKindRef.currentUrl || extractLink)
          setToast({ type: 'success', message: 'Audio extraído y guardado.' })
        } else {
          setToast({ type: 'success', message: 'Audio generado y guardado.' })
        }
      }
      return
    }
    const id = setInterval(async () => {
      try { setJob(await getJob(job.id)) } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
  }, [job?.id, job?.status])

  useEffect(() => {
    if (!busy) { setElapsed(0); return undefined }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [busy])

  async function reloadEngines() {
    try {
      const v = await listVoices()
      setEngines(v.engines || [])
    } catch { /* ignore */ }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard?.writeText(buildScriptPrompt(topic, project?.clips || []))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) { setError(e.message) }
  }

  async function saveGeminiKey() {
    const key = geminiKey.trim()
    if (!key) { setError('Pega la API key de Gemini.'); return }
    setSavingKey(true)
    setError('')
    try {
      await putSettings({ gemini_api_key: key })
      setGeminiKey('')
      await reloadEngines()
      setToast({ type: 'success', message: 'API key de Gemini guardada.' })
    } catch (e) { setError(e.message) }
    setSavingKey(false)
  }

  async function generate() {
    setError('')
    if (!text.trim()) { setError('Escribe o pega el texto a narrar.'); return }
    putSettings({
      tts: { engine, voice, voice2: voice2 || null, blend, speed, pause, style },
    }).catch(() => {})
    try {
      jobKindRef.current = 'tts'
      setJob(await createTtsJob({
        project_id: project.id, text, engine, voice,
        voice2: isKokoro ? (voice2 || undefined) : undefined, blend, speed, pause,
        name: name.trim() || undefined,
        style: isGemini ? style : undefined,
      }))
    } catch (e) { setError(e.message) }
  }

  async function extractYoutube(url) {
    setError('')
    const link = (url ?? ytUrl).trim()
    if (!link) { setError('Pega un enlace de YouTube.'); return }
    if (extractedKey && extractedKey === link) return
    try {
      jobKindRef.current = 'youtube'
      jobKindRef.currentUrl = link
      setJob(await createYoutubeAudioJob({
        project_id: project.id,
        url: link,
      }))
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="ed-caja-audio">
      <div className="audio-subtabs">
        <button type="button" className={`ed-tab ${mode === 'narrator' ? 'on' : ''}`} onClick={() => { setMode('narrator'); setError('') }}>
          Narrador
        </button>
        <button type="button" className={`ed-tab ${mode === 'youtube' ? 'on' : ''}`} onClick={() => { setMode('youtube'); setError('') }}>
          Link video
        </button>
      </div>

      {mode === 'narrator' ? (
        <>
          <button className="primary" type="button" onClick={generate} disabled={busy || !available}>
            {busy && jobKindRef.current === 'tts' ? 'Generando…' : 'Generar audio'}
          </button>

          <TtsControls
            engines={engines} engine={engine} setEngine={setEngine}
            voices={voices} voice={voice} setVoice={setVoice}
            voice2={voice2} setVoice2={setVoice2} isKokoro={isKokoro} isGemini={isGemini}
            style={style} setStyle={setStyle}
            blend={blend} setBlend={setBlend} speed={speed} setSpeed={setSpeed}
            pause={pause} setPause={setPause} name={name} setName={setName}
          />

          <label className="field"><span>Guion</span>
            <textarea
              className="tts-text"
              placeholder="Pega o escribe aquí el guion…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
          </label>

          <details className="ed-narrator-more">
            <summary>Prompt para el guion</summary>
            <div className="prompt-box">
              <label className="field"><span>Tema</span>
                <input
                  className="time-input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="ej. cómo el silicio de la arena termina en una GPU"
                />
              </label>
              <button className="ghost small" type="button" onClick={copyPrompt} title="Copia un prompt listo para pedirle el guion a una IA">
                <Icon name={copied ? 'check' : 'content_copy'} size={16} /> {copied ? 'Copiado' : 'Copiar prompt'}
              </button>
            </div>
          </details>

          {isGemini && !available && (
            <div className="ed-gemini-key">
              <p className="ed-caja-hint">{curEngine?.reason || 'Gemini necesita una API key.'}</p>
              <div className="ed-gemini-key-row">
                <input
                  className="url"
                  type="password"
                  autoComplete="off"
                  placeholder="AIza…"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !savingKey && saveGeminiKey()}
                />
                <button className="ghost small" type="button" onClick={saveGeminiKey} disabled={savingKey || !geminiKey.trim()}>
                  {savingKey ? 'Guardando…' : 'Guardar key'}
                </button>
              </div>
            </div>
          )}

          {!available && !isGemini && (
            <div className="warn">
              El motor <strong>{curEngine?.label || engine}</strong> no está instalado.
              {engine === 'piper'
                ? <> Ejecuta <code>python get_piper.py</code> en la carpeta <code>backend/</code> y reinicia el backend.</>
                : <> Faltan los modelos en <code>backend/models</code>.</>}
            </div>
          )}

          {error && <div className="ed-mat-err">{error}</div>}
        </>
      ) : (
        <>
          <button
            className="primary"
            type="button"
            onClick={() => extractYoutube(extractLink)}
            disabled={busy || !extractLink || alreadyExtracted}
          >
            {busy && jobKindRef.current === 'youtube' ? 'Extrayendo…' : alreadyExtracted ? 'Audio extraído' : 'Extraer audio'}
          </button>
          <p className="ed-caja-hint">
            Extrae el audio del vídeo. Queda en este proyecto; para reutilizarlo en otros, Guardar en la card.
          </p>
          {readyYt ? (
            <div className="ed-caja-source">
              <span className="ed-caja-source-k">Vídeo ya cargado</span>
              <strong title={readyYt}>{sourceTitle || readyYt}</strong>
            </div>
          ) : (
            <label className="field"><span>Enlace de YouTube</span>
              <input
                className="url"
                placeholder="https://www.youtube.com/watch?v=…"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && !alreadyExtracted && extractYoutube()}
                disabled={busy}
              />
            </label>
          )}
          {error && <div className="ed-mat-err">{error}</div>}
        </>
      )}

      {busy && (
        <JobStatusBar
          progress={job.progress || 0}
          message={job.message || (mode === 'youtube' ? 'Extrayendo audio…' : 'Generando voz…')}
          elapsed={elapsed}
        />
      )}
      {job?.status === 'error' && <div className="ed-mat-err">{job.error}</div>}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
