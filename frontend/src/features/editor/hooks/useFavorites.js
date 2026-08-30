import { useCallback, useEffect, useState } from 'react'
import { getSettings, putSettings } from '../../../services/api'
import {
  audioFavKey,
  clipFavRef,
  emptyFavorites,
  makeTextStyleFavorite,
  normalizeFavorites,
  toggleId,
} from '../../../lib/favorites'

export function useFavorites(projectId) {
  const [favs, setFavs] = useState(emptyFavorites)

  useEffect(() => {
    let alive = true
    getSettings()
      .then((s) => { if (alive) setFavs(normalizeFavorites(s.favorites)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const persist = useCallback(async (next) => {
    setFavs(next)
    try { await putSettings({ favorites: next }) } catch { /* backend */ }
  }, [])

  const isSfxFav = useCallback((id) => favs.sfx.includes(String(id)), [favs.sfx])
  const isAudioFav = useCallback((audioId) => (
    !!projectId && favs.audios.includes(audioFavKey(projectId, audioId))
  ), [favs.audios, projectId])

  function toggleSfx(id) {
    return persist({ ...favs, sfx: toggleId(favs.sfx, id) })
  }
  function toggleAudio(audioId) {
    if (!projectId) return Promise.resolve()
    return persist({ ...favs, audios: toggleId(favs.audios, audioFavKey(projectId, audioId)) })
  }
  function isClipFav(clip) {
    const ref = clipFavRef(projectId, clip)
    if (!ref) return false
    return (favs[ref.bucket] || []).includes(ref.id)
  }
  function toggleClipFav(clip) {
    const ref = clipFavRef(projectId, clip)
    if (!ref) return Promise.resolve()
    return persist({ ...favs, [ref.bucket]: toggleId(favs[ref.bucket], ref.id) })
  }
  function saveTextStyle(style) {
    const item = makeTextStyleFavorite(style, favs.textStyles)
    persist({ ...favs, textStyles: [...favs.textStyles, item] })
    return item
  }
  function removeTextStyle(id) {
    persist({ ...favs, textStyles: favs.textStyles.filter((t) => t.id !== id) })
  }

  return {
    favs, isSfxFav, isAudioFav, toggleSfx, toggleAudio,
    isClipFav, toggleClipFav, saveTextStyle, removeTextStyle,
  }
}
