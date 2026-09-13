import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { fmtMoment, withDuration } from '../editor/motionTarget'
import { useGenerateMotion } from './useGenerateMotion'

const SOURCE_LABEL = {
  captions: 'de los subtítulos',
  transcript: 'de la transcripción',
  audio_text_estimate: 'estimado del texto del audio',
  none: 'sin guion con tiempos',
}

const KIND_ICON = { video: 'movie', image: 'image', shape: 'category', motion: 'animation', text: 'title' }

// "Generar Motion" para UN tramo de la timeline. Paso 1: el contexto que
// recibirá la IA (solo ese momento del guion, lo que hay en pantalla y la
// duración). Los pasos de propuesta, generación y preview se montan encima.
export default function GenerateMotionModal({ projectId, target, onChangeTarget, onClose, onPropose }) {
  const { ctx, loading, error, refresh } = useGenerateMotion(projectId, target)
  const [frames, setFrames] = useState(false)
  const [hint, setHint] = useState('')
  const duration = +(target.end - target.start).toFixed(2)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const script = ctx?.scriptContext
  const tl = ctx?.timelineContext
  const elements = (tl?.existingElements || []).slice(0, 6)
  const dupes = tl?.motionInRange || []

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal gm-modal" role="dialog" aria-label="Generar Motion">
        <div className="modal-head">
          <h3><Icon name="auto_awesome" size={20} /> Generar Motion</h3>
          <button className="icon-btn" onClick={onClose} title="Cerrar (Esc)"><Icon name="close" size={18} /></button>
        </div>

        <div className="gm-body">
          <section className="gm-sec">
            <div className="gm-label">Momento</div>
            <div className="gm-moment">
              <span className="gm-tc">{fmtMoment(target.start)} – {fmtMoment(target.end)}</span>
              <label className="gm-dur">
                Duración
                <input
                  type="number" min="0.5" step="0.1" value={duration}
                  onChange={(e) => onChangeTarget?.(withDuration(target, e.target.value))}
                />
                s
              </label>
            </div>
            {!target.explicit && (
              <div className="gm-note">Sin rango marcado: se usan {duration} s desde el cursor. Marca uno con <kbd>I</kbd> / <kbd>O</kbd>.</div>
            )}
          </section>

          <section className="gm-sec">
            <div className="gm-label">
              Guion en este momento
              {script && <em>{SOURCE_LABEL[script.source] || script.source}</em>}
              <button className="icon-btn gm-refresh" onClick={refresh} title="Volver a leer"><Icon name="refresh" size={14} /></button>
            </div>
            {loading && !ctx && <div className="gm-muted">Leyendo el tramo…</div>}
            {error && <div className="gm-error">{error}</div>}
            {script && (
              <p className="gm-script">
                {script.previous && <span className="gm-side">{script.previous} </span>}
                <mark>{script.current || '(nadie habla en este tramo)'}</mark>
                {script.next && <span className="gm-side"> {script.next}</span>}
              </p>
            )}
            {script?.keyTerms?.length > 0 && (
              <div className="gm-chips">{script.keyTerms.map((k) => <span key={k} className="gm-chip">{k}</span>)}</div>
            )}
          </section>

          {tl && (
            <section className="gm-sec">
              <div className="gm-label">En pantalla</div>
              {elements.length === 0 && <div className="gm-muted">Nada visual en este tramo.</div>}
              <ul className="gm-elements">
                {elements.map((el) => (
                  <li key={el.id} className={tl.activeClip?.id === el.id ? 'on' : ''}>
                    <Icon name={KIND_ICON[el.kind] || 'crop_square'} size={14} />
                    <span className="gm-el-name">{el.name || el.kind}</span>
                    <span className="gm-el-tc">{fmtMoment(el.start)}–{fmtMoment(el.end)}</span>
                  </li>
                ))}
              </ul>
              {dupes.length > 0 && (
                <div className="gm-warn">
                  <Icon name="warning" size={14} /> Ya hay {dupes.length === 1 ? 'un motion' : `${dupes.length} motions`} en este tramo ({dupes.map((d) => d.name).join(', ')}).
                </div>
              )}
            </section>
          )}

          <section className="gm-sec">
            <label className="gm-check">
              <input type="checkbox" checked={frames} onChange={(e) => setFrames(e.target.checked)} />
              Incluir 3 fotogramas del vídeo <span className="gm-muted">(solo modelos con visión)</span>
            </label>
            <textarea
              className="gm-hint" rows={2} value={hint} onChange={(e) => setHint(e.target.value)}
              placeholder="Indicación opcional: “un diagrama minimalista”, “resalta la palabra singularidad”…"
            />
          </section>
        </div>

        <div className="modal-actions gm-actions">
          <button className="ghost" onClick={onClose}>Cancelar</button>
          <button
            className="primary"
            disabled={!ctx || loading || !onPropose}
            onClick={() => onPropose?.({ ctx, frames, hint: hint.trim() })}
          >
            <Icon name="lightbulb" size={16} /> Proponer idea
          </button>
        </div>
      </div>
    </div>
  )
}
