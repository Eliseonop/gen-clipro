import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listMotionTemplates, createMotion, getMotion, updateMotion,
  addMotionToTimeline, getJob,
} from '../../services/api'
import { newTextLayer, updateLayer, removeLayer, moveLayer, clampComposition } from './motionModel'

// Estado de la composición de Motion, compartido por los paneles del editor
// (Elementos en EdMaterial, preview en el canvas central, Propiedades en EdInspector,
// capas como clips en EdTimeline). Autosave con debounce.
export function useMotionComp(pid, { onReloadTimeline } = {}) {
  const [comp, setComp] = useState(null)
  const [selLayerId, setSelLayerId] = useState(null)
  const [templates, setTemplates] = useState([])
  const [addJob, setAddJob] = useState(null)
  const [error, setError] = useState('')
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (pid) listMotionTemplates(pid).then((r) => setTemplates(r.templates || [])).catch(() => {})
  }, [pid])

  // Autosave (debounce) — persiste para render y para que preview.html refleje el estado.
  useEffect(() => {
    if (!comp?.id || !dirtyRef.current) return
    const t = setTimeout(() => {
      updateMotion(pid, comp.id, comp).catch((e) => setError(e.message))
      dirtyRef.current = false
    }, 600)
    return () => clearTimeout(t)
  }, [comp, pid])

  const loadComp = useCallback(async (cid) => {
    if (!cid) return null
    try {
      const c = await getMotion(pid, cid)
      dirtyRef.current = false
      setComp(c)
      setSelLayerId(c.layers?.[0]?.id || null)
      setError('')
      return c
    } catch (e) { setError(e.message); return null }
  }, [pid])

  const edit = useCallback((next) => { dirtyRef.current = true; setComp(next) }, [])
  const editLayer = useCallback((id, patch) => {
    setComp((c) => { if (!c) return c; dirtyRef.current = true; return updateLayer(c, id, patch) })
  }, [])
  const moveLayerBy = useCallback((id, dx, dy) => {
    setComp((c) => { if (!c) return c; dirtyRef.current = true; return moveLayer(c, id, dx, dy) })
  }, [])
  const addLayer = useCallback((factory) => {
    setComp((c) => {
      if (!c) return c
      const layer = factory(c)
      dirtyRef.current = true
      setSelLayerId(layer.id)
      return { ...c, layers: [...(c.layers || []), layer] }
    })
  }, [])
  const deleteLayer = useCallback((id) => {
    setComp((c) => { if (!c) return c; dirtyRef.current = true; return removeLayer(c, id) })
    setSelLayerId((sel) => (sel === id ? null : sel))
  }, [])
  const setName = useCallback((name) => {
    setComp((c) => { if (!c) return c; dirtyRef.current = true; return { ...c, name } })
  }, [])
  const setDuration = useCallback((d) => {
    setComp((c) => { if (!c) return c; dirtyRef.current = true; return clampComposition({ ...c, duration: Number(d) }) })
  }, [])

  const createBlank = useCallback(async (format = {}) => {
    try {
      const c = await createMotion(pid, { width: format.width, height: format.height, fps: format.fps })
      c.layers = [newTextLayer(c, { content: 'TÍTULO' })]
      dirtyRef.current = true
      setComp(c)
      setSelLayerId(c.layers[0].id)
      return c
    } catch (e) { setError(e.message); return null }
  }, [pid])

  const createFromTemplate = useCallback(async (key) => {
    try {
      const c = await createMotion(pid, { template: key })
      dirtyRef.current = false
      setComp(c)
      setSelLayerId(c.layers?.[0]?.id || null)
      return c
    } catch (e) { setError(e.message); return null }
  }, [pid])

  // Sincroniza SOLO start/end de las capas (desde el timeline) sin re-derivar clips.
  const applyTiming = useCallback((layers) => {
    setComp((c) => { if (!c) return c; dirtyRef.current = true; return { ...c, layers } })
  }, [])

  const close = useCallback(() => { setComp(null); setSelLayerId(null); setError('') }, [])

  function pollJob(id) {
    const tick = async () => {
      try {
        const j = await getJob(id)
        setAddJob({ id, progress: j.progress, message: j.message, status: j.status })
        if (j.status === 'done') { onReloadTimeline?.(); setTimeout(() => setAddJob(null), 1500) }
        else if (j.status === 'error') { setError(j.error || j.message); setTimeout(() => setAddJob(null), 4000) }
        else setTimeout(tick, 700)
      } catch { setTimeout(tick, 1000) }
    }
    setTimeout(tick, 500)
  }
  const addToProject = useCallback(async () => {
    if (!comp?.id) return
    setError('')
    try {
      if (dirtyRef.current) { await updateMotion(pid, comp.id, comp); dirtyRef.current = false }
      const job = await addMotionToTimeline(pid, comp.id, { start: 0 })
      setAddJob({ id: job.id, progress: job.progress || 0, message: job.message || 'Renderizando…', status: job.status })
      pollJob(job.id)
    } catch (e) { setError(e.message) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp, pid])

  const selLayer = comp?.layers?.find((l) => l.id === selLayerId) || null

  return {
    comp, setComp, selLayer, selLayerId, setSelLayerId,
    templates, addJob, error, setError,
    edit, editLayer, moveLayerBy, addLayer, deleteLayer, setName, setDuration,
    loadComp, createBlank, createFromTemplate, addToProject, close, applyTiming,
  }
}
