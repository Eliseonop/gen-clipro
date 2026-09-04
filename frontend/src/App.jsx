import { useState, useEffect } from 'react'
import { listProjects, createProject, deleteProject } from './services/api'
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
  const [openId, setOpenId] = useState(readHash)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Navegar = cambiar el hash; el estado se actualiza vía 'hashchange'.
  function navigate(id) {
    window.location.hash = id ? `#/${id}` : '#/'
  }

  async function refresh() {
    try { setProjects(await listProjects()) } catch { /* backend no listo */ }
  }

  useEffect(() => { refresh() }, [])

  // Sincroniza el estado con la URL (deep-link, atrás/adelante, edición manual).
  useEffect(() => {
    const onHash = () => setOpenId(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  async function onCreate(name) {
    const p = await createProject(name)
    await refresh()
    return p
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
        <Home projects={projects} onOpen={navigate} onCreate={onCreate} onDelete={(p) => setDeleteTarget(p)} />
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
