import { useState, useEffect } from 'react'
import {
  listProjects, createProject, deleteProject, renameProject, duplicateProject,
  listProjectGroups, createProjectGroup, renameProjectGroup, deleteProjectGroup, moveProjectToGroup,
} from './services/api'
import Home from './features/projects/Home'
import ProjectView from './features/projects/ProjectView'
import ConfirmModal from './components/ConfirmModal'
import './styles/App.css'

// Proyecto abierto <-> URL: leemos el id del hash (#/<id>) para poder
// compartir enlaces directos y que atrás/adelante del navegador funcionen.
function readHash() {
  const id = window.location.hash.replace(/^#\/?/, '').trim()
  return id || null
}

export default function App() {
  const [projects, setProjects] = useState([])
  const [groups, setGroups] = useState([])
  // Carpeta abierta en el inicio (null = raíz). Vive aquí para conservarla al volver de un proyecto.
  const [groupId, setGroupId] = useState(null)
  const [openId, setOpenId] = useState(readHash)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null)

  // Navegar = cambiar el hash; el estado se actualiza vía 'hashchange'.
  function navigate(id) {
    window.location.hash = id ? `#/${id}` : '#/'
  }

  async function refresh() {
    try {
      const [ps, gs] = await Promise.all([listProjects(), listProjectGroups()])
      setProjects(ps)
      setGroups(gs)
    } catch { /* backend no listo */ }
  }

  useEffect(() => { refresh() }, [])

  // Sincroniza el estado con la URL (deep-link, atrás/adelante, edición manual).
  useEffect(() => {
    const onHash = () => setOpenId(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  async function onCreate(name, targetGroupId) {
    const p = await createProject(name, targetGroupId)
    await refresh()
    return p
  }

  async function onCreateGroup(name) {
    const g = await createProjectGroup(name)
    await refresh()
    return g
  }

  async function onRenameGroup(g, name) {
    try { await renameProjectGroup(g.id, name) } catch { /* error silencioso */ }
    await refresh()
  }

  // Arrastrar a una carpeta: se aplica al momento y luego se confirma con el backend.
  async function onMove(pid, targetGroupId) {
    setProjects((ps) => ps.map((p) => (p.id === pid ? { ...p, group_id: targetGroupId } : p)))
    try { await moveProjectToGroup(pid, targetGroupId) } catch { /* se revierte con el refresh */ }
    await refresh()
  }

  async function confirmDeleteGroup() {
    if (!deleteGroupTarget) return
    try {
      await deleteProjectGroup(deleteGroupTarget.id)
      if (groupId === deleteGroupTarget.id) setGroupId(null)
      await refresh()
    } catch { /* error silencioso */ }
    setDeleteGroupTarget(null)
  }

  async function onRename(p, name) {
    try { await renameProject(p.id, name) } catch { /* error silencioso */ }
    await refresh()
  }

  async function onDuplicate(p) {
    try { await duplicateProject(p.id) } catch { /* error silencioso */ }
    await refresh()
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return
    try {
      await deleteProject(deleteTarget.id)
      if (openId === deleteTarget.id) navigate(null)
      await refresh()
    } catch { /* error silencioso */ }
    setDeleteTarget(null)
  }

  const openProject = projects.find((p) => p.id === openId) || null
  const currentGroupId = groups.some((g) => g.id === groupId) ? groupId : null

  return (
    <div className="app">
      {!openProject && (
        <header>
          <h1 className="brand" onClick={() => navigate(null)}>🎬 material</h1>
          <p className="sub">Tu material de vídeo y audio, en un solo sitio</p>
        </header>
      )}

      {openProject ? (
        <ProjectView project={openProject} onBack={() => navigate(null)} onRefresh={refresh} />
      ) : (
        <Home
          projects={projects}
          groups={groups}
          groupId={currentGroupId}
          onOpenGroup={setGroupId}
          onOpen={navigate}
          onCreate={onCreate}
          onDelete={(p) => setDeleteTarget(p)}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onMove={onMove}
          onCreateGroup={onCreateGroup}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={(g) => setDeleteGroupTarget(g)}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="¿Eliminar proyecto?"
        message={deleteTarget ? `¿Estás seguro de que quieres eliminar el proyecto "${deleteTarget.name}"? Los clips en disco no se borrarán.` : ''}
        confirmText="Eliminar"
        cancelText="Cancelar"
        danger
        onConfirm={confirmDeleteProject}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={!!deleteGroupTarget}
        title="¿Eliminar carpeta?"
        message={deleteGroupTarget ? `Se eliminará la carpeta "${deleteGroupTarget.name}". Sus proyectos no se borran: pasan a "Sin carpeta".` : ''}
        confirmText="Eliminar carpeta"
        cancelText="Cancelar"
        danger
        onConfirm={confirmDeleteGroup}
        onCancel={() => setDeleteGroupTarget(null)}
      />
    </div>
  )
}
