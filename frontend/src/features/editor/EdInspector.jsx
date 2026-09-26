import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import { clipPose } from '../../lib/clipAnim'
import { APPEAR_OPTIONS, COLOR_FX, EXIT_OPTIONS, fxNum } from '../../lib/clipFx'
import { canKeyframe, kfNeighborT, kfState, styleKfState, textStyleAt, withTextStyleKf } from '../../lib/clipKeyframes'
import { bgCapable } from '../../lib/clipBg'
import { maskable } from '../../lib/clipMask'
import { isVisualClip } from './editorModel'
import EdBgRemove from './EdBgRemove'
import EdClipNote from './EdClipNote'
import EdMask from './EdMask'
import EdShape from './EdShape'
import EdText, { SubtitlesPanel, TextFavorites, TextFxPanel } from './EdText'
import EdTransform, { BlendRow, InspSection, InspSlider } from './EdTransform'
import { clipBeats } from '../../lib/beats'
import { shapeDrawAt } from '../../lib/shapes'
import { FOLLOW_MODES } from '../../lib/objectTrack'
import EdFilters from './EdFilters'
import { AudioFxGrid, KfTransitionSelect, VolumePanel } from './EdEffects'

// Pestañas como CapCut. Seguimiento va aparte (no dentro de Animación) cuando
// el clip se puede enganchar a un objeto del vídeo (`canTrack`).
function navsFor(clip, textMode, audioMode, canTrack) {
  const navs = baseNavs(clip, textMode, audioMode)
  return canTrack && navs.includes('animacion') ? [...navs, 'seguimiento'] : navs
}

function baseNavs(clip, textMode, audioMode) {
  // Un clip de texto admite máscara ("revelar texto"); la pista de texto no.
  if (clip?.kind === 'text' && textMode !== 'track') return ['texto', 'subtitulos', 'mascara', 'animacion']
  if (textMode || clip?.kind === 'text') return ['texto', 'subtitulos', 'animacion']
  if (audioMode === 'track' || clip?.kind === 'audio') return ['audio']
  if (clip?.kind === 'shape') return ['video', 'animacion']
  if (clip?.kind === 'adjustment') return ['ajuste']
  if (isVisualClip(clip)) {
    if (clip.kind === 'video') return ['video', 'animacion', 'audio']
    return ['video', 'animacion']
  }
  return []
}

function navLabel(id) {
  if (id === 'animacion') return 'Animación'
  if (id === 'texto') return 'Texto'
  if (id === 'subtitulos') return 'Subtítulos'
  if (id === 'mascara') return 'Máscara'
  if (id === 'audio') return 'Audio'
  if (id === 'ajuste') return 'Capa de ajuste'
  if (id === 'seguimiento') return 'Seguimiento'
  return 'Video'
}

function opacityOf(clip, playhead) {
  const t = Math.max(0, (playhead ?? 0) - (clip?.start || 0))
  const n = Number(clipPose(clip, t).opacity)
  return Number.isFinite(n) ? n : 1
}

// Mezcla (panel Básico de CapCut): opacidad con keyframes y modo de fusión.
function MixSection({ clip, p, kfSt, kfNav }) {
  const reset = () => {
    p.onPose?.({ opacity: 1 })
    p.onBlend?.('normal')
  }
  return (
    <InspSection title="Mezcla" kfSt={kfSt} onAddKf={p.onAddKf} kfNav={kfNav} onReset={reset}>
      <InspSlider
        label="Opacidad"
        value={Math.round(opacityOf(clip, p.playhead) * 100)}
        min={0}
        max={100}
        step={1}
        format={(v) => `${Math.round(v)}`}
        suffix="%"
        parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
        onChange={(pct) => p.onPose?.({ opacity: Math.min(1, Math.max(0, pct / 100)) })}
        onKf={p.onAddKf}
        kfSt={kfSt}
        kfNav={kfNav}
        stepper
        defaultValue={100}
      />
      {p.onBlend && <BlendRow clip={clip} onBlend={p.onBlend} />}
    </InspSection>
  )
}

