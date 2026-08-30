import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeAnchoredMenu } from '../lib/placeMenu'

export default function FlipSelect({ value, options, onChange, className = '', title }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const label = options.find((o) => o.value === value)?.label ?? value

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const a = btnRef.current.getBoundingClientRect()
    const mh = menuRef.current.offsetHeight
    const mw = Math.max(160, a.width, menuRef.current.offsetWidth)
    const next = placeAnchoredMenu(a, mw, mh, window.innerWidth, window.innerHeight)
    setPos({ ...next, minWidth: mw })
  }, [open, options, label])

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`select flip-select ${className}`}
        title={title || String(label)}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flip-select-label">{label}</span>
      </button>
      {open && createPortal(
        <ul
          ref={menuRef}
          className="flip-select-menu"
          role="listbox"
          style={pos
            ? { left: pos.left, top: pos.top, minWidth: pos.minWidth }
            : { left: 0, top: 0, visibility: 'hidden' }}
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={o.value === value ? 'on' : ''}
                role="option"
                aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false) }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}
