import { useState, useEffect, useRef } from 'react'
import { transcribeClip, getJob } from '../../services/api'
import { fmt } from '../../lib/utils'
import Icon from '../../components/Icon'

const TX_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3']

// Deriva el guion del fragmento a partir del guion completo del vídeo original,
// re-basando los tiempos para que sean relativos al clip.
function deriveFragment(clip, transcripts) {
  if (!transcripts?.length || !clip.source_url) return null
  const t = transcripts.find((tr) => tr.source_url === clip.source_url)
  if (!t) return null
  const segs = t.segments
    .filter((s) => s.start < clip.end && s.end > clip.start)
    .map((s) => ({
      start: Math.max(0, +(s.start - clip.start).toFixed(2)),
      end: +(Math.min(clip.end, s.end) - clip.start).toFixed(2),
      text: s.text,
    }))
  return segs.length ? { segments: segs, derived: true } : null
}

export default function ClipPreview({ project, clip, onClose, onChange }) {
  const [model, setModel] = useState('base')
  const [job, setJob] = useState(null)
  const [t, setT] = useState(0)
  const videoRef = useRef(null)

  // Guion del fragmento: el propio del clip, o derivado del guion completo.
  const own = clip.transcript ? { segments: clip.transcript.segments, derived: false } : null
  const fragment = own || deriveFragment(clip, project.transcripts)

  // Reset al cambiar de clip.
  useEffect(() => { setJob(null); setT(0) }, [clip.index])

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

  async function generate() {
    try { setJob(await transcribeClip(project.id, clip.index, model)) } catch (e) { alert(e.message) }
  }

  function seek(sec) {
    const v = videoRef.current
    if (v) { v.currentTime = sec; v.play?.() }
  }

  const busy = job && (job.status === 'pending' || job.status === 'running')
  const activeIdx = fragment
    ? fragment.segments.findIndex((s) => t >= s.start && t < s.end)
    : -1

  return (
    <section className="card clip-preview">
      <div className="tx-head">
        <h3><Icon name="movie" size={18} /> Vista previa del clip</h3>
        <span className="muted">{fmt(clip.start)} → {fmt(clip.end)} · {Math.round(clip.end - clip.start)}s</span>
        <button className="icon-btn" title="Cerrar" onClick={onClose}><Icon name="close" size={20} /></button>
      </div>

      <div className="clip-preview-body">
        <div className="clip-video">
          <video
            ref={videoRef}
            key={clip.filename}
            src={clip.url}
            controls
            autoPlay
            preload="metadata"
            onTimeUpdate={(e) => setT(e.target.currentTime)}
          />
          <a className="ghost small dl" href={clip.url} download><Icon name="download" size={16} /> Descargar</a>
        </div>

        <div className="clip-transcript">
          {fragment ? (
            <>
              <div className="muted" style={{ marginBottom: 8 }}>
                {fragment.derived ? 'Guion derivado del vídeo original' : 'Guion del clip'} · sincronizado
              </div>
              <div className="transcript tall">
                {fragment.segments.map((s, i) => (
                  <div
                    key={i}
                    className={`tx-line ${i === activeIdx ? 'active' : ''}`}
                    onClick={() => seek(s.start)}
                    title="Reproducir desde aquí"
                  >
                    <span className="tx-time">{fmt(s.start)}</span>
                    <span className="tx-text">{s.text}</span>
                  </div>
                ))}
              </div>
            </>
          ) : busy ? (
            <div>
              <div className="progress"><span style={{ width: `${(job.progress || 0) * 100}%` }} /></div>
              <p className="muted">{job.message || 'Transcribiendo el clip…'}</p>
            </div>
          ) : (
            <div className="clip-generate">
              <p className="muted">Este clip aún no tiene guion.</p>
              <div className="actions">
                <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                  {TX_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="primary alt" onClick={generate}>
                  <Icon name="notes" size={16} /> Generar transcripción
                </button>
              </div>
              {job?.status === 'error' && <div className="error" style={{ marginTop: 10 }}>⚠️ {job.error}</div>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
