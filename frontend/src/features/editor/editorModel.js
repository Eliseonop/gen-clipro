// Modelo del editor de vídeo: fábricas puras y helpers de dominio (sin React ni canvas).
// Centraliza la creación de clips/tracks/keyframes y las constantes de formato para
// que los componentes y hooks del editor compartan una única fuente de verdad.
import { defaultTextStyle } from '../../lib/textstyles'

// --- Identificadores estables ---
let _uid = 1
export const uid = (p) => `${p}${Date.now().toString(36)}${(_uid++).toString(36)}`

// --- Duración/fin de un clip (tiempo de timeline) ---
export const clipDur = (c) => Math.max(0, c.out_point - c.in_point)
export const clipEnd = (c) => c.start + clipDur(c)

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
  const kind = clip.asset_kind === 'audios' ? 'audio' : 'video'
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

export const newReframe = () => ({ zoom: 1, pan_mode: 'smooth', dual_crop: false, split_orientation: 'vertical', keyframes: [], keyframes2: [] })

// Asegura ids en los keyframes (para color/selección estables).
export function withKfIds(reframe) {
  if (!reframe) return reframe
  const fix = (arr) => (arr || []).map((k) => (k.id ? k : { ...k, id: uid('k') }))
  return { ...newReframe(), ...reframe, keyframes: fix(reframe.keyframes), keyframes2: fix(reframe.keyframes2) }
}

// Crea un clip de vídeo/audio a partir de un asset de la biblioteca.
export function makeClip(assetKind, item, trackId, start, dur) {
  const kind = assetKind === 'clips' ? 'video' : 'audio'
  return {
    id: uid('c'),
    track_id: trackId,
    kind,
    asset_kind: assetKind,
    asset_id: assetKind === 'clips' ? String(item.index) : String(item.id),
    filename: assetKind === 'sfx' ? item.id : item.filename,
    name: item.label || item.name || item.filename,
    start: +Math.max(0, start).toFixed(3),
    in_point: 0,
    out_point: +Math.max(0.3, dur || 1).toFixed(3),
    source_duration: +Math.max(0.3, dur || 1).toFixed(3),
    volume: 1,
    reframe: kind === 'video' ? newReframe() : null,
  }
}

// Crea un clip de texto.
export function makeTextClip(trackId, start, dur, text, style) {
  return {
    id: uid('c'), track_id: trackId, kind: 'text', asset_kind: 'text', asset_id: uid('t'),
    filename: '', name: (text || 'Texto').slice(0, 22), start: +Math.max(0, start).toFixed(3),
    in_point: 0, out_point: +Math.max(0.5, dur).toFixed(3), source_duration: +Math.max(0.5, dur).toFixed(3),
    volume: 1, reframe: null, text: text || 'Texto', style: { ...(style || defaultTextStyle()) },
  }
}
