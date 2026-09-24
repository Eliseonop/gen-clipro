import { useRef, useState } from 'react'
import Icon from '../../components/Icon'
import FlipPopover from '../../components/FlipPopover'
import { WORKSPACE_PRESETS } from './panelLayout'

// Miniatura de cada disposición: rectángulos en una caja 40×26
// (m = materiales, v = Main, i = inspector, t = timeline).
const PREVIEW = {
  default: [['m', 0, 0, 11, 16], ['v', 12, 0, 16, 16], ['i', 29, 0, 11, 16], ['t', 0, 17, 40, 9]],
  'main-right': [['m', 0, 0, 11, 16], ['i', 12, 0, 11, 16], ['v', 24, 0, 16, 16], ['t', 0, 17, 40, 9]],
  'main-left': [['v', 0, 0, 16, 16], ['m', 17, 0, 11, 16], ['i', 29, 0, 11, 16], ['t', 0, 17, 40, 9]],
  mirror: [['i', 0, 0, 11, 16], ['v', 12, 0, 16, 16], ['m', 29, 0, 11, 16], ['t', 0, 17, 40, 9]],
  'tall-media': [['m', 0, 0, 11, 26], ['v', 12, 0, 16, 16], ['i', 29, 0, 11, 16], ['t', 12, 17, 28, 9]],
  'tall-main': [['m', 0, 0, 11, 16], ['i', 12, 0, 11, 16], ['t', 0, 17, 23, 9], ['v', 24, 0, 16, 26]],
}

function LayoutThumb({ id }) {
  return (
    <svg className="ed-layout-thumb" viewBox="0 0 40 26" width="40" height="26" aria-hidden="true">
      {(PREVIEW[id] || PREVIEW.default).map(([k, x, y, w, h]) => (
        <rect key={k} className={`k-${k}`} x={x} y={y} width={w} height={h} rx="1.5" />
      ))}
    </svg>
  )
}

function LayoutMenu({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  return (
    <>
      <button
        ref={btnRef}
        className={`icon-btn${open ? ' on' : ''}`}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Diseño de la ventana"
        aria-label="Diseño de la ventana"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="dashboard" size={18} />
      </button>
      <FlipPopover open={open} anchorRef={btnRef} onClose={() => setOpen(false)} className="ed-layout-menu">
        <div className="ed-layout-menu-title">Diseño</div>
        {WORKSPACE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="menuitemradio"
            aria-checked={value === p.id}
            className={`ed-layout-opt${value === p.id ? ' on' : ''}`}
            onClick={() => { onChange(p.id); setOpen(false) }}
          >
            <LayoutThumb id={p.id} />
            <span>
              <strong>{p.label}</strong>
              <em>{p.desc}</em>
            </span>
          </button>
        ))}
      </FlipPopover>
    </>
  )
}

export default function EdTopBar({
  projectName,
  savedLabel,
  canUndo,
  canRedo,
  onBack,
  onUndo,
  onRedo,
  onHelp,
  onSettings,
  onChat,
  chatBusy,
  onOpenJson,
  clipMode,
  onLeaveClip,
  exporting,
  exportPct,
  exportDone,
  exportUrl,
  exportBusyDisabled,
  onExport,
  onClearExport,
  clipSaving,
  clipSavePct,
  clipSaveDisabled,
  onSaveClip,
  saveClipLabel,
  layoutPreset,
  onLayoutPreset,
}) {
  return (
    <header className="ed-topbar">
      <div className="ed-topbar-left">
        <button className="ed-back" type="button" onClick={onBack} aria-label="Volver a proyectos" title="Volver a proyectos">
          <Icon name="arrow_back" size={20} />
        </button>
        <div className="ed-topbar-project">
          <strong title={projectName}>{projectName || 'Proyecto'}</strong>
          {savedLabel ? <em>{savedLabel}</em> : null}
        </div>
        <span className="ed-topbar-sep" />
        <button className="icon-btn" type="button" onClick={onUndo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
          <Icon name="undo" size={18} />
        </button>
        <button className="icon-btn" type="button" onClick={onRedo} disabled={!canRedo} title="Rehacer (Ctrl+Y)">
          <Icon name="redo" size={18} />
        </button>
        {clipMode && (
          <button className="ghost small" type="button" onClick={onLeaveClip} title="Volver al proyecto">
            <Icon name="movie" size={15} /> Proyecto
          </button>
        )}
      </div>

      <div className="ed-topbar-right">
        {onLayoutPreset && <LayoutMenu value={layoutPreset} onChange={onLayoutPreset} />}
        <button className="icon-btn" type="button" onClick={onChat} title="Chat IA" aria-label="Chat IA">
          <Icon name="forum" size={18} />
          {chatBusy ? <span className="ed-topbar-dot" /> : null}
        </button>
        <button className="icon-btn" type="button" onClick={onSettings} title="Configuración">
          <Icon name="settings" size={18} />
        </button>
        <button className="icon-btn" type="button" onClick={onHelp} title="Atajos: Espacio reproduce, S divide, Supr elimina, Ctrl+Z deshace">
          <Icon name="help_outline" size={18} />
        </button>
        <button className="ghost small" type="button" onClick={onOpenJson} title="Ver / editar el JSON del proyecto">
          <Icon name="data_object" size={15} /> JSON
        </button>
        {clipMode ? (
          clipSaving ? (
            <span className="ed-export-pct">{Math.round((clipSavePct || 0.05) * 100)}%</span>
          ) : (
            <button className="primary small ed-export-btn" type="button" onClick={onSaveClip} disabled={clipSaveDisabled} title={saveClipLabel}>
              <Icon name="save" size={15} /> {saveClipLabel}
            </button>
          )
        ) : exporting ? (
          <span className="ed-export-pct">{Math.round((exportPct || 0.05) * 100)}%</span>
        ) : exportDone ? (
          <>
            <a className="primary small ed-export-btn" href={exportUrl} download>
              <Icon name="download" size={15} /> Descargar
            </a>
            <button className="ghost small" type="button" onClick={onClearExport}>Editar</button>
          </>
        ) : (
          <button className="primary small ed-export-btn" type="button" onClick={onExport} disabled={exportBusyDisabled} title="Exportar el resultado">
            <Icon name="movie" size={15} /> Exportar
          </button>
        )}
      </div>
    </header>
  )
}
