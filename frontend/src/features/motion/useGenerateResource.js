import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildResource, createMotionFromProposal, deleteMotion, getMotion, suggestResources,
} from '../../services/api'

// Estado de "Generar recurso" (§3): sugerir → elegir → construir el borrador.
//
// Dos vías de construcción, y la primera es la buena (§16):
//   · con plantilla → una llamada POST, instantánea y determinista;
//   · sin plantilla → la IA compone desde cero (SSE), solo si nada encajaba.
export function useGenerateResource(projectId, target) {
  const [suggestions, setSuggestions] = useState([])
  const [asking, setAsking] = useState(false)
  const [degraded, setDegraded] = useState('')
  const [building, setBuilding] = useState(false)
  const [status, setStatus] = useState('')
  const [draftId, setDraftId] = useState(null)
  const [comp, setComp] = useState(null)
  const [error, setError] = useState('')

  const askRef = useRef(null)
  const buildRef = useRef(null)
  const keepRef = useRef(false)
  // El id vivo del borrador: lo leen `discard` y la limpieza al desmontar, que
  // corren fuera del render.
  const draftRef = useRef(null)
  useEffect(() => { draftRef.current = draftId }, [draftId])

  const start = target?.start
  const end = target?.end
  const playhead = target?.playhead
  const clipId = target?.clipId

  // Devuelve la lista final ({ suggestions, degraded }) para quien necesite
  // encadenar (la instrucción escrita construye directamente la mejor).
  const ask = useCallback(async (hint = '') => {
    if (!projectId || start == null) return { suggestions: [], degraded: '' }
    askRef.current?.abort()
    const ctrl = new AbortController()
    askRef.current = ctrl
    setAsking(true)
    setError('')
    setDegraded('')
    const last = { suggestions: [], degraded: '' }
    try {
      await suggestResources(projectId, { start, end, playhead, clipId, hint }, (ev) => {
        // `seed` son las heurísticas del guion: pintan el modal en el primer frame
        // y se quedan hasta que llega la propuesta de la IA.
        if (ev.type === 'seed' || ev.type === 'suggestions') {
          last.suggestions = Array.isArray(ev.suggestions) ? ev.suggestions : []
          last.degraded = ev.degraded || ''
          setSuggestions(last.suggestions)
          if (ev.degraded) setDegraded(ev.degraded)
        } else if (ev.type === 'error') setError(ev.message || 'No se pudieron leer sugerencias.')
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudieron leer sugerencias.')
    } finally {
      if (askRef.current === ctrl) { setAsking(false); askRef.current = null }
    }
    return last
  }, [projectId, start, end, playhead, clipId])

  useEffect(() => { ask() }, [ask])

  // Construye el recurso elegido. Devuelve el id del borrador, o null si falló.
  const build = useCallback(async (suggestion) => {
    if (!projectId || !suggestion || start == null) return null
    buildRef.current?.abort()
    const ctrl = new AbortController()
    buildRef.current = ctrl
    setBuilding(true)
    setError('')
    setComp(null)
    // El borrador anterior deja de importar: si no se insertó, fuera.
    const stale = draftRef.current
    if (stale) { setDraftId(null); deleteMotion(projectId, stale).catch(() => {}) }

    let createdId = null
    try {
      if (suggestion.template) {
        setStatus('Montando el recurso…')
        const out = await buildResource(projectId, {
          start, end, template: suggestion.template, params: suggestion.params || {},
        })
        createdId = out?.composition_id || null
      } else {
        setStatus('La IA está componiendo…')
        const proposal = {
          type: suggestion.kind || 'concept',
          title: suggestion.label || 'Recurso',
          concept: suggestion.concept || suggestion.why || '',
          duration: Number(end) - Number(start),
          background: suggestion.params?.opaque === false ? 'transparent' : 'opaque',
          elements: [],
        }
        await createMotionFromProposal(projectId, { start, end, playhead, clipId, proposal },
          (ev) => {
            if (ev.type === 'status') setStatus(ev.message || '')
            else if (ev.type === 'created') createdId = ev.composition_id
            else if (ev.type === 'error') setError(ev.message || 'No se pudo generar el recurso.')
          }, ctrl.signal)
      }
      if (createdId) {
        const c = await getMotion(projectId, createdId)
        if (buildRef.current === ctrl) { setDraftId(createdId); setComp(c) }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudo generar el recurso.')
    } finally {
      if (buildRef.current === ctrl) { setBuilding(false); setStatus(''); buildRef.current = null }
    }
    return createdId
  }, [projectId, start, end, playhead, clipId])

  const discard = useCallback(() => {
    askRef.current?.abort()
    buildRef.current?.abort()
    askRef.current = null
    buildRef.current = null
    if (draftRef.current && !keepRef.current) deleteMotion(projectId, draftRef.current).catch(() => {})
    setDraftId(null); setComp(null); setBuilding(false); setStatus(''); setError('')
  }, [projectId])

  const keep = useCallback(() => { keepRef.current = true }, [])

  // Al desmontar, el borrador no insertado no debe quedarse en el proyecto.
  useEffect(() => () => {
    askRef.current?.abort()
    buildRef.current?.abort()
    if (draftRef.current && !keepRef.current) deleteMotion(projectId, draftRef.current).catch(() => {})
  }, [projectId])

  return { suggestions, asking, degraded, building, status, draftId, comp, error,
    ask, build, discard, keep }
}
