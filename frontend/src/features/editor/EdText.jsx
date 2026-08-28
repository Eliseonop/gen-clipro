import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { TEXT_PRESETS, FONTS, FONT_SIZES, FONT_SIZE_REF } from '../../lib/textstyles'

// Convierte fracción interna → px (aproximado al tamaño predefinido más cercano)
function sizeToNearestPx(size) {
  const px = Math.round((size ?? 0.009375) * FONT_SIZE_REF)
  return FONT_SIZES.reduce((a, b) => Math.abs(b - px) < Math.abs(a - px) ? b : a)
}

// Panel de propiedades de texto. mode='segment' edita un segmento (contenido,
// posición, duración + estilo); mode='track' edita el estilo GENERAL de la pista.
export default function EdText({ mode = 'segment', clip, style, trackName, onChangeText, onChangeStyle, onApplyPreset, onChangeDur, onApplyAsGlobalTemplate, framing, onStartFraming, onSaveFraming, onCancelFraming }) {
  const st = style || {}
  const isTrack = mode === 'track'
  const set = (patch) => onChangeStyle(patch)
  const dur = clip ? clip.out_point - clip.in_point : 0

  const currentPx = sizeToNearestPx(st.size)

  return (
    <div className="ed-text-panel">
      <div className="ed-crops-head">
        <div className="ed-crops-title">{isTrack ? `Estilo de pista · ${trackName}` : 'Texto'}</div>
        {!isTrack && onApplyAsGlobalTemplate && (
          <button
            className="icon-btn"
            title="Aplicar estilo de este texto como plantilla global para todos los textos del Timeline"
            onClick={onApplyAsGlobalTemplate}
            style={{ fontSize: 11, padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <Icon name="style" size={14} /> Global
          </button>
        )}
      </div>
      <div className="ed-text-body">
        {isTrack && <p className="muted small">Se aplica a todos los textos de la pista y a los nuevos.</p>}

        {isTrack && onStartFraming && (
          <div className="ed-frame-tools">
            {!framing ? (
              <button className="primary alt small" onClick={onStartFraming} title="Definir posición y tamaño de los textos con un recuadro en el Main">
                <Icon name="crop_free" size={15} /> Encuadrar
              </button>
            ) : (
              <>
                <button className="primary small" onClick={onSaveFraming} title="Aplicar el encuadre a todos los textos de la pista">
                  <Icon name="check" size={15} /> Guardar
                </button>
                <button className="ghost small" onClick={onCancelFraming}>Cancelar</button>
              </>
            )}
          </div>
        )}
        {isTrack && framing && <p className="muted small">Mueve y ajusta el recuadro amarillo en el Main. Al guardar define posición, ancho y tamaño de los textos.</p>}

        {!isTrack && (
          <textarea className="ed-text-content" rows={2} value={clip.text || ''}
            placeholder="Escribe el texto…" onChange={(e) => onChangeText(e.target.value)} />
        )}

        <div className="ed-text-presets">
          {TEXT_PRESETS.map((p) => (
            <button key={p.id} className={`ed-preset ${st.preset === p.id ? 'on' : ''}`}
              onClick={() => onApplyPreset(p)} title={p.name}>{p.name}</button>
          ))}
        </div>

        <div className="ed-text-row">
          <select className="select mini" value={st.font || 'Arial'} onChange={(e) => set({ font: e.target.value })}>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="select mini" value={st.align || 'center'} onChange={(e) => set({ align: e.target.value })}>
            <option value="left">◀</option><option value="center">■</option><option value="right">▶</option>
          </select>
        </div>

        <label className="ed-text-field"><span>Tamaño</span>
          <select
            className="select mini"
            value={currentPx}
            onChange={(e) => set({ size: +(Number(e.target.value) / FONT_SIZE_REF).toFixed(6) })}
            style={{ width: '100%' }}
          >
            {FONT_SIZES.map((px) => (
              <option key={px} value={px}>{px} px</option>
            ))}
          </select>
        </label>

        <div className="ed-text-row">
          <label className="ed-color"><span>Color</span>
            <input type="color" value={st.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </label>
          <label className="ed-color"><span>Borde</span>
            <input type="color" value={st.border_color || '#000000'} onChange={(e) => set({ border_color: e.target.value })} />
          </label>
        </div>
        <label className="ed-text-field"><span>Grosor borde: {st.border_width || 0}</span>
          <input type="range" min="0" max="14" step="1" value={st.border_width || 0} onChange={(e) => set({ border_width: Number(e.target.value) })} />
        </label>

        <div className="ed-text-row">
          <label className="ed-chip"><input type="checkbox" checked={!!st.shadow} onChange={(e) => set({ shadow: e.target.checked })} /> Sombra</label>
          <label className="ed-chip"><input type="checkbox" checked={!!st.glow} onChange={(e) => set({ glow: e.target.checked })} /> Brillo</label>
          <label className="ed-chip"><input type="checkbox" checked={!!st.bold} onChange={(e) => set({ bold: e.target.checked })} /> Negrita</label>
        </div>

        <div className="ed-text-row">
          <label className="ed-chip pad">
            <input type="checkbox" checked={st.bg && st.bg !== 'none'} onChange={(e) => set({ bg: e.target.checked ? '#111318' : 'none' })} /> Fondo
          </label>
          {st.bg && st.bg !== 'none' && <input type="color" value={st.bg} onChange={(e) => set({ bg: e.target.value })} />}
          {st.bg && st.bg !== 'none' && <input type="range" min="0.1" max="1" step="0.05" value={st.bg_opacity ?? 0.55} onChange={(e) => set({ bg_opacity: Number(e.target.value) })} />}
        </div>

        {!isTrack && (
          <>
            <label className="ed-text-field"><span>Ancho de caja: {Math.round((st.w ?? 0.8) * 100)}%</span>
              <input type="range" min="0.15" max="1" step="0.01" value={st.w ?? 0.8} onChange={(e) => set({ w: Number(e.target.value) })} />
            </label>
            <label className="ed-text-field"><span>Posición X</span>
              <input type="range" min="0" max="1" step="0.01" value={st.x ?? 0.5} onChange={(e) => set({ x: Number(e.target.value) })} />
            </label>
            <label className="ed-text-field"><span>Posición Y</span>
              <input type="range" min="0" max="1" step="0.01" value={st.y ?? 0.5} onChange={(e) => set({ y: Number(e.target.value) })} />
            </label>
            <label className="ed-text-field"><span>Duración: {fmt(dur)}</span>
              <input type="range" min="0.5" max="15" step="0.1" value={dur} onChange={(e) => onChangeDur(Number(e.target.value))} />
            </label>
            <p className="muted small"><Icon name="drag_pan" size={13} /> Arrastra el texto y sus manijas en el Main.</p>
          </>
        )}
      </div>
    </div>
  )
}
