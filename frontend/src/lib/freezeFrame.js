// Congelar fotograma (#11): parte el clip de vídeo en el cabezal e inserta una
// imagen fija de ese fotograma (3 s, como CapCut), desplazando el resto de la pista.
//
// La imagen la extrae el backend a la resolución NATIVA del material
// (backend/app/freeze.py), así que su transformación es la misma que la del vídeo.
// Aquí se construye el clip de imagen para que se vea EXACTAMENTE como el vídeo en
// ese instante: misma pose (los keyframes se congelan en su valor), mismo recorte,
// efectos, máscaras, volteo y modo de fusión.
import { clipMasksAt, clipPose } from './clipAnim.js'
import { frameAt } from './panning.js'
import {
  clipDur, clipEnd, makeClip, splitClipAt, timelineToSource, withKfIds,
} from '../features/editor/editorModel.js'

export const FREEZE_DUR = 3

/** ¿Se puede congelar `clip` en `head`? (vídeo y cabezal dentro del clip) */
export function canFreeze(clip, head) {
  return !!clip && clip.kind === 'video' && head >= clip.start - 1e-3 && head <= clipEnd(clip) + 1e-3
}

/** Instante del ARCHIVO que se ve en `head` (lo que hay que extraer). */
export function freezeSourceTime(clip, head) {
  const src = timelineToSource(clip, head)
  return +Math.min(clip.out_point, Math.max(clip.in_point, src)).toFixed(3)
}

function staticKf(fr) {
  return {
    t: 0, cx: fr.cx, cy: fr.cy, zoom: fr.zoom, pan_mode: 'smooth',
    ...(fr.fit ? { fit: fr.fit } : {}),
  }
}

/** Recorte fijo con el encuadre que tiene el vídeo en `srcTime`. */
function staticReframe(video, srcTime, p) {
  const rf = video.reframe
  if (!rf) return rf
  const out = { ...rf, zoom: p.zoom, keyframes: [staticKf({ cx: p.cx, cy: p.cy, zoom: p.zoom })] }
  if (rf.dual_crop) {
    const f2 = frameAt(rf.keyframes2?.length ? rf.keyframes2 : rf.keyframes, srcTime,
      rf.zoom2 ?? rf.zoom ?? 1, rf.pan_mode || 'smooth')
    out.keyframes2 = [staticKf(f2)]
  } else {
    out.keyframes2 = []
  }
  return withKfIds(out)
}

/**
 * Clip de imagen (`image` = ImageInfo del fotograma) que reproduce el vídeo en
 * `head`. Eliminar fondo automático no se copia (su recorte es del vídeo: habría
 * que recalcularlo); el chroma key sí.
 */
export function frozenClipFrom(video, image, head, dur = FREEZE_DUR) {
  const localT = Math.max(0, head - video.start)
  const srcTime = freezeSourceTime(video, head)
  const p = clipPose(video, localT, srcTime)   // keyframes o pistas `anim` antiguas
  const base = makeClip('images', image, video.track_id, head, dur)
  const bg = video.bg_removal
  return {
    ...base,
    name: image.label || base.name,
    layout: video.layout,
    frame: video.frame,
    transform: { x: p.x, y: p.y, scale: p.scale, rotation: p.rotation },
    opacity: p.opacity < 1 ? p.opacity : undefined,
    reframe: staticReframe(video, srcTime, p),
    effects: { ...(video.effects || {}) },
    look: video.look || 'none',
    masks: clipMasksAt(video, localT, { includeAdjust: true }),
    ...(video.flip_h ? { flip_h: true } : {}),
    ...(video.flip_v ? { flip_v: true } : {}),
    ...(video.blend_mode ? { blend_mode: video.blend_mode } : {}),
    ...(bg?.chroma?.enabled ? { bg_removal: { ...bg, auto: { ...(bg.auto || {}), enabled: false } } } : {}),
  }
}

/**
 * Inserta `frozen` en `head`: parte el vídeo `videoId` (la parte derecha y los
 * clips posteriores de la misma pista se desplazan la duración del congelado).
 * Pegado a un borde del clip (no se puede partir), va delante o detrás de él.
 */
export function insertFreeze(clips, videoId, head, frozen, rightId) {
  const v = clips.find((c) => c.id === videoId)
  if (!v) return clips
  const dur = clipDur(frozen)
  const parts = splitClipAt(v, head, rightId)
  const atStart = !parts && head - v.start < clipDur(v) / 2
  const pivot = parts ? head : (atStart ? v.start : clipEnd(v))
  const shift = (c) => ({ ...c, start: +(c.start + dur).toFixed(3) })
  const out = []
  for (const c of clips) {
    if (c.id === v.id) {
      const f = { ...frozen, start: +pivot.toFixed(3) }
      if (parts) out.push(parts.left, f, shift(parts.right))
      else if (atStart) out.push(f, shift(v))
      else out.push(v, f)
      continue
    }
    out.push(c.track_id === v.track_id && c.start >= pivot - 1e-3 ? shift(c) : c)
  }
  return out
}
