import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { pasteableGroups } from '../../lib/clipAttrs'

// «Pegar atributos» (#13, Ctrl+Alt+V): elige QUÉ grupos del clip copiado se
// pegan en los clips seleccionados. Recuerda (en este navegador) los grupos que
// se desmarcaron la última vez.
const OFF_KEY = 'ed.pasteAttrs.off'

function readOff() {
  try {
    const v = JSON.parse(localStorage.getItem(OFF_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function writeOff(ids) {
  try { localStorage.setItem(OFF_KEY, JSON.stringify(ids)) } catch { /* noop */ }
}

const KIND_LABEL = { video: 'vídeo', image: 'imagen', text: 'texto', shape: 'figura', audio: 'audio' }

export default function EdPasteAttrs({ source, targets, onPaste, onCancel }) {
  const groups = useMemo(() => pasteableGroups(source, targets), [source, targets])
  const [on, setOn] = useState(() => {
    const off = new Set(readOff())
    return new Set(groups.map((g) => g.id).filter((id) => !off.has(id)))
  })
  const okRef = useRef(null)
  useEffect(() => { okRef.current?.focus() }, [])

  const picked = groups.filter((g) => on.has(g.id)).map((g) => g.id)
  const n = groups[0]?.total || 0

  function toggle(id) {
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirm() {
    if (!picked.length) return
    const off = new Set(readOff())
    for (const g of groups) {
      if (on.has(g.id)) off.delete(g.id)
      else off.add(g.id)
    }
    writeOff([...off])
    onPaste?.(picked)
  }

  function onKey(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
    if (e.key === 'Enter' && e.target.type !== 'checkbox') { e.preventDefault(); confirm() }
  }

  return (
    <div
      className="modal-overlay"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
      onKeyDown={onKey}
    >
      <div className="modal ed-paste-attrs" role="dialog" aria-modal="true" aria-labelledby="ed-paste-attrs-title">
        <div className="modal-head">
          <h3 id="ed-paste-attrs-title"><Icon name="content_paste" size={20} /> Pegar atributos</h3>
          <button className="icon-btn" onClick={onCancel} title="Cerrar">
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="ed-paste-attrs-from">
          De <b>{source?.name || KIND_LABEL[source?.kind] || 'clip'}</b> ({KIND_LABEL[source?.kind] || source?.kind})
          {' → '}{n === 1 ? '1 clip' : `${n} clips`}
        </p>
        <div className="ed-paste-attrs-bulk">
          <button type="button" className="ghost small" onClick={() => setOn(new Set(groups.map((g) => g.id)))}>Todo</button>
          <button type="button" className="ghost small" onClick={() => setOn(new Set())}>Nada</button>
        </div>
        <div className="ed-paste-attrs-list">
          {groups.map((g) => (
            <label key={g.id} className={on.has(g.id) ? 'on' : ''}>
              <input type="checkbox" checked={on.has(g.id)} onChange={() => toggle(g.id)} />
              <Icon name={g.icon} size={16} />
              <span>{g.label}</span>
              {g.count < g.total && <em title="Los demás clips no admiten este atributo">{g.count} de {g.total}</em>}
            </label>
          ))}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button ref={okRef} className="primary" onClick={confirm} disabled={!picked.length}>
            <Icon name="check" size={16} /> Pegar
          </button>
        </div>
      </div>
    </div>
  )
}
