import { useEffect, useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import Toast from '../../components/Toast'
import { getSettings, putSettings } from '../../services/api'

export const API_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', hint: 'Narración TTS, guion e imágenes' },
  { id: 'openai', label: 'OpenAI', hint: 'GPT, Whisper e imágenes' },
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude para guiones' },
  { id: 'elevenlabs', label: 'ElevenLabs', hint: 'Voces TTS' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'Varios modelos con una sola clave' },
  { id: 'pexels', label: 'Pexels', hint: 'Vídeo e imágenes de stock' },
  { id: 'pixabay', label: 'Pixabay', hint: 'Stock libre' },
  { id: 'unsplash', label: 'Unsplash', hint: 'Fotos de stock' },
  { id: 'youtube', label: 'YouTube Data', hint: 'Metadatos y búsqueda' },
  { id: 'replicate', label: 'Replicate', hint: 'Modelos de imagen y vídeo' },
  { id: 'fal', label: 'Fal.ai', hint: 'Generación rápida' },
  { id: 'huggingface', label: 'Hugging Face', hint: 'Modelos abiertos' },
  { id: 'assemblyai', label: 'AssemblyAI', hint: 'Transcripción' },
  { id: 'removebg', label: 'Remove.bg', hint: 'Quitar fondo' },
  { id: 'stability', label: 'Stability AI', hint: 'Imagen y vídeo' },
]

function providerLabel(id) {
  return API_PROVIDERS.find((p) => p.id === id)?.label || id
}

function providerHint(id) {
  return API_PROVIDERS.find((p) => p.id === id)?.hint || ''
}

const FPS_OPTS = [24, 25, 30, 60]
const QUALITY_OPTS = [
  { id: 'draft', label: 'Borrador', hint: 'Más rápido, más compresión' },
  { id: 'standard', label: 'Estándar', hint: 'Equilibrio calidad / tamaño' },
  { id: 'high', label: 'Alta', hint: 'Mejor calidad, export más lento' },
]

