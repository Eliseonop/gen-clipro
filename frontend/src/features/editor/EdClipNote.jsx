import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { InspSection } from './EdTransform'

const MAX = 200
// Espera antes de pedir la propuesta automática: pasar de clip en clip no dispara
// una llamada por cada uno.
const AUTO_DELAY_MS = 900
// Solo los materiales VISUALES reciben propuesta automática; en un subtítulo el
// propio texto ya dice lo que es.
const AUTO_KINDS = new Set(['video', 'image', 'motion'])

// Propuestas ya pedidas, por fragmento. La clave incluye el recorte: si el clip se
// recorta o se mueve, representa otra cosa y se vuelve a proponer (§8).
const proposals = new Map()
const fragmentKey = (c) => [c.id, c.start, c.in_point, c.out_point].map((v) => String(v ?? '')).join('|')

// "Contexto / Nota" de un material de la timeline (§5-§8).
//
// Un recorte 00:12→00:17 no dice qué representa dentro de la historia. La nota sí,
// y es lo que después lee la IA al generar recursos o diseñar animaciones. La
// escribe el usuario; la IA PROPONE (sola al seleccionar un clip sin nota, o al
// pulsar Proponer) y su propuesta no se guarda hasta que el usuario la acepta.
export default function EdClipNote({ clip, onChange, onSuggest }) {
  const [draft, setDraft] = useState(clip?.note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [, rerender] = useState(0)
  const clipId = clip?.id
  const lastId = useRef(clipId)
  const key = clip ? fragmentKey(clip) : ''
  const wantsAuto = !!(clip && onSuggest && !clip.note && AUTO_KINDS.has(clip.kind))
  const proposal = wantsAuto ? (proposals.get(key) || '') : ''

  // Al cambiar de clip el borrador se reemplaza; mientras es el mismo clip manda
  // lo que el usuario está escribiendo (si no, cada guardado le pisaría el cursor).
  useEffect(() => {
    if (lastId.current === clipId) return
    lastId.current = clipId
    setDraft(clip?.note || '')
    setError('')
  }, [clipId, clip?.note])

  // Propuesta automática del fragmento (§8: IA propone → usuario corrige).
  useEffect(() => {
    if (!wantsAuto || proposals.has(key)) return undefined
    let alive = true
    const timer = setTimeout(async () => {
      try {
        const note = (await onSuggest(clipId)) || ''
        proposals.set(key, note)
        if (alive) rerender((n) => n + 1)
      } catch {
        // Silencioso: la propuesta automática es un extra; el botón Proponer sí avisa.
      }
    }, AUTO_DELAY_MS)
    return () => { alive = false; clearTimeout(timer) }
  }, [wantsAuto, key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!clip) return null

  const dirty = (draft || '') !== (clip.note || '')
  const showProposal = !!proposal && !clip.note && !draft.trim()

  function commit() {
    if (!dirty) return
    onChange?.(draft.trim().slice(0, MAX) || null, 'user')
  }

  function acceptProposal() {
    setDraft(proposal)
    onChange?.(proposal.slice(0, MAX), 'ai')
  }

  function dismissProposal() {
    proposals.set(key, '')
    rerender((n) => n + 1)
  }

  async function suggest() {
    if (!onSuggest) return
    setBusy(true)
    setError('')
    try {
      const note = await onSuggest(clip.id)
      if (note) setDraft(note)
      else setError('La IA no propuso nada para este fragmento.')
    } catch (e) {
      setError(e?.message || 'No se pudo proponer la nota.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <InspSection title="Contexto / Nota">
      <div className="ed-note">
        {showProposal && (
          <div className="ed-note-proposal">
            <span className="ed-note-proposal-h"><Icon name="auto_awesome" size={12} /> Propuesta</span>
            <p>{proposal}</p>
            <div className="ed-note-proposal-actions">
              <button type="button" className="primary small" onClick={acceptProposal}>
                <Icon name="check" size={14} /> Usar
              </button>
              <button type="button" className="ghost small" onClick={() => setDraft(proposal)}
                title="Copiarla abajo para retocarla antes de guardar">
                <Icon name="edit" size={14} /> Editar
              </button>
              <button type="button" className="icon-btn" onClick={dismissProposal} title="Descartar">
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        )}
        <textarea
          className="ed-note-text"
          rows={3}
          maxLength={MAX}
          value={draft}
          placeholder="Qué representa este fragmento: «el científico escribe la ecuación en la pizarra»"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
            if (e.key === 'Escape') { e.preventDefault(); setDraft(clip.note || ''); e.target.blur() }
          }}
        />
        <div className="ed-note-foot">
          <button type="button" className="ghost small" disabled={busy} onClick={suggest}
            title="Que la IA lea el guion de este momento y proponga la nota">
            <span className={busy ? 'gm-spin' : ''}><Icon name="auto_awesome" size={14} /></span>
            {busy ? 'Leyendo…' : 'Proponer'}
          </button>
          {dirty && (
            <button type="button" className="primary small" onClick={commit}>
              <Icon name="check" size={14} /> Guardar
            </button>
          )}
          {!dirty && clip.note_source === 'ai' && (
            <span className="ed-note-tag" title="Propuesta por la IA; edítala si no encaja">
              <Icon name="auto_awesome" size={12} /> IA
            </span>
          )}
          <span className="ed-note-count">{draft.length}/{MAX}</span>
        </div>
        {error && <div className="ed-note-err">{error}</div>}
      </div>
    </InspSection>
  )
}
