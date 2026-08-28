import { useState } from 'react'
import { updateMaterial, autoDescribeClip } from './api'
import Icon from './Icon'

// Modal para etiquetar (label + descripción) un clip o audio.
export default function MaterialEditor({ pid, kind, item, onClose, onSaved }) {
  const ident = kind === 'clips' ? item.index : item.id
  const [label, setLabel] = useState(item.label || '')
  const [description, setDescription] = useState(item.description || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    try {
      await updateMaterial(pid, kind, ident, { label, description })
      onSaved()
    } catch (e) { setErr(e.message || 'Error al guardar.') } finally { setBusy(false) }
  }

  async function auto() {
    setErr('')
    if (kind === 'clips') {
      try { const r = await autoDescribeClip(pid, item.index); setDescription(r.description || '') }
      catch (e) { setErr(e.message || 'Error en auto descripción.') }
    } else {
      setDescription(item.text || '')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Etiquetar {kind === 'clips' ? 'clip' : 'audio'}</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <p className="muted" style={{ wordBreak: 'break-all' }}>{item.filename}</p>

        {err && <div className="error" style={{ marginBottom: 12 }}>⚠️ {err}</div>}

        <label className="field"><span>Etiqueta</span>
          <input className="time-input" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="ej. intro, gancho, cierre…" />
        </label>

        <label className="field" style={{ marginTop: 12 }}>
          <span>Descripción (qué es / qué dice)</span>
          <textarea className="tts-text" rows={4} value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción para la IA…" />
        </label>

        <div className="modal-actions">
          <button className="ghost small" onClick={auto}>
            <Icon name="auto_awesome" size={16} /> {kind === 'clips' ? 'Auto (desde guion)' : 'Auto (texto)'}
          </button>
          <div style={{ flex: 1 }} />
          <button className="ghost" onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
