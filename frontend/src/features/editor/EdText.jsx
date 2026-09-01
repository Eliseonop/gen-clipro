import { useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import { fmt } from '../../lib/utils'
import { FONTS, FONT_SIZES, FONT_SIZE_REF, cssFont, selectedSubtitleThemeId } from '../../lib/textstyles'
import { SUBTITLE_THEMES, WORD_FX_OPTIONS, BLOCK_APPEAR_OPTIONS, WORDS_PER_BOX } from '../../lib/subtitleThemes'
import { hasWordFx, toggleWordFx, styleOpacity } from '../../lib/textKaraoke'
import { isFreeText } from '../../lib/textRole'

function sizeToNearestPx(size) {
  const px = Math.round((size ?? 0.009375) * FONT_SIZE_REF)
  return FONT_SIZES.reduce((a, b) => Math.abs(b - px) < Math.abs(a - px) ? b : a)
}

function themePreviewStyle(theme) {
  const s = theme.style || {}
  return {
    fontFamily: cssFont(s.font),
    fontWeight: s.bold ? 800 : 600,
    color: s.color,
    background: s.bg && s.bg !== 'none' ? s.bg : 'transparent',
    textShadow: s.glow
      ? `0 0 8px ${s.shadow_color || s.highlight_color}`
      : s.border_width
        ? `0 1px 0 ${s.border_color || '#000'}, 0 -1px 0 ${s.border_color || '#000'}, 1px 0 0 ${s.border_color || '#000'}, -1px 0 0 ${s.border_color || '#000'}`
        : 'none',
  }
}

export default function EdText({
  mode = 'segment', clip, style, onChangeText, onChangeStyle, onApplyPreset, onChangeDur,
  onApplyAsGlobalTemplate, framing, onStartFraming, onSaveFraming, onCancelFraming,
  textFavorites, onSaveFavorite, onApplyFavorite, onDeleteFavorite, onFragment,
  selectionCount = 1,
}) {
  const st = style || {}
  const isTrack = mode === 'track'
  const isFree = !isTrack && isFreeText(clip)
  const themed = !!selectedSubtitleThemeId(st)
  const showKaraoke = isTrack || themed
  const multi = !isTrack && selectionCount > 1
  const set = (patch) => onChangeStyle(patch)
  const dur = clip ? clip.out_point - clip.in_point : 0
  const currentPx = sizeToNearestPx(st.size)
  const themeId = selectedSubtitleThemeId(st)
  const [tab, setTab] = useState('props')
  const saved = textFavorites || []

  return (
    <div className="ed-text-panel">
      <div className="ed-crops-tabs">
        <button type="button" className={`ed-tab ${tab === 'props' ? 'on' : ''}`} onClick={() => setTab('props')}>
          Propiedades
        </button>
        <button type="button" className={`ed-tab ${tab === 'fav' ? 'on' : ''}`} onClick={() => setTab('fav')}>
          Favoritos
        </button>
      </div>
      {tab === 'fav' ? (
        <div className="ed-text-body">
          {saved.length === 0 ? (
            <p className="muted small">Aún no hay estilos guardados. En Propiedades pulsa Favorito para guardar encuadre, tema y tamaño.</p>
          ) : (
            <div className="ed-theme-grid">
              {saved.map((f) => (
                <div key={f.id} className="ed-theme-card ed-fav-style">
                  <button type="button" className="ed-fav-apply" onClick={() => onApplyFavorite?.(f)} title={f.name}>
                    <span className="ed-theme-chip" style={themePreviewStyle(f)}>
                      <span className="idle">Aa</span>
                      <span className="hot" style={{ color: f.style?.highlight_color }}>Aa</span>
                    </span>
                    <span className="ed-theme-name">{f.name}</span>
                  </button>
                  <button type="button" className="ed-fav-del" title="Quitar de favoritos" onClick={() => onDeleteFavorite?.(f.id)}>
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="ed-text-body">
          {isTrack && <p className="muted small">Se aplica a todos los textos de la pista y a los nuevos.</p>}
          {multi && (
            <p className="muted small">{selectionCount} textos seleccionados. Estilo y encuadre se aplican a todos; el contenido, solo al último clic.</p>
          )}

          {onStartFraming && (
            <div className="ed-text-actions">
              {!framing ? (
                <button className="primary alt small" onClick={onStartFraming} title={isTrack ? 'Definir posición y tamaño de los textos con un recuadro en el Main' : 'Definir posición y tamaño de los textos seleccionados'}>
                  <Icon name="crop_free" size={15} /> Encuadrar
                </button>
              ) : (
                <>
                  <button className="primary small" onClick={onSaveFraming} title={isTrack ? 'Aplicar el encuadre a todos los textos de la pista' : 'Aplicar el encuadre a los textos seleccionados'}>
                    <Icon name="check" size={15} /> Guardar
                  </button>
                  <button className="ghost small" onClick={onCancelFraming}>Cancelar</button>
                </>
              )}
              {isTrack && (
                <button type="button" className="ghost small" title="Guardar encuadre, tema y tamaño en Favoritos" onClick={() => { onSaveFavorite?.(st); setTab('fav') }}>
                  <Icon name="star" size={15} /> Favorito
                </button>
              )}
            </div>
          )}
          {isTrack && !onStartFraming && (
            <button type="button" className="ghost small" title="Guardar estilo en Favoritos" onClick={() => { onSaveFavorite?.(st); setTab('fav') }}>
              <Icon name="star" size={15} /> Favorito
            </button>
          )}
          {framing && (
            <p className="muted small">
              {isTrack
                ? 'Mueve y ajusta el recuadro amarillo en el Main. Al guardar define posición, ancho y tamaño de los textos.'
                : 'El recuadro amarillo se aplica solo a los textos seleccionados.'}
            </p>
          )}

          {!isTrack && (
            <textarea className="ed-text-content" rows={6} value={clip.text || ''}
              placeholder="Escribe el texto…" onChange={(e) => onChangeText(e.target.value)} />
          )}

          <div className="ed-theme-label">Temas</div>
          <div className="ed-theme-grid">
            {SUBTITLE_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ed-theme-card ${themeId === t.id ? 'on' : ''}`}
                onClick={() => onApplyPreset(t)}
                title={t.name}
              >
                <span className="ed-theme-chip" style={themePreviewStyle(t)}>
                  <span className="idle">Aa</span>
                  <span className="hot" style={{ color: t.style.highlight_color }}>Aa</span>
                </span>
                <span className="ed-theme-name">{t.name}</span>
              </button>
            ))}
          </div>

          <div className="ed-text-dense four">
            <label className="ed-mini" title="Tipo de letra">
              <span>Fuente</span>
              <FlipSelect className="mini" title={st.font || 'Arial'} value={st.font || 'Arial'}
                options={FONTS.map((f) => ({ value: f, label: f, previewStyle: { fontFamily: cssFont(f) } }))} onChange={(v) => set({ font: v })} />
            </label>
            <label className="ed-mini" title="Tamaño">
              <span>Px</span>
              <FlipSelect className="mini" value={String(currentPx)}
                options={FONT_SIZES.map((px) => ({ value: String(px), label: `${px}` }))}
                onChange={(v) => set({ size: +(Number(v) / FONT_SIZE_REF).toFixed(6) })} />
            </label>
            <label className="ed-mini" title="Alineación">
              <span>Alin</span>
              <FlipSelect className="mini" value={st.align || 'center'}
                options={[{ value: 'left', label: '◀' }, { value: 'center', label: '■' }, { value: 'right', label: '▶' }]}
                onChange={(v) => set({ align: v })} />
            </label>
            <label className="ed-mini" title="Entrada del bloque">
              <span>In</span>
              <FlipSelect className="mini" value={st.block_appear || 'none'} options={BLOCK_APPEAR_OPTIONS}
                onChange={(v) => set({ block_appear: v })} />
            </label>
          </div>

          {showKaraoke && (
          <>
          <div className="ed-theme-label">Palabra activa</div>
          <div className="ed-text-dense four">
            {WORD_FX_OPTIONS.map((o) => (
              <label key={o.value} className="ed-chip" title="Se pueden combinar">
                <input
                  type="checkbox"
                  checked={hasWordFx(st, o.value)}
                  onChange={() => set({ word_fx: toggleWordFx(st.word_fx, o.value) })}
                />
                {o.label}
              </label>
            ))}
          </div>
          </>
          )}

          <div className="ed-text-dense five">
            <label className="ed-mini ed-swatch" title="Color del texto">
              <span>Texto</span>
              <input type="color" value={st.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
            </label>
            {showKaraoke && (
            <label className="ed-mini ed-swatch" title="Color de la palabra activa">
              <span>Resalte</span>
              <input type="color" value={st.highlight_color || '#ffe566'} onChange={(e) => set({ highlight_color: e.target.value })} />
            </label>
            )}
            <label className="ed-mini ed-swatch" title="Color del borde">
              <span>Borde</span>
              <input type="color" value={st.border_color || '#000000'} onChange={(e) => set({ border_color: e.target.value })} />
            </label>
            <label className="ed-mini ed-swatch" title="Fondo">
              <span>Fondo</span>
              <input type="color" value={st.bg && st.bg !== 'none' ? st.bg : '#111318'}
                onChange={(e) => set({ bg: e.target.value })} />
            </label>
            <label className="ed-mini" title="Grosor del borde">
              <span>Grosor</span>
              <input type="range" min="0" max="14" step="1" value={st.border_width || 0}
                onChange={(e) => set({ border_width: Number(e.target.value) })} />
            </label>
          </div>

          <div className="ed-text-dense four">
            <label className="ed-chip"><input type="checkbox" checked={!!st.shadow} onChange={(e) => set({ shadow: e.target.checked })} /> Sombra</label>
            <label className="ed-chip"><input type="checkbox" checked={!!st.glow} onChange={(e) => set({ glow: e.target.checked })} /> Brillo</label>
            <label className="ed-chip"><input type="checkbox" checked={!!st.bold} onChange={(e) => set({ bold: e.target.checked })} /> Negrita</label>
            <label className="ed-chip">
              <input type="checkbox" checked={st.bg && st.bg !== 'none'} onChange={(e) => set({ bg: e.target.checked ? (st.bg && st.bg !== 'none' ? st.bg : '#111318') : 'none' })} /> Caja
            </label>
          </div>
          <label className="ed-mini" title="Opacidad del texto">
            <span>Opacidad {Math.round(styleOpacity(st) * 100)}%</span>
            <input type="range" min="0" max="100" step="1" value={Math.round(styleOpacity(st) * 100)}
              onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
          </label>
          {st.bg && st.bg !== 'none' && (
            <label className="ed-mini"><span>Opacidad fondo</span>
              <input type="range" min="0.1" max="1" step="0.05" value={st.bg_opacity ?? 0.55}
                onChange={(e) => set({ bg_opacity: Number(e.target.value) })} />
            </label>
          )}
          {showKaraoke && (
          <div className="ed-text-dense two">
            <label className="ed-mini" title="Opacidad de la palabra que se está diciendo">
              <span>Activa {Math.round((st.active_opacity ?? 1) * 100)}%</span>
              <input type="range" min="0" max="100" step="1" value={Math.round((st.active_opacity ?? 1) * 100)}
                onChange={(e) => set({ active_opacity: Number(e.target.value) / 100 })} />
            </label>
            <label className="ed-mini" title="Opacidad de las palabras que aún no están activas">
              <span>Inactiva {Math.round((st.inactive_opacity ?? 1) * 100)}%</span>
              <input type="range" min="0" max="100" step="1" value={Math.round((st.inactive_opacity ?? 1) * 100)}
                onChange={(e) => set({ inactive_opacity: Number(e.target.value) / 100 })} />
            </label>
          </div>
          )}

          {isTrack && (
            <>
              <div className="ed-theme-label">Por cuadro</div>
              <div className="ed-words-row">
                {WORDS_PER_BOX.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ed-words-n ${(st.max_words ?? 8) === n ? 'on' : ''}`}
                    title={`${n} palabras por cuadro`}
                    onClick={() => set({ max_words: n })}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="ghost small"
                  title="Partir los textos de la pista que superen el máximo"
                  onClick={() => onFragment?.()}
                >
                  Fragmentar
                </button>
              </div>
              <p className="muted small">Máximo de palabras por cuadro. Los subtítulos nuevos también se parten así.</p>
            </>
          )}

          {!isTrack && (
            <>
              <div className="ed-text-dense four">
                <label className="ed-mini" title="Posición X">
                  <span>X {Math.round((st.x ?? 0.5) * 100)}</span>
                  <input type="range" min="0" max="1" step="0.01" value={st.x ?? 0.5} onChange={(e) => set({ x: Number(e.target.value) })} />
                </label>
                <label className="ed-mini" title="Posición Y">
                  <span>Y {Math.round((st.y ?? 0.5) * 100)}</span>
                  <input type="range" min="0" max="1" step="0.01" value={st.y ?? 0.5} onChange={(e) => set({ y: Number(e.target.value) })} />
                </label>
                <label className="ed-mini" title="Ancho de caja">
                  <span>Ancho {Math.round((st.w ?? 0.8) * 100)}</span>
                  <input type="range" min="0.15" max="1" step="0.01" value={st.w ?? 0.8} onChange={(e) => set({ w: Number(e.target.value) })} />
                </label>
                <label className="ed-mini" title="Duración">
                  <span>Dur {fmt(dur)}</span>
                  {isFree ? (
                    <input type="number" min="0.15" step="0.1" value={+dur.toFixed(1)}
                      onChange={(e) => onChangeDur(Number(e.target.value))} />
                  ) : (
                    <input type="range" min="0.5" max={Math.max(15, dur)} step="0.1" value={dur}
                      onChange={(e) => onChangeDur(Number(e.target.value))} />
                  )}
                </label>
              </div>
              <p className="muted small">
                {isFree ? 'Arrastra los extremos del clip en la timeline para cambiar la duración. ' : ''}
                <Icon name="drag_pan" size={13} /> Arrastra en el Main: las líneas rosa marcan el centro y otros textos.
              </p>
            </>
          )}
          <div className="ed-text-actions">
            {!isTrack && (
              <button type="button" className="ghost small" title="Guardar encuadre, tema y tamaño en Favoritos" onClick={() => { onSaveFavorite?.(st); setTab('fav') }}>
                <Icon name="star" size={15} /> Favorito
              </button>
            )}
            {!isTrack && onApplyAsGlobalTemplate && (
              <button
                type="button"
                className="ghost small"
                title="Aplicar este estilo a todos los textos del Timeline"
                onClick={onApplyAsGlobalTemplate}
              >
                <Icon name="style" size={15} /> Global
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
