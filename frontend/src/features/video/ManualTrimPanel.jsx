import { useState, useEffect } from 'react'
import Icon from '../../components/Icon'
import { fmt, parseTime } from '../../lib/utils'
import Timeline from './Timeline'

// Entrada de tiempo "m:ss" que valida y confirma al salir/Enter.
function TimeInput({ value, max, onCommit }) {
  const [text, setText] = useState(fmt(value))
  useEffect(() => { setText(fmt(value)) }, [value])

  function commit() {
    const s = parseTime(text)
    if (s == null) { setText(fmt(value)); return }
    onCommit(Math.max(0, Math.min(s, max)))
  }

  return (
    <input
      className="time-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.target.blur() } }}
    />
  )
}

// Info del vídeo + recorte manual del tramo + previsualización embebida.
export default function ManualTrimPanel({ result, dur, heatmapSegments, inT, outT, setInT, setOutT, manualPreview, setManualPreview, onEditManual }) {
  return (
    <section className="card">
      <div className="video-info">
        {result.video.thumbnail && <img src={result.video.thumbnail} alt="" />}
        <div>
          <h2>{result.video.title}</h2>
          <p className="muted">{result.video.uploader} · {fmt(dur)}</p>
        </div>
      </div>

      <h3>Recortar tramo manual</h3>
      <Timeline
        duration={dur}
        segments={heatmapSegments}
        inT={inT} outT={outT} setInT={setInT} setOutT={setOutT}
      />

      <div className="cutter-fields">
        <label className="field"><span>Inicio (m:ss)</span>
          <TimeInput value={inT} max={dur} onCommit={(s) => setInT(Math.max(0, Math.min(s, outT - 0.5)))} />
        </label>
        <label className="field"><span>Fin (m:ss)</span>
          <TimeInput value={outT} max={dur} onCommit={(s) => setOutT(Math.min(dur, Math.max(s, inT + 0.5)))} />
        </label>
        <button className="ghost" onClick={() => setManualPreview((v) => !v)}>
          {manualPreview ? '✕ Cerrar' : '▶ Previsualizar'}
        </button>
      </div>

      {manualPreview && result.video.id && (
        <div className="seg-player">
          <iframe
            src={`https://www.youtube.com/embed/${result.video.id}?start=${Math.floor(inT)}&end=${Math.ceil(outT)}&autoplay=1&rel=0`}
            title="Preview rango" allow="autoplay; encrypted-media" allowFullScreen
          />
        </div>
      )}

      <button className="primary big" onClick={onEditManual}>
        <Icon name="movie_edit" size={18} /> Caja · Editar ({fmt(Math.max(0, outT - inT))})
      </button>

      {!result.has_heatmap && (
        <p className="muted" style={{ marginTop: 12 }}>
          Sin datos de "Most Replayed" — usa el recorte manual de arriba.
        </p>
      )}
    </section>
  )
}