// Texto → Básico, en el orden de CapCut: contenido y tipografía, estilos,
// Trazo / Fondo / Brillo / Sombra, Transformación y Mezcla (las mismas que un
// vídeo). Después lo de subtítulos y los estilos guardados.
function TextTab({ clip, textMode, p, kfSt, kfNav, noteProps }) {
  const te = p.textEditor || {}
  const mode = textMode === 'track' ? 'track' : 'segment'
  const st0 = p.textStyle ?? clip?.style ?? {}
  const textOf = te.clip || (clip?.kind === 'text' ? clip : null)
  // Color, Trazo, Fondo y Sombra: el panel enseña el valor animado en el cabezal.
  const animable = clip?.kind === 'text' && mode !== 'track'
  const localT = Math.max(0, (p.playhead ?? 0) - (clip?.start || 0))
  const st = animable ? withTextStyleKf(st0, textStyleAt(clip, localT)) : st0
  const kf = animable && p.onStyleKf ? {
    state: (keys) => styleKfState(clip, localT, keys, p.fps || 30),
    toggle: p.onStyleKf,
    nav: kfNav,
  } : null
  return (
    <>
      <EdText
        mode={mode}
        clip={textOf}
        style={st}
        selectionCount={te.selectionCount || 1}
        onChangeText={te.onChangeText}
        onChangeStyle={p.onChangeTextStyle}
        kf={kf}
      />
      {clip?.kind === 'text' && mode !== 'track' && (
        <>
          <EdTransform
            clip={clip}
            playhead={p.playhead}
            onPose={p.onPose}
            onAddKf={p.onAddKf}
            onTextStyle={p.onChangeTextStyle}
            onFlip={p.onFlip}
            fps={p.fps}
            frameW={p.outW}
            frameH={p.outH}
            kfNav={kfNav}
            textStyle={st}
            styleKf={kf}
          />
          <MixSection clip={clip} p={p} kfSt={kfSt} kfNav={kfNav} />
        </>
      )}
      {mode === 'track' && (
        // La pista (general) usa la misma Transformación que un texto suelto;
        // sin keyframes: cada cambio va a la pista y a todos sus textos.
        <EdTransform
          clip={{ id: 'track-style', kind: 'text', start: 0, style: st }}
          playhead={0}
          onPose={p.onPose}
          onTextStyle={p.onChangeTextStyle}
          fps={p.fps}
          frameW={p.outW}
          frameH={p.outH}
          textStyle={st}
        />
      )}
      <TextFxPanel section="look" style={st} mode={textMode || 'clip'} onChangeStyle={p.onChangeTextStyle} kf={kf} />
      <TextFavorites
        mode={mode}
        style={st}
        textFavorites={te.textFavorites}
        onSaveFavorite={te.onSaveFavorite}
        onApplyFavorite={te.onApplyFavorite}
        onDeleteFavorite={te.onDeleteFavorite}
        onApplyAsGlobalTemplate={te.onApplyAsGlobalTemplate}
        onApplyToTrack={te.onApplyToTrack}
      />
      {/* En un texto lo que significa ya es su contenido: la nota va al final. */}
      {clip && noteProps && (
        <EdClipNote clip={clip} onChange={(note, source) => noteProps.onChange?.(clip.id, note, source)}
          onSuggest={noteProps.onSuggest} />
      )}
    </>
  )
}

// Flechas ‹ › del rombo: el cabezal salta al keyframe anterior / siguiente del clip.
function kfNavFor(clip, localT, fps, onSeek) {
  if (!clip || !onSeek || !clip.keyframes?.enabled) return null
  const go = (dir) => {
    const t = kfNeighborT(clip, localT, dir, fps)
    return t == null ? null : () => onSeek((clip.start || 0) + t)
  }
  return { prev: go(-1), next: go(1) }
}

// Beats (#12): detectar, densidad (uno de cada N) y quitar.
const BEAT_EVERY_OPTIONS = [
  { value: '1', label: 'Todos los beats' },
  { value: '2', label: 'Uno de cada 2' },
  { value: '4', label: 'Uno de cada 4' },
]
function BeatsSection({ clip, busy, onDetect, onChange }) {
  const b = clipBeats(clip)
  return (
    <InspSection
      title="Beats"
      hint={<>Detecta los golpes de la música para cortar y colocar clips al ritmo. Los puntos
        amarillos del clip son imán al mover o recortar clips; <b>,</b> y <b>.</b> saltan entre ellos.</>}
    >
      <div className="ed-insp-tools">
        <button type="button" className="ed-btn" disabled={busy} onClick={() => onDetect(clip.id)}>
          <Icon name={busy ? 'hourglass_top' : 'graphic_eq'} size={15} /> {b ? 'Volver a detectar' : 'Detectar beats'}
        </button>
        {b && (
          <button type="button" className="ed-btn" onClick={() => onChange(clip.id, null)}>
            <Icon name="music_off" size={15} /> Quitar
          </button>
        )}
      </div>
      {b ? (
        <>
          <label className="ed-insp-select">
            Marcas
            <FlipSelect value={String(b.every)} options={BEAT_EVERY_OPTIONS}
              onChange={(v) => onChange(clip.id, { every: Number(v) })} title="Densidad de beats" />
          </label>
          <p className="ed-insp-meta">{b.times.length} beats · {Math.round(b.bpm)} BPM</p>
        </>
      ) : null}
    </InspSection>
  )
}

