import { useState, useEffect, useCallback, useRef } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { FAV_CAT } from '../../lib/favorites'
import { analyze, listSfx, setSfxFolder, pickFolder, listLibrary, saveLibraryItem, unsaveLibraryItem, uploadImages, uploadVideo, uploadAudio } from '../../services/api'
import MaterialClipGrid, { dragPayload, useToggle, useExclusiveMedia, Empty, ImageCard } from './MaterialClipGrid'
import SfxClassifyModal from './SfxClassifyModal'
import ClipEditor from '../video/ClipEditor'
import JobStatusBar from '../../components/JobStatusBar'

const YT_ANALYZE_OPTS = { min_score: 0.4, max_clips: 10, max_duration: 60, padding: 10 }

const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)$/i
const VIDEO_FILE_RE = /\.(mp4|mov|mkv|webm|avi|m4v|mpe?g|wmv|flv)$/i
const AUDIO_FILE_RE = /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i

function isImageFile(file) {
  if (!file) return false
  if ((file.type || '').startsWith('image/')) return true
  return IMAGE_FILE_RE.test(file.name || '')
}

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

function hasOsImageDrag(e) {
  const types = [...(e.dataTransfer?.types || [])]
  return types.includes('Files') && !types.includes('application/x-material')
}

function pickDefaultSfxCat(categories, current) {
  const cats = (categories || []).filter((c) => c.id && c.id !== FAV_CAT)
  if (current && cats.some((c) => c.id === current)) return current
  const other = cats.find((c) => c.id === '13_OTHER')
  return (other || cats[0] || {}).id || ''
}

function CargarRecList({ segments, videoId, preview, setPreview, configs, onEdit }) {
  if (!segments.length) {
    return (
      <div className="ed-cargar-empty">
        <Icon name="auto_awesome" size={22} />
        <p>Este vídeo no tiene tramos recomendados.</p>
      </div>
    )
  }
  return (
    <div className="ed-cargar-recs clips-panel-body">
      {segments.map((s) => {
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
      })}
    </div>
  )
}

function ScopeFilter({ value, onChange, includeLoad = false }) {
  return (
    <div className="ed-scope-filter">
      <button type="button" className={`ed-tab ${value === 'all' ? 'on' : ''}`} onClick={() => onChange('all')}>Todos</button>
      <button type="button" className={`ed-tab ${value === 'saved' ? 'on' : ''}`} onClick={() => onChange('saved')}>Guardados</button>
      {includeLoad && (
        <button type="button" className={`ed-tab ${value === 'cargar' ? 'on' : ''}`} onClick={() => onChange('cargar')}>
          <Icon name="add" size={14} /> Cargar
        </button>
      )}
    </div>
  )
}

