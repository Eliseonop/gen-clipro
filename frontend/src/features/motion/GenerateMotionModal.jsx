import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { fmtMoment, withDuration } from '../editor/motionTarget'
import MotionCanvas from './MotionCanvas'
import { useGenerateMotion, useMotionDraft, useMotionProposal } from './useGenerateMotion'

const SOURCE_LABEL = {
  captions: 'de los subtítulos',
  transcript: 'de la transcripción',
  audio_text_estimate: 'estimado del texto del audio',
  none: 'sin guion con tiempos',
}

const KIND_ICON = { video: 'movie', image: 'image', shape: 'category', motion: 'animation', text: 'title' }

const TYPE_LABEL = {
  title: 'Título', lower_third: 'Lower third', callout: 'Resalte', diagram: 'Diagrama',
  list: 'Lista', quote: 'Cita', stat: 'Dato', motion: 'Motion',
}

// "Generar Motion" para UN tramo de la timeline.
//  · Paso 1 (context): el contexto que recibirá la IA (guion, en pantalla, duración).
//  · Paso 2 (proposal): la idea que propone la IA, con concepto y duración editables.
//  · Paso 3 (preview): el borrador generado, con preview + transporte, antes de insertar.
export default function GenerateMotionModal({
  projectId, target, onChangeTarget, onClose, onEditInStudio, onAddToTimeline,
}) {
  const { ctx, loading, error, refresh } = useGenerateMotion(projectId, target)
  const { proposing, proposal, error: propError, propose, reset, patchProposal } = useMotionProposal(projectId, target)
  const draft = useMotionDraft(projectId, target)
  const [frames, setFrames] = useState(false)
  const [hint, setHint] = useState('')
  const [step, setStep] = useState('context')
  const ctrlRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const duration = +(target.end - target.start).toFixed(2)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const script = ctx?.scriptContext
  const tl = ctx?.timelineContext
  const elements = (tl?.existingElements || []).slice(0, 6)
  const dupes = tl?.motionInRange || []

  function handleClose() {
    draft.discard()   // borra el borrador si no se conservó (insertar / editar en Studio)
    onClose?.()
  }

  function startPropose() {
    setStep('proposal')
    propose({ frames, hint: hint.trim() })
  }

  function backToContext() {
    reset()
    setStep('context')
  }

  function startGenerate() {
    setStep('preview')
    setPlaying(false)
    setTime(0)
    draft.generate(proposal)
  }

  function togglePlay() {
    const c = ctrlRef.current
    if (!c) return
    if (playing) { c.pause(); setPlaying(false) }
    else { c.play(time >= (draft.comp?.duration || 0) - 0.05 ? 0 : time); setPlaying(true) }
  }

  function scrub(t) {
    setTime(t)
    ctrlRef.current?.seek(t)
  }

  function editInStudio() {
    if (!draft.draftId) return
    draft.keep()
    onEditInStudio?.(draft.draftId)
    onClose?.()
  }

  function addToTimeline() {
    if (!draft.draftId || !onAddToTimeline) return
    draft.keep()
    onAddToTimeline({ draftId: draft.draftId, target, proposal, comp: draft.comp })
    onClose?.()
  }

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal gm-modal" role="dialog" aria-label="Generar Motion">
        <div className="modal-head">
          <h3><Icon name="auto_awesome" size={20} /> Generar Motion</h3>
          <button className="icon-btn" onClick={handleClose} title="Cerrar (Esc)"><Icon name="close" size={18} /></button>
        </div>

        {step === 'context' && (
          <>
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
                  Incluir fotogramas del vídeo <span className="gm-muted">(solo modelos con visión)</span>
                </label>
                <textarea
                  className="gm-hint" rows={2} value={hint} onChange={(e) => setHint(e.target.value)}
                  placeholder="Indicación opcional: “un diagrama minimalista”, “resalta la palabra singularidad”…"
                />
              </section>
            </div>

            <div className="modal-actions gm-actions">
              <button className="ghost" onClick={handleClose}>Cancelar</button>
              <button className="primary" disabled={!ctx || loading} onClick={startPropose}>
                <Icon name="lightbulb" size={16} /> Proponer idea
              </button>
            </div>
          </>
        )}

        {step === 'proposal' && (
          <>
            <div className="gm-body">
              <section className="gm-sec">
                <div className="gm-label">
                  Idea propuesta
                  <em>{fmtMoment(target.start)} – {fmtMoment(target.end)}</em>
                </div>

                {proposing && !proposal && (
                  <div className="gm-proposing">
                    <Icon name="auto_awesome" size={16} className="gm-spin" /> Pensando una idea…
                  </div>
                )}
                {propError && <div className="gm-error">{propError}</div>}

                {proposal && (
                  <div className="gm-card">
                    <div className="gm-card-head">
                      <span className="gm-type">{TYPE_LABEL[proposal.type] || proposal.type}</span>
                      <label className="gm-dur">
                        Duración
                        <input
                          type="number" min="0.5" step="0.1" value={proposal.duration}
                          onChange={(e) => patchProposal({ duration: +e.target.value })}
                        />
                        s
                      </label>
                      {proposal.background === 'opaque' && <span className="gm-bg-tag">fondo opaco</span>}
                    </div>
                    <div className="gm-field">
                      <label>Título</label>
                      <input type="text" value={proposal.title} onChange={(e) => patchProposal({ title: e.target.value })} />
                    </div>
                    <div className="gm-field">
                      <label>Concepto</label>
                      <textarea rows={3} value={proposal.concept} onChange={(e) => patchProposal({ concept: e.target.value })} />
                    </div>
                    {proposal.elements?.length > 0 && (
                      <div className="gm-field">
                        <label>Elementos</label>
                        <ul className="gm-el-list">
                          {proposal.elements.map((el, i) => (
                            <li key={i}>{typeof el === 'string' ? el : (el.name || el.content || JSON.stringify(el))}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="modal-actions gm-actions">
              <button className="ghost" onClick={backToContext} disabled={proposing}>
                <Icon name="arrow_back" size={16} /> Atrás
              </button>
              <button className="ghost" disabled={proposing} onClick={() => propose({ frames, hint: hint.trim() })}>
                <Icon name="refresh" size={16} /> Otra idea
              </button>
              <button className="primary" disabled={!proposal || proposing} onClick={startGenerate}>
                <Icon name="movie_filter" size={16} /> Generar
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="gm-body">
              <section className="gm-sec">
                <div className="gm-label">
                  Vista previa
                  <em>{proposal?.title}</em>
                </div>

                {draft.error && <div className="gm-error">{draft.error}</div>}

                {!draft.comp && draft.generating && (
                  <div className="gm-proposing">
                    <Icon name="movie_filter" size={16} className="gm-spin" /> {draft.status || 'Generando la composición…'}
                  </div>
                )}

                {draft.comp && (
                  <div className="gm-preview">
                    <div className="gm-preview-canvas">
                      <MotionCanvas
                        projectId={projectId}
                        comp={draft.comp}
                        onControls={(c) => { ctrlRef.current = c }}
                        onTime={(t) => { setTime(t); setPlaying(!!ctrlRef.current?.isPlaying?.()) }}
                      />
                    </div>
                    <div className="gm-transport">
                      <button className="icon-btn" onClick={togglePlay} title={playing ? 'Pausa' : 'Reproducir'}>
                        <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
                      </button>
                      <input
                        type="range" min="0" max={draft.comp.duration || 0} step="0.03" value={time}
                        onChange={(e) => scrub(+e.target.value)}
                      />
                      <span className="gm-el-tc">{time.toFixed(1)} / {(draft.comp.duration || 0).toFixed(1)}s</span>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="modal-actions gm-actions gm-actions-preview">
              <button className="ghost" onClick={() => setStep('proposal')} disabled={draft.generating}>
                <Icon name="arrow_back" size={16} /> Atrás
              </button>
              <button className="ghost" disabled={draft.generating} onClick={() => draft.generate(proposal)} title="Vuelve a generar sobre el mismo borrador">
                <Icon name="refresh" size={16} /> Regenerar
              </button>
              <button className="ghost" disabled={!draft.draftId || draft.generating} onClick={editInStudio}>
                <Icon name="tune" size={16} /> Editar en Motion Studio
              </button>
              <button
                className="primary"
                disabled={!draft.draftId || draft.generating || !onAddToTimeline}
                title={onAddToTimeline ? '' : 'La inserción llega en la siguiente fase'}
                onClick={addToTimeline}
              >
                <Icon name="add" size={16} /> Agregar al timeline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
