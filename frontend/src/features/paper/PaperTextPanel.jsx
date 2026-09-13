// Sección "Texto" del panel izquierdo de Paper Animator.
//
// Aquí solo se decide QUÉ letras forman el texto y cómo se reparte en elementos
// (letras, grupos o frase). El CÓMO se anima cada elemento es el panel derecho
// de siempre: seleccionar una letra aquí o en el lienzo la pone en el inspector
// igual que la imagen.

import { useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import { letterUrl } from '../../services/api'
import { TEXT_ASSIGN, TEXT_MODES, candidatesFor, elementAt, indexLibrary } from './paperText.js'

function Chips({ value, options, onChange, disabled }) {
  return (
    <div className="ed-fx-chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ed-fx-chip ${value === o.value ? 'on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function PaperTextPanel({ paper, onGoPaper }) {
  const {
    raw, letters, loadLetters, select, setTextContent, setTextAssign, rerollText,
    setTextMode, groupLetters, ungroup, changeLetter, clearText,
  } = paper
  const text = raw.text
  // Letras marcadas con Ctrl/Shift+clic para agrupar. Es estado de la UI, no de
  // la composición: no entra en el historial.
  const [marked, setMarked] = useState([])
  const index = useMemo(() => indexLibrary(letters), [letters])

  const ready = !!letters?.available
  const styles = letters?.styles || []
  const selectedEl = text.elements.find((e) => e.id === raw.selected) || null
  const markedEls = new Set(marked.map((i) => elementAt(text.elements, i)?.id).filter(Boolean))
  const canGroup = text.mode === 'letters' && markedEls.size >= 2
  const isGroup = selectedEl && text.glyphs.slice(selectedEl.from, selectedEl.to + 1).filter((g) => g.file).length > 1
  const single = selectedEl && selectedEl.from === selectedEl.to ? text.glyphs[selectedEl.from] : null
  const missing = text.glyphs.filter((g) => g.missing).map((g) => g.ch)

  function clickLetter(e, i) {
    const el = elementAt(text.elements, i)
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      setMarked((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))
    } else {
      setMarked([i])
    }
    if (el) { onGoPaper?.(); select(el.id) }
  }

  function doGroup() {
    groupLetters(marked)
    setMarked([])
  }

  if (!letters) {
    return (
      <>
        <div className="motion-panel-title">Paper · Texto</div>
        <div className="ed-bg-status run"><Icon name="progress_activity" size={14} /><span>Cargando letras…</span></div>
      </>
    )
  }

  if (!ready) {
    return (
      <>
        <div className="motion-panel-title">Paper · Texto</div>
        <p className="motion-start-hint">
          {letters.error || 'No hay letras disponibles.'} Coloca los PNG de letras
          (con su <b>catalog.json</b>) en <b>assets/alfnum</b> y vuelve a cargar.
        </p>
        <div className="paper-actions">
          <button type="button" className="ed-btn" onClick={loadLetters}>
            <Icon name="refresh" size={14} /> Volver a cargar
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="motion-panel-title">Paper · Texto</div>
      <textarea
        className="paper-text-input"
        rows={2}
        value={text.content}
        placeholder="HELLO WORLD"
        spellCheck={false}
        onChange={(e) => { onGoPaper?.(); setTextContent(e.target.value) }}
      />

      <div className="paper-text-row">
        <span className="paper-text-lab">Letras</span>
        <Chips value={text.assign} options={TEXT_ASSIGN} onChange={(v) => setTextAssign({ assign: v })} />
      </div>
      <div className="paper-text-row">
        {text.assign === 'style' ? (
          <FlipSelect
            value={text.style || styles[0]}
            options={styles.map((s) => ({ value: s, label: s }))}
            onChange={(v) => setTextAssign({ style: v })}
          />
        ) : (
          <span className="paper-text-hint">Cada letra de un estilo al azar (reproducible).</span>
        )}
        <button type="button" className="ed-btn" onClick={rerollText} disabled={!text.glyphs.length}
          title="Vuelve a sortear las variantes (y los estilos, en aleatorio)">
          <Icon name="casino" size={14} /> Variar
        </button>
      </div>

      <div className="paper-text-row">
        <span className="paper-text-lab">Composición</span>
        <Chips value={text.mode} options={TEXT_MODES} onChange={setTextMode} disabled={!text.glyphs.length} />
      </div>

      {text.glyphs.length > 0 && (
        <div className="paper-letters" role="listbox" aria-label="Letras del texto">
          {text.glyphs.map((g, i) => {
            const key = `${i}-${g.ch}`
            if (g.br) return <span key={key} className="paper-letter-br" />
            if (g.space) return <span key={key} className="paper-letter-space" />
            if (g.missing) {
              return (
                <span key={key} className="paper-letter missing" title={`“${g.ch}” no tiene letra en la biblioteca: se deja el hueco`}>
                  {g.ch}
                </span>
              )
            }
            const el = elementAt(text.elements, i)
            const grouped = el && el.from !== el.to
            const cls = [
              'paper-letter',
              el && el.id === raw.selected ? 'on' : '',
              marked.includes(i) ? 'marked' : '',
              grouped ? 'grp' : '',
              grouped && i === el.from ? 'grp-start' : '',
              grouped && i === el.to ? 'grp-end' : '',
            ].filter(Boolean).join(' ')
            return (
              <button key={key} type="button" className={cls} onClick={(e) => clickLetter(e, i)}
                title={`${g.ch} · ${g.style}${grouped ? ' (grupo)' : ''}`}>
                <img src={letterUrl(g.file)} alt={g.ch} draggable={false} />
              </button>
            )
          })}
        </div>
      )}

      {missing.length > 0 && (
        <p className="ed-key-hint">
          Sin letra en la biblioteca: <b>{[...new Set(missing)].join(' ')}</b> — se conserva el hueco.
        </p>
      )}

      {text.mode === 'letters' && text.elements.length > 0 && (
        <div className="paper-actions">
          <button type="button" className="ed-btn" onClick={doGroup} disabled={!canGroup}
            title="Ctrl+clic en varias letras y agrúpalas: se animan como una sola pieza">
            <Icon name="link" size={14} /> Agrupar
          </button>
          <button type="button" className="ed-btn" onClick={() => ungroup(selectedEl.id)} disabled={!isGroup}>
            <Icon name="link_off" size={14} /> Desagrupar
          </button>
        </div>
      )}

      {single?.file && (
        <div className="paper-letter-detail">
          <span className="paper-text-lab">“{single.ch}”</span>
          <button type="button" className="ed-btn" title="Variante anterior"
            onClick={() => changeLetter(selectedEl.from, { dir: -1 })}>
            <Icon name="chevron_left" size={14} />
          </button>
          <button type="button" className="ed-btn" title="Variante siguiente"
            onClick={() => changeLetter(selectedEl.from, { dir: 1 })}>
            <Icon name="chevron_right" size={14} />
          </button>
          <FlipSelect
            value={single.style}
            options={[...new Set(candidatesFor(index, single.ch).map((c) => c.style))].map((s) => ({ value: s, label: s }))}
            onChange={(v) => changeLetter(selectedEl.from, { style: v })}
          />
        </div>
      )}

      {text.elements.length > 0 && (
        <>
          <p className="ed-key-hint">
            {text.mode === 'phrase'
              ? 'La frase se anima como una sola imagen. Sus propiedades están en el panel derecho.'
              : 'Cada letra (o grupo) es un objeto con sus propias propiedades y animación: selecciónalo aquí o en el lienzo. Ctrl+clic marca varias.'}
          </p>
          <div className="paper-actions">
            <button type="button" className="ed-btn danger" onClick={() => { setMarked([]); clearText() }}>
              <Icon name="close" size={14} /> Quitar texto
            </button>
          </div>
        </>
      )}
    </>
  )
}
