// Ayuda contextual compacta (estilo CapCut): un ⓘ discreto que muestra la
// explicación al pasar el ratón o al enfocarlo con el teclado. Sustituye a los
// párrafos de ayuda fijos que ocupaban el panel. El globo va en un portal con
// posición fija para que no lo recorte el scroll del inspector.
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const W = 240

export default function Hint({ children, className = '' }) {
  const ref = useRef(null)
  const tipRef = useRef(null)
  const [pos, setPos] = useState(null)

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2))
    setPos({ left, top: r.bottom + 6, anchorTop: r.top })
  }
  const hide = () => setPos(null)

  // Si no cabe debajo, se abre hacia arriba.
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el || !pos || pos.flipped) return
    const h = el.offsetHeight
    if (pos.top + h > window.innerHeight - 8) setPos({ ...pos, top: Math.max(8, pos.anchorTop - h - 6), flipped: true })
  }, [pos])

  if (!children) return null
  return (
    <>
      <span
        ref={ref}
        className={`ui-hint ${className}`}
        tabIndex={0}
        role="img"
        aria-label="Ayuda"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      >i</span>
      {pos && createPortal(
        <div ref={tipRef} className="ui-hint-tip" role="tooltip" style={{ left: pos.left, top: pos.top, width: W }}>
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
