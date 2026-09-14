import { useCallback, useEffect, useRef, useState } from 'react'
import { getMotionSegmentContext, setMotionFocus } from '../../services/api'

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
