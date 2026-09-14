import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { updateLibraryItem, updateMaterial } from '../../services/api'
import { materialIdent } from './materialMenu'

const KIND_LABEL = { clips: 'Vídeo', images: 'Imagen', audios: 'Audio' }

function fmtDur(s) {
  if (!Number.isFinite(s) || s <= 0) return null
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

// Título + descripción de un material (del proyecto o guardado). Es lo que la IA lee
// para saber QUÉ representa cada asset al dirigir escenas.
export default function MaterialInfoModal({ projectId, kind, item, onClose, onSaved }) {
  const [label, setLabel] = useState(item?.label || '')
  const [description, setDescription] = useState(item?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef(null)
  const library = item?.scope === 'library'
  const duration = item?.duration ?? (item?.end != null && item?.start != null ? item.end - item.start : null)

  useEffect(() => { titleRef.current?.focus(); titleRef.current?.select() }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function save() {
    if (saving) return
    setSaving(true)
    setError('')
    const data = { label: label.trim(), description: description.trim() }
    try {
      const saved = library
        ? await updateLibraryItem(item.id, data)
        : await updateMaterial(projectId, kind, materialIdent(kind, item), data)
      onSaved?.(saved)
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal mat-info-modal" role="dialog" aria-label="Información del material">
        <div className="modal-head">
          <h3><Icon name="edit_note" size={20} /> Información del material</h3>
          <button className="icon-btn" onClick={onClose} title="Cerrar (Esc)"><Icon name="close" size={18} /></button>
        </div>

        <div className="mat-info-meta">
          <span className="gm-chip">{KIND_LABEL[kind] || 'Material'}</span>
          <span className="gm-chip">{library ? 'Guardado' : 'Proyecto'}</span>
          {fmtDur(duration) && <span className="gm-chip">{fmtDur(duration)}</span>}
          {item?.width && item?.height && <span className="gm-chip">{item.width}×{item.height}</span>}
          <span className="mat-info-file" title={item?.filename}>{item?.filename}</span>
        </div>

        <div className="gm-field">
          <label htmlFor="mat-info-title">Título</label>
          <input
            id="mat-info-title" ref={titleRef} type="text" value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre corto y reconocible: “Watney en el invernadero”"
          />
        </div>
        <div className="gm-field">
          <label htmlFor="mat-info-desc">Descripción</label>
          <textarea
            id="mat-info-desc" rows={5} value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Qué se ve y qué representa: personajes, acción, plano, ambiente… Es lo que lee la IA para elegir este material."
          />
        </div>
        {item?.description_ai && item.description_ai !== description && (
          <div className="mat-info-ai">
            <span><Icon name="auto_awesome" size={14} /> Descripción de la IA: {item.description_ai}</span>
            <button type="button" className="ghost sc-mini" onClick={() => setDescription(item.description_ai)}>Usar</button>
          </div>
        )}
        {error && <div className="gm-error">{error}</div>}

        <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
          <button className="ghost" onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={saving} onClick={save} title="Ctrl+Enter">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
