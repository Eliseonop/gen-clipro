import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { saveUserTemplate } from '../../services/api'
import { fmtMoment, withDuration } from '../editor/motionTarget'
import MotionCanvas from './MotionCanvas'
import { bestForHint, contextLine, contextStats, dedupe, iconOf, isCustom, TYPE_HINTS } from './resourceModel'
import { useGenerateMotion } from './useGenerateMotion'
import { useGenerateResource } from './useGenerateResource'

// "Generar recurso": modal rápido para sacar un recurso VISUAL del tramo actual.
//
// La IA recibe sola el contexto (guion, materiales, notas, timeline) y propone
// qué conviene dibujar; el usuario pulsa una propuesta y se genera. Escribir la
// instrucción a mano es opcional y va debajo (§4). El wizard largo de Generar
// Escena sigue existiendo para dirigir el guion entero, pero no estorba aquí.
export default function GenerateResourceModal({
  projectId, target, onChangeTarget, onClose, onEditInStudio, onAddToTimeline,
}) {
  const { ctx } = useGenerateMotion(projectId, target)
  const res = useGenerateResource(projectId, target)
  const [step, setStep] = useState('pick')       // pick | preview
  const [hint, setHint] = useState('')
  const [chosen, setChosen] = useState(null)
  const [showContext, setShowContext] = useState(false)
  const [routing, setRouting] = useState(false)   // buscando plantilla para la instrucción escrita
  const routeRef = useRef(0)
  // «Guardar como plantilla» (§16): una composición libre que salió bien pasa a
  // la biblioteca para reutilizarla con otro contenido.
  const [saveForm, setSaveForm] = useState(null)   // { name, bestFor } mientras se rellena
  const [savedTpl, setSavedTpl] = useState('')     // nombre guardado (confirmación)
  const [saveErr, setSaveErr] = useState('')
  const ctrlRef = useRef(null)
  const autoPlayedRef = useRef('')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)

  // En t=0 casi todo recurso está aún sin entrar: el lienzo se ve vacío y parece
  // que ha fallado. Cada borrador nuevo arranca solo, en bucle.
  function onControls(c) {
    ctrlRef.current = c
    const key = res.comp ? `${res.comp.id}:${res.comp.version}` : ''
    if (!c?.ready || !key || autoPlayedRef.current === key) return
    autoPlayedRef.current = key
    c.setLoop(true)
    c.play(0)
    setPlaying(true)
  }

  const duration = +(target.end - target.start).toFixed(2)
  const list = useMemo(() => dedupe(res.suggestions), [res.suggestions])
  const stats = contextStats(ctx)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function handleClose() {
    res.discard()
    onClose?.()
  }

  async function generate(suggestion) {
    if (!suggestion) return
    setChosen(suggestion)
    setSaveForm(null)
    setSavedTpl('')
    setSaveErr('')
    setStep('preview')
    setPlaying(false)
    setTime(0)
    await res.build(suggestion)
  }

  // "Generar mejor propuesta" (§13): la primera de la lista es la que la IA
  // considera más adecuada para el tramo.
  const best = list[0] || null

  // Instrucción escrita (§16): primero se busca la plantilla que encaja con ESA
  // petición y el contexto; solo si la IA dice que ninguna sirve, compone libre.
  // Si la IA no responde, se queda en la lista con lo que sale del guion. No espera
  // al análisis automático: pedir de nuevo cancela el que estuviera en curso.
  async function generateFromHint() {
    const text = hint.trim()
    if (!text) return
    const id = ++routeRef.current
    setRouting(true)
    try {
      const pick = bestForHint(await res.ask(text))
      if (pick && id === routeRef.current) generate(pick)
    } finally {
      if (id === routeRef.current) setRouting(false)
    }
  }

  function askWithHint(extra) {
    const text = [hint.trim(), extra].filter(Boolean).join('. ')
    res.ask(text)
  }

  async function saveAsTemplate() {
    const name = (saveForm?.name || '').trim()
    if (!name || !res.draftId) return
    setSaveErr('')
    try {
      await saveUserTemplate(projectId, { compositionId: res.draftId, name, bestFor: saveForm.bestFor })
      setSavedTpl(name)
      setSaveForm(null)
    } catch (e) {
      setSaveErr(e.message || 'No se pudo guardar la plantilla.')
    }
  }

  function togglePlay() {
    const c = ctrlRef.current
    if (!c) return
    if (playing) { c.pause(); setPlaying(false) } else {
      c.play(time >= (res.comp?.duration || 0) - 0.05 ? 0 : time)
      setPlaying(true)
    }
  }

  function editInStudio() {
    if (!res.draftId) return
    res.keep()
    onEditInStudio?.(res.draftId)
    onClose?.()
  }

  function addToTimeline() {
    if (!res.draftId || !onAddToTimeline) return
    res.keep()
    onAddToTimeline({ draftId: res.draftId, target, comp: res.comp })
    onClose?.()
  }

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal gr-modal" role="dialog" aria-label="Generar recurso">
        <div className="modal-head gr-head">
          <h3><Icon name="auto_awesome" size={19} /> Generar recurso</h3>
          <span className="gm-tc">{fmtMoment(target.start)} – {fmtMoment(target.end)}</span>
          <label className="gm-dur">
            <input
              type="text" inputMode="decimal" value={duration} disabled={step !== 'pick'}
              onChange={(e) => {
                const v = parseFloat(String(e.target.value).replace(',', '.'))
                if (v > 0) onChangeTarget?.(withDuration(target, v))
              }}
            />s
          </label>
          <button className="icon-btn" onClick={handleClose} title="Cerrar (Esc)">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Lo que la IA sabe del tramo: una línea, y el detalle solo si se pide. */}
        <button type="button" className={`gr-ctx ${showContext ? 'open' : ''}`}
          onClick={() => setShowContext((v) => !v)}
          title="Qué contexto recibe la IA">
          <Icon name={showContext ? 'expand_less' : 'expand_more'} size={15} />
          <span className="gr-ctx-line">{contextLine(ctx)}</span>
          <span className="gr-ctx-tags">
            {stats.notes > 0 && <em title="materiales con nota de contexto"><Icon name="sticky_note_2" size={12} /> {stats.notes}</em>}
            {stats.images > 0 && <em title="imágenes del material disponibles"><Icon name="image" size={12} /> {stats.images}</em>}
          </span>
        </button>
        {showContext && <ContextDetail ctx={ctx} />}

        {step === 'pick' && (
          <>
            <div className="gr-body">
              <p className="gr-q">¿Qué recurso visual quieres generar?</p>

              {res.error && <div className="gm-error">{res.error}</div>}
              {res.degraded && <div className="gr-degraded"><Icon name="info" size={14} /> {res.degraded}</div>}

              <ul className="gr-list">
                {list.map((s) => (
                  <li key={s.id || s.label}>
                    <button type="button" className={`gr-card ${isCustom(s) ? 'is-custom' : ''}`}
                      onClick={() => generate(s)}>
                      <span className="gr-card-icon"><Icon name={iconOf(s)} size={20} /></span>
                      <span className="gr-card-txt">
                        <b>{s.label}</b>
                        {s.why && <em>{s.why}</em>}
                      </span>
                      <Icon name="arrow_forward" size={16} />
                    </button>
                  </li>
                ))}
                {res.asking && list.length === 0 && (
                  <li className="gr-loading">
                    <span className="gm-spin"><Icon name="auto_awesome" size={16} /></span>
                    Leyendo el tramo…
                  </li>
                )}
                {!res.asking && list.length === 0 && (
                  <li className="gr-loading">
                    <Icon name="lightbulb" size={16} />
                    Nada claro que proponer aquí: elige un tipo o descríbelo abajo.
                  </li>
                )}
              </ul>
              {res.asking && list.length > 0 && (
                <div className="gr-refining">
                  <span className="gm-spin"><Icon name="auto_awesome" size={14} /></span>
                  {routing ? 'Buscando el recurso que encaja con tu indicación…' : 'Afinando con la IA…'}
                </div>
              )}

              <div className="gr-types">
                {TYPE_HINTS.map((t) => (
                  <button key={t.id} type="button" className="gr-type"
                    onClick={() => askWithHint(t.hint)} title={`Pide a la IA ${t.hint}`}>
                    <Icon name={t.icon} size={14} /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions gr-actions">
              <input
                type="text" className="gr-hint" value={hint} placeholder="O dilo tú: «un diagrama de la gravedad»…"
                onChange={(e) => setHint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || !hint.trim()) return
                  e.preventDefault()
                  generateFromHint()
                }}
              />
              {hint.trim() ? (
                <>
                  <button className="ghost" onClick={() => askWithHint()}
                    title="Que la IA proponga opciones con tu indicación">
                    <Icon name="lightbulb" size={16} /> Proponer
                  </button>
                  <button className="primary" disabled={routing} onClick={generateFromHint}
                    title="Busca la plantilla que mejor encaja con tu indicación y la genera">
                    <Icon name="movie_filter" size={16} /> Generar
                  </button>
                </>
              ) : (
                <button className="primary" disabled={!best} onClick={() => generate(best)}
                  title="Genera la propuesta que la IA considera mejor para este tramo">
                  <Icon name="auto_awesome" size={16} /> Generar mejor propuesta
                </button>
              )}
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="gr-body gr-preview">
              <div className="gr-chosen">
                <Icon name={iconOf(chosen)} size={16} /> <b>{chosen?.label}</b>
                {chosen?.template && <span className="gm-chip">plantilla</span>}
                {isCustom(chosen) && res.draftId && !res.building && !savedTpl && !saveForm && (
                  <button type="button" className="ghost small gr-save-tpl"
                    onClick={() => setSaveForm({ name: chosen?.label || '', bestFor: chosen?.concept || chosen?.why || '' })}
                    title="Guárdala para reutilizarla con otro contenido">
                    <Icon name="bookmark_add" size={14} /> Guardar como plantilla
                  </button>
                )}
                {savedTpl && (
                  <span className="gr-saved"><Icon name="bookmark_added" size={14} /> En «Mis plantillas»</span>
                )}
              </div>
              {saveForm && (
                <div className="gr-save-form">
                  <input type="text" value={saveForm.name} maxLength={48} placeholder="Nombre"
                    onChange={(e) => setSaveForm((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveAsTemplate() }} />
                  <input type="text" value={saveForm.bestFor} maxLength={160}
                    placeholder="Cuándo usarla (lo lee la IA para elegirla)"
                    onChange={(e) => setSaveForm((f) => ({ ...f, bestFor: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveAsTemplate() }} />
                  <button type="button" className="primary small" disabled={!saveForm.name.trim()} onClick={saveAsTemplate}>
                    <Icon name="check" size={14} /> Guardar
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setSaveForm(null)} title="Cancelar">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              )}
              {saveErr && <div className="gm-error">{saveErr}</div>}
              {res.error && <div className="gm-error">{res.error}</div>}
              {res.building && (
                <div className="gm-proposing">
                  <span className="gm-spin"><Icon name="auto_awesome" size={16} /></span>
                  {res.status || 'Montando el recurso…'}
                </div>
              )}
              {res.comp && !res.building && (
                <div className="gm-preview">
                  <div className="gm-preview-canvas gr-canvas">
                    <MotionCanvas
                      projectId={projectId} comp={res.comp}
                      onControls={onControls}
                      onTime={(t) => { setTime(t); setPlaying(!!ctrlRef.current?.isPlaying?.()) }}
                    />
                  </div>
                  <div className="gm-transport">
                    <button className="icon-btn" onClick={togglePlay} title={playing ? 'Pausa' : 'Reproducir'}>
                      <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
                    </button>
                    <input type="range" min="0" max={res.comp.duration || 0} step="0.03" value={time}
                      onChange={(e) => { const t = +e.target.value; setTime(t); ctrlRef.current?.seek(t) }} />
                    <span className="gm-el-tc">{time.toFixed(1)} / {(res.comp.duration || 0).toFixed(1)}s</span>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions gm-actions gr-actions-preview">
              <button className="ghost" disabled={res.building} onClick={() => setStep('pick')}
                title="Volver a las propuestas">
                <Icon name="arrow_back" size={16} /> Opciones
              </button>
              <button className="ghost" disabled={res.building || !chosen} onClick={() => generate(chosen)}
                title="Vuelve a montarlo">
                <Icon name="refresh" size={16} /> Regenerar
              </button>
              <button className="ghost" disabled={!res.draftId || res.building} onClick={editInStudio}>
                <Icon name="tune" size={16} /> Ajustar
              </button>
              <button className="primary" disabled={!res.draftId || res.building || !onAddToTimeline}
                onClick={addToTimeline}>
                <Icon name="add" size={16} /> Agregar al timeline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Detalle del contexto: se abre solo si el usuario lo pide.
function ContextDetail({ ctx }) {
  const on = ctx?.timelineContext?.existingElements || []
  const images = (ctx?.availableAssets || []).filter((a) => a.kind === 'image')
  const sc = ctx?.scriptContext
  if (!ctx) return <div className="gr-ctx-detail gm-muted">Leyendo el tramo…</div>
  return (
    <div className="gr-ctx-detail">
      {sc?.previous && <p className="sd-side">…{sc.previous}</p>}
      {sc?.next && <p className="sd-side">{sc.next}…</p>}
      {on.length > 0 && (
        <ul className="gr-ctx-els">
          {on.slice(0, 6).map((e) => (
            <li key={e.id}>
              <Icon name={e.kind === 'video' ? 'movie' : e.kind === 'image' ? 'image' : 'animation'} size={13} />
              <b>{e.name || e.kind}</b>
              {e.note ? <em>{e.note}</em> : <em className="none">sin nota de contexto</em>}
            </li>
          ))}
        </ul>
      )}
      {images.length > 0 && (
        <div className="gr-ctx-imgs">
          <Icon name="image" size={13} /> {images.slice(0, 6).map((a) => a.label).join(' · ')}
        </div>
      )}
    </div>
  )
}
