import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  applyPanelDrag, clampPanelLayout, readPanelLayout, readWorkspacePreset,
  workspacePreset, writePanelLayout, writeWorkspacePreset,
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
  const padX = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0
  // En "tall-media" el workspace es display:contents (rect 0): usar el ancho del editor
  const workW = work?.width || (editor?.width ? editor.width - padX : 0) || 1200
  return {
    workW,
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
  const [preset, setPresetState] = useState(() => readWorkspacePreset(typeof localStorage === 'undefined' ? null : localStorage))
  const presetRef = useRef(preset)
  layoutRef.current = layout
  presetRef.current = preset

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

  const setPreset = useCallback((id) => {
    const next = workspacePreset(id).id
    setPresetState(next)
    writeWorkspacePreset(typeof localStorage === 'undefined' ? null : localStorage, next)
  }, [])

  // Al montar y al cambiar de disposición (cambian los anchos disponibles,
  // p. ej. la timeline pierde la columna de materiales): recortar tras el re-layout.
  useLayoutEffect(() => {
    persist(apply(layoutRef.current))
  }, [preset, apply, persist])

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
      const next = applyPanelDrag(kind, origin, ev.clientX - startX, ev.clientY - startY, box, presetRef.current)
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
    '--ed-main-w': `${layout.main}px`,
  }

  return { layout, vars, dragging, begin, editorRef, workRef, bottomRef, preset, setPreset }
}