export default function EdSettings() {
  const [cfgTab, setCfgTab] = useState('keys')
  const [setKeys, setSetKeys] = useState({})
  const [exportCfg, setExportCfg] = useState({ fps: 30, quality: 'standard' })
  const [form, setForm] = useState(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState(null)

  const savedIds = useMemo(
    () => API_PROVIDERS.map((p) => p.id).filter((id) => setKeys[id]),
    [setKeys],
  )
  const extraIds = useMemo(
    () => Object.keys(setKeys).filter((id) => setKeys[id] && !API_PROVIDERS.some((p) => p.id === id)),
    [setKeys],
  )
  const unused = API_PROVIDERS.filter((p) => !setKeys[p.id])
  const formHint = form ? providerHint(form.id) : ''

  async function reload() {
    const s = await getSettings()
    setSetKeys(s.api_keys && typeof s.api_keys === 'object' ? s.api_keys : {})
    const ex = s.export && typeof s.export === 'object' ? s.export : {}
    setExportCfg({
      fps: [24, 25, 30, 60].includes(Number(ex.fps)) ? Number(ex.fps) : 30,
      quality: ['draft', 'standard', 'high'].includes(ex.quality) ? ex.quality : 'standard',
    })
  }

  useEffect(() => {
    reload().catch(() => {})
  }, [])

  function openAdd() {
    const first = unused[0]
    if (!first) return
    setErr('')
    setValue('')
    setForm({ mode: 'add', id: first.id })
  }

  function openEdit(id) {
    setErr('')
    setValue('')
    setForm({ mode: 'edit', id })
  }

  function cancel() {
    setErr('')
    setValue('')
    setForm(null)
  }

  async function save() {
    const id = form?.id
    const key = value.trim()
    if (!id) return
    if (!key) { setErr('Pega la API key.'); return }
    setBusy(true)
    setErr('')
    try {
      await putSettings({ api_keys: { [id]: key } })
      setValue('')
      setForm(null)
      await reload()
      setToast({ type: 'success', message: `Clave de ${providerLabel(id)} guardada.` })
    } catch (e) {
      setErr(e.message || 'No se pudo guardar.')
    }
    setBusy(false)
  }

  async function remove(id) {
    setBusy(true)
    setErr('')
    try {
      await putSettings({ api_keys: { [id]: '' } })
      if (form?.id === id) cancel()
      await reload()
      setToast({ type: 'success', message: `Clave de ${providerLabel(id)} eliminada.` })
    } catch (e) {
      setErr(e.message || 'No se pudo eliminar.')
    }
    setBusy(false)
  }

  async function saveExport(patch) {
    const next = { ...exportCfg, ...patch }
    setExportCfg(next)
    setBusy(true)
    setErr('')
    try {
      await putSettings({ export: next })
      setToast({ type: 'success', message: 'Ajustes de export guardados.' })
    } catch (e) {
      setErr(e.message || 'No se pudo guardar.')
      await reload()
    }
    setBusy(false)
  }

  const rows = [...savedIds, ...extraIds]

  return (
    <div className="ed-cfg">
      <div className="ed-scope-filter">
        <button
          type="button"
          className={`ed-tab ${cfgTab === 'keys' ? 'on' : ''}`}
          onClick={() => setCfgTab('keys')}
        >
          API-KEYS
        </button>
        <button
          type="button"
          className={`ed-tab ${cfgTab === 'export' ? 'on' : ''}`}
          onClick={() => setCfgTab('export')}
        >
          Exportar
        </button>
      </div>

      {cfgTab === 'keys' && (
        <div className="ed-cfg-keys">
          {rows.length === 0 && !form && (
            <div className="ed-mat-empty">Aún no hay claves. Pulsa Agregar.</div>
          )}

          {rows.map((id) => {
            const editing = form?.mode === 'edit' && form.id === id
            return (
              <div className="ed-key-row" key={id}>
                <div className="ed-key-row-head">
                  <span className="ed-key-name">{providerLabel(id)}</span>
                  {!editing && <span className="ed-key-set">Guardada</span>}
                  {!editing && (
                    <div className="ed-key-actions">
                      <button type="button" className="ghost small" onClick={() => openEdit(id)} disabled={busy}>
                        Editar
                      </button>
                      <button type="button" className="ghost small danger" onClick={() => remove(id)} disabled={busy}>
                        Quitar
                      </button>
                    </div>
                  )}
                </div>
                {editing && (
                  <KeyForm
                    selectId={id}
                    providers={[{ id, label: providerLabel(id) }]}
                    selectLocked
                    hint={providerHint(id)}
                    value={value}
                    setValue={setValue}
                    busy={busy}
                    onSave={save}
                    onCancel={cancel}
                  />
                )}
              </div>
            )
          })}

          {form?.mode === 'add' && (
            <div className="ed-key-row">
              <KeyForm
                selectId={form.id}
                providers={unused}
                onSelect={(id) => setForm({ mode: 'add', id })}
                hint={formHint}
                value={value}
                setValue={setValue}
                busy={busy}
                onSave={save}
                onCancel={cancel}
              />
            </div>
          )}

          {err && <div className="ed-mat-err">{err}</div>}

          {!form && unused.length > 0 && (
            <button type="button" className="ghost small ed-key-add" onClick={openAdd} disabled={busy}>
              <Icon name="add" size={16} /> Agregar
            </button>
          )}
        </div>
      )}

      {cfgTab === 'export' && (
        <div className="ed-cfg-export">
          <label className="field">
            <span>FPS</span>
            <select
              className="select"
              value={exportCfg.fps}
              disabled={busy}
              onChange={(e) => saveExport({ fps: Number(e.target.value) })}
            >
              {FPS_OPTS.map((n) => (
                <option key={n} value={n}>{n} fps</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Calidad</span>
            <select
              className="select"
              value={exportCfg.quality}
              disabled={busy}
              onChange={(e) => saveExport({ quality: e.target.value })}
            >
              {QUALITY_OPTS.map((q) => (
                <option key={q.id} value={q.id}>{q.label}</option>
              ))}
            </select>
          </label>
          <p className="ed-key-hint">
            {QUALITY_OPTS.find((q) => q.id === exportCfg.quality)?.hint}.
            El preview usa el canvas; el MP4 usa estos valores.
          </p>
          {err && <div className="ed-mat-err">{err}</div>}
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function KeyForm({
  selectId, providers, onSelect, selectLocked, hint, value, setValue, busy, onSave, onCancel,
}) {
  return (
    <div className="ed-key-form">
      <label className="field">
        <span>Plataforma</span>
        <select
          className="select"
          value={selectId}
          disabled={selectLocked || providers.length < 2}
          onChange={(e) => onSelect?.(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      {hint ? <p className="ed-key-hint">{hint}</p> : null}
      <label className="field">
        <span>API key</span>
        <input
          className="ed-yt-url"
          type="password"
          autoComplete="off"
          placeholder="Pega la clave…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && onSave()}
        />
      </label>
      <div className="ed-key-actions">
        <button type="button" className="ghost small" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="button" className="primary small" onClick={onSave} disabled={busy || !value.trim()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
