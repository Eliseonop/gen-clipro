// Rejillas de material sin un <video> vivo por tarjeta (OPTIMIZACION_MEMORIA,
// Fase 3): la tarjeta solo monta su medio mientras se ve. Al salir de la vista se
// desmonta y se suelta el decodificador en el acto (`releaseMedia`).

import { useEffect, useState } from 'react'

/** True mientras el elemento de `ref` está (casi) a la vista. */
export function useNearViewport(ref, margin = '300px') {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return undefined
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setNear(e.isIntersecting)
    }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin])
  return near
}

/** Suelta YA el decodificador y los búferes de un <video>/<audio>. */
export function releaseMedia(el) {
  if (!el || typeof el.pause !== 'function') return
  try {
    el.pause()
    el.removeAttribute('src')
    el.load()
  } catch { /* noop */ }
}
