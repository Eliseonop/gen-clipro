import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'

// «Sonorizar con IA» (#17): los sonidos que propone la IA para la escena, ya
// emparejados con la biblioteca de SFX. Se escuchan, se marcan y se añaden.
const fmtT = (s) => `${Number(s || 0).toFixed(1).replace('.', ',')} s`

export default function EdSoundDesign({ result, onApply, onCancel }) {
  const sounds = result?.sounds || []
  const missing = result?.missing || []
  const [on, setOn] = useState(() => new Set(sounds.map((_, i) => i)))
  const [playing, setPlaying] = useState(null)
  const audioRef = useRef(null)

  useEffect(() => () => { audioRef.current?.pause() }, [])

  function toggle(i) {
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function play(i) {
    audioRef.current?.pause()
    if (playing === i) { setPlaying(null); return }
    const a = new Audio(sounds[i].sfx.url)
    a.volume = Math.min(1, Math.max(0.05, sounds[i].volume || 0.8))
    a.onended = () => setPlaying((p) => (p === i ? null : p))
    a.play().catch(() => setPlaying(null))
    audioRef.current = a
    setPlaying(i)
  }

  function apply() {
    audioRef.current?.pause()
    onApply?.(sounds.filter((_, i) => on.has(i)))
  }

  function onKey(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
  }

  return (
    <div className="modal-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }} onKeyDown={onKey}>
      <div className="modal ed-sound-design" role="dialog" aria-modal="true" aria-labelledby="ed-sound-title">
        <div className="modal-head">
          <h3 id="ed-sound-title"><Icon name="surround_sound" size={20} /> Sonorizar la escena</h3>
          <button className="icon-btn" onClick={onCancel} title="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <p className="ed-sound-mode">
          {result?.mode === 'vision' ? 'La IA ha mirado la escena.' : 'La IA ha usado la descripción y la nota de la escena (sin verla).'}
          {' '}Tiempos desde el inicio del clip.
        </p>
        {sounds.length ? (
          <div className="ed-sound-list">
            {sounds.map((s, i) => (
              <label key={`${s.sfx.id}-${i}`} className={on.has(i) ? 'on' : ''}>
                <input type="checkbox" checked={on.has(i)} onChange={() => toggle(i)} />
                <button type="button" className="icon-btn" onClick={(e) => { e.preventDefault(); play(i) }}
                  title={playing === i ? 'Parar' : 'Escuchar'}>
                  <Icon name={playing === i ? 'stop' : 'play_arrow'} size={16} />
                </button>
                <span className="ed-sound-what">
                  <b>{s.what}</b>
                  <em>{s.sfx.name}</em>
                </span>
                <span className={`ed-sound-kind ${s.kind}`}>{s.kind === 'ambience' ? 'Ambiente' : 'Puntual'}</span>
                <span className="ed-sound-time">{fmtT(s.start)} · {fmtT(s.duration)} · {Math.round((s.volume || 0) * 100)} %</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="ed-insp-hint">Ningún sonido de tu biblioteca encaja con esta escena.</p>
        )}
        {missing.length > 0 && (
          <p className="ed-sound-missing">
            <Icon name="info" size={14} /> No están en tu biblioteca: {missing.map((m) => m.what).join(', ')}.
            Puedes añadirlos en la pestaña SFX y volver a sonorizar.
          </p>
        )}
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="primary" onClick={apply} disabled={!on.size}>
            <Icon name="add" size={16} /> Añadir {on.size === 1 ? '1 sonido' : `${on.size} sonidos`}
          </button>
        </div>
      </div>
    </div>
  )
}
