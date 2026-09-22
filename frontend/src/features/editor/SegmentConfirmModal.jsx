import { useEffect, useRef } from 'react'
import Icon from '../../components/Icon'
import JobStatusBar from '../../components/JobStatusBar'
import { fmt } from '../../lib/utils'
import { DESC_MODES } from './clipExtract'

// "Crear clip" del Clip Editor: revisar título y descripción del tramo marcado
// (Z/X) y confirmar. Tras Confirmar el mismo modal muestra el progreso hasta que
// el clip está en Mis materiales.
//
// ask = { start, end, title, descMode: 'manual'|'source'|'none', description,
//         sourceDescription, remote, phase: 'edit'|'running'|'error', progress, message, error }
export default function SegmentConfirmModal({ ask, onChange, onConfirm, onCancel }) {
  const titleRef = useRef(null)
  const open = !!ask
  const running = ask?.phase === 'running'

  useEffect(() => {
    if (open && ask.phase === 'edit') {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
    // Solo al abrir: re-enfocar en cada tecla movería el cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  const dur = Math.max(0, ask.end - ask.start)
  const canConfirm = !running && String(ask.title || '').trim().length > 0

  function onKey(e) {
    e.stopPropagation()
    if (e.key === 'Escape' && !running) { e.preventDefault(); onCancel?.() }
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && canConfirm) {
      e.preventDefault()
      onConfirm?.()
    }
  }

  return (
    <div
      className="modal-overlay"
      onPointerDown={(e) => { if (e.target === e.currentTarget && !running) onCancel?.() }}
      onKeyDown={onKey}
    >
      <div className="modal seg-confirm" role="dialog" aria-modal="true" aria-labelledby="seg-confirm-title">
        <div className="modal-head">
          <h3 id="seg-confirm-title"><Icon name="add_to_photos" size={20} /> {ask.simple ? 'Agregar a material' : 'Crear clip'}</h3>
          <button className="icon-btn" onClick={onCancel} disabled={running} title="Cerrar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="seg-confirm-range">
          <span><Icon name="first_page" size={15} /> {fmt(ask.start)}</span>
          <span className="seg-confirm-arrow">→</span>
          <span><Icon name="last_page" size={15} /> {fmt(ask.end)}</span>
          <span className="seg-confirm-dur">{fmt(dur)}</span>
          <span className="seg-confirm-kind" title={ask.remote
            ? 'El vídeo solo está en YouTube: se descarga ese tramo en su formato original.'
            : 'Usa el tramo del vídeo original por referencia: no se renderiza nada.'}>
            {ask.remote ? 'Descarga el tramo' : 'Sin render'}
          </span>
        </div>

        <fieldset className="seg-confirm-body" disabled={running}>
          <label className="seg-field">
            <span>Título</span>
            <input
              ref={titleRef}
              value={ask.title}
              maxLength={160}
              placeholder="Título del clip"
              onChange={(e) => onChange?.({ title: e.target.value })}
            />
          </label>

          <div className="seg-field">
            <span>Descripción</span>
            {!ask.simple && (
              <div className="seg-desc-modes" role="radiogroup" aria-label="Qué descripción usar">
                {DESC_MODES.map((m) => {
                  const disabled = m.id === 'source' && !String(ask.sourceDescription || '').trim()
                  return (
                    <label key={m.id} className={`seg-desc-mode${ask.descMode === m.id ? ' on' : ''}${disabled ? ' off' : ''}`}>
                      <input
                        type="radio"
                        name="seg-desc-mode"
                        checked={ask.descMode === m.id}
                        disabled={disabled}
                        onChange={() => onChange?.({ descMode: m.id })}
                      />
                      {m.label}
                    </label>
                  )
                })}
              </div>
            )}
            {(ask.simple || ask.descMode === 'manual') && (
              <textarea
                rows={3}
                value={ask.description}
                placeholder="¿Qué pasa en este clip?"
                onChange={(e) => onChange?.({ description: e.target.value })}
              />
            )}
            {!ask.simple && ask.descMode === 'source' && (
              <p className="seg-desc-preview">{ask.sourceDescription}</p>
            )}
          </div>
        </fieldset>

        {running && (
          <div className="seg-confirm-progress">
            <JobStatusBar progress={ask.progress} message={ask.message} />
          </div>
        )}
        {ask.phase === 'error' && <div className="error small">⚠️ {ask.error}</div>}

        <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
          <button className="ghost" onClick={onCancel} disabled={running}>Cancelar</button>
          <button className="primary" onClick={onConfirm} disabled={!canConfirm}>
            <Icon name={running ? 'hourglass_top' : 'check'} size={16} />
            {running ? 'Creando…' : ask.phase === 'error' ? 'Reintentar' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
