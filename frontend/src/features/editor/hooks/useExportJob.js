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

  // Un export terminado es la timeline de ESE momento. Si luego se edita (p. ej. se
  // mutea una pista), «Descargar» seguiría bajando el render viejo: vuelve a «Exportar».
  useEffect(() => {
    setExportJob((j) => (j?.status === 'done' ? null : j))
  }, [timelinePayload])

  async function doExport() {
    try {
      // El fps es el del proyecto (timeline.fps), no el predeterminado global.
      await saveTimeline(projectId, timelinePayload())
      setExportJob(await exportTimeline(projectId, exportPayload()))
    } catch (e) { setExportJob({ status: 'error', error: e.message }) }
  }

  const exporting = exportJob && (exportJob.status === 'pending' || exportJob.status === 'running')

  return { exportJob, setExportJob, doExport, exporting }
}
