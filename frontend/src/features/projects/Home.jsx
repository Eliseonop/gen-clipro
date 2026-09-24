import { useRef, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'

// Tipo propio en dataTransfer: así solo aceptamos arrastres de tarjetas de proyecto.
const DRAG_TYPE = 'application/x-project-id'

// Panel de inicio: barra lateral de carpetas + proyectos como tarjetas + crear nuevo.
// Las carpetas solo organizan la lista (group_id); en la raíz se ve todo lo que no
// está en ninguna carpeta: las propias carpetas y los proyectos sueltos.
export default function Home({
  projects, groups, groupId, onOpenGroup, onOpen, onCreate, onDelete, onRename, onDuplicate,
  onMove, onCreateGroup, onRenameGroup, onDeleteGroup,
}) {
  const [name, setName] = useState('')
  const [pick, setPick] = useState(null)               // { gid, value }: carpeta elegida a mano
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [newGroup, setNewGroup] = useState(null)       // null = sin input; string = borrador
  const [groupEditId, setGroupEditId] = useState(null)
  const [groupDraft, setGroupDraft] = useState('')
  const [dragId, setDragId] = useState(null)
  const [overKey, setOverKey] = useState(null)
  const cancelRef = useRef(false)

  const known = new Set(groups.map((g) => g.id))
  // Un group_id huérfano (carpeta borrada a mano) cuenta como "sin carpeta".
  const groupOf = (p) => (known.has(p.group_id) ? p.group_id : null)
  const counts = {}
  for (const p of projects) {
    const g = groupOf(p) ?? ''
    counts[g] = (counts[g] || 0) + 1
  }
  const current = groups.find((g) => g.id === groupId) || null
  const visible = projects.filter((p) => groupOf(p) === groupId)
  // El selector de carpeta del "Nuevo proyecto" sigue a la carpeta abierta,
  // salvo que se haya elegido otra a mano estando en ella.
  const target = pick && pick.gid === groupId && (!pick.value || known.has(pick.value)) ? pick.value : (groupId ?? '')

  async function create() {
    const n = name.trim()
    if (!n) return
    const g = target || null
    const p = await onCreate(n, g)
    setName('')
    onOpenGroup(g)        // al volver del proyecto se ve dentro de su carpeta
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

  async function commitNewGroup() {
    const n = cancelRef.current ? '' : (newGroup || '').trim()
    cancelRef.current = false
    setNewGroup(null)
    if (n) { try { await onCreateGroup(n) } catch { /* error silencioso */ } }
  }

  function startRenameGroup(g) {
    cancelRef.current = false
    setGroupEditId(g.id)
    setGroupDraft(g.name)
  }

  async function commitRenameGroup(g) {
    if (cancelRef.current) { cancelRef.current = false; return }
    const n = groupDraft.trim()
    setGroupEditId(null)
    if (!n || n === g.name) return
    await onRenameGroup(g, n)
  }

  // --- Arrastrar proyectos a carpetas ---
  function dragStart(e, p) {
    e.dataTransfer.setData(DRAG_TYPE, p.id)
    e.dataTransfer.effectAllowed = 'move'
    // Diferido: tocar el DOM del elemento arrastrado dentro de dragstart cancela el arrastre en Chrome.
    setTimeout(() => setDragId(p.id), 0)
  }

  function dragEnd() {
    setDragId(null)
    setOverKey(null)
  }

  // Props de un destino de soltar: `key` identifica el elemento resaltado y
  // `dest` la carpeta a la que va el proyecto (null = raíz).
  function dropProps(key, dest) {
    return {
      onDragOver: (e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (overKey !== key) setOverKey(key)
      },
      onDragLeave: (e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return
        setOverKey((k) => (k === key ? null : k))
      },
      onDrop: (e) => {
        e.preventDefault()
        const pid = e.dataTransfer.getData(DRAG_TYPE)
        dragEnd()
        const p = projects.find((x) => x.id === pid)
        if (p && groupOf(p) !== dest) onMove(pid, dest)
      },
    }
  }

  const drop = (key) => (overKey === key ? ' drop' : '')
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  const folderOptions = [
    { value: '', label: 'Sin carpeta' },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ]

  return (
    <div className={`home-layout${dragId ? ' dragging' : ''}`}>
      <aside className="home-side">
        <button
          type="button"
          className={`side-item${groupId === null ? ' on' : ''}${drop('side:root')}`}
          title="Inicio · suelta aquí un proyecto para sacarlo de su carpeta"
          onClick={() => onOpenGroup(null)}
          {...dropProps('side:root', null)}
        >
          <Icon name="home" size={18} />
          <span className="side-name">Inicio</span>
          <span className="side-count">{counts[''] || 0}</span>
        </button>

        <div className="side-head">
          <span>Carpetas</span>
          <button
            type="button"
            className="icon-btn"
            title="Nueva carpeta"
            onClick={() => { cancelRef.current = false; setNewGroup('') }}
          ><Icon name="create_new_folder" size={18} /></button>
        </div>

        {newGroup !== null && (
          <input
            className="side-input"
            autoFocus
            placeholder="Nombre de la carpeta…"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            onBlur={commitNewGroup}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') { cancelRef.current = true; e.currentTarget.blur() }
            }}
          />
        )}

        {groups.length === 0 && newGroup === null && (
          <p className="side-empty muted">Crea una carpeta y arrastra proyectos dentro.</p>
        )}

        <ul className="side-list">
          {groups.map((g) => (
            <li key={g.id}>
              <div
                role="button"
                tabIndex={0}
                className={`side-item${groupId === g.id ? ' on' : ''}${drop(`side:${g.id}`)}`}
                onClick={() => groupEditId !== g.id && onOpenGroup(g.id)}
                onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpenGroup(g.id)}
                {...dropProps(`side:${g.id}`, g.id)}
              >
                <Icon name={groupId === g.id ? 'folder_open' : 'folder'} size={18} />
                {groupEditId === g.id ? (
                  <input
                    className="side-input inline"
                    autoFocus
                    value={groupDraft}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setGroupDraft(e.target.value)}
                    onBlur={() => commitRenameGroup(g)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      else if (e.key === 'Escape') { cancelRef.current = true; e.currentTarget.blur(); setGroupEditId(null) }
                    }}
                  />
                ) : (
                  <span className="side-name" onDoubleClick={stop(() => startRenameGroup(g))} title={g.name}>{g.name}</span>
                )}
                <span className="side-count">{counts[g.id] || 0}</span>
                <span className="side-actions">
                  <button type="button" title="Renombrar carpeta" onClick={stop(() => startRenameGroup(g))}>
                    <Icon name="edit" size={14} />
                  </button>
                  <button type="button" title="Eliminar carpeta" onClick={stop(() => onDeleteGroup(g))}>
                    <Icon name="delete" size={14} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <div className="home-main">
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
            {groups.length > 0 && (
              <div className="home-folder-pick">
                <FlipSelect value={target} options={folderOptions} onChange={(value) => setPick({ gid: groupId, value })} title="Carpeta del proyecto" />
              </div>
            )}
            <button className="primary" onClick={create}>Crear</button>
          </div>
        </section>

        {current && (
          <div className="home-crumbs">
            <button
              type="button"
              className={`crumb${drop('crumb:root')}`}
              onClick={() => onOpenGroup(null)}
              {...dropProps('crumb:root', null)}
            ><Icon name="home" size={16} /> Inicio</button>
            <Icon name="chevron_right" size={18} />
            <strong><Icon name="folder_open" size={18} /> {current.name}</strong>
          </div>
        )}

        {projects.length === 0 && groups.length === 0 ? (
          <div className="empty big">
            <p style={{ fontSize: 18 }}>👋 Aún no tienes proyectos</p>
            <p className="muted">Crea uno arriba para empezar a guardar vídeos y audios.</p>
          </div>
        ) : current && visible.length === 0 ? (
          <div className="empty big">
            <p style={{ fontSize: 16 }}>Esta carpeta está vacía</p>
            <p className="muted">Crea un proyecto con esta carpeta elegida, o vuelve a Inicio y arrastra proyectos a «{current.name}» en la barra lateral.</p>
          </div>
        ) : (
          <div className="proj-grid">
            {!current && groups.map((g) => (
              <div
                className={`proj-card folder-card${drop(`card:${g.id}`)}`}
                key={`g-${g.id}`}
                title="Abrir carpeta · suelta aquí un proyecto para moverlo"
                onClick={() => onOpenGroup(g.id)}
                {...dropProps(`card:${g.id}`, g.id)}
              >
                <div className="proj-thumb folder-thumb">
                  <Icon name={overKey === `card:${g.id}` ? 'folder_open' : 'folder'} size={56} />
                </div>
                <div className="proj-meta">
                  <strong>{g.name}</strong>
                  <span className="muted">{counts[g.id] || 0} proyecto(s)</span>
                </div>
              </div>
            ))}
            {visible.map((p) => (
              <div
                className={`proj-card${dragId === p.id ? ' is-dragging' : ''}`}
                key={p.id}
                draggable={editId !== p.id}
                onDragStart={(e) => dragStart(e, p)}
                onDragEnd={dragEnd}
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
                    ? <video src={p.clips[0].url} preload="metadata" muted draggable={false} />
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
      </div>
    </div>
  )
}
