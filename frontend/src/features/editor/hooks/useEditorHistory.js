import { useCallback, useEffect, useRef, useState } from 'react'
import { registerStats } from '../../../lib/lruBytes.js'

// Tope del historial: 80 pasos Y como mucho ~48 MB de instantáneas (una timeline
// larga con subtítulos ronda los cientos de KB por paso; V8 guarda las cadenas
// en 1 o 2 bytes por carácter, se cuenta 2 por prudencia).
export const HISTORY_MAX_STEPS = 80
export const HISTORY_MAX_BYTES = 48 * 1024 * 1024

export function snapBytes(snap) {
  return (snap?.length || 0) * 2
}

/** Recorta `past` (el más antiguo primero) a los topes de pasos y de bytes. Muta. */
export function trimHistory(past, future = [], maxSteps = HISTORY_MAX_STEPS, maxBytes = HISTORY_MAX_BYTES) {
  while (past.length > maxSteps) past.shift()
  let total = 0
  for (const s of past) total += snapBytes(s)
  for (const s of future) total += snapBytes(s)
  while (past.length > 1 && total > maxBytes) total -= snapBytes(past.shift())
  return past
}

// Todas las instancias vivas del historial, para el panel `?debug=mem`.
const instances = new Set()
registerStats('undo', () => {
  let entries = 0
  let bytes = 0
  for (const h of instances) {
    for (const s of h.past.current) { entries += 1; bytes += snapBytes(s) }
    for (const s of h.future.current) { entries += 1; bytes += snapBytes(s) }
  }
  return { entries, bytes }
})

/**
 * Undo/redo por instantáneas JSON con debounce.
 *
 * `snapshot` es cualquier valor serializable: el editor pasa `{tracks, clips}` y
 * Paper Animator su propio estado. `undo()`/`redo()` devuelven el valor
 * deserializado (o `null` si no hay nada), y quien llama decide cómo aplicarlo.
 *
 * `enabled` apaga el registro: así pueden convivir varias instancias (una por
 * modo del editor) sin que la inactiva acumule historia.
 */
export function useEditorHistory(snapshot, enabled) {
  const past = useRef([])
  const future = useRef([])
  const last = useRef(null)
  const skip = useRef(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    const h = { past, future }
    instances.add(h)
    return () => { instances.delete(h) }
  }, [])

  const reset = useCallback(() => {
    past.current = []
    future.current = []
    last.current = null
    skip.current = false
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    const id = setTimeout(() => {
      const snap = JSON.stringify(snapshot)
      if (skip.current) {
        skip.current = false
        last.current = snap
        return
      }
      if (last.current == null) {
        last.current = snap
        return
      }
      if (snap === last.current) return
      past.current.push(last.current)
      future.current = []
      trimHistory(past.current)
      last.current = snap
      setCanUndo(true)
      setCanRedo(false)
    }, 320)
    return () => clearTimeout(id)
  }, [snapshot, enabled])

  const undo = useCallback(() => {
    if (!past.current.length || last.current == null) return null
    future.current.push(last.current)
    const prev = past.current.pop()
    last.current = prev
    skip.current = true
    setCanUndo(past.current.length > 0)
    setCanRedo(true)
    try { return JSON.parse(prev) } catch { return null }
  }, [])

  const redo = useCallback(() => {
    if (!future.current.length || last.current == null) return null
    past.current.push(last.current)
    const next = future.current.pop()
    last.current = next
    skip.current = true
    setCanUndo(true)
    setCanRedo(future.current.length > 0)
    try { return JSON.parse(next) } catch { return null }
  }, [])

  return { canUndo, canRedo, undo, redo, reset }
}
