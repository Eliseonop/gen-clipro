import { useState, useEffect } from 'react'
import { listProjects, createProject, deleteProject } from './api'
import Home from './Home'
import ProjectView from './ProjectView'
import ConfirmModal from './ConfirmModal'
import './App.css'

export default function App() {
  const [projects, setProjects] = useState([])
  const [openId, setOpenId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function refresh() {
    try { setProjects(await listProjects()) } catch { /* backend no listo */ }
  }

  useEffect(() => { refresh() }, [])

  async function onCreate(name) {
    const p = await createProject(name)
    await refresh()
    return p
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return
    try {
      await deleteProject(deleteTarget.id)
      if (openId === deleteTarget.id) setOpenId(null)
      await refresh()
    } catch { /* error silencioso */ }
    setDeleteTarget(null)
  }

  const openProject = projects.find((p) => p.id === openId) || null

  return (
    <div className="app">
      {!openProject && (
        <header>
          <h1 className="brand" onClick={() => setOpenId(null)}>🎬 material</h1>
          <p className="sub">Tu material de vídeo y audio, en un solo sitio</p>
        </header>
      )}

      {openProject ? (
        <ProjectView project={openProject} onBack={() => setOpenId(null)} onRefresh={refresh} />
      ) : (
        <Home projects={projects} onOpen={setOpenId} onCreate={onCreate} onDelete={(p) => setDeleteTarget(p)} />
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
    </div>
  )
}
