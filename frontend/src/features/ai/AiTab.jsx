import { useState, useEffect, useRef } from 'react'
import { getAiStatus, transcribeAudio, generateSubtitles, analyzeImage, ocrImage, getJob, analyzeMaterials, generateAiImage, foundryGenerate } from '../../services/api'
import Icon from '../../components/Icon'
import JobStatusBar from '../../components/JobStatusBar'
import Toast from '../../components/Toast'
import FoundryPanel from './FoundryPanel'

// Pestaña "IA": punto único para los servicios de Azure integrados en el editor.
//   Voz        → generar voz (narrador) + transcribir audio (Whisper / Azure)
//   Subtítulos → generar subtítulos automáticamente desde un audio
//   Crear      → generar imágenes (MAI-Image / FLUX.2 de Foundry, fallback entre modelos)
//   Imagen     → analizar imagen + extraer texto (OCR) con Azure Vision
//   Material   → describir clips e imágenes con la visión de Foundry (para dirigir escenas)
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
        <button type="button" className={`ed-tab ${section === 'create' ? 'on' : ''}`} onClick={() => setSection('create')}>Crear imagen</button>
        <button type="button" className={`ed-tab ${section === 'image' ? 'on' : ''}`} onClick={() => setSection('image')}>Imagen</button>
        <button type="button" className={`ed-tab ${section === 'material' ? 'on' : ''}`} onClick={() => setSection('material')}>Material</button>
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
      {section === 'create' && (
        <CreateImageSection gen={status?.image} projectId={project?.id} editorContext={editorContext}
          foundryOk={!!status?.foundry?.available} onGoSettings={onGoSettings}
          onChange={onChange} setToast={setToast} />
      )}
      {section === 'image' && (
        <ImageSection images={images} visionOk={visionOk} visionReason={status?.vision?.reason}
          projectId={project?.id} onChange={onChange} setToast={setToast} />
      )}
      {section === 'material' && (
        <MaterialSection project={project} foundry={status?.foundry} onGoSettings={onGoSettings}
          onChange={onChange} setToast={setToast} />
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

// "Analizado" = ya tiene descripción IA + metadata semántica (igual que material_ai.is_analyzed).
const isAnalyzed = (m) => !!(m?.description_ai && m?.semantic && Object.keys(m.semantic).length)

function MaterialSection({ project, foundry, onGoSettings, onChange, setToast }) {
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [renameGeneric, setRenameGeneric] = useState(true)
  const { job, setJob, busy, elapsed } = useJobRunner()
  const doneRef = useRef(null)

  const configured = !!foundry?.available
  const clips = project?.clips || []
  const images = project?.images || []
  const total = clips.length + images.length
  const pending = clips.filter((c) => !isAnalyzed(c)).length + images.filter((im) => !isAnalyzed(im)).length
  const willAnalyze = onlyMissing ? pending : total
  const summary = job?.status === 'done' ? job.result : null

  useEffect(() => {
    if ((job?.status === 'done' || job?.status === 'error') && doneRef.current !== job.id) {
      doneRef.current = job.id
      onChange?.()   // recarga el material: títulos/descripciones nuevos
      if (job.status === 'done') setToast({ type: 'success', message: job.message || 'Material analizado.' })
    }
  }, [job?.status])

  async function run() {
    try {
      setJob(await analyzeMaterials(project.id, { only_missing: onlyMissing, rename_generic: renameGeneric }))
    } catch (e) { setToast({ type: 'error', message: e.message }) }
  }

  return (
    <div className="ai-block">
      <div className="ai-block-head"><Icon name="visibility" size={16} /> Analizar material (visión de Foundry)</div>
      <p className="ed-caja-hint">
        La IA mira 3 fotogramas de cada clip (1 por imagen) junto con tu guion y guarda qué se ve
        y para qué frase sirve. Así Dirección de escena y Generar escena eligen mejor el material.
        Nunca pisa lo que escribiste: rellena la descripción solo si estaba vacía.
      </p>
      {!configured && (
        <div className="warn">
          {foundry?.reason || 'Configura el endpoint, el deployment y la clave de Foundry.'}
          {onGoSettings && (
            <button type="button" className="ghost small" onClick={onGoSettings} style={{ marginLeft: 8 }}>
              Ir a Configuración
            </button>
          )}
        </div>
      )}
      <div className="ai-result-meta">{total} materiales · {total - pending} analizados · {pending} pendientes</div>
      <div className="ai-btn-row">
        <label className={`ed-mode-toggle ${onlyMissing ? 'on' : ''}`} title="Desmarcado: vuelve a analizar también lo ya analizado">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} disabled={busy} />
          Solo pendientes
        </label>
        <label className={`ed-mode-toggle ${renameGeneric ? 'on' : ''}`}
          title="Cambia títulos vacíos, nombres de archivo, «image» o el mismo título repetido (p. ej. el del tráiler). Los títulos que pusiste tú no se tocan.">
          <input type="checkbox" checked={renameGeneric} onChange={(e) => setRenameGeneric(e.target.checked)} disabled={busy} />
          Renombrar títulos genéricos
        </label>
      </div>
      <button className="primary" type="button" onClick={run} disabled={busy || !configured || !willAnalyze}>
        {busy ? 'Analizando…' : willAnalyze ? `Analizar ${willAnalyze} materiales` : 'Nada pendiente'}
      </button>
      {busy && <JobStatusBar progress={job.progress || 0} message={job.message || 'Analizando…'} elapsed={elapsed} />}
      {job?.status === 'error' && <div className="ed-mat-err">{job.error}</div>}

      {summary && (
        <div className="ai-result">
          <div className="ai-result-meta">
            {summary.analyzed} analizados{summary.failed?.length ? ` · ${summary.failed.length} con error` : ''}
            {summary.tokens ? ` · ${summary.tokens.toLocaleString()} tokens` : ''}
          </div>
          <ul className="foundry-list">
            {(summary.items || []).map((it) => (
              <li key={`${it.kind}-${it.id}`} className="foundry-list-item ai-mat-item">
                <Icon name={it.kind === 'clips' ? 'movie' : 'image'} size={15} />
                <span>
                  <b>{it.label || '—'}</b>
                  {it.renamed && it.old_label && <span className="ai-mat-old"> (antes: {it.old_label})</span>}
                  <br />{it.description_ai}
                </span>
              </li>
            ))}
            {(summary.failed || []).map((it) => (
              <li key={`err-${it.kind}-${it.id}`} className="foundry-list-item ai-mat-item">
                <Icon name="error_outline" size={15} />
                <span><b>{it.label || it.id}</b><br /><span className="ed-mat-err">{it.error}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const ASPECT_LABELS = { '9:16': '9:16 vertical', '16:9': '16:9 horizontal', '1:1': '1:1 cuadrado', '3:4': '3:4', '4:3': '4:3' }

// Genera imágenes con Foundry (MAI-Image / FLUX.2). El backend prueba los modelos
// en orden y salta al siguiente si uno agota su cuota o falla; cada imagen queda
// en el material del proyecto (origen "ai").
function CreateImageSection({ gen, projectId, editorContext, foundryOk, onGoSettings, onChange, setToast }) {
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState('9:16')
  const [model, setModel] = useState('auto')
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')

  const available = !!gen?.available
  const models = (gen?.models || []).filter((m) => m.available)
  const aspects = gen?.aspects?.length ? gen.aspects : Object.keys(ASPECT_LABELS)
  const keyless = (gen?.resources || []).filter((r) => !r.has_key)

  async function promptFromScene() {
    setBusy(true); setError('')
    try {
      const ctx = { vertical: aspect === '9:16', format: { aspect } }
      if (editorContext?.current_time != null) ctx.current_time = editorContext.current_time
      if (prompt.trim()) ctx.topic = prompt.trim()
      const r = await foundryGenerate({ op: 'visual_prompt', language: 'es', project_id: projectId, context: ctx })
      if (r.image_prompt) setPrompt(r.image_prompt)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function run() {
    if (!prompt.trim()) { setError('Describe la imagen que quieres.'); return }
    setBusy(true); setError('')
    const made = []
    for (let i = 0; i < count; i += 1) {
      setProgress(count > 1 ? `Generando ${i + 1} de ${count}…` : 'Generando…')
      try {
        made.push(await generateAiImage(projectId, { prompt: prompt.trim(), aspect, model }))
        setResults((prev) => [made[made.length - 1], ...prev].slice(0, 12))
      } catch (e) {
        setError(e.message)
        break
      }
    }
    setProgress('')
    setBusy(false)
    if (made.length) {
      onChange?.()
      setToast({ type: 'success', message: made.length > 1 ? `${made.length} imágenes añadidas al material.` : 'Imagen añadida al material.' })
    }
  }

  return (
    <div className="ai-block">
      <div className="ai-block-head"><Icon name="auto_awesome" size={16} /> Crear imagen con IA (Foundry)</div>
      <p className="ed-caja-hint">
        MAI-Image y FLUX.2. Si un modelo agota su cuota o falla, se usa el siguiente automáticamente.
        La imagen se guarda en el material del proyecto. En inglés y con detalle suele salir mejor.
      </p>
      {!available && (
        <div className="warn">
          {gen?.reason || 'Configura los recursos de imagen de Foundry.'}
          {onGoSettings && <button type="button" className="ghost small" onClick={onGoSettings} style={{ marginLeft: 8 }}>Ir a Configuración</button>}
        </div>
      )}
      {available && keyless.length > 0 && (
        <div className="ed-caja-hint">
          Sin clave (no se usan como respaldo): {keyless.map((r) => r.id).join(', ')}.
          {onGoSettings && <button type="button" className="ghost small" onClick={onGoSettings} style={{ marginLeft: 6 }}>Añadir claves</button>}
        </div>
      )}
      <textarea className="tts-text" rows={4} value={prompt} disabled={busy}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="p. ej. a red panda astronaut floating over Earth, cinematic lighting, highly detailed" />
      <div className="ai-btn-row">
        <label className="field"><span>Formato</span>
          <select className="time-input" value={aspect} disabled={busy} onChange={(e) => setAspect(e.target.value)}>
            {aspects.map((a) => <option key={a} value={a}>{ASPECT_LABELS[a] || a}</option>)}
          </select>
        </label>
        <label className="field"><span>Modelo</span>
          <select className="time-input" value={model} disabled={busy} onChange={(e) => setModel(e.target.value)}>
            <option value="auto">Automático (mejor disponible)</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Cantidad</span>
          <select className="time-input" value={count} disabled={busy} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div className="ai-btn-row">
        <button className="primary" type="button" onClick={run} disabled={busy || !available || !prompt.trim()}>
          {busy && progress ? progress : 'Generar'}
        </button>
        <button className="ghost small" type="button" onClick={promptFromScene} disabled={busy || !foundryOk}
          title="Escribe un prompt a partir del guion y del momento actual de la timeline (usa el chat de Foundry)">
          Prompt desde la escena
        </button>
      </div>
      {error && <div className="ed-mat-err">{error}</div>}

      {results.length > 0 && (
        <div className="ai-result">
          <div className="ai-gen-grid">
            {results.map((r) => (
              <div key={r.image.id} className="ai-gen-item" title={r.image.description || ''}
                style={r.image.width && r.image.height ? { '--ar': `${r.image.width} / ${r.image.height}` } : undefined}>
                <img src={r.image.url} alt={r.image.label || ''} loading="lazy" />
                <span>{r.model}</span>
              </div>
            ))}
          </div>
          {results[0].attempts?.some((a) => a.code !== 'ok') && (
            <ul className="ai-gen-tries">
              {results[0].attempts.filter((a) => a.code !== 'ok').map((a, i) => (
                <li key={i}>{a.model}@{a.resource}: {a.error}</li>
              ))}
            </ul>
          )}
          <div className="ai-result-meta">Están en Material → Imágenes; arrástralas a la timeline.</div>
        </div>
      )}
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
