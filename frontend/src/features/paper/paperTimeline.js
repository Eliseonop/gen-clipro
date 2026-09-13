// Adaptador Paper Animator ↔ timeline del editor.
//
// Paper Animator NO tiene timeline propia: proyecta su estado al modelo de
// pistas/clips que ya sabe pintar `EdTimeline`, igual que hace Motion Studio con
// `motionLayersToTimeline`. Así se reutilizan tal cual la regla con ticks, el
// zoom por arrastre, el cabezal, el scrub, los puntos de keyframe con selección y
// arrastre, y el zoom con rueda — sin escribir un segundo componente de timeline.
//
// Lo que se proyecta:
//
//   ┌ Objeto ──────────────────────────────────────────────┐
//   │ ●1        ●2            ●3                           │   keyframes (modo avanzado)
//   └──────────────────────────────────────────────────────┘
//   ┌ Papel ───┐                            ┌──────────────┐
//   │ Abrir    │                            │ Cerrar       │   modo simple, 1 s cada uno
//   └──────────┘                            └──────────────┘
//
// Cada elemento de texto (letra, grupo o frase) proyecta su propia pista con el
// mismo tipo de clip que la imagen.
//
// El clip del objeto usa `kind: 'image'` a propósito: `isVisualClip` lo acepta
// (se pinta con etiqueta e icono) pero `hasVolumeControls` no, así que la
// timeline no le dibuja la curva de volumen, que aquí no significa nada.

import { selectedObject } from './paperModel.js'
import { elementLabel, glyphsSig } from './paperText.js'

export const PAPER_OBJECT_TRACK = 'paper_object'
export const PAPER_FOLD_TRACK = 'paper_fold'
export const PAPER_OBJECT_CLIP = 'paper_object_clip'
export const PAPER_FOLD_OPEN_CLIP = 'paper_fold_open'
export const PAPER_FOLD_CLOSE_CLIP = 'paper_fold_close'
export const PAPER_TEXT_TRACK_PREFIX = 'paper_text:'
export const PAPER_TEXT_CLIP_PREFIX = 'paper_text_clip:'

const SIMPLE_ANIM_DURATION = 1

/** Easing de Paper Animator → interpolación del editor (solo para pintar el punto). */
function interpOf(easing) {
  return easing === 'instant' ? 'hold' : 'linear'
}

function baseClip(id, trackId, kind, name, start, span, duration) {
  return {
    id,
    track_id: trackId,
    kind,
    asset_kind: kind,
    asset_id: id,
    filename: '',
    name,
    start: +start.toFixed(3),
    in_point: 0,
    out_point: +span.toFixed(3),
    source_duration: +Math.max(span, duration).toFixed(3),
    volume: 1,
    muted: false,
    speed: 1,
    keep_pitch: true,
    reverse: false,
    speed_curve: null,
    reframe: null,
    effects: {},
    audio_fx: {},
    description: null,
    dup_of: null,
    paper: true,
  }
}

/** Keyframes de un object de PA → formato del editor (solo para DIBUJARLOS). */
function projectKeyframes(object, duration) {
  const anim = object.animation
  if (anim.mode !== 'advanced') return { enabled: false, items: [] }
  return {
    enabled: true,
    items: [...anim.keyframes]
      .sort((a, b) => a.time - b.time)
      .map((kf) => ({
        id: kf.id,
        t: Math.min(duration, Math.max(0, kf.time)),
        interpolation: interpOf(kf.easing),
        props: { x: kf.x, y: kf.y, scale: kf.scale, rotation: kf.rotation },
      })),
  }
}

/** Id del clip de un elemento de texto, y su inverso. */
export function paperElementClipId(elementId) {
  return `${PAPER_TEXT_CLIP_PREFIX}${elementId}`
}

/**
 * ¿A qué object pertenece un clip? `'image'`, el id de un elemento de texto, o
 * null (bandas de papel y clips desconocidos).
 */
export function paperClipTarget(clipId) {
  if (clipId === PAPER_OBJECT_CLIP) return 'image'
  if (typeof clipId === 'string' && clipId.startsWith(PAPER_TEXT_CLIP_PREFIX)) {
    return clipId.slice(PAPER_TEXT_CLIP_PREFIX.length)
  }
  return null
}

