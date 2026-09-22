import { useState, useEffect, useRef } from 'react'
import { getAiStatus, transcribeAudio, generateSubtitles, analyzeImage, ocrImage, getJob } from '../../services/api'
import Icon from '../../components/Icon'
import JobStatusBar from '../../components/JobStatusBar'
import Toast from '../../components/Toast'
import FoundryPanel from './FoundryPanel'

// Pestaña "IA": punto único para los servicios de Azure integrados en el editor.
//   Voz        → generar voz (narrador) + transcribir audio (Whisper / Azure)
//   Subtítulos → generar subtítulos automáticamente desde un audio
//   Imagen     → analizar imagen + extraer texto (OCR) con Azure Vision
// No duplica el narrador ni el motor de subtítulos: reutiliza los endpoints y el
// sistema de texto/karaoke que ya existen. La sub-pestaña "Foundry" añade la capa
// de IA GENERATIVA (Microsoft Foundry), independiente de Speech/Vision.
export default function AiTab({ project, onChange, onGoAudio, onGoSettings, editorContext }) {
  const [section, setSection] = useState('voice')
  const [status, setStatus] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { getAiStatus().then(setStatus).catch(() => {}) }, [])

  const audios = project?.audios || []
  const images = project?.images || []
  const speechAzure = status?.speech
  const visionOk = status?.vision?.available

  return (
    <div className="ed-caja-audio ai-tab">
      <div className="audio-subtabs">
        <button type="button" className={`ed-tab ${section === 'voice' ? 'on' : ''}`} onClick={() => setSection('voice')}>Voz</button>
        <button type="button" className={`ed-tab ${section === 'subs' ? 'on' : ''}`} onClick={() => setSection('subs')}>Subtítulos</button>
        <button type="button" className={`ed-tab ${section === 'image' ? 'on' : ''}`} onClick={() => setSection('image')}>Imagen</button>
        <button type="button" className={`ed-tab ${section === 'foundry' ? 'on' : ''}`} onClick={() => setSection('foundry')}>Foundry</button>
      </div>

      {section === 'voice' && (
        <VoiceSection audios={audios} speech={speechAzure} onGoAudio={onGoAudio}
          projectId={project?.id} onChange={onChange} setToast={setToast} />
      )}
      {section === 'subs' && (
        <SubsSection audios={audios} speech={speechAzure}
          projectId={project?.id} onChange={onChange} setToast={setToast} />
      )}
      {section === 'image' && (
        <ImageSection images={images} visionOk={visionOk} visionReason={status?.vision?.reason}
          projectId={project?.id} onChange={onChange} setToast={setToast} />
      )}
      {section === 'foundry' && (
        <FoundryPanel project={project} editorContext={editorContext} foundry={status?.foundry}
          onGoSettings={onGoSettings} setToast={setToast} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

// Sondea un job hasta done/error. Devuelve una promesa con el job final.
function useJobRunner() {
  const [job, setJob] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const busy = job && (job.status === 'pending' || job.status === 'running')
    if (!busy) return undefined
    const t0 = Date.now()
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
    const poll = setInterval(async () => {
      try { setJob(await getJob(job.id)) } catch { /* reintenta */ }
    }, 1000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [job?.id, job?.status])

  const busy = job && (job.status === 'pending' || job.status === 'running')
  return { job, setJob, busy, elapsed }
}

function EngineSelect({ engine, setEngine, speech }) {
  const azureOk = speech?.available
  return (
    <label className="field"><span>Motor</span>
      <select className="time-input" value={engine} onChange={(e) => setEngine(e.target.value)}>
        <option value="whisper">Whisper (local, gratis)</option>
        <option value="azure" disabled={!azureOk}>
          {azureOk ? 'Azure Speech (nube, timestamps por palabra)' : 'Azure Speech (configura la clave)'}
        </option>
      </select>
    </label>
  )
}

function AudioPicker({ audios, value, onChange }) {
  return (
    <label className="field"><span>Audio</span>
      <select className="time-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Elige un audio —</option>
        {audios.map((a) => (
          <option key={a.id} value={a.filename}>{a.label || a.text || a.filename}</option>
        ))}
      </select>
    </label>
  )
}

function VoiceSection({ audios, speech, onGoAudio, projectId, onChange, setToast }) {
  const [engine, setEngine] = useState('whisper')
  const [filename, setFilename] = useState('')
  const [transcript, setTranscript] = useState(null)
  const { job, setJob, busy, elapsed } = useJobRunner()
  const doneRef = useRef(null)

  useEffect(() => {
    if (job?.status === 'done' && doneRef.current !== job.id) {
      doneRef.current = job.id
      setTranscript(job.transcript || null)
      onChange?.()
      setToast({ type: 'success', message: 'Transcripción lista.' })
    }
  }, [job?.status])

  async function run() {
    if (!filename) { setToast({ type: 'error', message: 'Elige un audio.' }); return }
    setTranscript(null)
    try {
      setJob(await transcribeAudio({ project_id: projectId, filename, asset_kind: 'audios', engine }))
    } catch (e) { setToast({ type: 'error', message: e.message }) }
  }

  const fullText = transcript?.segments?.map((s) => s.text).join(' ') || ''
  const nWords = transcript?.segments?.reduce((n, s) => n + (s.words?.length || 0), 0) || 0

  return (
    <>
      <div className="ai-block">
        <div className="ai-block-head"><Icon name="record_voice_over" size={16} /> Generar voz</div>
        <p className="ed-caja-hint">Narrador (Kokoro / Piper / Gemini / Azure). Se edita en la pestaña Audio.</p>
        <button className="ghost small" type="button" onClick={onGoAudio}>Ir al narrador</button>
      </div>

      <div className="ai-block">
        <div className="ai-block-head"><Icon name="transcribe" size={16} /> Transcribir audio</div>
        <p className="ed-caja-hint">Convierte un audio en texto con timestamps (y por palabra con Azure).</p>
        <AudioPicker audios={audios} value={filename} onChange={setFilename} />
        <EngineSelect engine={engine} setEngine={setEngine} speech={speech} />
        <button className="primary" type="button" onClick={run} disabled={busy || !filename}>
          {busy ? 'Transcribiendo…' : 'Transcribir'}
        </button>
        {busy && <JobStatusBar progress={job.progress || 0} message={job.message || 'Transcribiendo…'} elapsed={elapsed} />}
        {job?.status === 'error' && <div className="ed-mat-err">{job.error}</div>}
        {transcript && (
          <div className="ai-result">
            <div className="ai-result-meta">{transcript.segments?.length || 0} frases · {nWords} palabras · {transcript.language || '—'}</div>
            <textarea className="tts-text" readOnly rows={5} value={fullText} />
          </div>
        )}
      </div>
    </>
  )
}

function SubsSection({ audios, speech, projectId, onChange, setToast }) {
  const [engine, setEngine] = useState('whisper')
  const [filename, setFilename] = useState('')
  const { job, setJob, busy, elapsed } = useJobRunner()
  const doneRef = useRef(null)

  useEffect(() => {
    if (job?.status === 'done' && doneRef.current !== job.id) {
      doneRef.current = job.id
      onChange?.()
      setToast({ type: 'success', message: job.message || 'Subtítulos generados.' })
    }
  }, [job?.status])

  async function run() {
    if (!filename) { setToast({ type: 'error', message: 'Elige un audio.' }); return }
    try {
      setJob(await generateSubtitles(projectId, { filename, asset_kind: 'audios', engine }))
    } catch (e) { setToast({ type: 'error', message: e.message }) }
  }

  return (
    <div className="ai-block">
      <div className="ai-block-head"><Icon name="subtitles" size={16} /> Generar subtítulos automáticamente</div>
      <p className="ed-caja-hint">
        Transcribe el audio y crea una pista de subtítulos (frase, palabra y resaltado activo, sincronizados).
        Si el audio ya está en la timeline, los coloca alineados a su clip.
      </p>
      <AudioPicker audios={audios} value={filename} onChange={setFilename} />
      <EngineSelect engine={engine} setEngine={setEngine} speech={speech} />
      <button className="primary" type="button" onClick={run} disabled={busy || !filename}>
        {busy ? 'Generando…' : 'Generar subtítulos'}
      </button>
      {busy && <JobStatusBar progress={job.progress || 0} message={job.message || 'Generando subtítulos…'} elapsed={elapsed} />}
      {job?.status === 'error' && <div className="ed-mat-err">{job.error}</div>}
    </div>
  )
}

function ImageSection({ images, visionOk, visionReason, projectId, onChange, setToast }) {
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [ocr, setOcr] = useState(null)

  async function runAnalyze(force = false) {
    if (!filename) { setToast({ type: 'error', message: 'Elige una imagen.' }); return }
    setBusy(true); setOcr(null)
    try {
      const r = await analyzeImage({ projectId, filename, force })
      setAnalysis(r.analysis)
      onChange?.()
      setToast({ type: 'success', message: r.cached ? 'Análisis reutilizado (sin coste).' : 'Imagen analizada.' })
    } catch (e) { setToast({ type: 'error', message: e.message }) }
    setBusy(false)
  }

  async function runOcr() {
    if (!filename) { setToast({ type: 'error', message: 'Elige una imagen.' }); return }
    setBusy(true); setAnalysis(null)
    try {
      const r = await ocrImage({ projectId, filename })
      setOcr(r.ocr)
      setToast({ type: 'success', message: 'Texto extraído.' })
    } catch (e) { setToast({ type: 'error', message: e.message }) }
    setBusy(false)
  }

  return (
    <div className="ai-block">
      <div className="ai-block-head"><Icon name="image_search" size={16} /> Imagen (Azure Vision)</div>
      {!visionOk && <div className="warn">{visionReason || 'Configura la clave y el endpoint de Azure Vision en Configuración.'}</div>}
      <label className="field"><span>Imagen</span>
        <select className="time-input" value={filename} onChange={(e) => setFilename(e.target.value)}>
          <option value="">— Elige una imagen —</option>
          {images.map((im) => (
            <option key={im.id} value={im.filename}>{im.label || im.filename}</option>
          ))}
        </select>
      </label>
      <div className="ai-btn-row">
        <button className="primary" type="button" onClick={() => runAnalyze(false)} disabled={busy || !filename || !visionOk}>
          {busy ? 'Analizando…' : 'Analizar imagen'}
        </button>
        <button className="ghost small" type="button" onClick={runOcr} disabled={busy || !filename || !visionOk}>
          Extraer texto (OCR)
        </button>
      </div>

      {analysis && (
        <div className="ai-result">
          {analysis.caption && <p className="ai-caption">“{analysis.caption}”</p>}
          {analysis.tags?.length > 0 && (
            <div className="ai-tags">
              {analysis.tags.slice(0, 20).map((t) => (
                <span key={t.name} className="ai-chip">{t.name}</span>
              ))}
            </div>
          )}
          {analysis.objects?.length > 0 && (
            <div className="ai-result-meta">Objetos: {analysis.objects.map((o) => o.name).filter(Boolean).join(', ')}</div>
          )}
          {analysis.people?.length > 0 && (
            <div className="ai-result-meta">Personas detectadas: {analysis.people.length}</div>
          )}
          {analysis.ocr_text && (
            <textarea className="tts-text" readOnly rows={4} value={analysis.ocr_text} />
          )}
        </div>
      )}

      {ocr && (
        <div className="ai-result">
          <div className="ai-result-meta">{ocr.lines?.length || 0} líneas · {ocr.words?.length || 0} palabras</div>
          <textarea className="tts-text" readOnly rows={6} value={ocr.text || '(sin texto)'} />
        </div>
      )}
    </div>
  )
}
