// Modelo del editor de vídeo: fábricas puras y helpers de dominio (sin React ni canvas).
// Centraliza la creación de clips/tracks/keyframes y las constantes de formato para
// que los componentes y hooks del editor compartan una única fuente de verdad.
import { defaultTextStyle } from '../../lib/textstyles.js'
import { isMasterReframe } from '../../lib/recipeLayout.js'
import { chunkCaptionText, splitCaptionWords } from '../../lib/textKaraoke.js'
import { isFreeText } from '../../lib/textRole.js'
import { defaultShape, SHAPE_DEFAULT_DUR } from '../../lib/shapes.js'

// --- Identificadores estables ---
let _uid = 1
export const uid = (p) => `${p}${Date.now().toString(36)}${(_uid++).toString(36)}`

// --- Velocidad (CapCut): in/out son fuente; la barra usa tiempo de timeline ---
export const SPEED_MIN = 0.1
export const SPEED_MAX = 10
export const SPEED_PRESETS = [0.3, 0.5, 1, 1.5, 2, 3, 5, 10]

export const IMAGE_DEFAULT_DUR = 5
export const VISUAL_CLIP_KINDS = ['video', 'image']

export function isVisualClip(c) {
  return VISUAL_CLIP_KINDS.includes(c?.kind)
}

export function isGeneratedDurationClip(c) {
  return c?.kind === 'text' || c?.kind === 'image' || c?.kind === 'shape'
}

export function trackKindForClip(kind) {
  if (kind === 'image' || kind === 'video' || kind === 'shape') return 'video'
  if (kind === 'audio') return 'audio'
  if (kind === 'text') return 'text'
  return kind
}

export function laneKindForAsset(assetKind) {
  if (assetKind === 'clips' || assetKind === 'video' || assetKind === 'images' || assetKind === 'image' || assetKind === 'shape') return 'video'
  return 'audio'
}

export function clipSpeed(c) {
  if (!c || c.kind === 'text' || c.kind === 'image' || c.kind === 'shape') return 1
  const s = Number(c.speed)
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, s))
}

/** True = mismo tono al acelerar (HTML preservesPitch / FFmpeg atempo). Ausente = true. */
export function clipKeepPitch(c) {
  return c?.keep_pitch !== false
}

export const clipSourceDur = (c) => Math.max(0, (c?.out_point ?? 0) - (c?.in_point ?? 0))
export const clipDur = (c) => clipSourceDur(c) / clipSpeed(c)
export const clipEnd = (c) => c.start + clipDur(c)

/** Un poco antes de EOF: el <video> y FFmpeg pintan negro en duration exacta. */
export const LAST_FRAME_PULL = 0.04

export function previewHead(head, duration, fps = 30) {
  const d = Math.max(0, Number(duration) || 0)
  const h = Math.max(0, Number(head) || 0)
  if (d <= 0) return 0
  const n = Number(fps)
  const dt = Math.max(LAST_FRAME_PULL, 1 / (Number.isFinite(n) && n > 0 ? n : 30))
  return h >= d - 1e-6 ? Math.max(0, d - dt) : h
}

export function safeMediaTime(el, t, fps = 30) {
  const want = Math.max(0, Number(t) || 0)
  const dur = Number(el?.duration)
  if (!Number.isFinite(dur) || dur <= 0) return want
  const n = Number(fps)
  const dt = Math.max(LAST_FRAME_PULL, 1 / (Number.isFinite(n) && n > 0 ? n : 30))
  return Math.min(want, Math.max(0, dur - dt))
}

export function timelineToSource(c, t) {
  const local = (t - c.start) * clipSpeed(c)
  if (c.reverse) return c.out_point - local
  return c.in_point + local
}

export function sourceToTimeline(c, src) {
  const sp = clipSpeed(c)
  if (c.reverse) return c.start + (c.out_point - src) / sp
  return c.start + (src - c.in_point) / sp
}

export function splitClipAt(c, at, rightId) {
  const src = timelineToSource(c, at)
  if (src <= c.in_point + 0.1 || src >= c.out_point - 0.1) return null
  const cut = +src.toFixed(3)
  return {
    left: { ...c, out_point: cut },
    right: { ...c, id: rightId, in_point: cut, start: +at.toFixed(3) },
  }
}

/** El clip no suena: silenciado él o su pista. */
export function clipPlaybackMuted(clip, track) {
  return !!(track?.muted || clip?.muted)
}

/** Volumen del elemento <video>/<audio> en el editor. No se usa en el export. */
export function previewElementVolume(clipVolume, monitorGain, muted) {
  if (muted) return 0
  const clip = clipVolume == null || !Number.isFinite(Number(clipVolume)) ? 1 : Number(clipVolume)
  const gain = monitorGain == null || !Number.isFinite(Number(monitorGain)) ? 1 : Number(monitorGain)
  return Math.min(1, Math.max(0, clip * gain))
}

