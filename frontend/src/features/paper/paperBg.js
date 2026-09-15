// "Quitar fondo" de Paper Animator = la MISMA eliminación de fondo del editor.
//
// No hay aquí ningún modelo, ninguna derivación de matte y ningún caché nuevo:
//   · el matte lo calcula el backend con el job de siempre (`/bg-removal`,
//     backend/app/jobs._run_bg_removal), con su caché por `base_key`;
//   · el alfa se deriva en el navegador con `cutoutDrawable` (editor/bgCutout),
//     que es lo que ya usa el preview del editor y lo que replica el export.
//
// Lo único propio de Paper es el final: el editor deja el matte como PROPIEDAD
// del clip (`clip.bg_removal`) y lo aplica al dibujar, mientras que aquí el alfa
// se hornea en la imagen, porque el borde rasgado y las máscaras de papel se
// calculan a partir de sus píxeles. Deshacerlo es cosa del undo del estado
// (imageSig) y de "Restablecer imagen", igual que el pincel.
//
// La imagen tiene que estar en el material del proyecto: el job trabaja sobre el
// ARCHIVO. Una imagen subida solo a Paper se sube antes al proyecto (`ensureAsset`).

import { createBgCutoutJob, createBgRemovalJob, getJob, uploadImages } from '../../services/api'
import { cutoutDrawable, resetBgMeta, resetCutout } from '../editor/bgCutout'
import { defaultBg, normalizeBg } from '../../lib/clipBg'

// Id del pseudo-clip con el que se habla con bgCutout. Sus cachés van por id, así
// que uno fijo basta: en Paper solo hay un objeto a la vez.
const PAPER_CLIP_ID = 'paper_object'

const POLL_MS = 700
const MATTE_WAIT_MS = 15000
const MATTE_STEP_MS = 120

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Descriptor del material sobre el que lanzar el job, subiendo la imagen al
 * proyecto si solo existía en memoria (subida local en el panel de Paper).
 *
 * @returns {Promise<{asset_id: string, filename: string}>}
 */
export async function ensureAsset(projectId, asset, file, name) {
  if (asset?.filename) return asset
  if (!file) throw new Error('Esta imagen no está en el material del proyecto.')
  const res = await uploadImages(projectId, [new File([file], name || file.name || 'paper.png', { type: file.type || 'image/png' })])
  const saved = (res?.images || [])[0]
  if (!saved?.filename) throw new Error(res?.errors?.[0]?.error || 'No se pudo subir la imagen al proyecto.')
  return { asset_id: String(saved.id), filename: saved.filename, label: saved.label || saved.filename }
}

