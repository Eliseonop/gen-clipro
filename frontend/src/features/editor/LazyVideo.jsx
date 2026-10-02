// <video> de tarjeta que solo existe mientras `show` (la tarjeta está a la vista):
// al ocultarse se desmonta y suelta su decodificador (useNearViewport.js). La
// suelta va diferida y solo si el elemento salió del DOM: StrictMode (dev) simula
// un desmontaje de refs al montar.

import { useCallback, useRef } from 'react'
import { releaseMedia } from './useNearViewport'

export default function LazyVideo({ show, mediaRef, ...props }) {
  const local = useRef(null)
  const setRef = useCallback((el) => {
    if (el) {
      local.current = el
      if (typeof mediaRef === 'function') mediaRef(el)
      else if (mediaRef) mediaRef.current = el
      return
    }
    const old = local.current
    local.current = null
    if (mediaRef && typeof mediaRef !== 'function' && mediaRef.current === old) mediaRef.current = null
    if (old) setTimeout(() => { if (!old.isConnected) releaseMedia(old) }, 0)
  }, [mediaRef])
  if (!show) return null
  return <video ref={setRef} {...props} />
}
