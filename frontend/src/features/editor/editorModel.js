// Modelo del editor de vídeo: fábricas puras y helpers de dominio (sin React ni canvas).
// Centraliza la creación de clips/tracks/keyframes y las constantes de formato para
// que los componentes y hooks del editor compartan una única fuente de verdad.
import { defaultTextStyle } from '../../lib/textstyles.js'
import { isMasterReframe } from '../../lib/recipeLayout.js'
import { chunkCaptionText, splitCaptionWords } from '../../lib/textKaraoke.js'
import { isFreeText } from '../../lib/textRole.js'

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
  return c?.kind === 'text' || c?.kind === 'image'
}

export function trackKindForClip(kind) {
  if (kind === 'image' || kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'
  if (kind === 'text') return 'text'
  return kind
}

export function laneKindForAsset(assetKind) {
  if (assetKind === 'clips' || assetKind === 'video' || assetKind === 'images' || assetKind === 'image') return 'video'
  return 'audio'
}

export function clipSpeed(c) {
  if (!c || c.kind === 'text' || c.kind === 'image') return 1
  const s = Number(c.speed)
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, s))
}

export const clipSourceDur = (c) => Math.max(0, (c?.out_point ?? 0) - (c?.in_point ?? 0))
export const clipDur = (c) => clipSourceDur(c) / clipSpeed(c)
export const clipEnd = (c) => c.start + clipDur(c)

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
  return {
    tracks: (tracks || []).filter((t) => t.id !== trackId),
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
  if (isFreeText(clip)) return clip ? [clip] : []
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
    if (c.kind === 'text' && c.track_id === trackId) out.push(...splitClipByMaxWords(c, maxWords))
    else out.push(c)
  }
  return out
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
 * additive = Ctrl/Cmd, range = Shift, keepGroup = clic en un clip ya marcado.
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
  { id: '16:9', w: 1280, h: 720 },
  { id: '1:1', w: 1080, h: 1080 },
  { id: '4:5', w: 864, h: 1080 },
  { id: '4:3', w: 960, h: 720 },
]

// URL del medio de un clip (vídeo/audio/sfx) para el elemento <video>/<audio>.
export function mediaUrl(pid, clip) {
  if (clip.asset_kind === 'sfx') return `/api/sfx/file/${clip.filename.split('/').map(encodeURIComponent).join('/')}`
  const kind = clip.asset_kind === 'audios' ? 'audio'
    : (clip.asset_kind === 'images' || clip.kind === 'image') ? 'image'
      : 'video'
  if ((clip.asset_scope || 'project') === 'library') {
    return `/api/library/media/${kind}/${encodeURIComponent(clip.filename)}`
  }
  return `/api/media/${pid}/${kind}/${encodeURIComponent(clip.filename)}`
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
    keep_pitch: false,
    reverse: false,
    speed_curve: null,
    reframe: visual
      ? (fromLib ? withKfIds({ ...newReframe(), ...item.reframe }) : newReframe())
      : null,
    layout: visual ? 'fill' : undefined,
    frame: visual ? 'full' : undefined,
    appear: 'none',
    exit: 'none',
    look: 'none',
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
    volume: 1, muted: false, speed: 1, keep_pitch: false, reverse: false, speed_curve: null,
    reframe: null, text: text || 'Texto', style: st,
    words: [], text_role: role,
  }
}
