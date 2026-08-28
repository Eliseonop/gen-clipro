import { useState } from 'react'
import Icon from './Icon'

// Panel de inicio: proyectos como tarjetas + crear nuevo.
export default function Home({ projects, onOpen, onCreate, onDelete }) {
  const [name, setName] = useState('')

  async function create() {
    const n = name.trim()
    if (!n) return
    const p = await onCreate(n)
    setName('')
    if (p) onOpen(p.id)   // entra directo al proyecto recién creado
  }

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
            <div className="proj-card" key={p.id} onClick={() => onOpen(p.id)}>
              <button
                className="card-x"
                title="Eliminar proyecto"
                onClick={(e) => { e.stopPropagation(); onDelete(p) }}
              ><Icon name="close" size={16} /></button>
              <div className="proj-thumb">
                {p.clips[0]
                  ? <video src={p.clips[0].url} preload="metadata" muted />
                  : <Icon name="movie" size={40} />}
              </div>
              <div className="proj-meta">
                <strong>{p.name}</strong>
                <span className="muted">{p.clips.length} clip(s) · {p.created_at.slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
