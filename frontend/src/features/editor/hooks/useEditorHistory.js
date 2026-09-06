import { useCallback, useEffect, useRef, useState } from 'react'

export function useEditorHistory(tracks, clips, enabled) {
  const past = useRef([])
  const future = useRef([])
  const last = useRef(null)
  const skip = useRef(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

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
      const snap = JSON.stringify({ tracks, clips })
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
      if (past.current.length > 80) past.current.shift()
      last.current = snap
      future.current = []
      setCanUndo(true)
      setCanRedo(false)
    }, 320)
    return () => clearTimeout(id)
  }, [tracks, clips, enabled])

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