export default function EdInspector({
  selectedClip,
  textMode,
  audioMode,
  effectsProps,
  shapeProps,
  maskProps,
  bgProps,
  noteProps,
  clipMode,
}) {
  const clip = selectedClip
  const hasTarget = !!(clip || textMode || audioMode)
  const visual = isVisualClip(clip)
  const isShape = clip?.kind === 'shape'
  const p = effectsProps || {}
  const canTrack = !!p.track
  const navs = navsFor(clip, textMode, audioMode, canTrack)
  const [nav, setNav] = useState(navs[0] || 'video')
  const [sub, setSub] = useState('basic')
  const activeNav = navs.includes(nav) ? nav : (navs[0] || 'video')
  const localT = Math.max(0, (p.playhead ?? 0) - (clip?.start || 0))
  const kfSt = clip && canKeyframe(clip) ? kfState(clip, localT, p.fps || 30) : 'off'
  const kfNav = kfNavFor(clip, localT, p.fps || 30, p.onSeek)
  const effects = clip?.effects && typeof clip.effects === 'object' ? clip.effects : {}
  const canMask = !!(maskProps && maskable(clip))
  const canBg = !!(bgProps && bgCapable(clip))

  useEffect(() => {
    const next = navsFor(clip, textMode, audioMode, canTrack)
    setNav((cur) => (next.includes(cur) ? cur : (next[0] || 'video')))
    setSub('basic')
  }, [clip?.id, clip?.kind, textMode, audioMode, canTrack])

  // La manipulación de la máscara en el reproductor solo vive con su panel abierto.
  const onMaskOpen = maskProps?.onPanelOpen
  const maskOpen = ((activeNav === 'video' && sub === 'mask') || activeNav === 'mascara') && canMask
  useEffect(() => { onMaskOpen?.(maskOpen) }, [maskOpen, onMaskOpen])

  // Igual el pincel de Eliminar fondo: al cerrar el panel se apaga, para que el
  // puntero vuelva a mover/seleccionar clips.
  const onBgOpen = bgProps?.onPanelOpen
  const bgOpen = activeNav === 'video' && sub === 'bg' && canBg
  useEffect(() => { onBgOpen?.(bgOpen) }, [bgOpen, onBgOpen])

  function patchEffects(next) {
    p.onChangeFx?.({ effects: { ...effects, ...next } })
  }

  const videoSubs = activeNav === 'video' && (visual || isShape)

  return (
    <aside className="ed-inspector">
      {hasTarget && navs.length > 0 && (
        <nav className="ed-insp-nav" aria-label="Propiedades">
          {navs.map((id) => (
            <button
              key={id}
              type="button"
              className={activeNav === id ? 'on' : ''}
              onClick={() => { setNav(id); setSub('basic') }}
            >
              {navLabel(id)}
            </button>
          ))}
          {clipMode && <em>Clip</em>}
        </nav>
      )}
      {hasTarget && videoSubs && (
        <nav className="ed-insp-sub" aria-label="Secciones">
          <button type="button" className={sub === 'basic' ? 'on' : ''} onClick={() => setSub('basic')}>Básico</button>
          {canBg && (
            <button type="button" className={sub === 'bg' ? 'on' : ''} onClick={() => setSub('bg')}>Eliminar fondo</button>
          )}
          {canMask && (
            <button type="button" className={sub === 'mask' ? 'on' : ''} onClick={() => setSub('mask')}>Máscara</button>
          )}
          {visual && (
            <button type="button" className={sub === 'adjust' ? 'on' : ''} onClick={() => setSub('adjust')}>Ajustar</button>
          )}
        </nav>
      )}

      <div className="ed-insp-body">
        {!hasTarget && (
          <div className="ed-insp-empty">
            <Icon name="tune" size={28} />
            <p>Selecciona un elemento para editar sus propiedades.</p>
          </div>
        )}

        {/* Qué SIGNIFICA este fragmento en la historia. Va lo primero: es lo que
            después lee la IA, y es lo que no se puede deducir mirando los frames. */}
        {clip && noteProps && sub === 'basic' && ['video', 'audio'].includes(activeNav) && (
          <EdClipNote clip={clip} onChange={(note, source) => noteProps.onChange?.(clip.id, note, source)}
            onSuggest={noteProps.onSuggest} />
        )}

        {hasTarget && activeNav === 'video' && sub === 'basic' && (
          <>
            {isShape && shapeProps && <EdShape {...shapeProps} />}
            {isShape && (
              // «Dibujar trazo» (#14): cuánto del trazo se ve; animable con keyframes.
              <InspSection title={clip.shape?.type === 'letterbox' ? 'Entrada de las barras' : 'Dibujar trazo'} kfSt={kfSt} onAddKf={p.onAddKf}>
                <InspSlider
                  label={clip.shape?.type === 'letterbox' ? 'Dentro' : 'Dibujado'}
                  value={Math.round(shapeDrawAt(clip, localT) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  format={(v) => `${Math.round(v)}`}
                  suffix="%"
                  parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
                  onChange={(pct) => p.onPose?.({ draw: pct / 100 })}
                  onKf={p.onAddKf}
                  kfSt={kfSt}
                />
                {shapeProps?.onDrawIn && (
                  <div className="ed-insp-tools">
                    <button type="button" className="ghost small" onClick={shapeProps.onDrawIn}
                      title="Keyframes de 0 a 100 % en 1,5 s desde el inicio del clip">
                      <Icon name="gesture" size={15} /> {clip.shape?.type === 'letterbox' ? 'Animar: las barras entran al aparecer' : 'Animar: se dibuja al aparecer'}
                    </button>
                  </div>
                )}
              </InspSection>
            )}
            {!isShape && (
            <EdTransform
              clip={clip}
              playhead={p.playhead}
              onPose={p.onPose}
              onAddKf={p.onAddKf}
              onTextStyle={clip?.kind === 'text' ? p.onChangeTextStyle : undefined}
              onFlip={p.onFlip}
              fps={p.fps}
              heightScale={p.heightScale}
              frameW={p.outW}
              frameH={p.outH}
              kfNav={kfNav}
            />
            )}
            {canKeyframe(clip) && clip?.kind !== 'audio' && (
              <MixSection clip={clip} p={p} kfSt={kfSt} kfNav={kfNav} />
            )}
          </>
        )}

        {hasTarget && activeNav === 'video' && sub === 'bg' && canBg && (
          <EdBgRemove clip={clip} {...bgProps} />
        )}

        {hasTarget && ((activeNav === 'video' && sub === 'mask') || activeNav === 'mascara') && canMask && (
          <EdMask
            clip={clip}
            playhead={p.playhead}
            fps={p.fps}
            {...maskProps}
          />
        )}

        {hasTarget && activeNav === 'video' && sub === 'adjust' && visual && (
          <InspSection title="Color">
            {COLOR_FX.map((item) => {
              const u = item.ui ?? 100
              return (
                <InspSlider
                  key={item.id}
                  label={item.label}
                  value={Math.round(fxNum(effects, item.id) * u)}
                  min={Math.round(item.min * u)}
                  max={Math.round(item.max * u)}
                  step={Math.max(1, Math.round((item.step || 0.05) * u))}
                  format={(v) => `${Math.round(v)}${item.suffix || ''}`}
                  parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
                  onChange={(v) => patchEffects({ [item.id]: v / u })}
                />
              )
            })}
            {canMask && maskProps && (
              <div className="ed-insp-tools">
                <button
                  type="button"
                  className="ghost small"
                  title="Limita estos ajustes a una zona (círculo, pincel, rollo de película…)"
                  onClick={() => { maskProps.onAddAdjustMask?.(); setSub('mask') }}
                >
                  <Icon name="filter_center_focus" size={15} /> Aplicar solo en una zona (máscara)
                </button>
              </div>
            )}
          </InspSection>
        )}

        {hasTarget && activeNav === 'ajuste' && clip?.kind === 'adjustment' && (
          // Capa de ajuste (#19): filtra todo lo de debajo (no los textos, que van encima).
          <>
            <InspSection title="Capa de ajuste" defaultOpen
              hint="Afecta a los vídeos, imágenes y figuras de las pistas de debajo mientras dura.">
              <InspSlider
                label="Intensidad"
                value={Math.round((clip.opacity ?? 1) * 100)}
                min={0}
                max={100}
                step={1}
                format={(v) => `${Math.round(v)}`}
                suffix="%"
                parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
                onChange={(pct) => p.onChangeFx?.({ opacity: Math.min(1, Math.max(0, pct / 100)) })}
              />
            </InspSection>
            <InspSection title="Color">
              {COLOR_FX.map((item) => {
                const u = item.ui ?? 100
                return (
                  <InspSlider
                    key={item.id}
                    label={item.label}
                    value={Math.round(fxNum(effects, item.id) * u)}
                    min={Math.round(item.min * u)}
                    max={Math.round(item.max * u)}
                    step={Math.max(1, Math.round((item.step || 0.05) * u))}
                    format={(v) => `${Math.round(v)}${item.suffix || ''}`}
                    parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
                    onChange={(v) => patchEffects({ [item.id]: v / u })}
                  />
                )
              })}
            </InspSection>
            <InspSection title="Filtros">
              <EdFilters clip={clip} onChangeFx={p.onChangeFx} />
            </InspSection>
          </>
        )}
        {hasTarget && activeNav === 'seguimiento' && p.track && (
          // Seguimiento (#15): el clip acompaña a un objeto del vídeo de debajo.
          <InspSection title="Seguimiento"
            hint="Marca con un recuadro un objeto del vídeo de debajo y este clip lo seguirá. Pon el cursor en un momento en que el objeto se vea.">
            <label className="ed-insp-select">
              Seguir
              <FlipSelect
                value={p.track.mode}
                options={FOLLOW_MODES.map((m) => ({ value: m.id, label: m.label }))}
                onChange={p.track.onMode}
              />
            </label>
            <div className="ed-insp-tools">
              {p.track.picking ? (
                <button type="button" className="ghost small" onClick={p.track.onCancel}>
                  <Icon name="close" size={15} /> Cancelar (dibuja el recuadro en el visor)
                </button>
              ) : (
                <button type="button" className="ghost small" disabled={!p.track.hasVideo || !!p.track.run}
                  onClick={p.track.onStart}
                  title={p.track.hasVideo ? 'Marca con un recuadro el objeto del vídeo; este clip lo seguirá'
                    : 'Pon el cursor sobre un vídeo con el objeto que quieres seguir'}>
                  <Icon name="my_location" size={15} />
                  {p.track.run ? ` Siguiendo… ${Math.round((p.track.run.progress || 0) * 100)}%` : ' Seguir un objeto del vídeo'}
                </button>
              )}
            </div>
          </InspSection>
        )}
        {hasTarget && activeNav === 'animacion' && (
          <InspSection title="Entrada y salida">
            <KfTransitionSelect clip={clip} selKfId={p.selKfId} playhead={p.playhead} onInterp={p.onInterpKf} fps={p.fps} />
            {(clip?.kind === 'video' || clip?.kind === 'image' || clip?.kind === 'text') && (
              <>
                <label className="ed-insp-select">
                  Aparición
                  <FlipSelect
                    value={clip.appear || 'none'}
                    options={APPEAR_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => p.onChangeFx?.({ appear: v })}
                  />
                </label>
                <label className="ed-insp-select">
                  Salida
                  <FlipSelect
                    value={clip.exit || 'none'}
                    options={EXIT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => p.onChangeFx?.({ exit: v })}
                  />
                </label>
              </>
            )}
          </InspSection>
        )}

        {hasTarget && activeNav === 'audio' && (
          <InspSection title="Audio" defaultOpen>
            {p.trackEmpty ? (
              <p className="ed-insp-meta">Esta pista no tiene clips.</p>
            ) : (
              <>
                <VolumePanel
                  clip={clip}
                  playhead={p.playhead}
                  onChangeFx={p.onChangeFx}
                  onPose={p.onPose}
                  onAddKf={p.onAddKf}
                  onFade={p.onFade}
                  trackMode={audioMode === 'track'}
                />
                <AudioFxGrid
                  clip={clip}
                  playhead={p.playhead}
                  onChangeFx={p.onChangeFx}
                  onPose={p.onPose}
                  trackMode={audioMode === 'track'}
                />
              </>
            )}
          </InspSection>
        )}
        {hasTarget && activeNav === 'audio' && audioMode !== 'track' && p.beats && clip?.id && (
          <BeatsSection clip={clip} {...p.beats} />
        )}

        {hasTarget && activeNav === 'texto' && (
          <TextTab clip={clip} textMode={textMode} p={p} kfSt={kfSt} kfNav={kfNav} noteProps={noteProps} />
        )}
        {hasTarget && activeNav === 'subtitulos' && (
          <SubtitlesPanel
            mode={textMode === 'track' ? 'track' : 'segment'}
            clip={p.textEditor?.clip || (clip?.kind === 'text' ? clip : null)}
            style={p.textStyle ?? clip?.style ?? {}}
            onChangeStyle={p.onChangeTextStyle}
            onApplyPreset={p.onApplyTextPreset}
            onApplyTrackPreset={p.onApplyTrackTextPreset}
            onFragment={p.textEditor?.onFragment}
          />
        )}
      </div>
    </aside>
  )
}
