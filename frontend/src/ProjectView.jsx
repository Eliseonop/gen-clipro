import { useState } from 'react'
import VideoTab from './VideoTab'
import AudioTab from './AudioTab'
import VideoEditor from './VideoEditor'
import Icon from './Icon'
import MaterialEditor from './MaterialEditor'
import JsonEditor from './JsonEditor'
import ConfirmModal from './ConfirmModal'
import Toast from './Toast'
import { pickFolder, setProjectFolder, deleteMaterial } from './api'

export default function ProjectView({ project, onBack, onRefresh }) {
  const [section, setSection] = useState('video')
  const [choosing, setChoosing] = useState(false)
  const [editing, setEditing] = useState(null)   // { kind, item }
  const [showJson, setShowJson] = useState(false)
  const [selClip, setSelClip] = useState(null)    // index del clip seleccionado

  const [deleteTarget, setDeleteTarget] = useState(null) // { kind, item }
  const [toast, setToast] = useState(null)

  function selectClip(index) { setSelClip(index); setSection('video') }

  async function chooseFolder() {
    setChoosing(true)
    let path = null
    try { path = (await pickFolder()).path } catch { /* manual */ }
    if (!path) path = window.prompt('Pega la ruta de la carpeta del proyecto:', project.folder || '')
    setChoosing(false)
    if (!path) return
    try {
      await setProjectFolder(project.id, path)
      await onRefresh()
      setToast({ type: 'success', message: 'Carpeta actualizada correctamente.' })
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Error guardando carpeta.' })
    }
  }

  async function confirmDeleteMaterial() {
    if (!deleteTarget) return
    const { kind, item } = deleteTarget
    const ident = kind === 'clips' ? item.index : item.id
    try {
      await deleteMaterial(project.id, kind, ident)
      await onRefresh()
      setToast({ type: 'success', message: `"${item.filename}" eliminado.` })
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Error al eliminar.' })
    }
    setDeleteTarget(null)
  }

  const clips = project.clips || []
  const audios = project.audios || []
  const selectedClip = clips.find((c) => c.index === selClip) || null
  const isEditor = section === 'editor'

  return (
    <div className={`project-view ${isEditor ? 'editor-mode' : ''}`}>
      <aside className="sidebar">
        <button className="back" onClick={onBack}><Icon name="arrow_back" size={18} /> Proyectos</button>
        <h2 className="side-title">{project.name}</h2>

        <nav className="side-nav">
          <button className={`side-item ${section === 'video' ? 'on' : ''}`} onClick={() => setSection('video')}>
            <span className="si-label"><Icon name="movie" size={18} /> Vídeo</span>
            <span className="pill">{clips.length}</span>
          </button>
          <button className={`side-item ${section === 'audio' ? 'on' : ''}`} onClick={() => setSection('audio')}>
            <span className="si-label"><Icon name="mic" size={18} /> Audio</span>
            <span className="pill">{audios.length}</span>
          </button>
          <button className={`side-item ${section === 'editor' ? 'on' : ''}`} onClick={() => setSection('editor')}>
            <span className="si-label"><Icon name="movie_edit" size={18} /> Editor</span>
          </button>
        </nav>

        <div className="side-store" style={isEditor ? { display: 'none' } : undefined}>
          <div className="side-label">Almacenamiento</div>
          <div className="store-path" title={project.folder || 'Por defecto'}>
            <Icon name="folder" size={16} />
            <span>{project.folder || 'Por defecto'}</span>
          </div>

          <MaterialTree label="video" icon="movie" items={clips} kind="clips"
            activeId={selClip}
            onSelect={(item) => selectClip(item.index)}
            onEdit={(item) => setEditing({ kind: 'clips', item })}
            onDelete={(item) => setDeleteTarget({ kind: 'clips', item })} />
          <MaterialTree label="audio" icon="mic" items={audios} kind="audios"
            onSelect={() => setSection('audio')}
            onEdit={(item) => setEditing({ kind: 'audios', item })}
            onDelete={(item) => setDeleteTarget({ kind: 'audios', item })} />

          <div className="store-buttons">
            <button className="ghost small" onClick={chooseFolder} disabled={choosing}>
              <Icon name="drive_file_move" size={16} /> {choosing ? 'Elige…' : 'Carpeta'}
            </button>
            <button className="ghost small" onClick={() => setShowJson(true)} title="Ver / editar el JSON del proyecto">
              <Icon name="data_object" size={16} /> JSON
            </button>
          </div>
        </div>
      </aside>

      <div className="project-content">
        {section === 'video' && (
          <VideoTab
            project={project}
            onChange={onRefresh}
            selectedClip={selectedClip}
            onSelectClip={selectClip}
            onClearClip={() => setSelClip(null)}
          />
        )}
        {section === 'audio' && <AudioTab project={project} onChange={onRefresh} />}
        {section === 'editor' && <VideoEditor project={project} />}
      </div>

      {editing && (
        <MaterialEditor
          pid={project.id}
          kind={editing.kind}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await onRefresh() }}
        />
      )}

      {showJson && (
        <JsonEditor
          pid={project.id}
          onClose={() => setShowJson(false)}
          onSaved={onRefresh}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="¿Eliminar material?"
        message={deleteTarget ? `¿Estás seguro de que quieres eliminar "${deleteTarget.item.filename}"? Se borrará también el archivo del disco.` : ''}
        confirmText="Eliminar"
        cancelText="Cancelar"
        danger
        onConfirm={confirmDeleteMaterial}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function MaterialTree({ label, icon, items, activeId, onSelect, onEdit, onDelete }) {
  return (
    <div className="mtree">
      <div className="mtree-head"><Icon name={icon} size={14} /> {label}/ <span className="muted">({items.length})</span></div>
      {items.length === 0
        ? <div className="mtree-empty">vacío</div>
        : items.map((it, i) => (
          <div className={`mtree-item ${it.index === activeId ? 'active' : ''}`} key={i}>
            <button className="mt-name" title={it.filename} onClick={() => onSelect?.(it)}>
              {it.label ? <span className="mt-chip">{it.label}</span> : null}
              {it.filename}
            </button>
            <span className="mt-actions">
              <button className="icon-btn" title="Etiquetar" onClick={() => onEdit(it)}><Icon name="sell" size={15} /></button>
              <button className="icon-btn" title="Eliminar" onClick={() => onDelete(it)}><Icon name="delete" size={15} /></button>
            </span>
          </div>
        ))}
    </div>
  )
}
