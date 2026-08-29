export default function JobStatusBar({ progress, message, elapsed = 0, indeterminate = false }) {
  const pct = Math.max(4, Math.min(100, Math.round((progress || 0) * 100)))
  return (
    <div className="job-status-bar" role="status">
      <div className={`progress${indeterminate ? ' indeterminate' : ''}`}>
        <span style={indeterminate ? undefined : { width: `${pct}%` }} />
      </div>
      <div className="job-status-meta">
        <span className="job-status-msg">{message || 'Trabajando…'}</span>
        <span className="muted tabular">
          {elapsed > 0 ? `${elapsed}s` : ''}
          {!indeterminate ? ` · ${pct}%` : ''}
        </span>
      </div>
    </div>
  )
}
