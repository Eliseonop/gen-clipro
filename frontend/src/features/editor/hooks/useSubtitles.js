// Generación de subtítulos: lanza el job, lo sondea y construye los clips de texto.
import { useState, useEffect } from 'react'
import { getJob, generateSubtitles } from '../../../services/api'
import { subtitleStyle } from '../../../lib/textstyles'
import { makeTextClip } from '../editorModel'

export function useSubtitles(projectId, { tracksRef, ensureTextTrack, setClips, setCtxMenu }) {
  const [subJob, setSubJob] = useState(null)

  function requestSubtitles(clip) {
    setCtxMenu(null)
    if (!clip || (clip.asset_kind !== 'audios' && clip.asset_kind !== 'sfx')) return
    generateSubtitles(projectId, { filename: clip.filename, asset_kind: clip.asset_kind, model: 'base' })
      .then((job) => setSubJob({ ...job, srcClip: clip }))
      .catch((e) => setSubJob({ status: 'error', error: e.message }))
  }

  function buildSubtitleClips(job) {
    const src = job.srcClip
    const existing = tracksRef.current.find((t) => t.kind === 'text')
    const style = existing?.style || subtitleStyle()
    const tid = ensureTextTrack(style)
    const clipLen = src.out_point - src.in_point
    const news = []
    for (const s of job.transcript.segments || []) {
      const ls = s.start - src.in_point, le = s.end - src.in_point
      if (le <= 0 || ls >= clipLen) continue
      const start = src.start + Math.max(0, ls)
      const end = src.start + Math.min(clipLen, le)
      if (!(s.text || '').trim()) continue
      news.push(makeTextClip(tid, start, Math.max(0.4, end - start), s.text.trim(), style))
    }
    if (news.length) setClips((prev) => [...prev, ...news])
  }

  useEffect(() => {
    if (!subJob || subJob.status === 'done' || subJob.status === 'error') {
      if (subJob?.status === 'done' && subJob.transcript && subJob.srcClip) { buildSubtitleClips(subJob); setSubJob(null) }
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
