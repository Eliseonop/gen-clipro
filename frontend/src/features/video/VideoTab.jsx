import { useState, useEffect } from 'react'
import { analyze, deleteMaterial, transcribeClip } from '../../services/api'
import Icon from '../../components/Icon'
import ConfirmModal from '../../components/ConfirmModal'
import Toast from '../../components/Toast'
import ClipEditor from './ClipEditor'
import VideoAnalyzeForm from './VideoAnalyzeForm'
import ManualTrimPanel from './ManualTrimPanel'
import ClipsLibraryPanel from './ClipsLibraryPanel'

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
        <VideoAnalyzeForm
          url={url} setUrl={setUrl}
          analyzing={analyzing} onAnalyze={onAnalyze}
          showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
          opts={opts} setOpts={setOpts}
        />

        {error && <div className="error">⚠️ {error}</div>}

        {/* --- Recorte Manual & Vista Previa del Vídeo --- */}
        {result ? (
          <ManualTrimPanel
            result={result} dur={dur} heatmapSegments={heatmapSegments}
            inT={inT} outT={outT} setInT={setInT} setOutT={setOutT}
            manualPreview={manualPreview} setManualPreview={setManualPreview}
            onEditManual={editManual}
          />
        ) : (
          <div className="empty big">
            <Icon name="movie" size={48} />
            <p>Pega una URL de YouTube arriba y pulsa <strong>Cargar vídeo</strong> para ver la línea de tiempo y generar clips.</p>
          </div>
        )}
      </div>

      {/* ===== PANEL LATERAL DERECHO: Biblioteca de Clips ===== */}
      <ClipsLibraryPanel
        rightTab={rightTab} setRightTab={setRightTab}
        heatmapSegments={heatmapSegments} savedClips={savedClips}
        configs={configs} preview={preview} setPreview={setPreview}
        videoId={result?.video?.id}
        activeMenuIndex={activeMenuIndex} setActiveMenuIndex={setActiveMenuIndex}
        transcribingIndex={transcribingIndex}
        onEditSegment={editSegment} onEditSavedClip={editSavedClip}
        onTranscribe={handleTranscribeClip} onDeleteClip={setDeleteTargetClip}
      />

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
