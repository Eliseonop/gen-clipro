import { useState, useEffect } from 'react'
import { getManifest, putManifest } from '../services/api'
import Icon from './Icon'

// Modal para ver / editar el JSON del proyecto y guardarlo en su carpeta.
export default function JsonEditor({ pid, onClose, onSaved }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const m = await getManifest(pid)
        setText(JSON.stringify(m, null, 2))
      } catch (e) { setError(e.message) } finally { setLoading(false) }
    })()
  }, [pid])

  async function copy() {
    try { await navigator.clipboard?.writeText(text); setInfo('Copiado al portapapeles.') }
    catch (e) { setError(e.message) }
  }

  async function save() {
    setError(''); setInfo('')
    let parsed
    try { parsed = JSON.parse(text) }
    catch { setError('El JSON no es válido. Revisa comas y llaves.'); return }
    setBusy(true)
    try {
      const r = await putManifest(pid, parsed)
      setText(JSON.stringify({ project: r.project, materials: r.materials }, null, 2))
      setInfo(r.saved_to ? `Guardado en: ${r.saved_to}` : 'Guardado.')
      onSaved?.()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>JSON del proyecto</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <p className="muted">Puedes editarlo a mano. Al guardar se aplica al proyecto y se escribe <code>manifest.json</code> en su carpeta.</p>

        {loading
          ? <div className="empty">Cargando…</div>
          : (
            <textarea
              className="tts-text json-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={18}
            />
          )}

        {error && <div className="error">⚠️ {error}</div>}
        {info && <div className="ok">{info}</div>}

        <div className="modal-actions">
          <button className="ghost small" onClick={copy}><Icon name="content_copy" size={16} /> Copiar</button>
          <div style={{ flex: 1 }} />
          <button className="ghost" onClick={onClose}>Cerrar</button>
          <button className="primary" onClick={save} disabled={busy || loading}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
