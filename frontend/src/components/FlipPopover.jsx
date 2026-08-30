import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeAnchoredMenu } from '../lib/placeMenu'

export default function FlipPopover({ open, anchorRef, onClose, className, children }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current || !menuRef.current) return
    const a = anchorRef.current.getBoundingClientRect()
    const mh = menuRef.current.offsetHeight
    const mw = Math.max(a.width, menuRef.current.offsetWidth)
    setPos(placeAnchoredMenu(a, mw, mh, window.innerWidth, window.innerHeight))
  }, [open, anchorRef, children])

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (anchorRef?.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      onClose?.()
    }
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, anchorRef, onClose])

  if (!open) return null
  return createPortal(
    <div
      ref={menuRef}
      className={className}
      style={pos
        ? { position: 'fixed', left: pos.left, top: pos.top, right: 'auto', bottom: 'auto', margin: 0 }
        : { position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
