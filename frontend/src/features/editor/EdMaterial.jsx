import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../components/Icon'
import { fmt, parseTime } from '../../lib/utils'
import { FAV_CAT } from '../../lib/favorites'
import { analyze, listSfx, setSfxFolder, pickFolder, listLibrary, saveLibraryItem, unsaveLibraryItem, uploadImages, uploadVideo, uploadAudio, getSettings, putSettings, deleteMaterial, updateMaterial, fetchRemoteImage } from '../../services/api'
import MaterialClipGrid, { dragPayload, useToggle, useExclusiveMedia, Empty, ImageCard, MaterialMenuBtn } from './MaterialClipGrid'
import SfxClassifyModal from './SfxClassifyModal'
import ImageAddModal from './ImageAddModal'
import EdSettings from './EdSettings'
import EdFxLibrary from './EdFxLibrary'
import EdShapes from './EdShapes'
import EdChat from './EdChat'
import EdExplore from './EdExplore'
import AudioTab from '../audio/AudioTab'
import MotionElements from '../motion/MotionElements'
import ConfirmModal from '../../components/ConfirmModal'
import AnchoredMenu from '../../components/AnchoredMenu'
import { canDeleteMaterial, canDownloadMaterial, downloadMaterialFile, materialIdent, materialMenuItems, materialDeleteTitle, materialLabel } from './materialMenu'
import { clipCopyText } from './editorModel'
import { isTypingTarget, scopeShortcutIndex, scopeTabsFor, stepNavId, wheelStepDir } from './materialNav'
import JobStatusBar from '../../components/JobStatusBar'
import FlipPopover from '../../components/FlipPopover'
import Toast from '../../components/Toast'
import { collectFromClipboardItems, collectPastePayload, hasImagePaste, imageUrlsFromText, isImageFile, resolvePasteImages } from './imagePaste'

const YT_ANALYZE_OPTS = { min_score: 0.4, max_clips: 10, max_duration: 60, padding: 10 }

const VIDEO_FILE_RE = /\.(mp4|mov|mkv|webm|avi|m4v|mpe?g|wmv|flv)$/i
const AUDIO_FILE_RE = /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i

function isVideoFile(file) {
  if (!file) return false
  if ((file.type || '').startsWith('video/')) return true
  return VIDEO_FILE_RE.test(file.name || '')
}

function isAudioFile(file) {
  if (!file) return false
  if ((file.type || '').startsWith('audio/')) return true
  return AUDIO_FILE_RE.test(file.name || '')
}

function droppedUrl(dt) {
  const text = dt.getData('text/uri-list') || dt.getData('text/plain') || ''
  const m = text.trim().match(/https?:\/\/\S+/)
  return m ? m[0] : ''
}

function isYtUrl(u) {
  const s = (u || '').trim()
  if (!s) return false
  try {
    const host = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./i, '').toLowerCase()
    return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com' || host.endsWith('.youtube.com')
  } catch {
    return /youtu\.be|youtube\.com/i.test(s)
  }
}

function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter((x) => x && typeof x === 'object' && String(x.url || '').trim())
}

function hasOsFileDrag(e) {
  const types = [...(e.dataTransfer?.types || [])]
  return types.includes('Files') && !types.includes('application/x-material')
}

// Tipo de material arrastrado, por MIME. Durante el drag el navegador NO expone
// nombres ni bytes (solo `items[].type`), así que la detección es best-effort:
// si el MIME viene vacío devolvemos 'file' (neutro) y dejamos que el drop valide
// por extensión. 'other' = MIME presente pero no es medio soportado.
function dragMediaKind(e) {
  const items = [...(e.dataTransfer?.items || [])].filter((it) => it.kind === 'file')
  const mimes = items.map((it) => (it.type || '').toLowerCase())
  if (mimes.some((m) => m.startsWith('video/'))) return 'video'
  if (mimes.some((m) => m.startsWith('image/'))) return 'image'
  if (mimes.some((m) => m.startsWith('audio/'))) return 'audio'
  if (mimes.some((m) => m)) return 'other'
  return 'file'
}

const DROP_HINT = {
  video: 'Suelta el vídeo aquí',
  image: 'Suelta la imagen aquí',
  audio: 'Suelta el audio aquí',
  file: 'Suelta el archivo aquí',
  other: 'Formato no compatible',
}

function pickDefaultSfxCat(categories, current) {
  const cats = (categories || []).filter((c) => c.id && c.id !== FAV_CAT)
  if (current && cats.some((c) => c.id === current)) return current
  const other = cats.find((c) => c.id === '13_OTHER')
  return (other || cats[0] || {}).id || ''
}

function TimeInput({ label, value, onCommit }) {
  const [text, setText] = useState(fmt(value))
  useEffect(() => { setText(fmt(value)) }, [value])
  function commit() {
    const s = parseTime(text)
    if (s == null) { setText(fmt(value)); return }
    onCommit(s)
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="ed-yt-url"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  )
}

