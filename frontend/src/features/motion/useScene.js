import { useCallback, useEffect, useRef, useState } from 'react'
import {
  askSceneQuestions, buildScene, deleteMotion, deleteScenePreset, getMotion, getSceneDirections,
  listScenePresets, planScene, saveScenePreset,
} from '../../services/api'

// Catálogo de direcciones creativas + opciones del brief + presets.
export function useSceneCatalog(projectId) {
  const [directions, setDirections] = useState([])
  const [options, setOptions] = useState(null)
  const [presets, setPresets] = useState([])
  const [error, setError] = useState('')

  const reloadPresets = useCallback(async () => {
    if (!projectId) return
    try { setPresets((await listScenePresets(projectId)).presets || []) } catch (e) { setError(e.message) }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    let alive = true
    getSceneDirections(projectId)
      .then((d) => { if (alive) { setDirections(d.directions || []); setOptions(d.options || null) } })
      .catch((e) => alive && setError(e.message || 'No se pudo cargar el catálogo.'))
    reloadPresets()
    return () => { alive = false }
  }, [projectId, reloadPresets])

  const savePreset = useCallback(async ({ id, name, brief }) => {
    const saved = await saveScenePreset(projectId, { id, name, brief })
    await reloadPresets()
    return saved
  }, [projectId, reloadPresets])

  const removePreset = useCallback(async (id) => {
    await deleteScenePreset(projectId, id)
    await reloadPresets()
  }, [projectId, reloadPresets])

  return { directions, options, presets, error, savePreset, removePreset }
}

// Una llamada SSE cancelable (preguntas / plan). `result` = payload del evento `resultType`.
function useSceneCall(resultType) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  const run = useCallback(async (call) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    setStatus('')
    setResult(null)
    setError('')
    let got = null
    try {
      await call((ev) => {
        if (ev.type === 'status') setStatus(ev.message || '')
        else if (ev.type === resultType) { got = ev[resultType]; setResult(got) }
        else if (ev.type === 'error') setError(ev.message || 'La IA no pudo responder.')
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Error de conexión.')
    } finally {
      if (abortRef.current === ctrl) { setRunning(false); abortRef.current = null }
    }
    return got
  }, [resultType])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false); setStatus(''); setResult(null); setError('')
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])
  return { running, status, result, error, run, reset, setResult }
}

export function useSceneQuestions(projectId, range) {
  const call = useSceneCall('questions')
  const { run } = call
  const ask = useCallback((brief) => run((onEv, signal) =>
    askSceneQuestions(projectId, range, brief, onEv, signal)), [run, projectId, range])
  return { ...call, ask }
}

export function useScenePlan(projectId, range) {
  const call = useSceneCall('plan')
  const { run } = call
  const plan = useCallback((brief, answers) => run((onEv, signal) =>
    planScene(projectId, range, { brief, answers }, onEv, signal)), [run, projectId, range])
  return { ...call, plan }
}

// Construcción del BORRADOR beat a beat. Se borra al cerrar si no se conserva.
export function useSceneDraft(projectId, range) {
  const [building, setBuilding] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({})   // beat_id → 'working' | 'done' | 'fallback'
  const [draftId, setDraftId] = useState(null)
  const [comp, setComp] = useState(null)
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const keepRef = useRef(false)

  const build = useCallback(async ({ brief, answers, plan, onlyBeats = null }) => {
    if (!projectId || !range) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBuilding(true)
    setError('')
    setStatus('Preparando…')
    setProgress((p) => (onlyBeats ? p : {}))
    let createdId = null
    try {
      await buildScene(projectId, range, { brief, answers, plan, variantOf: draftId, onlyBeats }, (ev) => {
        if (ev.type === 'status') setStatus(ev.message || '')
        else if (ev.type === 'beat_start') {
          setStatus(`Construyendo beat ${ev.index + 1} de ${ev.total}…`)
          setProgress((p) => ({ ...p, [ev.beat_id]: 'working' }))
        } else if (ev.type === 'beat_done') {
          setProgress((p) => ({ ...p, [ev.beat_id]: ev.fallback ? 'fallback' : 'done' }))
        } else if (ev.type === 'created') { createdId = ev.composition_id; setDraftId(ev.composition_id) }
        else if (ev.type === 'error') setError(ev.message || 'No se pudo construir la escena.')
      }, ctrl.signal)
      if (createdId) {
        const c = await getMotion(projectId, createdId)
        if (abortRef.current === ctrl) setComp(c)
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudo construir la escena.')
    } finally {
      if (abortRef.current === ctrl) { setBuilding(false); setStatus(''); abortRef.current = null }
    }
  }, [projectId, range, draftId])

  const discard = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (draftId && !keepRef.current) deleteMotion(projectId, draftId).catch(() => {})
    setDraftId(null); setComp(null); setBuilding(false); setStatus(''); setError(''); setProgress({})
  }, [projectId, draftId])

  const keep = useCallback(() => { keepRef.current = true }, [])

  useEffect(() => () => {
    abortRef.current?.abort()
    if (draftId && !keepRef.current) deleteMotion(projectId, draftId).catch(() => {})
  }, [projectId, draftId])

  return { building, status, progress, draftId, comp, error, build, discard, keep }
}
