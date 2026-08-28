import { useState, useEffect, useRef } from 'react'
import { analyze, getJob, deleteMaterial, transcribeClip } from './api'
import { fmt, parseTime, ytId } from './utils'
import Timeline from './Timeline'
import ClipEditor from './ClipEditor'
import ConfirmModal from './ConfirmModal'
import Toast from './Toast'
import Icon from './Icon'

const TX_MODELS = [
  { id: 'tiny', label: 'tiny · muy rápido' },
  { id: 'base', label: 'base · rápido' },
  { id: 'small', label: 'small · equilibrado' },
  { id: 'medium', label: 'medium · lento' },
  { id: 'large-v3', label: 'large-v3 · el mejor (lento)' },
]

function usePolledJob(job, setJob, onDone) {
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') {
      if (job?.status === 'done') onDone?.()
      return
    }
    const id = setInterval(async () => {
      try { setJob(await getJob(job.id)) } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
  }, [job?.id, job?.status])
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function VideoTab({ project, onChange }) {
  const [url, setUrl] = useState('')
  const [opts, setOpts] = useState({ min_score: 0.4, max_clips: 10, max_duration: 60, padding: 10 })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState('')

  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [preview, setPreview] = useState(null)

  const [inT, setInT] = useState(0)
  const [outT, setOutT] = useState(30)
  const [manualPreview, setManualPreview] = useState(false)



  const [editor, setEditor] = useState(null)
  const [configs, setConfigs] = useState({})
  const [rightTab, setRightTab] = useState('recommended')

  // Menú de opciones de cada clip (index activo del dropdown)
  const [activeMenuIndex, setActiveMenuIndex] = useState(null)
  const [deleteTargetClip, setDeleteTargetClip] = useState(null)
  const [toast, setToast] = useState(null)
  const [transcribingIndex, setTranscribingIndex] = useState(null)



  useEffect(() => {
    if (result?.video?.duration) {
      const first = result.segments?.[0]
      setInT(first ? first.start : 0)
      setOutT(first ? first.end : Math.min(result.video.duration, 30))
      setManualPreview(false)
    }
  }, [result])

  async function onAnalyze() {
    setError(''); setResult(null)
    if (!url.trim()) { setError('Pega una URL de YouTube.'); return }
    setAnalyzing(true)
    try {
      const res = await analyze({ url: url.trim(), ...opts })
      setResult(res)
      if (res?.has_heatmap) setRightTab('recommended')
    } catch (e) { setError(e.message) } finally { setAnalyzing(false) }
  }



  function openEditor(segStart, segEnd, key, segIndex, urlOverride = null, initialConfig = null) {
    const targetUrl = (urlOverride || url).trim()
    if (!targetUrl) { setError('Falta la URL del vídeo original para editar este clip.'); return }
    setEditor({
      segStart,
      segEnd,
      key,
      segIndex,
      url: targetUrl,
      initial: initialConfig || configs[key],
    })
  }

  function closeEditor(config) {
    if (editor && config) setConfigs((c) => ({ ...c, [editor.key]: config }))
    setEditor(null)
  }

  function editManual() {
    if (outT - inT < 0.5) { setError('El rango es demasiado corto.'); return }
    openEditor(+inT.toFixed(2), +outT.toFixed(2), 'manual', 100000 + (Date.now() % 900000))
  }

  function editSegment(s) {
    openEditor(s.start, s.end, `seg-${s.index}`, s.index)
  }

  function editSavedClip(c) {
    const initialConfig = c.reframe || {
      zoom: c.zoom || 1,
      keyframes: c.keyframes || [],
      trimIn: 0,
      trimOut: (c.end - c.start) || 0,
    }
    const targetUrl = c.source_url || url
    openEditor(c.start, c.end, `clip-${c.index}`, c.index, targetUrl, initialConfig)
  }

  async function confirmRemoveClip() {
    if (!deleteTargetClip) return
    try {
      await deleteMaterial(project.id, 'clips', deleteTargetClip.index)
      await onChange?.()
      setToast({ type: 'success', message: `Clip "${deleteTargetClip.filename}" eliminado.` })
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Error al eliminar el clip.' })
    }
    setDeleteTargetClip(null)
    setActiveMenuIndex(null)
  }

  async function handleTranscribeClip(clip) {
    setActiveMenuIndex(null)
    setTranscribingIndex(clip.index)
    try {
      await transcribeClip(project.id, clip.index, 'base')
      await onChange?.()
      setToast({ type: 'success', message: `Transcripción iniciada para el Clip #${clip.index}.` })
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Error al transcribir el clip.' })
    } finally {
      setTranscribingIndex(null)
    }
  }



  if (!project) return null
  const dur = result?.video?.duration || 0
  const heatmapSegments = result?.has_heatmap ? result.segments : []
  const savedClips = project.clips || []

  return (
    <div className="video-tab-layout">
      {/* ===== ÁREA PRINCIPAL: Editor & Previsualización ===== */}
      <div className="video-main-workspace">
        {/* --- URL + Acciones --- */}
        <section className="card">
          <div className="card-header">
            <h3><Icon name="movie" size={18} /> Vídeo de YouTube</h3>
          </div>
          <div className="row">
            <input
              className="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
            />
          </div>
          <div className="actions">
            <button className="primary" onClick={onAnalyze} disabled={analyzing}>
              {analyzing ? 'Cargando…' : '▶ Cargar vídeo'}
            </button>
          </div>
          <button className="link" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? '▾' : '▸'} Opciones avanzadas (heatmap)
          </button>
          {showAdvanced && (
            <div className="advanced">
              <Field label="Umbral heatmap" value={opts.min_score} min={0} max={1} step={0.05}
                onChange={(v) => setOpts({ ...opts, min_score: v })} />
              <Field label="Máx. clips" value={opts.max_clips} min={1} max={50} step={1}
                onChange={(v) => setOpts({ ...opts, max_clips: v })} />
              <Field label="Duración máx (s)" value={opts.max_duration} min={5} max={600} step={5}
                onChange={(v) => setOpts({ ...opts, max_duration: v })} />
              <Field label="Padding (s)" value={opts.padding} min={0} max={60} step={1}
                onChange={(v) => setOpts({ ...opts, padding: v })} />
            </div>
          )}
        </section>

        {error && <div className="error">⚠️ {error}</div>}

        {/* --- Recorte Manual & Vista Previa del Vídeo --- */}
        {result ? (
          <section className="card">
            <div className="video-info">
              {result.video.thumbnail && <img src={result.video.thumbnail} alt="" />}
              <div>
                <h2>{result.video.title}</h2>
                <p className="muted">{result.video.uploader} · {fmt(dur)}</p>
              </div>
            </div>

            <h3>Recortar tramo manual</h3>
            <Timeline
              duration={dur}
              segments={heatmapSegments}
              inT={inT} outT={outT} setInT={setInT} setOutT={setOutT}
            />

            <div className="cutter-fields">
              <label className="field"><span>Inicio (m:ss)</span>
                <TimeInput value={inT} max={dur} onCommit={(s) => setInT(Math.max(0, Math.min(s, outT - 0.5)))} />
              </label>
              <label className="field"><span>Fin (m:ss)</span>
                <TimeInput value={outT} max={dur} onCommit={(s) => setOutT(Math.min(dur, Math.max(s, inT + 0.5)))} />
              </label>
              <button className="ghost" onClick={() => setManualPreview((v) => !v)}>
                {manualPreview ? '✕ Cerrar' : '▶ Previsualizar'}
              </button>
            </div>

            {manualPreview && result.video.id && (
              <div className="seg-player">
                <iframe
                  src={`https://www.youtube.com/embed/${result.video.id}?start=${Math.floor(inT)}&end=${Math.ceil(outT)}&autoplay=1&rel=0`}
                  title="Preview rango" allow="autoplay; encrypted-media" allowFullScreen
                />
              </div>
            )}

            <button className="primary big" onClick={editManual}>
              <Icon name="movie_edit" size={18} /> Editar y crear clip ({fmt(Math.max(0, outT - inT))})
            </button>

            {!result.has_heatmap && (
              <p className="muted" style={{ marginTop: 12 }}>
                Sin datos de "Most Replayed" — usa el recorte manual de arriba.
              </p>
            )}
          </section>
        ) : (
          <div className="empty big">
            <Icon name="movie" size={48} />
            <p>Pega una URL de YouTube arriba y pulsa <strong>Cargar vídeo</strong> para ver la línea de tiempo y generar clips.</p>
          </div>
        )}


      </div>

      {/* ===== PANEL LATERAL DERECHO: Biblioteca de Clips ===== */}
      <aside className="clips-right-panel">
        <div className="clips-panel-header">
          <div className="clips-panel-title">
            <Icon name="video_library" size={20} />
            <h2>Biblioteca de Clips</h2>
          </div>

          <div className="clips-panel-tabs">
            <button
              className={`panel-tab ${rightTab === 'recommended' ? 'active' : ''}`}
              onClick={() => setRightTab('recommended')}
            >
              🔥 Recomendados ({heatmapSegments.length})
            </button>
            <button
              className={`panel-tab ${rightTab === 'saved' ? 'active' : ''}`}
              onClick={() => setRightTab('saved')}
            >
              💾 Guardados ({savedClips.length})
            </button>
          </div>
        </div>

        <div className="clips-panel-body">
          {/* TAB 1: Recomendados por heatmap / viralidad */}
          {rightTab === 'recommended' && (
            <div className="clips-tab-content">
              {heatmapSegments.length === 0 ? (
                <div className="empty-panel">
                  <Icon name="auto_awesome" size={36} />
                  <p>Carga un vídeo de YouTube para ver los tramos más reproducidos recomendados automáticamente.</p>
                </div>
              ) : (
                <div className="recommended-list">
                  {heatmapSegments.map((s) => {
                    const scorePct = Math.round((s.score || 0) * 100)
                    const isEdited = !!configs[`seg-${s.index}`]
                    const isPreviewing = preview === s.index

                    return (
                      <div className="clip-card rec-card" key={s.index}>
                        <div className="clip-card-header">
                          <span className="clip-num">Tramo #{s.index}</span>
                          <span className="score-badge" title="Potencial de reproducciones (Heatmap)">
                            🔥 {scorePct}%
                          </span>
                        </div>

                        <div className="clip-card-meta">
                          <span className="clip-time">{fmt(s.start)} → {fmt(s.end)}</span>
                          <span className="clip-dur">({fmt(s.end - s.start)})</span>
                          {isEdited && (
                            <span className="edited-badge" title="Editado en esta sesión">
                              <Icon name="check_circle" size={13} /> Editado
                            </span>
                          )}
                        </div>

                        <div className="score-bar-track">
                          <div className="score-bar-fill" style={{ width: `${scorePct}%` }} />
                        </div>

                        {isPreviewing && (
                          <div className="seg-player-mini">
                            <iframe
                              src={`https://www.youtube.com/embed/${result.video.id}?start=${Math.floor(s.start)}&end=${Math.ceil(s.end)}&autoplay=1&rel=0`}
                              title={`Tramo ${s.index}`} allow="autoplay; encrypted-media" allowFullScreen
                            />
                          </div>
                        )}

                        <div className="clip-card-actions">
                          <button className="primary small edit-btn" onClick={() => editSegment(s)}>
                            <Icon name="movie_edit" size={16} /> Editar
                          </button>
                          <button
                            className="ghost small"
                            onClick={() => setPreview(isPreviewing ? null : s.index)}
                            title="Previsualizar tramo"
                          >
                            <Icon name={isPreviewing ? 'close' : 'play_arrow'} size={16} />
                            {isPreviewing ? 'Cerrar' : 'Ver'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Clips Guardados (De 2 en 2 en cuadrícula + Reproducción inline + Menú opciones) */}
          {rightTab === 'saved' && (
            <div className="clips-tab-content">
              {savedClips.length === 0 ? (
                <div className="empty-panel">
                  <Icon name="bookmark_border" size={36} />
                  <p>Aún no hay clips guardados en este proyecto. Edita y guarda un tramo recomendado o manual.</p>
                </div>
              ) : (
                <div className="saved-grid">
                  {savedClips.map((c) => {
                    const isMenuOpen = activeMenuIndex === c.index
                    const dateStr = formatDate(c.created_at)

                    return (
                      <div className="clip-card saved-card-grid" key={c.index}>
                        {/* Reproductor Inline directo en la tarjeta */}
                        <div className="inline-video-wrap">
                          <video
                            src={c.url}
                            controls
                            preload="metadata"
                          />
                          <span className="thumb-dur">{fmt(c.end - c.start)}</span>
                        </div>

                        <div className="saved-card-info">
                          <div className="saved-title-row">
                            <strong title={c.filename}>{c.label ? c.label : `Clip #${c.index}`}</strong>
                          </div>
                          <div className="saved-sub-row">
                            <span className="clip-time">{fmt(c.start)} → {fmt(c.end)}</span>
                            {dateStr && <span className="clip-date">{dateStr}</span>}
                          </div>
                        </div>

                        <div className="clip-card-actions">
                          <button className="primary small edit-btn" onClick={() => editSavedClip(c)}>
                            <Icon name="movie_edit" size={15} /> Editar
                          </button>

                          {/* Menú de opciones ⋮ */}
                          <div className="options-menu-wrap">
                            <button
                              className="ghost small icon-only menu-trigger"
                              onClick={() => setActiveMenuIndex(isMenuOpen ? null : c.index)}
                              title="Opciones del clip"
                            >
                              <Icon name="more_vert" size={18} />
                            </button>

                            {isMenuOpen && (
                              <div className="options-dropdown" onMouseLeave={() => setActiveMenuIndex(null)}>
                                <a className="dropdown-item" href={c.url} download onClick={() => setActiveMenuIndex(null)}>
                                  <Icon name="download" size={15} /> Descargar
                                </a>
                                <button
                                  className="dropdown-item"
                                  onClick={() => handleTranscribeClip(c)}
                                  disabled={transcribingIndex === c.index}
                                >
                                  <Icon name="notes" size={15} />
                                  {transcribingIndex === c.index ? 'Transcribiendo…' : 'Transcribir'}
                                </button>
                                <button
                                  className="dropdown-item danger"
                                  onClick={() => setDeleteTargetClip(c)}
                                >
                                  <Icon name="delete" size={15} /> Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ===== MODAL DE EDICIÓN DEL CLIP ===== */}
      {editor && (
        <ClipEditor
          key={editor.key}
          project={project}
          url={editor.url}
          segStart={editor.segStart}
          segEnd={editor.segEnd}
          segIndex={editor.segIndex}
          initial={editor.initial}
          onClose={closeEditor}
          onChange={onChange}
        />
      )}

      {/* ===== MODAL DE CONFIRMACIÓN DE ELIMINACIÓN ===== */}
      <ConfirmModal
        open={!!deleteTargetClip}
        title="¿Eliminar clip?"
        message={deleteTargetClip ? `¿Estás seguro de que quieres eliminar "${deleteTargetClip.filename}"? Se borrará también el archivo del disco.` : ''}
        confirmText="Eliminar"
        cancelText="Cancelar"
        danger
        onConfirm={confirmRemoveClip}
        onCancel={() => setDeleteTargetClip(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} {...rest} />
    </label>
  )
}

function TimeInput({ value, max, onCommit }) {
  const [text, setText] = useState(fmt(value))
  useEffect(() => { setText(fmt(value)) }, [value])

  function commit() {
    const s = parseTime(text)
    if (s == null) { setText(fmt(value)); return }
    onCommit(Math.max(0, Math.min(s, max)))
  }

  return (
    <input
      className="time-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.target.blur() } }}
    />
  )
}
