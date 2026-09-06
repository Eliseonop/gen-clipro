import Icon from '../../components/Icon'
import { FORMATS } from './editorModel'

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
  formatId,
  onFormat,
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
  formatCustomLabel,
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
        <select
          className="select mini ed-topbar-format"
          value={formatId}
          onChange={(e) => onFormat(e.target.value)}
          title="Formato de salida"
        >
          {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
          {formatId === 'custom' && <option value="custom">{formatCustomLabel || 'Personalizado'}</option>}
        </select>
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