/** Solo escribe muted/volume/rate si cambian. Reasignarlos cada frame acelera o distorsiona el audio. */
export function syncPreviewMedia(el, { muted, volume, playbackRate }) {
  if (!el) return
  if (typeof muted === 'boolean' && el.muted !== muted) el.muted = muted
  if (volume != null && Number.isFinite(Number(volume))) {
    const v = Math.min(1, Math.max(0, Number(volume)))
    if (Math.abs((Number(el.volume) || 0) - v) > 0.008) {
      try { el.volume = v } catch { /* fuera de rango */ }
    }
  }
  if (playbackRate != null && Number.isFinite(Number(playbackRate)) && playbackRate > 0) {
    if (Math.abs((Number(el.playbackRate) || 1) - playbackRate) > 1e-3) {
      try { el.playbackRate = playbackRate } catch { /* noop */ }
    }
  }
}

export const PREVIEW_VOL_KEY = 'vy:preview-volume'

export function parsePreviewVolume(raw) {
  if (raw == null || raw === '') return 1
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

/** Pista con clips: hay que confirmar. Vacía: se borra al momento. */
export function shouldConfirmTrackDelete(clips, trackId) {
  return (clips || []).some((c) => c.track_id === trackId)
}

export function removeTrack(tracks, clips, trackId) {
  const remaining = (tracks || []).filter((t) => t.id !== trackId)
  return {
    tracks: remaining.map((t) => (t.linked_track_id === trackId ? { ...t, linked_track_id: null } : t)),
    clips: (clips || []).filter((c) => c.track_id !== trackId),
  }
}

/** Vídeo de biblioteca o audio/sfx: se puede transcribir a pista de texto. */
export function canCaptionClip(clip) {
  if (!clip || clip.kind === 'text') return false
  if (clip.asset_kind === 'audios' || clip.asset_kind === 'sfx') return true
  if (clip.kind !== 'video') return false
  if ((clip.asset_scope || 'project') === 'library') return false
  return !!(clip.asset_id || clip.index != null)
}

/** Palabras de un segmento mapeadas a tiempos RELATIVOS al inicio del text clip.
 *  Conserva todas las palabras (no filtra) para que el conteo cuadre con el texto;
 *  recorta cada tiempo a [0, dur] sin perder ninguna. */
function relSegmentWords(segment, src, clipStart, dur) {
  const ws = Array.isArray(segment?.words) ? segment.words : []
  if (!ws.length) return []
  return ws.map((w) => {
    const tlStart = src.start + ((w.start ?? 0) - src.in_point)
    const tlEnd = src.start + ((w.end ?? w.start ?? 0) - src.in_point)
    const rs = Math.min(Math.max(0, tlStart - clipStart), dur)
    const re = Math.min(Math.max(0, tlEnd - clipStart), dur)
    const out = { text: (w.text || '').trim(), start: +rs.toFixed(3), end: +Math.max(rs, re).toFixed(3) }
    if (w.prob != null) out.prob = w.prob
    return out
  })
}

/** Segmentos del Whisper → clips de texto en la timeline, recortados al tramo del clip.
 *  Si el segmento trae ``words[]`` (timing real), cada fragmento hereda solo sus
 *  palabras (relativas al fragmento) y conserva ``origin`` hacia su transcripción. */
export function textClipsFromTranscript(src, segments, trackId, style, transcript = null) {
  const clipLen = src.out_point - src.in_point
  const news = []
  ;(segments || []).forEach((s, segIndex) => {
    const ls = s.start - src.in_point
    const le = s.end - src.in_point
    if (le <= 0 || ls >= clipLen) return
    const start = src.start + Math.max(0, ls)
    const end = src.start + Math.min(clipLen, le)
    const text = (s.text || '').trim()
    if (!text) return
    const made = makeTextClip(trackId, start, Math.max(0.4, end - start), text, style, { text_role: 'caption' })
    made.words = relSegmentWords(s, src, made.start, clipDur(made))
    made.origin = {
      transcript_id: transcript?.id ?? null,
      segment_index: s.index ?? segIndex,
      source_range: { start: s.start, end: s.end },
      word_range: [0, splitCaptionWords(text).length],
    }
    news.push(...splitClipByMaxWords(made, style?.max_words ?? 8))
  })
  return news
}

/** Parte un clip de texto en cuadros consecutivos de como máximo `maxWords` palabras.
 *
 *  Las palabras se asignan a cada fragmento por su ÍNDICE en la secuencia (los
 *  cortes caen ENTRE palabras, nunca a través de una), así ninguna se pierde ni
 *  se duplica. Con ``words[]`` reales cuyo conteo cuadra con el texto, cada
 *  fragmento toma su rebanada de palabras y su tiempo sale de esas marcas
 *  (relativas al fragmento). Sin ``words[]`` → reparto uniforme (igual que antes). */
export function splitClipByMaxWords(clip, maxWords) {
  if (!clip) return []
  const chunks = chunkCaptionText(clip?.text || '', maxWords)
  if (chunks.length <= 1) return clip ? [clip] : []
  const total = splitCaptionWords(clip.text || '').length || 1
  const dur = clipDur(clip)
  const base = clip.start
  const hasWords = Array.isArray(clip.words) && clip.words.length === total
  const originStart = clip.origin?.word_range?.[0] ?? 0
  let acc = 0
  return chunks.map((text, i) => {
    const n = splitCaptionWords(text).length
    const from = acc
    const to = acc + n
    acc = to
    let start
    let d
    let words = []
    if (hasWords) {
      const slice = clip.words.slice(from, to)
      const w0 = slice[0]?.start ?? dur * (from / total)
      const wN = slice[slice.length - 1]?.end ?? dur * (to / total)
      start = base + w0
      d = Math.max(0.05, wN - w0)
      words = slice.map((w) => {
        const out = { text: w.text, start: +Math.max(0, w.start - w0).toFixed(3), end: +Math.max(0, w.end - w0).toFixed(3) }
        if (w.prob != null) out.prob = w.prob
        return out
      })
    } else {
      start = base + dur * (from / total)
      const end = i === chunks.length - 1 ? base + dur : base + dur * (to / total)
      d = Math.max(0.05, end - start)
    }
    const frag = {
      ...clip,
      id: uid('c'),
      asset_id: uid('t'),
      text,
      name: text.slice(0, 22),
      start: +start.toFixed(3),
      in_point: 0,
      out_point: +d.toFixed(3),
      source_duration: +d.toFixed(3),
      style: { ...(clip.style || {}) },
      words,
    }
    if (clip.origin) {
      frag.origin = { ...clip.origin, fragment_index: i, word_range: [originStart + from, originStart + to] }
    }
    return frag
  })
}

export function splitTrackTextByMaxWords(clips, trackId, maxWords) {
  const out = []
  for (const c of clips || []) {
    if (c.kind === 'text' && c.track_id === trackId && !isFreeText(c)) out.push(...splitClipByMaxWords(c, maxWords))
    else out.push(c)
  }
  return out
}

export function extraClipsAfterOneSplit(clip, maxWords) {
  if (!clip || clip.kind !== 'text') return 0
  return Math.max(0, splitClipByMaxWords(clip, maxWords).length - 1)
}

export function splitOneTextClip(clips, clipId, maxWords) {
  const list = clips || []
  const idx = list.findIndex((c) => c.id === clipId)
  if (idx < 0) return list
  const clip = list[idx]
  if (clip?.kind !== 'text') return list
  const parts = splitClipByMaxWords(clip, maxWords)
  if (parts.length <= 1) return list
  return list.slice(0, idx).concat(parts, list.slice(idx + 1))
}

/** Clips de una pista, de izquierda a derecha. */
export function clipsOnTrackSorted(clips, trackId) {
  return (clips || [])
    .filter((c) => c.track_id === trackId)
    .slice()
    .sort((a, b) => (a.start - b.start) || String(a.id).localeCompare(String(b.id)))
}

/** Ids inclusivos entre dos clips de la misma pista (por orden temporal). */
export function rangeSelectOnTrack(clips, trackId, fromId, toId) {
  const row = clipsOnTrackSorted(clips, trackId)
  const i0 = row.findIndex((c) => c.id === fromId)
  const i1 = row.findIndex((c) => c.id === toId)
  if (i1 < 0) return []
  if (i0 < 0) return [toId]
  const lo = Math.min(i0, i1)
  const hi = Math.max(i0, i1)
  return row.slice(lo, hi + 1).map((c) => c.id)
}

/**
 * Siguiente selección de clips.
 * additive = Ctrl/Cmd (mismo tipo), range = Shift (rango en la pista; en otra pista suma al grupo).
 * El primer id del grupo es la referencia (p. ej. igualar duración). keepGroup = clic en un clip ya marcado.
 */
export function nextClipSelection(clips, selectedIds, anchorId, clickedId, mods = {}) {
  const list = clips || []
  const clicked = list.find((c) => c.id === clickedId)
  if (!clicked) return { ids: selectedIds || [], anchorId: anchorId || null }
  const selected = (selectedIds || []).filter((id) => list.some((c) => c.id === id))
  const anchor = list.find((c) => c.id === anchorId) || null

  if (mods.additive) {
    const kind = selected.length ? list.find((c) => c.id === selected[0])?.kind : null
    if (kind && clicked.kind !== kind) return { ids: [clickedId], anchorId: clickedId }
    if (selected.includes(clickedId)) {
      const ids = selected.filter((id) => id !== clickedId)
      const nextAnchor = ids.includes(anchorId) ? anchorId : (ids[ids.length - 1] ?? null)
      return { ids, anchorId: nextAnchor }
    }
    return { ids: [...selected, clickedId], anchorId: clickedId }
  }

  if (mods.range && anchor && anchor.track_id === clicked.track_id) {
    return { ids: rangeSelectOnTrack(list, clicked.track_id, anchorId, clickedId), anchorId: clickedId }
  }

  if (mods.range) {
    if (selected.includes(clickedId)) {
      const ids = selected.filter((id) => id !== clickedId)
      if (!ids.length) return { ids: [clickedId], anchorId: clickedId }
      return { ids, anchorId: ids[0] }
    }
    const base = selected.length ? selected : (anchorId ? [anchorId] : [])
    const ids = base.includes(clickedId) ? base : [...base, clickedId]
    return { ids, anchorId: ids[0] }
  }

  if (mods.keepGroup && selected.includes(clickedId) && selected.length > 1) {
    return { ids: selected, anchorId: clickedId }
  }

  return { ids: [clickedId], anchorId: clickedId }
}

/** Desplaza un grupo usando las posiciones originales. Nadie queda con start < 0. */
export function groupMoveFromOrig(clips, origs, deltaT) {
  if (!origs?.length) return clips || []
  const minStart = Math.min(...origs.map((o) => o.start ?? 0))
  const d = Math.max(-(minStart), Number(deltaT) || 0)
  const byId = new Map(origs.map((o) => [o.id, o]))
  return (clips || []).map((c) => {
    const o = byId.get(c.id)
    if (!o) return c
    return { ...c, start: +(o.start + d).toFixed(3) }
  })
}

/** Parche de estilo solo en los clips de texto indicados. */
export function patchClipsStyle(clips, ids, patch) {
  const set = new Set(ids || [])
  return (clips || []).map((c) => {
    if (!set.has(c.id) || c.kind !== 'text') return c
    return { ...c, style: { ...(c.style || {}), ...patch } }
  })
}

export function removeClipsByIds(clips, ids) {
  const set = new Set(ids || [])
  return (clips || []).filter((c) => !set.has(c.id))
}

export function extraClipsAfterSplit(clips, trackId, maxWords) {
  let extra = 0
  for (const c of clips || []) {
    if (c.kind !== 'text' || c.track_id !== trackId || isFreeText(c)) continue
    extra += Math.max(0, splitClipByMaxWords(c, maxWords).length - 1)
  }
  return extra
}

export const GEN_MIN_DUR = 0.15

export function resizeGeneratedClip(orig, mode, deltaT) {
  const minDur = GEN_MIN_DUR
  const start = Number(orig?.start) || 0
  const inP = Number(orig?.in_point) || 0
  const outP = Number(orig?.out_point) || 0
  const src = Number(orig?.source_duration) > 0 ? Number(orig.source_duration) : outP
  const dur = Math.max(0, outP - inP)
  const d = Number(deltaT) || 0

  if (mode === 'trim-right') {
    const newDur = Math.max(minDur, dur + d)
    const newOut = inP + newDur
    return {
      out_point: +newOut.toFixed(3),
      source_duration: +Math.max(src, newOut).toFixed(3),
    }
  }
  if (mode === 'trim-left') {
    if (inP <= 1e-9 && d < 0) {
      const ns = Math.max(0, start + d)
      const grown = start - ns
      const newOut = outP + grown
      return {
        start: +ns.toFixed(3),
        in_point: 0,
        out_point: +newOut.toFixed(3),
        source_duration: +Math.max(src, newOut).toFixed(3),
      }
    }
    const ni = Math.min(outP - minDur, Math.max(0, inP + d))
    const ns = Math.max(0, start + (ni - inP))
    return {
      in_point: +ni.toFixed(3),
      start: +ns.toFixed(3),
    }
  }
  return {}
}

/** Patch de recorte (asas izquierda/derecha) sobre un clip de timeline. */
export function trimClipPatch(orig, mode, deltaT) {
  if (!orig || (mode !== 'trim-left' && mode !== 'trim-right')) return null
  if (isGeneratedDurationClip(orig)) return resizeGeneratedClip(orig, mode, deltaT)
  const sp = clipSpeed(orig)
  const minSrc = GEN_MIN_DUR * sp
  if (mode === 'trim-left') {
    const ni = Math.min(orig.out_point - minSrc, Math.max(0, orig.in_point + deltaT * sp))
    const ns = Math.max(0, orig.start + (ni - orig.in_point) / sp)
    return { in_point: +ni.toFixed(3), start: +ns.toFixed(3) }
  }
  const maxOut = orig.source_duration > 0 ? orig.source_duration : orig.out_point + 3600
  const no = Math.min(maxOut, Math.max(orig.in_point + minSrc, orig.out_point + deltaT * sp))
  return { out_point: +no.toFixed(3) }
}

/** Cabezal al que debe ir Resultado mientras se recorta un borde. */
export function trimPreviewHead(orig, mode, deltaT) {
  const patch = trimClipPatch(orig, mode, deltaT)
  if (!patch) return null
  const next = { ...orig, ...patch }
  if (mode === 'trim-left') return next.start
  return Math.max(next.start, clipEnd(next) - LAST_FRAME_PULL)
}

/** Recorta o alarga un clip para que dure `targetDur` en la timeline. Vídeo/audio no pasan de la fuente. */
export function durationPatchToMatch(clip, targetDur) {
  const minDur = GEN_MIN_DUR
  const want = Math.max(minDur, Number(targetDur) || 0)
  const inP = Number(clip?.in_point) || 0
  const outP = Number(clip?.out_point) || 0
  const sp = clipSpeed(clip)
  let newOut = inP + want * sp
  if (isGeneratedDurationClip(clip)) {
    const src = Number(clip?.source_duration) > 0 ? Number(clip.source_duration) : outP
    return {
      out_point: +newOut.toFixed(3),
      source_duration: +Math.max(src, newOut).toFixed(3),
    }
  }
  const srcDur = Number(clip?.source_duration) || 0
  const maxOut = srcDur > 0 ? srcDur : outP
  const minOut = inP + minDur * sp
  newOut = Math.min(maxOut, Math.max(minOut, newOut))
  if (maxOut < minOut) newOut = maxOut
  return { out_point: +newOut.toFixed(3) }
}

/** Deja `frontId` encima (más tarde en el array) y los de `behindIds` de la misma pista detrás. */
export function sendClipsBehind(clips, frontId, behindIds) {
  const list = clips || []
  const front = list.find((c) => c.id === frontId)
  if (!front) return list
  const behindSet = new Set(behindIds || [])
  const pending = list.filter((c) => behindSet.has(c.id) && c.track_id === front.track_id)
  if (!pending.length) return list
  const pendingIds = new Set(pending.map((c) => c.id))
  const out = []
  for (const c of list) {
    if (pendingIds.has(c.id)) continue
    if (c.id === frontId) {
      out.push(...pending, c)
      continue
    }
    out.push(c)
  }
  return out
}

/** Copia el rango de timeline del primer clip (mismo start y misma duración). Cada clip se queda en su pista. */
export function matchClipsToFirstDuration(clips, selectedIds) {
  const ids = (selectedIds || []).filter(Boolean)
  if (ids.length < 2) return clips || []
  const first = (clips || []).find((c) => c.id === ids[0])
  if (!first) return clips || []
  const targetDur = clipDur(first)
  const targetStart = +Math.max(0, Number(first.start) || 0).toFixed(3)
  const rest = ids.slice(1)
  const restSet = new Set(rest)
  const next = (clips || []).map((c) => {
    if (!restSet.has(c.id)) return c
    return { ...c, start: targetStart, ...durationPatchToMatch(c, targetDur) }
  })
  return sendClipsBehind(next, first.id, rest)
}

export function canLayerClip(clip) {
  const k = clip?.kind
  return k === 'video' || k === 'image' || k === 'shape' || k === 'text'
}

/** Capa en la pista: 1 = fondo, `count` = frente. */
export function clipLayerInfo(clips, clipId) {
  const list = clips || []
  const clip = list.find((c) => c.id === clipId)
  if (!clip) return { index: 1, count: 1, canBack: false, canFront: false }
  const row = list.filter((c) => c.track_id === clip.track_id)
  const p = row.findIndex((c) => c.id === clipId)
  const count = row.length
  return {
    index: p + 1,
    count,
    canBack: p > 0,
    canFront: p >= 0 && p < count - 1,
  }
}

/** `back` al fondo, `backward` una capa atrás, `forward` una adelante, `front` al frente. */
export function moveClipLayer(clips, clipId, action) {
  const list = clips || []
  const clip = list.find((c) => c.id === clipId)
  if (!clip) return list
  const trackIds = []
  const trackIdx = []
  list.forEach((c, i) => {
    if (c.track_id === clip.track_id) {
      trackIds.push(c.id)
      trackIdx.push(i)
    }
  })
  const p = trackIds.indexOf(clipId)
  if (p < 0) return list
  let next = trackIds.slice()
  if (action === 'backward' && p > 0) {
    const t = next[p - 1]; next[p - 1] = next[p]; next[p] = t
  } else if (action === 'forward' && p < next.length - 1) {
    const t = next[p + 1]; next[p + 1] = next[p]; next[p] = t
  } else if (action === 'back' && p > 0) {
    next = [clipId, ...trackIds.filter((id) => id !== clipId)]
  } else if (action === 'front' && p < next.length - 1) {
    next = [...trackIds.filter((id) => id !== clipId), clipId]
  } else {
    return list
  }
  const byId = new Map(list.map((c) => [c.id, c]))
  const out = list.slice()
  next.forEach((id, k) => { out[trackIdx[k]] = byId.get(id) })
  return out
}

// Orden en pantalla: texto (arriba), luego vídeo (capa superior arriba), luego audio.
export function displayTracks(tracks) {
  const txt = tracks.filter((t) => t.kind === 'text')
  const vids = tracks.filter((t) => t.kind === 'video')
  const auds = tracks.filter((t) => t.kind === 'audio')
  return [...txt.slice().reverse(), ...vids.slice().reverse(), ...auds]
}

// --- Formatos de salida disponibles ---
export const FORMATS = [
  { id: '9:16', w: 720, h: 1280 },
  { id: '9:16 HD', w: 1080, h: 1920 },
  { id: '16:9', w: 1280, h: 720 },
  { id: '1:1', w: 1080, h: 1080 },
  { id: '4:5', w: 864, h: 1080 },
  { id: '4:3', w: 960, h: 720 },
]

// Al regenerar un clip su archivo se reescribe con la MISMA URL; sin esto el
// navegador serviría el render viejo cacheado (mismo encuadre). media_version
// (created_at del material, que cambia en cada guardado) fuerza recargar el nuevo.
function withMediaVersion(url, clip) {
  const v = clip?.media_version
  if (!v) return url
  const q = encodeURIComponent(v)
  return url.includes('?') ? `${url}&v=${q}` : `${url}?v=${q}`
}

// URL del medio de un clip (vídeo/audio/sfx) para el elemento <video>/<audio>.
export function mediaUrl(pid, clip) {
  if (clip.media_url) return clip.media_url
  if (clip.asset_kind === 'sfx') return `/api/sfx/file/${clip.filename.split('/').map(encodeURIComponent).join('/')}`
  const kind = clip.asset_kind === 'audios' ? 'audio'
    : (clip.asset_kind === 'images' || clip.kind === 'image') ? 'image'
      : 'video'
  if ((clip.asset_scope || 'project') === 'library') {
    return withMediaVersion(`/api/library/media/${kind}/${encodeURIComponent(clip.filename)}`, clip)
  }
  return withMediaVersion(`/api/media/${pid}/${kind}/${encodeURIComponent(clip.filename)}`, clip)
}

// Pistas por defecto de un proyecto nuevo.
export function defaultTracks() {
  return [
    { id: 'V1', kind: 'video', name: 'V1', hidden: false, muted: false, locked: false },
    { id: 'V2', kind: 'video', name: 'V2', hidden: false, muted: false, locked: false },
    { id: 'A1', kind: 'audio', name: 'A1', hidden: false, muted: false, locked: false },
    { id: 'A2', kind: 'audio', name: 'A2', hidden: false, muted: false, locked: false },
  ]
}

export const newReframe = () => ({
  zoom: 1, pan_mode: 'smooth', dual_crop: false,
  split_orientation: 'vertical', split_layout: 'auto', master: false,
  face_track_mode: null,
  keyframes: [], keyframes2: [],
})

// Asegura ids en los keyframes (para color/selección estables).
export function withKfIds(reframe) {
  if (!reframe) return reframe
  const fix = (arr) => (arr || []).map((k) => (k.id ? k : { ...k, id: uid('k') }))
  return { ...newReframe(), ...reframe, keyframes: fix(reframe.keyframes), keyframes2: fix(reframe.keyframes2) }
}

// Crea un clip de vídeo/audio a partir de un asset de la biblioteca.
export function makeClip(assetKind, item, trackId, start, dur) {
  const kind = assetKind === 'clips' ? 'video' : assetKind === 'images' ? 'image' : 'audio'
  const fromLibrary = item?.scope === 'library' || String(item?.id || '').startsWith('lib_')
  const visual = kind === 'video' || kind === 'image'
  const fromLib = kind === 'video' && isMasterReframe(item.reframe)
  const defaultDur = kind === 'image' ? IMAGE_DEFAULT_DUR : 1
  const span = +Math.max(0.3, dur || defaultDur).toFixed(3)
  return {
    id: uid('c'),
    track_id: trackId,
    kind,
    asset_kind: assetKind,
    asset_id: fromLibrary
      ? String(item.id)
      : (assetKind === 'clips' ? String(item.index) : String(item.id)),
    asset_scope: fromLibrary ? 'library' : 'project',
    filename: assetKind === 'sfx' ? item.id : item.filename,
    name: item.label || item.name || item.filename,
    start: +Math.max(0, start).toFixed(3),
    in_point: 0,
    out_point: span,
    source_duration: span,
    volume: 1,
    muted: false,
    speed: 1,
    keep_pitch: true,
    reverse: false,
    speed_curve: null,
    media_version: item.created_at || item.media_version || null,
    reframe: visual
      ? (fromLib ? withKfIds({ ...newReframe(), ...item.reframe }) : newReframe())
      : null,
    layout: visual ? 'fill' : undefined,
    frame: visual ? 'full' : undefined,
    appear: 'none',
    exit: 'none',
    look: 'none',
    effects: {},
    audio_fx: {},
    description: item.description || item.text || null,
    dup_of: null,
  }
}

// Crea un clip de texto.
export function makeTextClip(trackId, start, dur, text, style, opts = {}) {
  const role = opts.text_role === 'caption' ? 'caption' : 'free'
  const st = { ...(style || defaultTextStyle()) }
  return {
    id: uid('c'), track_id: trackId, kind: 'text', asset_kind: 'text', asset_id: uid('t'),
    filename: '', name: (text || 'Texto').slice(0, 22), start: +Math.max(0, start).toFixed(3),
    in_point: 0, out_point: +Math.max(0.5, dur).toFixed(3), source_duration: +Math.max(0.5, dur).toFixed(3),
    volume: 1, muted: false, speed: 1, keep_pitch: true, reverse: false, speed_curve: null,
    reframe: null, text: text || 'Texto', style: st,
    words: [], text_role: role,
    description: null,
    dup_of: null,
  }
}

export function makeShapeClip(trackId, start, dur, preset = {}) {
  const type = preset.type || preset.shape?.type || preset.shape_type || 'rect'
  const st = { ...defaultShape(type), ...(preset.shape || {}) }
  const span = +Math.max(0.3, dur || SHAPE_DEFAULT_DUR).toFixed(3)
  return {
    id: uid('c'),
    track_id: trackId,
    kind: 'shape',
    asset_kind: 'shape',
    asset_id: type,
    filename: '',
    name: preset.label || preset.name || st.type,
    start: +Math.max(0, start).toFixed(3),
    in_point: 0,
    out_point: span,
    source_duration: span,
    volume: 1,
    muted: false,
    speed: 1,
    keep_pitch: true,
    reverse: false,
    speed_curve: null,
    reframe: null,
    appear: 'none',
    exit: 'none',
    look: 'none',
    effects: {},
    audio_fx: {},
    shape: st,
    description: null,
    dup_of: null,
  }
}

export function isEditingExistingClip(meta) {
  return meta?.existingIndex != null && meta.existingIndex !== ''
}

export function clipSaveIndex(meta, fallback) {
  if (isEditingExistingClip(meta)) return Number(meta.existingIndex)
  return fallback
}

export function lineageRoot(clip) {
  return clip?.dup_of || clip?.id
}

export function dupCount(clips, clip) {
  if (!clip) return 0
  const root = lineageRoot(clip)
  return Math.max(0, (clips || []).filter((c) => lineageRoot(c) === root).length - 1)
}

export function duplicateClipOntoTrack(clip, trackId, newId) {
  const copy = JSON.parse(JSON.stringify(clip))
  copy.id = newId
  copy.track_id = trackId
  copy.dup_of = lineageRoot(clip)
  if (copy.reframe) {
    const strip = (arr) => (arr || []).map(({ id: _id, ...k }) => k)
    copy.reframe = withKfIds({
      ...copy.reframe,
      keyframes: strip(copy.reframe.keyframes),
      keyframes2: strip(copy.reframe.keyframes2),
    })
  }
  return copy
}

export function syncMaterialInstances(clips, patch) {
  const { assetKind, assetId } = patch
  const dur = Number(patch.duration)
  const hasDur = Number.isFinite(dur) && dur > 0
  return (clips || []).map((c) => {
    if (c.asset_kind !== assetKind || String(c.asset_id) !== String(assetId)) return c
    const next = { ...c }
    if (patch.filename) next.filename = patch.filename
    if (patch.name != null) next.name = patch.name
    if (patch.description !== undefined) next.description = patch.description
    if (patch.reframe) next.reframe = patch.reframe
    if (patch.media_version) next.media_version = patch.media_version
    if (hasDur) {
      next.source_duration = dur
      next.out_point = Math.min(next.out_point ?? dur, dur)
      next.in_point = Math.min(next.in_point ?? 0, next.out_point)
    }
    return next
  })
}

export function applyFaceTrack(reframe, keyframes, mode) {
  const pan = mode === 'direct' ? 'direct' : 'smooth'
  const base = reframe || newReframe()
  const incoming = keyframes || []
  const kfs = incoming.length
    ? incoming.map((k) => ({ ...k, pan_mode: pan }))
    : (base.keyframes || []).map((k) => ({ ...k, pan_mode: pan }))
  return withKfIds({
    ...base,
    pan_mode: pan,
    face_track_mode: pan,
    keyframes: kfs,
  })
}

export function clipCopyText(clip, materials) {
  const own = String(clip?.description || clip?.text || '').trim()
  if (own) return own
  if (clip?.kind && clip.kind !== 'audio') return ''
  const id = String(clip?.asset_id || '')
  const file = clip?.filename
  if (!id && !file) return ''
  const hit = (materials || []).find((a) => (
    (id && (String(a.id) === id || String(a.asset_id) === id))
    || (file && a.filename === file)
  ))
  return String(hit?.description || hit?.text || '').trim()
}

export function trackTextContent(clips, trackId) {
  return (clips || [])
    .filter((c) => c?.track_id === trackId && c?.kind === 'text')
    .sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0))
    .map((c) => String(c.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function trackContextItems(track, { linked = false, canLink = false, hasText = false } = {}) {
  const items = [{ id: 'rename', label: 'Renombrar' }]
  if (track?.kind === 'audio') {
    items.push({
      id: linked ? 'unlink' : 'link',
      label: linked ? 'Desrelacionar' : 'Relacionar',
      disabled: !linked && !canLink,
    })
  }
  if (track?.kind === 'text') {
    items.push({ id: 'copy-text', label: 'Copiar texto', disabled: !hasText })
  }
  items.push({ id: 'delete', label: 'Eliminar', danger: true })
  return items
}

export function linkedPartnerName(track, tracks) {
  if (!track?.linked_track_id) return null
  return (tracks || []).find((t) => t.id === track.linked_track_id)?.name || null
}

export function linkTrackPair(tracks, audioId, textId) {
  const audio = (tracks || []).find((t) => t.id === audioId)
  const text = (tracks || []).find((t) => t.id === textId)
  if (!audio || audio.kind !== 'audio' || !text || text.kind !== 'text') return tracks
  return tracks.map((t) => {
    if (t.id === audioId) return { ...t, linked_track_id: textId }
    if (t.id === textId) return { ...t, linked_track_id: audioId }
    if (t.linked_track_id === audioId || t.linked_track_id === textId) {
      return { ...t, linked_track_id: null }
    }
    return t
  })
}

export function unlinkTrackPair(tracks, trackId) {
  const t = (tracks || []).find((x) => x.id === trackId)
  const other = t?.linked_track_id
  if (!other) return tracks
  return tracks.map((x) => (
    x.id === trackId || x.id === other ? { ...x, linked_track_id: null } : x
  ))
}

export function scaleTextClipFromAnchor(clip, anchorStart, scale) {
  const dur = clipSourceDur(clip)
  const start = anchorStart + (clip.start - anchorStart) * scale
  const nextDur = Math.max(0.05, dur * scale)
  const words = (clip.words || []).map((w) => ({
    ...w,
    start: +((w.start || 0) * scale).toFixed(3),
    end: +((w.end || 0) * scale).toFixed(3),
  }))
  return {
    ...clip,
    start: +Math.max(0, start).toFixed(3),
    in_point: 0,
    out_point: +nextDur.toFixed(3),
    source_duration: +nextDur.toFixed(3),
    words,
  }
}

export function applyAudioSpeedToLinkedText(clips, tracks, audioClip, newSpeed) {
  if (!audioClip || audioClip.kind !== 'audio') return clips
  const audioTrack = (tracks || []).find((t) => t.id === audioClip.track_id)
  const textTrackId = audioTrack?.linked_track_id
  if (!textTrackId) return clips
  const oldSp = clipSpeed(audioClip)
  const nextSp = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number(newSpeed) || 1))
  if (Math.abs(oldSp - nextSp) < 1e-6) return clips
  const scale = oldSp / nextSp
  const a0 = audioClip.start
  const a1 = clipEnd(audioClip)
  return (clips || []).map((c) => {
    if (c.kind !== 'text' || c.track_id !== textTrackId) return c
    const end = clipEnd(c)
    if (end <= a0 + 1e-3 || c.start >= a1 - 1e-3) return c
    return scaleTextClipFromAnchor(c, a0, scale)
  })
}

/** Tiempo que un clip sigue resaltado en la timeline tras un write del MCP. */
export const MCP_BUSY_MS = 2800

/** Ids de clips que el MCP está tocando (jobs en curso o writes recientes). */
export function mcpBusyClipIds(active = [], entries = [], clips = [], now = Date.now()) {
  const ids = new Set()
  const add = (meta) => {
    if (!meta) return
    if (meta.clip_id) ids.add(String(meta.clip_id))
    if (meta.source_clip_id) ids.add(String(meta.source_clip_id))
    const fn = meta.filename
    if (fn) {
      for (const c of clips) {
        if (c.filename === fn || c.asset_id === fn) ids.add(c.id)
      }
    }
  }
  for (const a of active) add(a.meta)
  for (const e of entries) {
    if (e.access === 'read') continue
    const t = Date.parse(e.ts)
    if (!Number.isFinite(t) || now - t > MCP_BUSY_MS) continue
    add(e.meta)
  }
  return [...ids]
}
