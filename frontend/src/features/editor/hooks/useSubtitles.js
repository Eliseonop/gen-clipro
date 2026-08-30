// Generación de subtítulos: lanza el job, lo sondea y construye los clips de texto.
import { useState, useEffect } from 'react'
import { getJob, generateSubtitles, transcribeClip } from '../../../services/api'
import { subtitleStyle } from '../../../lib/textstyles'
import { canCaptionClip, textClipsFromTranscript } from '../editorModel'

export function useSubtitles(projectId, { tracksRef, ensureTextTrack, setClips, setCtxMenu, onChange }) {
  const [subJob, setSubJob] = useState(null)

  function requestSubtitles(clip) {
    setCtxMenu(null)
    if (!canCaptionClip(clip)) return
    const start = clip.kind === 'video'
      ? transcribeClip(projectId, clip.asset_id || clip.index, 'base')
      : generateSubtitles(projectId, { filename: clip.filename, asset_kind: clip.asset_kind, model: 'base' })
    start
      .then((job) => setSubJob({ ...job, srcClip: clip }))
      .catch((e) => setSubJob({ status: 'error', error: e.message }))
  }

  function buildSubtitleClips(job) {
    const src = job.srcClip
    const existing = tracksRef.current.find((t) => t.kind === 'text')
    const style = existing?.style || subtitleStyle()
    const tid = ensureTextTrack(style)
    const news = textClipsFromTranscript(src, job.transcript.segments || [], tid, style)
    if (news.length) setClips((prev) => [...prev, ...news])
  }

  useEffect(() => {
    if (!subJob || subJob.status === 'done' || subJob.status === 'error') {
      if (subJob?.status === 'done' && subJob.transcript && subJob.srcClip) {
        buildSubtitleClips(subJob)
        onChange?.()
        setSubJob(null)
      }
      return
    }
    const id = setInterval(async () => {
      try { const j = await getJob(subJob.id); setSubJob({ ...j, srcClip: subJob.srcClip }) } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subJob?.id, subJob?.status])

  return { subJob, setSubJob, requestSubtitles }
}
