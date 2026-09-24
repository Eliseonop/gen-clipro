// Progreso compacto de un job: una línea (spinner · mensaje recortado · %) y una
// barra fina debajo. Sin `progress` es indeterminado (sin % y barra en vaivén).
// El mensaje completo queda en el title. Estilos: .ed-job* en editor.css.
export default function JobProgress({ job, message, progress, className = '' }) {
  const raw = progress ?? job?.progress
  const determinate = raw != null
  const p = determinate ? Math.max(0, Math.min(100, Math.round(raw * 100))) : 0
  const msg = message || job?.message || 'Procesando…'
  return (
    <div className={`ed-job ${className}`} title={msg} role="status">
      <div className="ed-job-row">
        <span className="ed-job-spin" aria-hidden="true" />
        <span className="ed-job-msg">{msg}</span>
        {determinate && <b>{p}%</b>}
      </div>
      <div className={`ed-job-bar${determinate ? '' : ' indeterminate'}`}>
        <i style={determinate ? { width: `${p}%` } : undefined} />
      </div>
    </div>
  )
}
