import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { resolvePresets, resolvePreview, resolveExport } from '../../services/api'
import './resolve.css'

// Modal "Enviar a DaVinci Resolve": genera subtítulos animados por palabra
// (Título Fusion) + SRT + voz, para importar en Resolve Free. Muestra un preview
// en vivo del MISMO documento que se exportará (endpoint /resolve/preview).

function lastWordEnd(words) {
  return words && words.length ? words[words.length - 1].end : 0
}

// Palabra activa dentro de un segmento en el instante t (índice absoluto o -1).
function activeWordIdx(words, seg, t) {
  for (let i = seg.i0; i <= seg.i1; i++) {
    const start = words[i].start
    const end = i < seg.i1 ? words[i + 1].start : seg.end
    if (t >= start && t < end) return i
  }
  if (t >= seg.end) return seg.i1
  return -1
}

// Reparte las palabras del segmento en líneas según line_breaks (posición tras
// la que hay salto, relativa al segmento).
function segLines(words, seg) {
  const breaks = new Set(seg.line_breaks || [])
  const lines = []
  let cur = []
  for (let k = 0; k <= seg.i1 - seg.i0; k++) {
    cur.push(seg.i0 + k)
    if (breaks.has(k)) { lines.push(cur); cur = [] }
  }
  if (cur.length) lines.push(cur)
  return lines
}

function currentSegment(segments, t) {
  return segments.find((s) => t >= s.start && t < s.end) || null
}