const GIF_RE = /\.gif(\?|#|$)/i

/** ¿El asset es animado (GIF)? Paper decodifica solo el primer frame, así que
 *  para conservar la animación hay que hornear un recorte animado al material en
 *  vez de aplicar el matte sobre la imagen fija. Los vídeos no se cargan en Paper. */
export function isAnimatedAsset(filename) {
  return GIF_RE.test(String(filename || ''))
}

/**
 * Lanza el job "Exportar recorte" (backend) y espera: renderiza el GIF ENTERO
 * con el fondo eliminado a un WebM transparente y lo mete en Vídeos. El resultado
 * SIGUE SIENDO animado y reutilizable en el timeline.
 * @returns {Promise<object|null>} el `asset` del job (asset_id/filename/label).
 */
export async function runCutoutJob(projectId, { asset, provider, onProgress, shouldCancel }) {
  let job = await createBgCutoutJob(projectId, {
    clip_id: PAPER_CLIP_ID,
    kind: 'image',
    asset_kind: 'images',
    asset_id: String(asset.asset_id ?? ''),
    filename: asset.filename,
    asset_scope: 'project',
    in_point: 0,
    out_point: 0,
    source_duration: 0,
    label: asset.label || undefined,
    bg_removal: {
      enabled: true,
      mode: 'auto',
      auto: { ...defaultBg().auto, enabled: true, provider },
      chroma: { enabled: false },
    },
  })

  while (job && (job.status === 'pending' || job.status === 'running')) {
    if (shouldCancel?.()) return null
    onProgress?.(job.progress || 0, job.message || 'Procesando…')
    await sleep(POLL_MS)
    job = await getJob(job.id)
  }
  if (!job || job.status === 'error') throw new Error(job?.error || 'No se pudo exportar el recorte.')
  return job.asset || {}
}

/** Pseudo-clip con el que `cutoutDrawable` sabe derivar el alfa. */
function paperClip(auto) {
  return {
    id: PAPER_CLIP_ID,
    kind: 'image',
    asset_kind: 'images',
    bg_removal: normalizeBg({ ...defaultBg(), auto: { ...auto, enabled: true, status: 'ready' } }),
  }
}

/**
 * Lanza el job del matte y espera a que termine.
 * @returns {Promise<object>} el `bg_removal` del job (base_key, provider…)
 */
export async function runMatteJob(projectId, { asset, provider, onProgress, shouldCancel }) {
  let job = await createBgRemovalJob(projectId, {
    clip_id: PAPER_CLIP_ID,
    kind: 'image',
    asset_kind: 'images',
    asset_id: String(asset.asset_id ?? ''),
    filename: asset.filename,
    asset_scope: 'project',
    in_point: 0,
    out_point: 0,
    source_duration: 0,
    auto: { ...defaultBg().auto, enabled: true, provider },
  })

  while (job && (job.status === 'pending' || job.status === 'running')) {
    if (shouldCancel?.()) return null
    onProgress?.(job.progress || 0, job.message || 'Procesando…')
    await sleep(POLL_MS)
    job = await getJob(job.id)
  }
  if (!job || job.status === 'error') throw new Error(job?.error || 'No se pudo eliminar el fondo.')
  if (!job.bg_removal?.base_key) throw new Error('El matte no llegó con una clave válida.')
  return { ...job.bg_removal, provider: job.bg_removal.provider || provider }
}

/**
 * Aplica el matte ya calculado a `sourceEl` y devuelve un canvas con alfa.
 *
 * El matte es del ARCHIVO, así que se aplica sobre la imagen ORIGINAL (sin el
 * margen que le añade buildPaperImage): estirarlo sobre el element con margen
 * lo dejaría descuadrado. Quien llama rehace después el pipeline de papel.
 *
 * Espera a que lleguen los metadatos y el PNG del matte, que bgCutout pide de
 * forma asíncrona y devuelve `null` hasta tenerlos.
 */
export async function applyMatte(sourceEl, bgResult, { shouldCancel } = {}) {
  const auto = {
    ...defaultBg().auto,
    provider: bgResult.provider,
    model_version: bgResult.model_version || '',
    base_key: bgResult.base_key,
    mask_fps: bgResult.mask_fps || undefined,
    mask_height: bgResult.mask_height || undefined,
  }
  // Un recálculo con la misma clave tiene que releer: si no, se pintaría el alfa
  // viejo que quedó en la caché del preview.
  resetCutout(PAPER_CLIP_ID)
  resetBgMeta(bgResult.base_key)

  const clip = paperClip(auto)
  const deadline = Date.now() + MATTE_WAIT_MS
  while (Date.now() < deadline) {
    if (shouldCancel?.()) return null
    const cut = cutoutDrawable(clip, sourceEl, 0)
    if (cut) {
      // El canvas es de bgCutout y se reutiliza en la siguiente llamada: se copia
      // antes de que nadie lo pise.
      const out = document.createElement('canvas')
      out.width = cut.width
      out.height = cut.height
      out.getContext('2d').drawImage(cut, 0, 0)
      resetCutout(PAPER_CLIP_ID)
      return out
    }
    await sleep(MATTE_STEP_MS)
  }
  throw new Error('El matte tardó demasiado en llegar.')
}