/**
 * Estado de Paper Animator → `{tracks, clips}` para EdTimeline.
 *
 * Una pista por cosa animable: la imagen ("Objeto") y cada elemento de texto
 * (una letra, un grupo o la frase). Cada clip lleva los keyframes de SU object.
 * La pista "Papel" (apertura/cierre del modo simple) es la del object
 * seleccionado, que es el que editan el inspector y la barra de la timeline.
 * Devuelve pistas vacías si no hay nada (la timeline se ve, pero sin nada).
 */
export function paperStateToTimeline(st) {
  const elements = st?.text?.elements || []
  if (!st?.hasImage && !elements.length) return { tracks: [], clips: [] }

  const duration = Math.max(0.1, st.export.duration)
  const tracks = []
  const clips = []

  if (st.hasImage) {
    tracks.push({ id: PAPER_OBJECT_TRACK, kind: 'video', name: 'Objeto', muted: false, hidden: false, locked: false })
    const objectClip = baseClip(PAPER_OBJECT_CLIP, PAPER_OBJECT_TRACK, 'image', st.imageName || 'Objeto', 0, duration, duration)
    // La fuente de verdad sigue siendo `st`; nada de lo que pase aquí se guarda de
    // vuelta salvo por los handlers de la timeline (VideoEditor).
    objectClip.keyframes = projectKeyframes(st.object, duration)
    clips.push(objectClip)
  }

  for (const el of elements) {
    const trackId = `${PAPER_TEXT_TRACK_PREFIX}${el.id}`
    const label = elementLabel(st.text.glyphs, el)
    tracks.push({ id: trackId, kind: 'video', name: `Texto · ${label}`, muted: false, hidden: false, locked: false })
    const clip = baseClip(paperElementClipId(el.id), trackId, 'image', label, 0, duration, duration)
    clip.keyframes = projectKeyframes(el.object, duration)
    clips.push(clip)
  }

  const anim = selectedObject(st)?.animation
  if (anim && anim.mode !== 'advanced' && (anim.simple.open || anim.simple.close)) {
    tracks.push({
      id: PAPER_FOLD_TRACK, kind: 'video', name: 'Papel',
      muted: false, hidden: false, locked: true, // bloqueada: sus tiempos son fijos
    })
    const span = Math.min(SIMPLE_ANIM_DURATION, duration)
    if (anim.simple.open) {
      clips.push(baseClip(PAPER_FOLD_OPEN_CLIP, PAPER_FOLD_TRACK, 'shape', 'Abrir', 0, span, duration))
    }
    if (anim.simple.close) {
      clips.push(baseClip(PAPER_FOLD_CLOSE_CLIP, PAPER_FOLD_TRACK, 'shape', 'Cerrar', Math.max(0, duration - span), span, duration))
    }
  }

  return { tracks, clips }
}

/** ¿El clip es una banda de apertura/cierre? (no se puede mover ni recortar) */
export function isPaperFoldClip(clipId) {
  return clipId === PAPER_FOLD_OPEN_CLIP || clipId === PAPER_FOLD_CLOSE_CLIP
}

function objectSig(object) {
  const anim = object.animation
  const kf = anim.mode === 'advanced'
    ? anim.keyframes.map((k) => `${k.id}:${k.time}:${k.x}:${k.y}:${k.scale}:${k.rotation}:${k.easing}`).join(',')
    : `${anim.simple.open}:${anim.simple.close}`
  return `${anim.mode}|${kf}`
}

/**
 * Firma de lo que afecta a la proyección. Sirve para re-derivar `tracks`/`clips`
 * solo cuando hace falta, en vez de en cada cambio de propiedad (tocar un slider
 * de sombra no tiene por qué rehacer la timeline).
 */
export function paperTimelineSig(st) {
  const elements = st?.text?.elements || []
  if (!st?.hasImage && !elements.length) return 'empty'
  const image = st.hasImage ? `${st.imageName}|${objectSig(st.object)}` : '-'
  const text = elements.map((e) => `${e.id}:${e.from}-${e.to}:${objectSig(e.object)}`).join(';')
  return `${image}|${st.export.duration}|${st.selected}|${glyphsSig(st.text?.glyphs)}|${text}`
}