function CargarCustom({
  duration, videoId, inT, outT, setInT, setOutT, preview, setPreview, onEdit, onUseFull,
}) {
  const dur = Number(duration) || 0
  const span = Math.max(0, outT - inT)
  const showing = preview === 'custom'
  function clampStart(s) {
    const max = dur > 0.5 ? Math.max(0, (outT || dur) - 0.5) : Math.max(0, outT - 0.5)
    setInT(Math.max(0, Math.min(s, max)))
  }
  function clampEnd(s) {
    const hi = dur > 0.5 ? dur : Math.max(s, inT + 0.5)
    setOutT(Math.min(hi, Math.max(s, inT + 0.5)))
  }
  return (
    <div className="ed-cargar-custom">
      <div className="ed-key-row-head">
        <span className="ed-key-name">Clip personalizado</span>
        <span className="ed-key-set">{fmt(span)}</span>
      </div>
      <p className="ed-key-hint">Inicio y fin sobre el vídeo completo. También puedes usarlo entero.</p>
      <div className="ed-cargar-times">
        <TimeInput label="Inicio" value={inT} onCommit={clampStart} />
        <TimeInput label="Fin" value={outT} onCommit={clampEnd} />
      </div>
      {showing && videoId && (
        <div className="seg-player-mini">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(inT)}&end=${Math.ceil(outT)}&autoplay=1&rel=0`}
            title="Clip personalizado"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      )}
      <div className="clip-card-actions">
        <button className="primary small edit-btn" type="button" onClick={onEdit} disabled={span < 0.5}>
          <Icon name="movie_edit" size={16} /> Crear clip
        </button>
        <button
          className="ghost small"
          type="button"
          onClick={() => setPreview(showing ? null : 'custom')}
          title="Previsualizar el recorte"
          disabled={!videoId || span < 0.5}
        >
          <Icon name={showing ? 'close' : 'play_arrow'} size={16} />
          {showing ? 'Cerrar' : 'Ver'}
        </button>
      </div>
      <button className="ghost small ed-cargar-full" type="button" onClick={onUseFull} title="Abrir el vídeo completo en el Clip Editor">
        <Icon name="movie" size={16} /> Usar vídeo completo
      </button>
    </div>
  )
}

function CargarRecList({ segments, videoId, preview, setPreview, configs, onEdit }) {
  if (!segments.length) return null
  return segments.map((s) => {
        const scorePct = Math.round((s.score || 0) * 100)
        const isEdited = !!configs[`seg-${s.index}`]
        const isPreviewing = preview === s.index
        return (
          <div className="clip-card rec-card" key={s.index}>
            <button
              type="button"
              className="ed-edit-corner"
              title="Editar en Clip Editor"
              onClick={() => onEdit(s)}
            >
              <Icon name="movie_edit" size={15} />
            </button>
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
            {isPreviewing && videoId && (
              <div className="seg-player-mini">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(s.start)}&end=${Math.ceil(s.end)}&autoplay=1&rel=0`}
                  title={`Tramo ${s.index}`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            )}
            <div className="clip-card-actions">
              <button className="primary small edit-btn" type="button" onClick={() => onEdit(s)}>
                <Icon name="movie_edit" size={16} /> Editar
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={() => setPreview(isPreviewing ? null : s.index)}
                title="Previsualizar tramo"
              >
                <Icon name={isPreviewing ? 'close' : 'play_arrow'} size={16} />
                {isPreviewing ? 'Cerrar' : 'Ver'}
              </button>
            </div>
          </div>
        )
      })
}

function ScopeFilter({ value, onChange, includeLoad = false, loadId = 'cargar', loadLabel = 'Cargar clips', includeExplore = false }) {
  return (
    <div className="ed-scope-filter">
      <button type="button" className={`ed-tab ${value === 'all' ? 'on' : ''}`} onClick={() => onChange('all')}>Todos</button>
      <button type="button" className={`ed-tab ${value === 'saved' ? 'on' : ''}`} onClick={() => onChange('saved')}>Guardados</button>
      {includeExplore && (
        <button type="button" className={`ed-tab ${value === 'explore' ? 'on' : ''}`} onClick={() => onChange('explore')}>
          Explorar
        </button>
      )}
      {includeLoad && (
        <button type="button" className={`ed-tab ${value === loadId ? 'on' : ''}`} onClick={() => onChange(loadId)}>
          <Icon name="add" size={14} /> {loadLabel}
        </button>
      )}
    </div>
  )
}

function withProjectScope(items, kind) {
  return (items || []).map((it) => ({
    ...it,
    scope: 'project',
    is_saved: false,
    resource_type: kind,
    id: kind === 'clip' ? it.id || String(it.index) : it.id,
  }))
}

const MAT_NAV = [
  { id: 'video', icon: 'movie', label: 'Video' },
  { id: 'image', icon: 'image', label: 'Imagen' },
  { id: 'audio', icon: 'mic', label: 'Audio' },
  { id: 'sfx', icon: 'graphic_eq', label: 'SFX' },
  { id: 'effects', icon: 'auto_awesome', label: 'Efectos' },
  { id: 'shapes', icon: 'category', label: 'Figuras' },
  { id: 'text', icon: 'title', label: 'Texto' },
  { id: 'transitions', icon: 'animation', label: 'Transiciones' },
  { id: 'motion', icon: 'animation', label: 'Motion', sep: true },
  { id: 'settings', icon: 'settings', label: 'Configuración', sep: true },
  { id: 'chat', icon: 'forum', label: 'Chat IA' },
]

