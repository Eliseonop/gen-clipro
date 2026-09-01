import { useRef } from 'react'
import Icon from '../../components/Icon'
import FlipPopover from '../../components/FlipPopover'
import { fmt } from '../../lib/utils'

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Panel lateral derecho: biblioteca de clips (recomendados por heatmap + guardados).
export default function ClipsLibraryPanel({
  rightTab, setRightTab, heatmapSegments, savedClips, configs, preview, setPreview, videoId,
  activeMenuIndex, setActiveMenuIndex, transcribingIndex, onEditSegment, onEditSavedClip, onTranscribe, onDeleteClip,
}) {
  return (
    <aside className="clips-right-panel">
      <div className="clips-panel-header">
        <div className="clips-panel-title">
          <Icon name="video_library" size={20} />
          <h2>Caja biblioteca</h2>
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
                <p>Pulsa Caja · Cargar para ver los tramos más reproducidos.</p>
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
                            src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(s.start)}&end=${Math.ceil(s.end)}&autoplay=1&rel=0`}
                            title={`Tramo ${s.index}`} allow="autoplay; encrypted-media" allowFullScreen
                          />
                        </div>
                      )}

                      <div className="clip-card-actions">
                        <button className="primary small edit-btn" onClick={() => onEditSegment(s)}>
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
                        <button className="primary small edit-btn" onClick={() => onEditSavedClip(c)}>
                          <Icon name="movie_edit" size={15} /> Editar
                        </button>

                        <ClipOptions
                          clip={c}
                          isMenuOpen={isMenuOpen}
                          transcribingIndex={transcribingIndex}
                          setActiveMenuIndex={setActiveMenuIndex}
                          onTranscribe={onTranscribe}
                          onDeleteClip={onDeleteClip}
                        />
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
  )
}

function ClipOptions({ clip, isMenuOpen, transcribingIndex, setActiveMenuIndex, onTranscribe, onDeleteClip }) {
  const btnRef = useRef(null)
  const close = () => setActiveMenuIndex(null)
  return (
    <div className="options-menu-wrap">
      <button
        ref={btnRef}
        className="ghost small icon-only menu-trigger"
        onClick={() => setActiveMenuIndex(isMenuOpen ? null : clip.index)}
        title="Opciones del clip"
      >
        <Icon name="more_vert" size={18} />
      </button>
      <FlipPopover open={isMenuOpen} anchorRef={btnRef} onClose={close} className="options-dropdown">
        <a className="dropdown-item" href={clip.url} download onClick={close}>
          <Icon name="download" size={15} /> Descargar
        </a>
        <button
          className="dropdown-item"
          onClick={() => onTranscribe(clip)}
          disabled={transcribingIndex === clip.index}
        >
          <Icon name="notes" size={15} />
          {transcribingIndex === clip.index ? 'Transcribiendo…' : 'Transcribir'}
        </button>
        <button
          className="dropdown-item danger"
          onClick={() => onDeleteClip(clip)}
        >
          <Icon name="delete" size={15} /> Eliminar
        </button>
      </FlipPopover>
    </div>
  )
}
