import { useLayoutEffect, useRef, useState } from 'react'
import { placeMenu } from '../lib/placeMenu'

export default function AnchoredMenu({ x, y, className, children }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos(placeMenu(x, y, width, height, window.innerWidth, window.innerHeight))
  }, [x, y, children])

  return (
    <div ref={ref} className={className} style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>
  )
}