export default function EdMaterial({
  project, onAdd, onDragInfo, onRefresh, fav, onEditYtClip,
  selectedClip, onChangeFx,
  onAddText, onApplyTextPreset,
  matTab, onMatTab,
  onExportFps,
  audioDb, onAudioDb,
  aiContext, onReloadTimeline, timelineClips, onMcpAudit,
  motion, motionFormat, onGoMotion, onMotionBack,
}) {
  const [tabState, setTabState] = useState('video')
  const tab = matTab ?? tabState
  const setTab = (id) => { if (onMatTab) onMatTab(id); else setTabState(id) }
  const [videoFilter, setVideoFilter] = useState('all')
  const [videoQ, setVideoQ] = useState('')
  const [audioFilter, setAudioFilter] = useState('all')
  const [imageFilter, setImageFilter] = useState('all')
  const [library, setLibrary] = useState({ clips: [], audios: [], images: [] })
  const [err, setErr] = useState('')
  const [matToast, setMatToast] = useState(null)
  const [fileDrop, setFileDrop] = useState(false)
  const [dragKind, setDragKind] = useState('file')
  const [ytUrl, setYtUrl] = useState('')
  const [ytErr, setYtErr] = useState('')
  const [ytAnalyzing, setYtAnalyzing] = useState(false)
  const [ytElapsed, setYtElapsed] = useState(0)
  const [ytResult, setYtResult] = useState(null)
  const [ytPreview, setYtPreview] = useState(null)
  const [ytIn, setYtIn] = useState(0)
  const [ytOut, setYtOut] = useState(30)
  const [ytConfigs, setYtConfigs] = useState({})
  const [ytHistory, setYtHistory] = useState([])
  const [histOpen, setHistOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [vidOver, setVidOver] = useState(false)
  const [matMenu, setMatMenu] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [imgAddOpen, setImgAddOpen] = useState(false)
  const [imgTick, setImgTick] = useState(0)
  const [imgPaneMenu, setImgPaneMenu] = useState(null)
  const imgPendingRef = useRef([])
  const ytInputRef = useRef(null)
  const histBtnRef = useRef(null)
  const mediaFileRef = useRef(null)
  const dropDepth = useRef(0)
  const vidDropDepth = useRef(0)
  const ytT0 = useRef(0)
  const [chatBusy, setChatBusy] = useState(false)
  const [navTip, setNavTip] = useState(null)
  const navTipTimer = useRef(0)
  const navTipOn = useRef(false)
  const navTipNext = useRef(null)
  const tabRef = useRef(tab)
  const setTabRef = useRef(setTab)
  const wheelLock = useRef(0)
  tabRef.current = tab
  setTabRef.current = setTab
  const clips = project.clips || []
  const audios = project.audios || []
  const images = project.images || []
  const navCounts = {
    video: clips.length + (library.clips || []).length,
    image: images.length + (library.images || []).length,
    audio: audios.length + (library.audios || []).length,
  }
  const onPlayMedia = useExclusiveMedia()
  const di = onDragInfo || (() => {})

  const reloadLibrary = useCallback(() => {
    listLibrary().then(setLibrary).catch(() => {})
  }, [])

  const offerImageFiles = useCallback((files) => {
    if (!files?.length) return
    imgPendingRef.current = [...imgPendingRef.current, ...files]
    setTab('image')
    setImgAddOpen(true)
    setImgTick((n) => n + 1)
  }, [])

  async function ingestClipboard(payload) {
    setErr('')
    try {
      const files = await resolvePasteImages(payload, fetchRemoteImage)
      if (!files.length) {
        setErr('El portapapeles no tiene una imagen.')
        return
      }
      offerImageFiles(files)
    } catch (e) {
      setErr(e.message || 'No se pudo pegar la imagen.')
    }
  }

  async function pasteFromSystem() {
    setImgPaneMenu(null)
    if (!navigator.clipboard?.read) {
      setErr('Usa Ctrl+V para pegar la imagen.')
      return
    }
    try {
      const items = await navigator.clipboard.read()
      let payload = await collectFromClipboardItems(items)
      if (!hasImagePaste(payload)) {
        const text = await navigator.clipboard.readText().catch(() => '')
        payload = { files: [], urls: imageUrlsFromText(text) }
      }
      if (!hasImagePaste(payload)) {
        setErr('El portapapeles no tiene una imagen.')
        return
      }
      await ingestClipboard(payload)
    } catch (e) {
      const msg = String(e.message || '')
      if (/not focused|denied|permission|notallowed/i.test(msg)) {
        setErr('Usa Ctrl+V para pegar la imagen.')
      } else {
        setErr(msg || 'No se pudo leer el portapapeles. Prueba Ctrl+V.')
      }
    }
  }

  useEffect(() => { reloadLibrary() }, [reloadLibrary, project.id, clips.length, audios.length, images.length])
  useEffect(() => () => clearTimeout(navTipTimer.current), [])

  useEffect(() => {
    if (tab !== 'image') return undefined
    function onPaste(e) {
      const payload = collectPastePayload(e.clipboardData)
      if (!hasImagePaste(payload)) return
      const tag = e.target?.tagName || ''
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && !payload.files.length) return
      e.preventDefault()
      ingestClipboard(payload)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [tab])

  useEffect(() => {
    getSettings().then((s) => setYtHistory(normalizeHistory(s.yt_history))).catch(() => {})
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (isTypingTarget(document.activeElement) || isTypingTarget(e.target)) return
      if (document.querySelector('.modal-overlay')) return
      const ids = scopeTabsFor(tabRef.current)
      const idx = scopeShortcutIndex(e)
      if (idx < 0 || !ids.length || idx >= ids.length) return
      e.preventDefault()
      const id = ids[idx]
      const t = tabRef.current
      if (t === 'video') setVideoFilter(id)
      else if (t === 'image') setImageFilter(id)
      else if (t === 'audio') setAudioFilter(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onWheel(e) {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(document.activeElement)) return
      if (e.target?.closest?.('.ed-timeline-wrap')) return
      if (e.target?.closest?.('.modal-overlay')) return
      const dir = wheelStepDir(e.deltaX, e.deltaY)
      if (!dir) return
      e.preventDefault()
      const now = performance.now()
      if (now < wheelLock.current) return
      wheelLock.current = now + 200
      const ids = MAT_NAV.map((x) => x.id)
      const next = stepNavId(ids, tabRef.current, dir)
      if (next !== tabRef.current) setTabRef.current(next)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  function openMatMenu(e, kind, item) {
    e.preventDefault()
    e.stopPropagation()
    setMatMenu({
      x: e.clientX,
      y: e.clientY,
      kind,
      item,
      saved: item.scope === 'library' || !!item.is_saved,
    })
    setImgPaneMenu(null)
  }

  async function copyAudioDescription(audio) {
    const text = clipCopyText(audio)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setMatToast({ type: 'success', message: 'Descripción copiada.' })
    } catch {
      setMatToast({ type: 'error', message: 'No se pudo copiar.' })
    }
  }

  async function confirmDeleteMaterial() {
    if (!deleteTarget) return
    const { kind, item } = deleteTarget
    setErr('')
    try {
      await deleteMaterial(project.id, kind, materialIdent(kind, item))
      onRefresh?.()
    } catch (e) {
      setErr(e.message)
    }
    setDeleteTarget(null)
  }

  async function toggleSave(resourceType, item) {
    setErr('')
    try {
      const wasSaved = item.scope === 'library' || item.is_saved
      if (wasSaved) {
        await unsaveLibraryItem(item.id)
      } else {
        await saveLibraryItem({
          project_id: project.id,
          resource_type: resourceType,
          ident: resourceType === 'clip' ? String(item.index) : String(item.id),
        })
      }
      reloadLibrary()
      onRefresh?.()
      if (resourceType === 'audio') {
        setMatToast({
          type: 'success',
          message: wasSaved ? 'Audio quitado de guardados.' : 'Audio guardado en la biblioteca.',
        })
      }
    } catch (e) {
      setErr(e.message)
      if (resourceType === 'audio') {
        setMatToast({ type: 'error', message: e.message || 'No se pudo guardar el audio.' })
      }
    }
  }

  const projectClips = withProjectScope(clips, 'clip')
  const projectAudios = withProjectScope(audios, 'audio')
  const projectImages = withProjectScope(images, 'image')
  const shownClips = (videoFilter === 'saved' ? (library.clips || []) : [...projectClips, ...(library.clips || [])])
    .filter((c) => {
      const q = videoQ.trim().toLowerCase()
      if (!q) return true
      const name = `${c.label || ''} ${c.filename || ''} ${c.description || ''}`.toLowerCase()
      return name.includes(q)
    })
  const shownAudios = audioFilter === 'saved' ? (library.audios || []) : [...projectAudios, ...(library.audios || [])]
  const shownImages = imageFilter === 'saved' ? (library.images || []) : [...projectImages, ...(library.images || [])]
  const onCargarPane = tab === 'video' && videoFilter === 'cargar'

  useEffect(() => {
    if (onCargarPane) requestAnimationFrame(() => ytInputRef.current?.focus())
  }, [onCargarPane])

  useEffect(() => {
    if (!ytAnalyzing) { setYtElapsed(0); return }
    ytT0.current = Date.now()
    setYtElapsed(0)
    const id = setInterval(() => setYtElapsed(Math.floor((Date.now() - ytT0.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [ytAnalyzing])

  function onFileDragEnter(e) {
    if (onCargarPane) return
    if (!hasOsFileDrag(e)) return
    e.preventDefault()
    dropDepth.current += 1
    setDragKind(dragMediaKind(e))
    setFileDrop(true)
  }
  function onFileDragOver(e) {
    if (onCargarPane) return
    if (!hasOsFileDrag(e)) return
    e.preventDefault()
    setDragKind(dragMediaKind(e))
    e.dataTransfer.dropEffect = dragMediaKind(e) === 'other' ? 'none' : 'copy'
  }
  function onFileDragLeave(e) {
    if (onCargarPane) return
    if (!hasOsFileDrag(e)) return
    dropDepth.current = Math.max(0, dropDepth.current - 1)
    if (dropDepth.current === 0) setFileDrop(false)
  }
  function onFileDrop(e) {
    if (onCargarPane) return
    if (!hasOsFileDrag(e)) return
    e.preventDefault()
    dropDepth.current = 0
    setFileDrop(false)
    importMedia(e.dataTransfer.files, {
      setError: setErr,
      notify: (m) => { if (m) setMatToast({ type: 'success', message: m }) },
      emptyMsg: 'Formato no compatible. Suelta un vídeo, una imagen o un audio.',
      onDone: ({ videos, images }) => {
        if (videos.length) setTab('video')
        else if (images.length) setTab('image')
        else setTab('audio')
      },
    })
  }

  async function loadYt(fromUrl) {
    const url = (fromUrl ?? ytUrl).trim()
    if (fromUrl != null) setYtUrl(url)
    if (!url) { setYtErr('Pega el link de un vídeo de YouTube.'); return }
    setYtErr('')
    setYtResult(null)
    setYtPreview(null)
    setYtAnalyzing(true)
    try {
      const res = await analyze({ url, ...YT_ANALYZE_OPTS })
      setYtResult(res)
      const dur = Number(res?.video?.duration) || 0
      setYtIn(0)
      setYtOut(dur > 0.5 ? Math.min(dur, 30) : 30)
      try {
        const s = await getSettings()
        setYtHistory(normalizeHistory(s.yt_history))
      } catch { /* el análisis ya quedó */ }
    } catch (e) {
      setYtErr(e.message || 'No se pudo cargar el vídeo.')
    } finally {
      setYtAnalyzing(false)
    }
  }

  function openYtEditor(s) {
    const url = ytUrl.trim()
    if (!url) { setYtErr('Falta la URL del vídeo original para editar este clip.'); return }
    setYtConfigs((c) => ({ ...c, [`seg-${s.index}`]: true }))
    onEditYtClip?.({
      url,
      start: s.start,
      end: s.end,
      index: s.index,
      title: ytResult?.video?.title || `Tramo #${s.index}`,
      description: s.description || s.label || '',
      videoId: ytResult?.video?.id,
    })
  }

  function ytRange(start, end) {
    const dur = Number(ytResult?.video?.duration) || 0
    let a = Math.max(0, Number(start) || 0)
    let b = Math.max(a + 0.5, Number(end) || 0)
    if (dur > 0.5) {
      b = Math.min(dur, b)
      a = Math.max(0, Math.min(a, b - 0.5))
    }
    return [+a.toFixed(2), +b.toFixed(2)]
  }

  function openCustomClip() {
    const [start, end] = ytRange(ytIn, ytOut)
    if (end - start < 0.5) { setYtErr('El rango es demasiado corto.'); return }
    openYtEditor({ index: 100000 + (Date.now() % 900000), start, end, description: 'Clip personalizado' })
  }

  function openFullVideo() {
    const dur = Number(ytResult?.video?.duration) || 0
    const end = dur > 0.5 ? dur : Math.max(ytOut, 30)
    openYtEditor({ index: 100000 + (Date.now() % 900000), start: 0, end, description: 'Vídeo completo' })
  }

  function openProjectClip(c) {
    const src = (c.source_url || c.youtube_url || '').trim()
    const media = (c.url || '').trim()
    const title = c.label || c.filename || `Clip #${c.index}`
    const description = c.description || ''
    if (isYtUrl(src)) {
      setYtUrl(src)
      const start = Number(c.start) || 0
      const end = Number(c.end)
      onEditYtClip?.({
        url: src,
        start,
        end: Number.isFinite(end) && end > start ? end : start + Math.max(Number(c.duration) || 0, 0.5),
        index: c.index,
        title,
        description,
        videoId: c.youtube_id,
        existing: c.scope !== 'library',
      })
      return
    }
    const url = media || src
    if (!url) { setErr('Este clip no tiene fuente para editar.'); return }
    const dur = (c.end != null && c.start != null)
      ? Math.max(0, Number(c.end) - Number(c.start))
      : Number(c.duration) || 0
    onEditYtClip?.({
      url,
      start: 0,
      end: Math.max(dur, 0.5),
      index: c.index,
      title,
      description,
      existing: c.scope !== 'library',
    })
  }

  async function toggleHistory() {
    const next = !histOpen
    setHistOpen(next)
    if (!next) return
    try {
      const s = await getSettings()
      setYtHistory(normalizeHistory(s.yt_history))
    } catch { /* lista local */ }
  }

  async function removeHistory(item) {
    const needle = (item.video_id || item.url || '').trim()
    const next = ytHistory.filter((x) => {
      const key = (x.video_id || x.url || '').trim()
      return key !== needle && (x.url || '').trim() !== (item.url || '').trim()
    })
    setYtHistory(next)
    try { await putSettings({ yt_history: next }) } catch { /* noop */ }
  }

  async function saveImageDescription(im, description) {
    if (!im || im.scope === 'library') return
    try {
      await updateMaterial(project.id, 'images', materialIdent('images', im), {
        description: (description || '').trim(),
      })
      await onRefresh?.()
    } catch (e) {
      setErr(e.message || 'No se pudo guardar la descripción.')
    }
  }

  async function importMedia(fileList, opts = {}) {
    // Los mensajes van por defecto al panel Cargar (ytErr/importMsg); el drop del
    // contenedor los redirige (setError→err visible siempre, notify→toast).
    const setError = opts.setError || setYtErr
    const notify = opts.notify || setImportMsg
    const files = [...(fileList || [])]
    const videos = files.filter(isVideoFile)
    const images = files.filter(isImageFile)
    const audios = files.filter(isAudioFile)
    if (!videos.length && !images.length && !audios.length) {
      notify('')
      setError(opts.emptyMsg || 'Suelta un vídeo, una imagen o un audio.')
      return
    }
    setError('')
    notify('')
    setImporting(true)
    const done = []
    try {
      for (const f of videos) {
        await uploadVideo(project.id, f)
        done.push(f.name)
      }
      if (images.length) {
        await uploadImages(project.id, images)
        done.push(...images.map((f) => f.name))
      }
      for (const f of audios) {
        await uploadAudio(project.id, f)
        done.push(f.name)
      }
      await onRefresh?.()
      notify(done.length === 1
        ? `«${done[0]}» está en el material.`
        : `${done.length} archivos añadidos al material.`)
      opts.onDone?.({ videos, images, audios })
    } catch (e) {
      setError(e.message || 'No se pudo importar el archivo.')
    } finally {
      setImporting(false)
    }
  }

  function onVidDragEnter(e) {
    e.preventDefault()
    e.stopPropagation()
    vidDropDepth.current += 1
    setVidOver(true)
  }
  function onVidDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }
  function onVidDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    vidDropDepth.current = Math.max(0, vidDropDepth.current - 1)
    if (!vidDropDepth.current) setVidOver(false)
  }
  function onVidDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    vidDropDepth.current = 0
    setVidOver(false)
    const dt = e.dataTransfer
    if (dt.files && dt.files.length) { importMedia(dt.files); return }
    const link = droppedUrl(dt)
    if (link) { setYtUrl(link); setYtErr(''); setImportMsg('') }
  }

  function openNavTip(e, text) {
    const r = e.currentTarget.getBoundingClientRect()
    navTipNext.current = { text, left: Math.round(r.right + 8), top: Math.round(r.top + r.height / 2) }
    if (navTipOn.current) {
      setNavTip(navTipNext.current)
      return
    }
    clearTimeout(navTipTimer.current)
    navTipTimer.current = window.setTimeout(() => {
      navTipOn.current = true
      setNavTip(navTipNext.current)
    }, 80)
  }
  function closeNavTip() {
    clearTimeout(navTipTimer.current)
    navTipOn.current = false
    setNavTip(null)
  }

  const navItem = MAT_NAV.find((x) => x.id === tab)

  return (
    <div
      className={`ed-material${fileDrop ? ' file-drop' : ''}`}
      onDragEnter={onFileDragEnter}
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onFileDrop}
    >
      {fileDrop && (
        <div className={`ed-drop-hint${dragKind === 'other' ? ' bad' : ''}`} aria-hidden="true">
          <Icon name={dragKind === 'other' ? 'block' : 'upload'} size={22} />
          <span>{DROP_HINT[dragKind] || DROP_HINT.file}</span>
        </div>
      )}
      <nav className="ed-mat-nav" aria-label="Materiales" onMouseLeave={closeNavTip}>
        <div className="ed-mat-nav-scroll" onScroll={closeNavTip}>
          {MAT_NAV.map((item) => {
            const n = navCounts[item.id]
            const label = n != null ? `${item.label} (${n})` : item.label
            return (
              <Fragment key={item.id}>
                {item.sep ? <div className="ed-mat-nav-sep" aria-hidden="true" /> : null}
                <button
                  type="button"
                  className={`ed-mat-nav-btn${tab === item.id ? ' on' : ''}${item.id === 'chat' && chatBusy ? ' working' : ''}`}
                  aria-label={item.id === 'chat' && chatBusy ? `${label} (trabajando)` : label}
                  aria-current={tab === item.id ? 'page' : undefined}
                  onMouseEnter={(e) => openNavTip(e, item.id === 'chat' && chatBusy ? `${label} (trabajando)` : label)}
                  onClick={() => { setTab(item.id); if (item.id === 'motion') onGoMotion?.() }}
                >
                  <Icon name={item.icon} size={20} />
                </button>
              </Fragment>
            )
          })}
        </div>
      </nav>
      {navTip && createPortal(
        <div className="ed-fast-tip" style={{ left: navTip.left, top: navTip.top }} role="tooltip">
          {navTip.text}
        </div>,
        document.body,
      )}
      <div className="ed-mat-body">
      {navItem && <div className="ed-mat-title">{navItem.label}</div>}
      {err && <div className="ed-mat-err">{err}</div>}

      {tab === 'video' && (
        <div className="ed-mat-list">
          <ScopeFilter value={videoFilter} onChange={setVideoFilter} includeLoad />
          {videoFilter !== 'cargar' && (
            <div className="ed-sfx-search">
              <Icon name="search" size={16} />
              <input
                value={videoQ}
                onChange={(e) => setVideoQ(e.target.value)}
                placeholder="Buscar clips"
                aria-label="Buscar clips"
              />
            </div>
          )}
          {videoFilter === 'cargar' ? (
            <div className="ed-yt-form">
              <input
                ref={ytInputRef}
                className="ed-yt-url"
                placeholder="https://www.youtube.com/watch?v=…"
                value={ytUrl}
                onChange={(e) => { setYtUrl(e.target.value); setYtErr('') }}
                onKeyDown={(e) => e.key === 'Enter' && !ytAnalyzing && !importing && loadYt()}
                disabled={ytAnalyzing || importing}
              />
              <div className="ed-yt-actions">
                <button className="primary small" type="button" onClick={() => loadYt()} disabled={ytAnalyzing || importing}>
                  {ytAnalyzing ? 'Cargando…' : 'Cargar'}
                </button>
                <button
                  ref={histBtnRef}
                  className="ghost small icon-only"
                  type="button"
                  title="Historial de enlaces"
                  aria-expanded={histOpen}
                  aria-label="Historial de enlaces"
                  onClick={toggleHistory}
                  disabled={ytAnalyzing || importing}
                >
                  <Icon name="history" size={16} />
                </button>
                <FlipPopover open={histOpen} anchorRef={histBtnRef} onClose={() => setHistOpen(false)} className="ed-yt-hist-pop">
                  <div className="ed-yt-hist-head">Historial</div>
                  {ytHistory.length === 0 ? (
                    <div className="ed-yt-hist-empty">Aún no hay enlaces consultados.</div>
                  ) : ytHistory.map((item) => (
                    <div className="ed-yt-hist-row" key={`${item.video_id || ''}-${item.url}`}>
                      <button
                        type="button"
                        className="ed-yt-hist-pick"
                        title={item.url}
                        onClick={() => {
                          setHistOpen(false)
                          loadYt(item.url)
                        }}
                      >
                        <span className="ed-yt-hist-title">{item.title || item.url}</span>
                        <span className="ed-yt-hist-url">{item.url}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn ed-yt-hist-del"
                        title="Quitar del historial"
                        onClick={() => removeHistory(item)}
                      >
                        <Icon name="delete" size={15} />
                      </button>
                    </div>
                  ))}
                </FlipPopover>
              </div>
              {ytAnalyzing && (
                <JobStatusBar
                  indeterminate
                  progress={0.35}
                  message={ytElapsed < 8
                    ? 'Consultando YouTube y descargando metadatos…'
                    : ytElapsed < 25
                      ? 'Sigue cargando (heatmap / descarga). No está colgado.'
                      : `Lleva ${ytElapsed}s. YouTube a veces tarda; espera o revisa la URL.`}
                  elapsed={ytElapsed}
                />
              )}
              {!ytResult && !ytAnalyzing && (
                <button
                  type="button"
                  className={`ed-vid-drop${vidOver ? ' over' : ''}${importing ? ' busy' : ''}`}
                  onClick={() => { if (!importing) mediaFileRef.current?.click() }}
                  onDragEnter={onVidDragEnter}
                  onDragOver={onVidDragOver}
                  onDragLeave={onVidDragLeave}
                  onDrop={onVidDrop}
                  title="Elegir un archivo del equipo"
                >
                  <Icon name={importing ? 'hourglass_top' : 'upload'} size={20} />
                  <span>{importing ? 'Importando…' : 'Arrastra vídeo, imagen o audio, o elige un archivo'}</span>
                </button>
              )}
              <input
                ref={mediaFileRef}
                type="file"
                hidden
                multiple
                accept="video/*,audio/*,image/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.m4a,.png,.jpg,.jpeg,.webp,.gif"
                onChange={(e) => {
                  const files = [...(e.target.files || [])]
                  e.target.value = ''
                  if (files.length) importMedia(files)
                }}
              />
              {ytErr && <div className="ed-mat-err">{ytErr}</div>}
              {importMsg && <div className="ed-yt-ok">{importMsg}</div>}
              {ytResult && (
                <>
                  <div className="ed-yt-meta">
                    <strong title={ytResult.video?.title}>{ytResult.video?.title || 'Vídeo cargado'}</strong>
                    <span>
                      {ytResult.video?.duration ? fmt(ytResult.video.duration) : ''}
                      {(ytResult.has_heatmap ? ytResult.segments : []).length
                        ? ` · ${(ytResult.has_heatmap ? ytResult.segments : []).length} recomendados`
                        : ' · Sin tramos recomendados'}
                    </span>
                  </div>
                  <div className="ed-cargar-recs clips-panel-body">
                    <CargarCustom
                      duration={ytResult.video?.duration}
                      videoId={ytResult.video?.id}
                      inT={ytIn}
                      outT={ytOut}
                      setInT={setYtIn}
                      setOutT={setYtOut}
                      preview={ytPreview}
                      setPreview={setYtPreview}
                      onEdit={openCustomClip}
                      onUseFull={openFullVideo}
                    />
                    <CargarRecList
                      segments={ytResult.has_heatmap ? (ytResult.segments || []) : []}
                      videoId={ytResult.video?.id}
                      preview={ytPreview}
                      setPreview={setYtPreview}
                      configs={ytConfigs}
                      onEdit={openYtEditor}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <MaterialClipGrid
              clips={shownClips}
              onAdd={(c) => onAdd('clips', c)}
              onPlay={onPlayMedia}
              di={di}
              onEdit={openProjectClip}
              onMenu={(e, c) => openMatMenu(e, 'clips', c)}
              emptyText={videoFilter === 'saved' ? 'No hay clips guardados.' : 'Sin clips. Pulsa Cargar clips.'}
            />
          )}
        </div>
      )}

      <div
        className={tab === 'image'
          ? `ed-mat-list${imageFilter === 'explore' ? ' pinned' : ''}`
          : 'ed-hidden-panel'}
        onContextMenu={(e) => {
          if (tab !== 'image' || imageFilter === 'explore') return
          if (e.target.closest('.ed-card, button, input, textarea')) return
          e.preventDefault()
          setMatMenu(null)
          setImgPaneMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <div className="ed-img-toolbar">
          <ScopeFilter value={imageFilter} onChange={setImageFilter} includeExplore />
          {imageFilter !== 'explore' && (
            <button
              type="button"
              className="ed-sfx-add"
              title="Agregar imagen"
              onClick={() => { setImgAddOpen(true); setImgTick((n) => n + 1) }}
            >
              <Icon name="add" size={16} />
            </button>
          )}
        </div>
        {tab === 'image' && imageFilter !== 'explore' && (shownImages.length === 0
          ? <Empty text={imageFilter === 'saved' ? 'No hay imágenes guardadas.' : 'Sin imágenes. Clic derecho para pegar, o pulsa +.'} />
          : (
            <div className="ed-mat-grid">
              {shownImages.map((im) => (
                <ImageCard
                  key={`${im.scope}-${im.id}`}
                  image={im}
                  onAdd={() => onAdd('images', im)}
                  di={di}
                  onMenu={(e) => openMatMenu(e, 'images', im)}
                  onSaveDescription={im.scope === 'library' ? undefined : (text) => saveImageDescription(im, text)}
                />
              ))}
            </div>
          ))}
        <div className={imageFilter === 'explore' ? 'ed-explore-slot' : 'ed-hidden-panel'}>
            <EdExplore
              projectId={project.id}
              project={project}
              timelineClips={timelineClips}
              active={tab === 'image' && imageFilter === 'explore'}
              onImported={() => onRefresh?.()}
              onToast={setMatToast}
              onOpenSettings={() => setTab('settings')}
            />
        </div>
      </div>

      {tab === 'audio' && (
        <div className="ed-mat-list">
          <ScopeFilter
            value={audioFilter}
            onChange={setAudioFilter}
            includeLoad
            loadLabel="Cargar audio"
          />
          <div className={audioFilter === 'cargar' ? '' : 'ed-hidden-panel'}>
            <AudioTab
              project={project}
              onChange={onRefresh}
              initialYtUrl={ytUrl}
              sourceTitle={ytResult?.video?.title || ''}
            />
          </div>
          {audioFilter !== 'cargar' && (shownAudios.length === 0
            ? <Empty text={audioFilter === 'saved' ? 'No hay audios guardados.' : 'Sin audios. Pulsa Cargar audio para narrar o extraer de un vídeo.'} />
            : shownAudios.map((a) => (
              <AudioCard
                key={`${a.scope}-${a.id}`}
                audio={a}
                onAdd={() => onAdd('audios', a)}
                onPlay={onPlayMedia}
                di={di}
                onMenu={(e) => openMatMenu(e, 'audios', a)}
                onCopyDesc={() => copyAudioDescription(a)}
              />
            )))}
        </div>
      )}

      {tab === 'sfx' && <SfxTab onAdd={onAdd} onPlay={onPlayMedia} di={di} fav={fav} />}
      {tab === 'shapes' && <EdShapes onAdd={onAdd} onDragInfo={di} />}
      {tab === 'effects' && (
        <EdFxLibrary
          mode="effects"
          clip={selectedClip}
          onChangeFx={onChangeFx}
          onNeedClip={() => setMatToast({ type: 'error', message: 'Selecciona un clip en la timeline.' })}
        />
      )}
      {tab === 'text' && (
        <EdFxLibrary
          mode="text"
          clip={selectedClip}
          onAddText={onAddText}
          onApplyPreset={onApplyTextPreset}
        />
      )}
      {tab === 'transitions' && (
        <EdFxLibrary
          mode="transitions"
          clip={selectedClip}
          onChangeFx={onChangeFx}
        />
      )}
      {tab === 'motion' && motion && (
        <MotionElements pid={project.id} m={motion} format={motionFormat}
          onReloadTimeline={onReloadTimeline} onBack={onMotionBack} />
      )}
      {tab === 'settings' && <EdSettings onExportFps={onExportFps} audioDb={audioDb} onAudioDb={onAudioDb} />}
      <div
        className={tab === 'chat' ? 'ed-mat-list pinned' : 'ed-hidden-panel'}
        aria-hidden={tab !== 'chat'}
      >
        <EdChat project={project} context={aiContext} clips={timelineClips} onReload={onReloadTimeline} onBusy={setChatBusy} onMcpAudit={onMcpAudit} />
      </div>
      </div>

      {imgAddOpen && (
        <ImageAddModal
          projectId={project.id}
          tick={imgTick}
          pendingRef={imgPendingRef}
          onClose={() => setImgAddOpen(false)}
          onSaved={() => onRefresh?.()}
        />
      )}

      {imgPaneMenu && (
        <>
          <div
            className="ed-ctx-backdrop"
            onPointerDown={() => setImgPaneMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setImgPaneMenu(null) }}
          />
          <AnchoredMenu className="ed-ctx-menu" x={imgPaneMenu.x} y={imgPaneMenu.y}>
            <button type="button" onClick={pasteFromSystem}>
              <Icon name="content_paste" size={15} /> Pegar
            </button>
          </AnchoredMenu>
        </>
      )}

      {matMenu && (
        <>
          <div
            className="ed-ctx-backdrop"
            onPointerDown={() => setMatMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setMatMenu(null) }}
          />
          <AnchoredMenu className="ed-ctx-menu" x={matMenu.x} y={matMenu.y}>
            {materialMenuItems({
              saved: matMenu.saved,
              canDelete: canDeleteMaterial(matMenu.item),
              canDownload: canDownloadMaterial(matMenu.item),
            }).map((it) => (
              <button
                key={it.id}
                type="button"
                className={it.danger ? 'danger' : undefined}
                onClick={async () => {
                  const { kind, item } = matMenu
                  setMatMenu(null)
                  if (it.id === 'save') {
                    const resource = kind === 'clips' ? 'clip' : kind === 'images' ? 'image' : 'audio'
                    toggleSave(resource, item)
                    return
                  }
                  if (it.id === 'download') {
                    try {
                      await downloadMaterialFile(item)
                    } catch (err) {
                      setMatToast({ type: 'error', message: err.message || 'No se pudo descargar.' })
                    }
                    return
                  }
                  if (it.id === 'delete') setDeleteTarget({ kind, item })
                }}
              >
                <Icon
                  name={it.id === 'save' ? (matMenu.saved ? 'bookmark' : 'bookmark_border') : (it.id === 'download' ? 'download' : 'delete')}
                  size={15}
                />
                {it.label}
              </button>
            ))}
          </AnchoredMenu>
        </>
      )}

      <Toast toast={matToast} onClose={() => setMatToast(null)} />
      <ConfirmModal
        open={!!deleteTarget}
        title={materialDeleteTitle(deleteTarget?.kind)}
        message={deleteTarget
          ? `¿Estás seguro de que quieres eliminar "${materialLabel(deleteTarget.item)}"? Se borrará también el archivo del disco.`
          : ''}
        confirmText="Eliminar"
        cancelText="Cancelar"
        danger
        onConfirm={confirmDeleteMaterial}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function FavStar({ on, onToggle, title }) {
  return (
    <button
      type="button"
      className={`ed-fav-btn ${on ? 'on' : ''}`}
      title={title || (on ? 'Quitar de favoritos' : 'Favorito')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
    >
      <Icon name={on ? 'star' : 'star_border'} size={15} />
    </button>
  )
}

function SfxCard({ sfx, onAdd, onPlay, di, favOn, onToggleFav, onEdit }) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  const [dur, setDur] = useState(null)
  return (
    <div className="ed-card sfx-rect"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-material', dragPayload('sfx', { ...sfx, duration: dur || 0 })); di?.({ kind: 'audio', duration: dur || 1, name: sfx.name }) }}
      onDragEnd={() => di?.(null)}>
      <audio ref={ref} src={sfx.url} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.target.duration)} />
      <span className="ed-sfx-name" title={sfx.name}>{sfx.name}</span>
      <div className="ed-sfx-row">
        <button className="ed-play-round" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={18} />
        </button>
        <span className="ed-sfx-sub">{sfx.category}{dur != null ? ` · ${fmt(dur)}` : ''}</span>
        <FavStar on={favOn} onToggle={onToggleFav} />
        <button type="button" className="ed-add-btn" title="Editar" onClick={(e) => { e.stopPropagation(); onEdit?.() }}>
          <Icon name="edit" size={14} />
        </button>
        <button className="ed-add-btn" onClick={(e) => { e.stopPropagation(); onAdd() }} title="Agregar al proyecto">
          <Icon name="add" size={15} />
        </button>
      </div>
    </div>
  )
}

function AudioCard({ audio, onAdd, onPlay, di, onMenu, onCopyDesc }) {
  const { ref, playing, toggle, setPlaying } = useToggle(onPlay)
  const hasDesc = !!clipCopyText(audio)
  return (
    <div className="ed-card audio row"
      draggable
      onContextMenu={onMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onMenu(e) } : undefined}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-material', dragPayload('audios', audio)); di?.({ kind: 'audio', duration: audio.duration || 1, name: audio.label || audio.filename }) }}
      onDragEnd={() => di?.(null)}>
      <audio ref={ref} src={audio.url} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <button className="ed-play-round" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'}>
        <Icon name={playing ? 'pause' : 'play_arrow'} size={17} />
      </button>
      <span className="ed-card-name" title={audio.filename}>{audio.label || audio.filename}</span>
      <span className="ed-card-dur">{fmt(audio.duration || 0)}</span>
      {onCopyDesc && (
        <button
          type="button"
          className="ed-add-btn"
          disabled={!hasDesc}
          title={hasDesc ? 'Copiar descripción' : 'Sin descripción'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCopyDesc() }}
        >
          <Icon name="content_copy" size={15} />
        </button>
      )}
      {onMenu && <MaterialMenuBtn className="ed-add-btn" onOpen={onMenu} />}
      <button className="ed-add-btn" onClick={onAdd} title="Agregar al proyecto"><Icon name="add" size={15} /></button>
    </div>
  )
}

function SfxTab({ onAdd, onPlay, di, fav }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState({ available: true, items: [], categories: [], total: 0 })
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editSfx, setEditSfx] = useState(null)

  const refresh = useCallback(async (query, cat, quiet = false) => {
    if (!quiet) setLoading(true)
    try { setData(await listSfx(query, cat)) } catch { /* backend */ } finally { if (!quiet) setLoading(false) }
  }, [])

  useEffect(() => { refresh('', '') }, [refresh])
  useEffect(() => {
    const id = setTimeout(() => refresh(q, category), 250)
    return () => clearTimeout(id)
  }, [q, category, refresh])

  async function chooseFolder() {
    setBusy(true)
    let path = null
    try { path = (await pickFolder()).path } catch { /* manual */ }
    if (!path) path = window.prompt('Pega la ruta de la carpeta de SFX:', '')
    if (path) { try { setData(await setSfxFolder(path)) } catch { /* noop */ } }
    setBusy(false)
  }

  async function toggleSfxFav(id) {
    await fav?.toggleSfx(id)
    await refresh(q, category)
  }

  if (!loading && !data.available) {
    return (
      <div className="ed-sfx">
        <div className="ed-mat-empty">
          <p>No se encontró la biblioteca de sonidos.</p>
          <button className="ghost small" onClick={chooseFolder} disabled={busy}>
            <Icon name="folder_open" size={15} /> {busy ? 'Elige…' : 'Seleccionar carpeta'}
          </button>
        </div>
      </div>
    )
  }

  const cats = data.categories || []
  const hasFavOption = cats.some((c) => c.id === FAV_CAT)

  return (
    <div className="ed-sfx">
      <div className="ed-sfx-search">
        <Icon name="search" size={16} />
        <input placeholder="Buscar (explosion, laugh…)" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="icon-btn" onClick={() => setQ('')}><Icon name="close" size={15} /></button>}
      </div>
      <div className="ed-sfx-cat-row">
        <select className="select mini ed-sfx-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {!hasFavOption && <option value={FAV_CAT}>Favoritos</option>}
          {cats.map((c) => <option key={c.id} value={c.id}>{c.label}{c.count != null ? ` (${c.count})` : ''}</option>)}
        </select>
        <button
          type="button"
          className={`ed-fav-filter ${category === FAV_CAT ? 'on' : ''}`}
          title="Mostrar favoritos"
          onClick={() => setCategory((c) => (c === FAV_CAT ? '' : FAV_CAT))}
        >
          <Icon name={category === FAV_CAT ? 'star' : 'star_border'} size={16} />
        </button>
        <button
          type="button"
          className="ed-sfx-add"
          title="Agregar sonido"
          onClick={() => { setEditSfx(null); setAddOpen(true) }}
        >
          <Icon name="add" size={16} />
        </button>
      </div>

      <div className="ed-mat-grid ed-sfx-grid">
        {loading ? <Empty text="Cargando…" />
          : data.items.length === 0 ? <Empty text="Sin resultados." />
            : data.items.map((s) => (
              <SfxCard
                key={s.id}
                sfx={s}
                onAdd={() => onAdd('sfx', s)}
                onPlay={onPlay}
                di={di}
                favOn={!!fav?.isSfxFav(s.id)}
                onToggleFav={() => toggleSfxFav(s.id)}
                onEdit={() => { setAddOpen(true); setEditSfx(s) }}
              />
            ))}
      </div>
      {!loading && <div className="ed-sfx-count">{data.total} sonidos</div>}
      {(addOpen || editSfx) && (
        <SfxClassifyModal
          categories={cats}
          defaultCategory={pickDefaultSfxCat(cats, category)}
          editSfx={editSfx}
          onClose={() => { setAddOpen(false); setEditSfx(null) }}
          onChanged={() => refresh(q, category, true)}
        />
      )}
    </div>
  )
}
