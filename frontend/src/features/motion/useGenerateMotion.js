import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createMotionDraft, deleteMotion, getMotion, getMotionSegmentContext,
  proposeMotion, setMotionFocus,
} from '../../services/api'

// Estado del flujo "Generar Motion" para UN tramo. El contexto lo construye el
// backend (capa de contexto compacta): aquí solo se pide y se muestra.
export function useGenerateMotion(projectId, target) {
  const [ctx, setCtx] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reqRef = useRef(0)

  const start = target?.start
  const end = target?.end
  const playhead = target?.playhead
  const clipId = target?.clipId

  const refresh = useCallback(async () => {
    if (!projectId || start == null) return
    const id = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      // El foco se guarda para que Claude (MCP) pueda pedir este mismo tramo sin tiempos.
      setMotionFocus(projectId, { start, end, playhead, clipId }).catch(() => {})
      const data = await getMotionSegmentContext(projectId, { start, end, playhead, clipId })
      if (id === reqRef.current) setCtx(data)
    } catch (e) {
      if (id === reqRef.current) setError(e.message || 'No se pudo leer el contexto.')
    } finally {
      if (id === reqRef.current) setLoading(false)
    }
  }, [projectId, start, end, playhead, clipId])

  useEffect(() => { refresh() }, [refresh])

  return { ctx, loading, error, refresh }
}

// Fase de PROPUESTA: pide a la IA una idea para el tramo (SSE). El backend
// reconstruye el contexto desde la timeline guardada; aquí solo se manda el rango.
export function useMotionProposal(projectId, target) {
  const [proposing, setProposing] = useState(false)
  const [stream, setStream] = useState('')   // texto en vivo del modelo (si "piensa" en voz alta)
  const [proposal, setProposal] = useState(null)
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  const propose = useCallback(async ({ frames = false, hint = '' } = {}) => {
    if (!projectId || !target) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setProposing(true)
    setStream('')
    setProposal(null)
    setError('')
    try {
      await proposeMotion(projectId, {
        start: target.start, end: target.end, playhead: target.playhead,
        clipId: target.clipId, hint, frames,
      }, (ev) => {
        if (ev.type === 'text') setStream((s) => s + (ev.delta || ''))
        else if (ev.type === 'proposal') setProposal(ev.proposal)
        else if (ev.type === 'error') setError(ev.message || 'La IA no pudo proponer.')
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudo proponer.')
    } finally {
      if (abortRef.current === ctrl) { setProposing(false); abortRef.current = null }
    }
  }, [projectId, target])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setProposing(false)
    setStream('')
    setProposal(null)
    setError('')
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  // Deja editar concepto/duración de la propuesta sin re-preguntar a la IA.
  const patchProposal = useCallback((patch) => setProposal((p) => (p ? { ...p, ...patch } : p)), [])

  return { proposing, stream, proposal, error, propose, reset, patchProposal }
}

const TOOL_LABEL = {
  motion_list_templates: 'Mirando plantillas…',
  motion_create_composition: 'Construyendo la composición…',
  motion_update_composition: 'Corrigiendo la composición…',
}

// Fase de GENERACIÓN: la IA crea un BORRADOR de composición (con preview) para el
// tramo. Descarta el borrador si se cierra sin insertarlo.
export function useMotionDraft(projectId, target) {
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')
  const [draftId, setDraftId] = useState(null)
  const [comp, setComp] = useState(null)
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const keepRef = useRef(false)   // true = no borrar el borrador al limpiar (se insertó/edita en Studio)

  const generate = useCallback(async (proposal) => {
    if (!projectId || !target || !proposal) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGenerating(true)
    setError('')
    setComp(null)
    setStatus('Preparando…')
    let createdId = draftId   // regenerar sobre el mismo borrador
    try {
      await createMotionDraft(projectId, {
        start: target.start, end: target.end, playhead: target.playhead,
        clipId: target.clipId, proposal, variantOf: draftId || null,
      }, (ev) => {
        if (ev.type === 'tool_start') setStatus(TOOL_LABEL[ev.tool] || 'Trabajando…')
        else if (ev.type === 'created') { createdId = ev.composition_id; setDraftId(ev.composition_id) }
        else if (ev.type === 'error') setError(ev.message || 'No se pudo generar.')
      }, ctrl.signal)
      if (createdId) {
        const c = await getMotion(projectId, createdId)
        if (abortRef.current === ctrl) setComp(c)
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudo generar.')
    } finally {
      if (abortRef.current === ctrl) { setGenerating(false); abortRef.current = null }
    }
  }, [projectId, target, draftId])

  // Borra el borrador si quedó sin insertar (a menos que se marque conservar).
  const discard = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const id = draftId
    if (id && !keepRef.current) deleteMotion(projectId, id).catch(() => {})
    setDraftId(null)
    setComp(null)
    setGenerating(false)
    setStatus('')
    setError('')
  }, [projectId, draftId])

  const keep = useCallback(() => { keepRef.current = true }, [])

  useEffect(() => () => {
    // Al desmontar: cancela y borra el borrador si no se conservó.
    abortRef.current?.abort()
    if (draftId && !keepRef.current) deleteMotion(projectId, draftId).catch(() => {})
  }, [projectId, draftId])

  return { generating, status, draftId, comp, error, generate, discard, keep }
}
