// Estado y sondeo del job de exportación del timeline.
import { useState, useEffect } from 'react'
import { getJob, saveTimeline, exportTimeline } from '../../../services/api'

export function useExportJob(projectId, { timelinePayload, exportPayload }) {
  const [exportJob, setExportJob] = useState(null)

  useEffect(() => {
    if (!exportJob || exportJob.status === 'done' || exportJob.status === 'error') return
    const id = setInterval(async () => {
      try { setExportJob(await getJob(exportJob.id)) } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportJob?.id, exportJob?.status])

  async function doExport() {
    try {
      await saveTimeline(projectId, timelinePayload())
      setExportJob(await exportTimeline(projectId, exportPayload()))
    } catch (e) { setExportJob({ status: 'error', error: e.message }) }
  }

  const exporting = exportJob && (exportJob.status === 'pending' || exportJob.status === 'running')

  return { exportJob, setExportJob, doExport, exporting }
}