export default function ResolvePanel({ project, onClose }) {
  const [presets, setPresets] = useState([])
  const [presetId, setPresetId] = useState('word-pop')
  const [data, setData] = useState(null)          // respuesta de /resolve/preview
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [voice, setVoice] = useState('')          // filename de audio del proyecto (opcional)
  const [includeTimeline, setIncludeTimeline] = useState(true)
  const [installScript, setInstallScript] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState(null)      // respuesta de /resolve/export
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)

  const audios = project.audios || []

  // Cargar presets una vez.
  useEffect(() => {
    let alive = true
    resolvePresets().then((ps) => { if (alive) setPresets(ps || []) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Pedir el preview (lo que se exportará) cada vez que cambia el preset.
  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setResult(null)
    resolvePreview(project.id, { preset: presetId })
      .then((d) => { if (alive) { setData(d); setT(0); setPlaying(true) } })
      .catch((e) => { if (alive) { setData(null); setError(e.message || 'No se pudo generar el preview.') } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [project.id, presetId])

  const duration = useMemo(() => {
    if (!data) return 0
    return Math.max(data.project?.duration || 0, lastWordEnd(data.words))
  }, [data])

  // Bucle de reproducción del preview.
  const raf = useRef(0)
  const last = useRef(0)
  useEffect(() => {
    if (!playing || !duration) return
    last.current = performance.now()
    const tick = (now) => {
      const dt = (now - last.current) / 1000
      last.current = now
      setT((prev) => {
        const next = prev + dt
        return next >= duration ? 0 : next
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, duration])

  const st = data?.resolved_style || {}
  const an = data?.resolved_animation || {}
  const fx = new Set(an.word_fx || [])
  const doKaraoke = fx.has('karaoke') || fx.has('highlight')
  const doPop = fx.has('pop')
  const typewriter = an.mode === 'typewriter' || fx.has('typewriter')

  // Aspecto del stage a partir del formato (vertical 9:16 por defecto).
  const W = data?.project?.w || 1080
  const H = data?.project?.h || 1920
  const stageH = 440
  const stageW = Math.round(stageH * (W / H))

  const seg = data ? currentSegment(data.segments, t) : null
  const activeIdx = seg ? activeWordIdx(data.words, seg, t) : -1

  async function doExport() {
    setExporting(true); setError(''); setResult(null)
    try {
      const body = { preset: presetId, include_timeline: includeTimeline, install_script: installScript }
      if (voice) { body.voice_filename = voice; body.voice_kind = 'audio' }
      const r = await resolveExport(project.id, body)
      setResult(r)
    } catch (e) {
      setError(e.message || 'No se pudo generar el paquete.')
    } finally {
      setExporting(false)
    }
  }

  const fontFamily = st.font ? `"${st.font}", system-ui, sans-serif` : 'system-ui, sans-serif'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide rv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><Icon name="subtitles" size={20} /> Enviar a DaVinci Resolve</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <p className="muted">
          Subtítulos animados palabra a palabra (Título Fusion) + SRT + voz, listos para importar
          en <strong>Resolve Free</strong>. El preview muestra exactamente lo que se exportará.
        </p>

        {loading ? (
          <div className="empty">Generando preview…</div>
        ) : error && !data ? (
          <div className="rv-need">
            <Icon name="info" size={18} />
            <div>
              <strong>{error}</strong>
              <div className="muted">
                Transcribe el audio/vídeo del proyecto (con timing por palabra) y vuelve a abrir esto.
              </div>
            </div>
          </div>
        ) : data ? (
          <div className="rv-body">
            {/* Columna izquierda: presets + opciones */}
            <div className="rv-side">
              <label className="rv-label">Estilo</label>
              <div className="rv-presets">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    className={`rv-preset ${p.id === presetId ? 'is-active' : ''}`}
                    onClick={() => setPresetId(p.id)}
                    type="button"
                  >
                    <span className="rv-preset-name">{p.label || p.id}</span>
                    <span className="rv-preset-fx">{(p.animation?.word_fx || []).join(' · ') || 'estático'}</span>
                  </button>
                ))}
              </div>

              {audios.length > 0 && (
                <>
                  <label className="rv-label">Voz (opcional)</label>
                  <select className="rv-select" value={voice} onChange={(e) => setVoice(e.target.value)}>
                    <option value="">— sin voz —</option>
                    {audios.map((a, i) => (
                      <option key={a.id || a.filename || i} value={a.filename || a.name || ''}>
                        {a.name || a.filename || `Audio ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="rv-check">
                <input type="checkbox" checked={includeTimeline}
                  onChange={(e) => setIncludeTimeline(e.target.checked)} />
                <span>Incluir mis pistas (vídeo/voz) como timeline <code>.fcpxml</code>/<code>.otio</code></span>
              </label>
              <label className="rv-check">
                <input type="checkbox" checked={installScript}
                  onChange={(e) => setInstallScript(e.target.checked)} />
                <span>Instalar script en Resolve para montarlo con <strong>1 clic</strong> <em>(Free)</em></span>
              </label>

              <div className="rv-stats">
                <span><b>{data.segments.length}</b> subtítulos</span>
                <span><b>{data.words.length}</b> palabras</span>
                <span><b>{W}×{H}</b> · {Math.round(data.project?.fps || 30)}fps</span>
              </div>

              {data.font_note && (
                <div className="rv-fontnote"><Icon name="warning" size={14} /> {data.font_note}</div>
              )}
            </div>

            {/* Columna derecha: preview + scrubber */}
            <div className="rv-main">
              <div className="rv-stage-wrap">
                <div className="rv-stage" style={{ width: stageW, height: stageH }}>
                  {seg && (
                    <div
                      className="rv-block"
                      style={{
                        left: `${(st.x ?? 0.5) * 100}%`,
                        top: `${(st.y ?? 0.82) * 100}%`,
                        fontFamily,
                        fontWeight: st.bold === false ? 500 : 800,
                      }}
                    >
                      {segLines(data.words, seg).map((line, li) => (
                        <div className="rv-line" key={li}>
                          {line.map((wi) => {
                            const w = data.words[wi]
                            const isActive = wi === activeIdx
                            const visible = typewriter ? w.start <= t + 0.001 : true
                            const color = doKaraoke && isActive
                              ? (st.highlight_color || '#FFE44D')
                              : (st.color || '#FFFFFF')
                            const scale = doPop && isActive ? 1.14 : 1
                            const op = visible ? (isActive ? (st.active_opacity ?? 1) : (st.inactive_opacity ?? 1)) : 0
                            return (
                              <span
                                key={wi}
                                className="rv-word"
                                style={{
                                  fontSize: (st.size ?? 0.09) * stageH,
                                  color,
                                  opacity: op,
                                  transform: `scale(${scale})`,
                                  WebkitTextStroke: st.border_width
                                    ? `${Math.max(1, (st.border_width / 8) * 2)}px ${st.border_color || '#000'}`
                                    : undefined,
                                }}
                              >
                                {w.text}
                              </span>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rv-transport">
                <button className="icon-btn" type="button" onClick={() => setPlaying((p) => !p)}>
                  <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
                </button>
                <input
                  className="rv-scrub"
                  type="range" min={0} max={duration || 1} step={0.01}
                  value={t}
                  onChange={(e) => { setPlaying(false); setT(parseFloat(e.target.value)) }}
                />
                <span className="rv-time">{t.toFixed(1)} / {duration.toFixed(1)}s</span>
              </div>
            </div>
          </div>
        ) : null}

        {result && (
          <div className="rv-result">
            <div className="ok"><Icon name="check_circle" size={16} /> {result.message}</div>
            {result.script_install?.installed ? (
              <div className="rv-run">
                <Icon name="bolt" size={16} />
                <div>
                  <strong>1) Monta el timeline:</strong> en Resolve, abre tu proyecto y ejecuta
                  {' '}<code>Workspace › Scripts › ds_import</code> (coloca tus vídeos + voz).
                  {result.title_install?.installed && (
                    <div style={{ marginTop: 6 }}>
                      <strong>2) Subtítulos animados:</strong> en <code>Effects › Titles</code> arrastra
                      {' '}<code>{result.title_install.title}</code> a una <strong>pista superior</strong> sobre el vídeo y estíralo.
                      <span className="muted"> (si no aparece, reinicia Resolve una vez)</span>
                    </div>
                  )}
                </div>
              </div>
            ) : result.script_install ? (
              <div className="rv-warn"><Icon name="warning" size={13} /> No pude instalar el script automático ({result.script_install.reason}). Usa el <code>.fcpxml</code>/<code>.otio</code> del ZIP.</div>
            ) : null}
            <div className="rv-files">
              {result.files.map((f) => <span className="rv-chip" key={f}>{f}</span>)}
            </div>
            {result.warnings?.length > 0 && (
              <div className="rv-warns">
                {result.warnings.map((w, i) => (
                  <div key={i} className="rv-warn"><Icon name="warning" size={13} /> {w}</div>
                ))}
              </div>
            )}
            <div className="muted rv-dir">Carpeta: <code>{result.dir}</code></div>
          </div>
        )}
        {error && data && <div className="error">⚠️ {error}</div>}

        <div className="modal-actions">
          <div style={{ flex: 1 }} />
          <button className="ghost" onClick={onClose}>Cerrar</button>
          {result ? (
            <a className="primary" href={result.download_url} download>
              <Icon name="download" size={16} /> Descargar ZIP
            </a>
          ) : (
            <button className="primary" onClick={doExport} disabled={exporting || loading || !data}>
              {exporting ? 'Generando…' : <><Icon name="movie_filter" size={16} /> Generar paquete</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