function SaveMark({ on, onToggle, title }) {
  return (
    <button
      type="button"
      className={`ed-fav-btn ${on ? 'on' : ''}`}
      title={title || (on ? 'Quitar de guardados' : 'Guardar')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
    >
      <Icon name={on ? 'bookmark' : 'bookmark_border'} size={15} />
    </button>
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

export default function EdMaterial({ project, onAdd, onDragInfo, onBack, onOpenVideo, onOpenAudio, onRefresh, fav }) {
  const [tab, setTab] = useState('video')
  const [videoFilter, setVideoFilter] = useState('all')
  const [audioFilter, setAudioFilter] = useState('all')
  const [imageFilter, setImageFilter] = useState('all')
  const [library, setLibrary] = useState({ clips: [], audios: [], images: [] })
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const [fileDrop, setFileDrop] = useState(false)
  const [ytUrl, setYtUrl] = useState('')
  const [ytErr, setYtErr] = useState('')
  const [ytAnalyzing, setYtAnalyzing] = useState(false)
  const [ytElapsed, setYtElapsed] = useState(0)
  const [ytResult, setYtResult] = useState(null)
  const [ytPreview, setYtPreview] = useState(null)
  const [ytEditor, setYtEditor] = useState(null)
  const [ytConfigs, setYtConfigs] = useState({})
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [vidOver, setVidOver] = useState(false)
  const fileRef = useRef(null)
  const ytInputRef = useRef(null)
  const mediaFileRef = useRef(null)
  const dropDepth = useRef(0)
  const vidDropDepth = useRef(0)
  const ytT0 = useRef(0)
  const clips = project.clips || []
  const audios = project.audios || []
  const images = project.images || []
  const onPlayMedia = useExclusiveMedia()
  const di = onDragInfo || (() => {})

  const reloadLibrary = useCallback(() => {
    listLibrary().then(setLibrary).catch(() => {})
  }, [])

  useEffect(() => { reloadLibrary() }, [reloadLibrary, project.id, clips.length, audios.length, images.length])

  async function toggleSave(resourceType, item) {
    setErr('')
    try {
      if (item.scope === 'library' || item.is_saved) {
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
    } catch (e) {
      setErr(e.message)
    }
  }

  const projectClips = withProjectScope(clips, 'clip')
  const projectAudios = withProjectScope(audios, 'audio')
  const projectImages = withProjectScope(images, 'image')
  const shownClips = videoFilter === 'saved' ? (library.clips || []) : [...projectClips, ...(library.clips || [])]
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

  async function ingestFiles(fileList) {
    const files = [...(fileList || [])].filter(isImageFile)
    if (!files.length) {
      setErr('Suelta un PNG, JPG, WebP o GIF.')
      return
    }
    setTab('image')
    setUploading(true)
    setErr('')
    try {
      await uploadImages(project.id, files)
      onRefresh?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setUploading(false)
    }
  }

  function onFileDragEnter(e) {
    if (onCargarPane) return
    if (!hasOsImageDrag(e)) return
    e.preventDefault()
    dropDepth.current += 1
    setFileDrop(true)
  }
  function onFileDragOver(e) {
    if (onCargarPane) return
    if (!hasOsImageDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  function onFileDragLeave(e) {
    if (onCargarPane) return
    if (!hasOsImageDrag(e)) return
    dropDepth.current = Math.max(0, dropDepth.current - 1)
    if (dropDepth.current === 0) setFileDrop(false)
  }
  function onFileDrop(e) {
    if (onCargarPane) return
    if (!hasOsImageDrag(e)) return
    e.preventDefault()
    dropDepth.current = 0
    setFileDrop(false)
    ingestFiles(e.dataTransfer.files)
  }

  async function loadYt() {
    const url = ytUrl.trim()
    if (!url) { setYtErr('Pega el link de un vídeo de YouTube.'); return }
    setYtErr('')
    setYtResult(null)
    setYtPreview(null)
    setYtAnalyzing(true)
    try {
      const res = await analyze({ url, ...YT_ANALYZE_OPTS })
      setYtResult(res)
    } catch (e) {
      setYtErr(e.message || 'No se pudo cargar el vídeo.')
    } finally {
      setYtAnalyzing(false)
    }
  }

  function openYtEditor(s) {
    const url = ytUrl.trim()
    if (!url) { setYtErr('Falta la URL del vídeo original para editar este clip.'); return }
    const key = `seg-${s.index}`
    setYtEditor({
      segStart: s.start,
      segEnd: s.end,
      key,
      segIndex: s.index,
      url,
      initial: ytConfigs[key],
    })
  }

  function closeYtEditor(config) {
    if (ytEditor && config) setYtConfigs((c) => ({ ...c, [ytEditor.key]: config }))
    setYtEditor(null)
  }

  async function importMedia(fileList) {
    const files = [...(fileList || [])]
    const videos = files.filter(isVideoFile)
    const images = files.filter(isImageFile)
    const audios = files.filter(isAudioFile)
    if (!videos.length && !images.length && !audios.length) {
      setImportMsg('')
      setYtErr('Suelta un vídeo, una imagen o un audio.')
      return
    }
    setYtErr('')
    setImportMsg('')
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
      setImportMsg(done.length === 1
        ? `«${done[0]}» está en el material.`
        : `${done.length} archivos añadidos al material.`)
    } catch (e) {
      setYtErr(e.message || 'No se pudo importar el archivo.')
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

  return (
    <div
      className={`ed-material${fileDrop ? ' file-drop' : ''}`}
      onDragEnter={onFileDragEnter}
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onFileDrop}
    >
      <div className="ed-mat-head">
        <div className="ed-mat-title">
          <button className="ed-back" onClick={onBack} type="button" title="Volver a proyectos">
            <Icon name="arrow_back" size={22} />
          </button>
          <span className="ed-mat-label" title={project.name}></span>
        </div>
        <div className="ed-mat-actions">
          <button className="ghost small" onClick={onOpenVideo} type="button">
            <Icon name="add" size={15} /> Cargar video
          </button>
          <button className="ghost small" onClick={() => fileRef.current?.click()} type="button" disabled={uploading}>
            <Icon name="add" size={15} /> {uploading ? 'Subiendo…' : 'Imagen'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.heic"
            multiple
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files || [])]
              e.target.value = ''
              if (!files.length) return
              await ingestFiles(files)
            }}
          />
          <button className="ghost small" onClick={onOpenAudio} type="button">
            <Icon name="add" size={15} /> Audio
          </button>
        </div>
      </div>
      <div className="ed-mat-tabs">
        <button className={`ed-tab ${tab === 'video' ? 'on' : ''}`} onClick={() => setTab('video')}>
          <Icon name="movie" size={15} /> Video <span className="ed-count">{clips.length + (library.clips || []).length}</span>
        </button>
        <button className={`ed-tab ${tab === 'image' ? 'on' : ''}`} onClick={() => setTab('image')}>
          <Icon name="image" size={15} /> Imagen <span className="ed-count">{images.length + (library.images || []).length}</span>
        </button>
        <button className={`ed-tab ${tab === 'audio' ? 'on' : ''}`} onClick={() => setTab('audio')}>
          <Icon name="mic" size={15} /> Audio <span className="ed-count">{audios.length + (library.audios || []).length}</span>
        </button>
        <button className={`ed-tab ${tab === 'sfx' ? 'on' : ''}`} onClick={() => setTab('sfx')}>
          <Icon name="graphic_eq" size={15} /> SFX
        </button>
      </div>
      {err && <div className="ed-mat-err">{err}</div>}

      {tab === 'video' && (
        <div className="ed-mat-list">
          <ScopeFilter value={videoFilter} onChange={setVideoFilter} includeLoad />
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
                <button className="primary small" type="button" onClick={loadYt} disabled={ytAnalyzing || importing}>
                  {ytAnalyzing ? 'Cargando…' : 'Cargar'}
                </button>
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
                    <span>Recomendados ({(ytResult.has_heatmap ? ytResult.segments : []).length})</span>
                  </div>
                  <CargarRecList
                    segments={ytResult.has_heatmap ? (ytResult.segments || []) : []}
                    videoId={ytResult.video?.id}
                    preview={ytPreview}
                    setPreview={setYtPreview}
                    configs={ytConfigs}
                    onEdit={openYtEditor}
                  />
                </>
              )}
            </div>
          ) : (
            <MaterialClipGrid
              clips={shownClips}
              onAdd={(c) => onAdd('clips', c)}
              onPlay={onPlayMedia}
              di={di}
              onToggleSave={(c) => toggleSave('clip', c)}
              emptyText={videoFilter === 'saved' ? 'No hay clips guardados.' : 'Sin clips. Pulsa Cargar video para añadir material.'}
            />
          )}
        </div>
      )}

      {tab === 'image' && (
        <div className="ed-mat-list">
          <ScopeFilter value={imageFilter} onChange={setImageFilter} />
          {shownImages.length === 0
            ? <Empty text={imageFilter === 'saved' ? 'No hay imágenes guardadas.' : 'Sin imágenes. Suelta un archivo aquí o pulsa Imagen.'} />
            : (
              <div className="ed-mat-grid">
                {shownImages.map((im) => (
                  <ImageCard
                    key={`${im.scope}-${im.id}`}
                    image={im}
                    onAdd={() => onAdd('images', im)}
                    di={di}
                    saved={im.scope === 'library' || !!im.is_saved}
                    onToggleSave={() => toggleSave('image', im)}
                  />
                ))}
              </div>
            )}
        </div>
      )}

      {tab === 'audio' && (
        <div className="ed-mat-list">
          <ScopeFilter value={audioFilter} onChange={setAudioFilter} />
          {shownAudios.length === 0
            ? <Empty text={audioFilter === 'saved' ? 'No hay audios guardados.' : 'Sin audios. Pulsa Audio para generar narración.'} />
            : shownAudios.map((a) => (
              <AudioCard
                key={`${a.scope}-${a.id}`}
                audio={a}
                onAdd={() => onAdd('audios', a)}
                onPlay={onPlayMedia}
                di={di}
                saved={a.scope === 'library' || !!a.is_saved}
                onToggleSave={() => toggleSave('audio', a)}
              />
            ))}
        </div>
      )}

      {tab === 'sfx' && <SfxTab onAdd={onAdd} onPlay={onPlayMedia} di={di} fav={fav} />}

      {ytEditor && (
        <ClipEditor
          key={ytEditor.key}
          project={project}
          url={ytEditor.url}
          segStart={ytEditor.segStart}
          segEnd={ytEditor.segEnd}
          segIndex={ytEditor.segIndex}
          initial={ytEditor.initial}
          onClose={closeYtEditor}
          onChange={onRefresh}
        />
      )}
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

function AudioCard({ audio, onAdd, onPlay, di, saved, onToggleSave }) {
  const { ref, playing, toggle, setPlaying } = useToggle(onPlay)
  return (
    <div className="ed-card audio row"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-material', dragPayload('audios', audio)); di?.({ kind: 'audio', duration: audio.duration || 1, name: audio.label || audio.filename }) }}
      onDragEnd={() => di?.(null)}>
      <audio ref={ref} src={audio.url} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <button className="ed-play-round" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'}>
        <Icon name={playing ? 'pause' : 'play_arrow'} size={17} />
      </button>
      <span className="ed-card-name" title={audio.filename}>{audio.label || audio.filename}</span>
      <span className="ed-card-dur">{fmt(audio.duration || 0)}</span>
      <SaveMark on={saved} onToggle={onToggleSave} />
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
