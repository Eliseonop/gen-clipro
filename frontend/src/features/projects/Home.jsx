import { useRef, useState } from 'react'
import Icon from '../../components/Icon'

// Panel de inicio: proyectos como tarjetas + crear nuevo.
export default function Home({ projects, onOpen, onCreate, onDelete, onRename, onDuplicate }) {
  const [name, setName] = useState('')
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState('')
  const [busyId, setBusyId] = useState(null)
  const cancelRef = useRef(false)

  async function create() {
    const n = name.trim()
    if (!n) return
    const p = await onCreate(n)
    setName('')
    if (p) onOpen(p.id)   // entra directo al proyecto recién creado
  }

  function startRename(p) {
    cancelRef.current = false
    setEditId(p.id)
    setDraft(p.name)
  }

  async function commitRename(p) {
    if (cancelRef.current) { cancelRef.current = false; return }   // cancelado con Escape
    const n = draft.trim()
    setEditId(null)
    if (!n || n === p.name) return
    await onRename(p, n)
  }

  async function duplicate(p) {
    setBusyId(p.id)
    try { await onDuplicate(p) } finally { setBusyId(null) }
  }

  const stop = (fn) => (e) => { e.stopPropagation(); fn() }

  return (
    <>
      <section className="card">
        <h3>Nuevo proyecto</h3>
        <div className="row">
          <input
            className="url"
            placeholder="Nombre del proyecto…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="primary" onClick={create}>Crear</button>
        </div>
      </section>

      {projects.length === 0 ? (
        <div className="empty big">
          <p style={{ fontSize: 18 }}>👋 Aún no tienes proyectos</p>
          <p className="muted">Crea uno arriba para empezar a guardar vídeos y audios.</p>
        </div>
      ) : (
        <div className="proj-grid">
          {projects.map((p) => (
            <div
              className="proj-card"
              key={p.id}
              onClick={() => editId !== p.id && onOpen(p.id)}
            >
              <div className="card-actions">
                <button
                  className="card-x"
                  title="Renombrar proyecto"
                  onClick={stop(() => startRename(p))}
                ><Icon name="edit" size={15} /></button>
                <button
                  className="card-x"
                  title="Duplicar proyecto"
                  disabled={busyId === p.id}
                  onClick={stop(() => duplicate(p))}
                ><Icon name={busyId === p.id ? 'hourglass_empty' : 'content_copy'} size={15} /></button>
                <button
                  className="card-x"
                  title="Eliminar proyecto"
                  onClick={stop(() => onDelete(p))}
                ><Icon name="close" size={16} /></button>
              </div>
              <div className="proj-thumb">
                {p.clips[0]
                  ? <video src={p.clips[0].url} preload="metadata" muted />
                  : <Icon name="movie" size={40} />}
              </div>
              <div className="proj-meta">
                {editId === p.id ? (
                  <input
                    className="proj-rename"
                    autoFocus
                    value={draft}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      else if (e.key === 'Escape') { cancelRef.current = true; e.currentTarget.blur(); setEditId(null) }
                    }}
                  />
                ) : (
                  <strong onDoubleClick={stop(() => startRename(p))} title="Doble clic para renombrar">{p.name}</strong>
                )}
                <span className="muted">{p.clips.length} clip(s) · {p.created_at.slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
