// Sonorizar con IA (#17): coloca en la timeline los sonidos que propuso
// backend/app/sound_design.py. Espejo de timeline_ops.add_sound_design.
//
// Cada sonido va en una pista de audio «SFX» donde no pise nada (si todas están
// ocupadas en ese tramo, se crea «SFX 2», «SFX 3»…). Dura lo pedido, sin pasar
// del archivo ni del final de la escena; el ambiente entra y sale con fundido.

import { clipDur, clipEnd, makeClip } from '../features/editor/editorModel.js'
import { applyVolumeFade } from './clipKeyframes.js'

export const SFX_TRACK_RE = /^sfx\b/i
export const AMBIENCE_FADE = 0.4

const r3 = (v) => +Number(v).toFixed(3)

function overlaps(clips, trackId, start, dur) {
  return clips.some((c) => c.track_id === trackId && c.start < start + dur - 1e-6 && clipEnd(c) > start + 1e-6)
}

function nextSfxName(tracks) {
  const n = tracks.filter((t) => t.kind === 'audio' && SFX_TRACK_RE.test(String(t.name || ''))).length
  return n ? `SFX ${n + 1}` : 'SFX'
}

/**
 * Devuelve {clips, tracks, added} con los sonidos `sounds` ([{sfx: {id, name,
 * duration}, start, duration, volume, kind}], tiempos locales de la escena)
 * colocados sobre `scene` (el clip de vídeo o imagen). `makeId(prefijo)` da ids.
 */
export function placeSoundDesign(clips, tracks, scene, sounds, makeId) {
  const outClips = [...(clips || [])]
  const outTracks = [...(tracks || [])]
  const added = []
  const s0 = scene.start || 0
  const sceneDur = clipDur(scene)
  for (const s of sounds || []) {
    if (!s?.sfx?.id) continue
    const src = Number(s.sfx.duration) || 0
    const start = r3(s0 + Math.min(Math.max(0, Number(s.start) || 0), Math.max(0, sceneDur - 0.1)))
    const want = Math.max(0.1, Math.min(Number(s.duration) || 0.1, s0 + sceneDur - start))
    const dur = r3(src > 0 ? Math.min(want, src) : want)
    let track = outTracks.find((t) => t.kind === 'audio' && !t.locked && SFX_TRACK_RE.test(String(t.name || ''))
      && !overlaps(outClips, t.id, start, dur))
    if (!track) {
      track = { id: makeId('A'), kind: 'audio', name: nextSfxName(outTracks), hidden: false, muted: false, locked: false, linked_track_id: null }
      outTracks.push(track)
    }
    let clip = {
      ...makeClip('sfx', { id: s.sfx.id, name: s.sfx.name }, track.id, start, dur),
      id: makeId('c'),
      source_duration: r3(src > 0 ? src : dur),
      volume: Math.min(1, Math.max(0.05, Number(s.volume) || 0.8)),
      note: s.what || null,
      note_source: s.what ? 'ai' : null,
    }
    if (s.kind === 'ambience' && dur > 1) {
      clip = applyVolumeFade(clip, dur, 'in', AMBIENCE_FADE)
      clip = applyVolumeFade(clip, dur, 'out', AMBIENCE_FADE)
    }
    outClips.push(clip)
    added.push(clip.id)
  }
  return { clips: outClips, tracks: outTracks, added }
}
