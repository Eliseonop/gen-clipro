import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  applyPanelDrag, clampPanelLayout, readPanelLayout, writePanelLayout,
} from '../panelLayout'

function measure(editorEl, workEl, bottomEl) {
  const editor = editorEl?.getBoundingClientRect()
  const work = workEl?.getBoundingClientRect()
  const bottom = bottomEl?.getBoundingClientRect()
  const topbarEl = editorEl?.querySelector('.ed-topbar')
  const topbar = topbarEl?.getBoundingClientRect()
  const cs = editorEl ? getComputedStyle(editorEl) : null
  const topbarCs = topbarEl ? getComputedStyle(topbarEl) : null
  const padY = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0
  return {
    workW: work?.width || 1200,
    bottomW: bottom?.width || work?.width || 1200,
    editorH: (editor?.height || 800) - padY,
    topbarH: (topbar?.height || 44) + (parseFloat(topbarCs?.marginBottom) || 0),
  }
}

export function usePanelLayout() {
  const editorRef = useRef(null)
  const workRef = useRef(null)
  const bottomRef = useRef(null)
  const layoutRef = useRef(readPanelLayout(typeof localStorage === 'undefined' ? null : localStorage))
  const [layout, setLayout] = useState(() => layoutRef.current)
  const [dragging, setDragging] = useState(null)
  layoutRef.current = layout

  const apply = useCallback((next) => {
    const box = measure(editorRef.current, workRef.current, bottomRef.current)
    const clamped = clampPanelLayout(next, box)
    layoutRef.current = clamped
    setLayout(clamped)
    return clamped
  }, [])

  const persist = useCallback((next) => {
    writePanelLayout(typeof localStorage === 'undefined' ? null : localStorage, next)
  }, [])

  useLayoutEffect(() => {
    persist(apply(layoutRef.current))
  }, [apply, persist])

  useEffect(() => {
    const onResize = () => persist(apply(layoutRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [apply, persist])

  const begin = useCallback((kind) => (e) => {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* pointer sintético */ }
    const origin = { ...layoutRef.current }
    const startX = e.clientX
    const startY = e.clientY
    const box = measure(editorRef.current, workRef.current, bottomRef.current)
    setDragging(kind)
    const move = (ev) => {
      const next = applyPanelDrag(kind, origin, ev.clientX - startX, ev.clientY - startY, box)
      layoutRef.current = next
      setLayout(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDragging(null)
      persist(layoutRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [persist])

  const vars = {
    '--ed-mat-w': `${layout.materials}px`,
    '--ed-insp-w': `${layout.inspector}px`,
    '--ed-bottom-h': `${layout.bottom}px`,
    '--ed-crops-w': `${layout.crops}px`,
  }

  return { layout, vars, dragging, begin, editorRef, workRef, bottomRef }
}
