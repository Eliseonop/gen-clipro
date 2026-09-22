import { useEffect, useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import Toast from '../../components/Toast'
import { FPS_CHOICES, normalizeFps } from '../../lib/projectFps'
import { getSettings, putSettings, getAiConfig, getLmStudioModels, testApiKeys, addApiKey, setApiKeyAt, deleteApiKeyAt } from '../../services/api'

// `use` = etiqueta corta de PARA QUÉ sirve la clave (chip). `icon` = material-icons
// clásico (por ligadura). `wired: false` = la clave se guarda y se puede probar,
// pero todavía ninguna función de la app la consume (p. ej. Unsplash: la búsqueda
// de stock solo usa Pexels + GIPHY).
const API_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', use: 'IA · voz · img', icon: 'auto_awesome', hint: 'Narración TTS, guion e imágenes', keys: 'https://aistudio.google.com/apikey' },
  { id: 'openai', label: 'OpenAI', use: 'IA · voz · img', icon: 'auto_awesome', hint: 'GPT, Whisper e imágenes', keys: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', use: 'Guiones', icon: 'edit_note', hint: 'Claude para guiones', keys: 'https://console.anthropic.com/settings/keys' },
  { id: 'elevenlabs', label: 'ElevenLabs', use: 'Voces TTS', icon: 'record_voice_over', wired: false, hint: 'Voces TTS — aún sin cablear (se usan Kokoro/Piper/Gemini/Azure)', keys: 'https://elevenlabs.io/app/settings/api-keys' },
  { id: 'openrouter', label: 'OpenRouter', use: 'Chat IA', icon: 'forum', hint: 'Varios modelos con una sola clave', keys: 'https://openrouter.ai/keys' },
  { id: 'groq', label: 'Groq', use: 'Chat IA', icon: 'bolt', hint: 'Chat IA gratis y muy rápido', keys: 'https://console.groq.com/keys' },
  { id: 'cerebras', label: 'Cerebras', use: 'Chat IA', icon: 'bolt', hint: 'Chat IA gratis, inferencia ultrarrápida', keys: 'https://cloud.cerebras.ai/platform' },
  { id: 'mistral', label: 'Mistral', use: 'Chat IA', icon: 'forum', hint: 'Chat IA gratis (La Plateforme)', keys: 'https://console.mistral.ai/api-keys' },
  { id: 'pexels', label: 'Pexels', use: 'Fotos y vídeo', icon: 'image', hint: 'Vídeo e imágenes de stock (pestaña Explorar)', keys: 'https://www.pexels.com/api/' },
  { id: 'giphy', label: 'GIPHY', use: 'GIFs', icon: 'gif', hint: 'GIFs animados (pestaña Explorar)', keys: 'https://developers.giphy.com/dashboard/' },
  { id: 'pixabay', label: 'Pixabay', use: 'Fotos y vídeo', icon: 'image', hint: 'Fotos y vídeo de stock (pestaña Explorar)', keys: 'https://pixabay.com/api/docs/' },
  { id: 'unsplash', label: 'Unsplash', use: 'Fotos', icon: 'image', hint: 'Fotos de stock (pestaña Explorar)', keys: 'https://unsplash.com/oauth/applications' },
  { id: 'youtube', label: 'YouTube Data', use: 'Metadatos', icon: 'smart_display', wired: false, hint: 'Metadatos y búsqueda — aún sin cablear', keys: 'https://console.cloud.google.com/apis/credentials' },
  { id: 'replicate', label: 'Replicate', use: 'Imagen/vídeo IA', icon: 'movie_filter', wired: false, hint: 'Modelos de imagen y vídeo — aún sin cablear', keys: 'https://replicate.com/account/api-tokens' },
  { id: 'fal', label: 'Fal.ai', use: 'Imagen IA', icon: 'movie_filter', wired: false, hint: 'Generación rápida — aún sin cablear', keys: 'https://fal.ai/dashboard/keys' },
  { id: 'huggingface', label: 'Hugging Face', use: 'Chat IA', icon: 'hub', hint: 'Modelos abiertos', keys: 'https://huggingface.co/settings/tokens' },
  { id: 'assemblyai', label: 'AssemblyAI', use: 'Transcripción', icon: 'subtitles', wired: false, hint: 'Transcripción — aún sin cablear (se usa Whisper local)', keys: 'https://www.assemblyai.com/app/account' },
  { id: 'removebg', label: 'Remove.bg', use: 'Quitar fondo', icon: 'auto_fix_high', wired: false, hint: 'Quitar fondo — aún sin cablear (se usa matte IA local)', keys: 'https://www.remove.bg/dashboard#api-key' },
  { id: 'stability', label: 'Stability AI', use: 'Imagen/vídeo IA', icon: 'movie_filter', wired: false, hint: 'Imagen y vídeo — aún sin cablear', keys: 'https://platform.stability.ai/account/keys' },
]

function provider(id) {
  return API_PROVIDERS.find((p) => p.id === id)
}

function providerLabel(id) {
  return provider(id)?.label || id
}

function providerHint(id) {
  return provider(id)?.hint || ''
}

function providerKeysUrl(id) {
  return provider(id)?.keys || ''
}

const FPS_OPTS = FPS_CHOICES
const AUDIO_DB_PRESETS = [-24, -18, -16, -14, -12, -10, -8]
const QUALITY_OPTS = [
  { id: 'draft', label: 'Borrador', hint: 'Más rápido, más compresión' },
  { id: 'standard', label: 'Estándar', hint: 'Equilibrio calidad / tamaño' },
  { id: 'high', label: 'Alta', hint: 'Mejor calidad, export más lento' },
]

const TX_FALLBACK = [
  { id: 'tiny', label: 'Tiny', hint: 'Más rápido, menos preciso (~75 MB)' },
  { id: 'base', label: 'Base', hint: 'Equilibrio velocidad / calidad (~140 MB)' },
  { id: 'small', label: 'Small', hint: 'Mejor precisión, un poco más lento (~460 MB)' },
  { id: 'medium', label: 'Medium', hint: 'Alta precisión, más lento (~1.5 GB)' },
  { id: 'large-v3', label: 'Large v3', hint: 'Máxima precisión (~3 GB)' },
]

function txModelsFrom(raw) {
  const list = Array.isArray(raw) ? raw : []
  const mapped = list.map((m) => {
    if (typeof m === 'string') {
      const hit = TX_FALLBACK.find((x) => x.id === m)
      return hit || { id: m, label: m, hint: '' }
    }
    const id = m?.id
    if (!id) return null
    const hit = TX_FALLBACK.find((x) => x.id === id)
    return { id, label: m.label || hit?.label || id, hint: m.hint || hit?.hint || '' }
  }).filter(Boolean)
  return mapped.length ? mapped : TX_FALLBACK
}

function txMeta(models, id) {
  return models.find((m) => m.id === id) || { id, label: id, hint: '' }
}

export default function EdSettings({ audioDb, onAudioDb }) {
  const [cfgTab, setCfgTab] = useState('config')
  const [setKeys, setSetKeys] = useState({})
  const [keyCounts, setKeyCounts] = useState({})
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState(null)  // {provider: [{index, ok, message}]}
  const [exportCfg, setExportCfg] = useState({ fps: 30, quality: 'standard' })
  const [txCfg, setTxCfg] = useState({ model: 'base' })
  const [txModels, setTxModels] = useState(TX_FALLBACK)
  const [txEdit, setTxEdit] = useState(false)
  const [txDraft, setTxDraft] = useState('base')
  const [form, setForm] = useState(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState(null)
  const [aiCfg, setAiCfg] = useState(null)
  const [aiProv, setAiProv] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiEdit, setAiEdit] = useState(false)
  const [lmModels, setLmModels] = useState([])
  const [lmStatus, setLmStatus] = useState('idle')
  const [lmReason, setLmReason] = useState('')
  const [lmTick, setLmTick] = useState(0)
  // Azure Vision: recurso PROPIO (clave + endpoint), separado de Azure Speech.
  const [azVisionEndpoint, setAzVisionEndpoint] = useState('')
  const [azVisionKey, setAzVisionKey] = useState('')
  const [azVisionEdit, setAzVisionEdit] = useState(false)
  // Microsoft Foundry: capa de IA generativa (endpoint + deployment + api-version + clave).
  const [azFoundryEndpoint, setAzFoundryEndpoint] = useState('')
  const [azFoundryDeployment, setAzFoundryDeployment] = useState('')
  const [azFoundryApiVersion, setAzFoundryApiVersion] = useState('')
  const [azFoundryKey, setAzFoundryKey] = useState('')
  const [azFoundryEdit, setAzFoundryEdit] = useState(false)

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
    setKeyCounts(s.api_keys_counts && typeof s.api_keys_counts === 'object' ? s.api_keys_counts : {})
    const ex = s.export && typeof s.export === 'object' ? s.export : {}
    setExportCfg({
      fps: normalizeFps(ex.fps),
      quality: ['draft', 'standard', 'high'].includes(ex.quality) ? ex.quality : 'standard',
    })
    const tx = s.transcribe && typeof s.transcribe === 'object' ? s.transcribe : {}
    const models = txModelsFrom(tx.models)
    setTxModels(models)
    const model = models.some((m) => m.id === tx.model) ? tx.model : (models[0]?.id || 'base')
    setTxCfg({ model })
    setTxDraft(model)
    setAzVisionEndpoint(typeof s.azure_vision_endpoint === 'string' ? s.azure_vision_endpoint : '')
    setAzFoundryEndpoint(typeof s.azure_foundry_endpoint === 'string' ? s.azure_foundry_endpoint : '')
    setAzFoundryDeployment(typeof s.azure_foundry_deployment === 'string' ? s.azure_foundry_deployment : '')
    setAzFoundryApiVersion(typeof s.azure_foundry_api_version === 'string' ? s.azure_foundry_api_version : '')
  }

  async function saveAzVision() {
    const ep = azVisionEndpoint.trim()
    const key = azVisionKey.trim()
    if (!ep) { setErr('Pega el endpoint de Azure Vision.'); return }
    setBusy(true)
    setErr('')
    try {
      const patch = { azure_vision_endpoint: ep }
      if (key) patch.api_keys = { azure_vision: key }
      await putSettings(patch)
      setAzVisionKey('')
      await reload()
      setAzVisionEdit(false)
      setToast({ type: 'success', message: 'Credenciales de Azure Vision guardadas.' })
    } catch (e) {
      setErr(e.message || 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  async function saveAzFoundry() {
    const ep = azFoundryEndpoint.trim()
    const dep = azFoundryDeployment.trim()
    const key = azFoundryKey.trim()
    if (!ep) { setErr('Pega el endpoint de Microsoft Foundry.'); return }
    if (!dep) { setErr('Indica el nombre del deployment/modelo de Foundry.'); return }
    setBusy(true)
    setErr('')
    try {
      const patch = { azure_foundry_endpoint: ep, azure_foundry_deployment: dep }
      if (azFoundryApiVersion.trim()) patch.azure_foundry_api_version = azFoundryApiVersion.trim()
      if (key) patch.api_keys = { azure_foundry: key }
      await putSettings(patch)
      setAzFoundryKey('')
      await reload()
      setAzFoundryEdit(false)
      setToast({ type: 'success', message: 'Credenciales de Foundry guardadas.' })
    } catch (e) {
      setErr(e.message || 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  async function reloadAi() {
    const c = await getAiConfig()
    setAiCfg(c)
    setAiProv(c.provider)
    setAiModel(c.model)
    setAiBaseUrl(c.base_url || '')
  }

  async function saveAi() {
    setBusy(true)
    setErr('')
    try {
      await putSettings({ ai: { provider: aiProv, model: aiModel.trim(), base_url: aiBaseUrl.trim() } })
      await reloadAi()
      setAiEdit(false)
      setToast({ type: 'success', message: 'Proveedor de IA guardado.' })
    } catch (e) {
      setErr(e.message || 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    reload().catch(() => {})
    reloadAi().catch(() => {})
  }, [])

  useEffect(() => {
    if (aiProv !== 'lmstudio') {
      setLmModels([])
      setLmStatus('idle')
      setLmReason('')
      return
    }
    let cancelled = false
    setLmStatus('loading')
    const t = setTimeout(() => {
      getLmStudioModels(aiBaseUrl)
        .then((r) => {
          if (cancelled) return
          if (r.ok) {
            setLmModels(Array.isArray(r.models) ? r.models : [])
            setLmStatus('ok')
            setLmReason('')
          } else {
            setLmModels([])
            setLmStatus('off')
            setLmReason(r.reason || 'Enciende LM Studio y arranca su servidor (Developer → Start Server).')
          }
        })
        .catch(() => {
          if (cancelled) return
          setLmModels([])
          setLmStatus('off')
          setLmReason('Enciende LM Studio y arranca su servidor (Developer → Start Server).')
        })
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [aiProv, aiBaseUrl, lmTick])

  useEffect(() => {
    if (aiProv !== 'lmstudio' || lmStatus !== 'ok' || !aiEdit || !lmModels.length) return
    if (lmModels.some((m) => m.id === aiModel)) return
    const pick = lmModels.find((m) => m.loaded) || lmModels.find((m) => m.tool_use) || lmModels[0]
    if (pick) setAiModel(pick.id)
  }, [aiProv, lmStatus, lmModels, aiEdit, aiModel])

  function openAdd() {
    const first = unused[0]
    if (!first) return
    setErr('')
    setValue('')
    setForm({ mode: 'add', id: first.id })
  }

  function openEdit(id, index = 0) {
    setErr('')
    setValue('')
    setForm({ mode: 'edit', id, index })
  }

  function openAddExtra(id) {
    setErr('')
    setValue('')
    setForm({ mode: 'addExtra', id })
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
      // 'add' = primera clave de un proveedor (flujo Agregar, sin cambios).
      // 'addExtra' = otra clave del mismo proveedor. 'edit' = reemplaza la clave #index.
      if (form.mode === 'addExtra') await addApiKey(id, key)
      else if (form.mode === 'edit') await setApiKeyAt(id, form.index || 0, key)
      else await putSettings({ api_keys: { [id]: key } })
      setValue('')
      setForm(null)
      setTestResults(null)
      await reload()
      setToast({ type: 'success', message: `Clave de ${providerLabel(id)} guardada.` })
    } catch (e) {
      setErr(e.message || 'No se pudo guardar.')
    }
    setBusy(false)
  }

  async function remove(id, index = 0) {
    setBusy(true)
    setErr('')
    try {
      await deleteApiKeyAt(id, index)
      if (form?.id === id) cancel()
      setTestResults(null)
      await reload()
      setToast({ type: 'success', message: `Clave de ${providerLabel(id)} eliminada.` })
    } catch (e) {
      setErr(e.message || 'No se pudo eliminar.')
    }
    setBusy(false)
  }

  async function runTest() {
    if (testing) return
    setTesting(true)
    setErr('')
    setTestResults(null)
    try {
      const r = await testApiKeys()
      setTestResults(r.results || {})
    } catch (e) {
      setErr(e.message || 'No se pudieron probar las claves.')
    }
    setTesting(false)
  }

  function resultFor(id, index) {
    const list = testResults?.[id]
    if (!list) return undefined
    return list.find((e) => e.index === index)
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

  function openTxEdit() {
    setErr('')
    setTxDraft(txCfg.model)
    setTxEdit(true)
  }

  function cancelTxEdit() {
    setErr('')
    setTxDraft(txCfg.model)
    setTxEdit(false)
  }

  async function saveTx() {
    const model = txModels.some((m) => m.id === txDraft) ? txDraft : txCfg.model
    setBusy(true)
    setErr('')
    try {
      await putSettings({ transcribe: { model } })
      setTxEdit(false)
      await reload()
      setToast({ type: 'success', message: 'Modelo de transcripción guardado.' })
    } catch (e) {
      setErr(e.message || 'No se pudo guardar.')
    }
    setBusy(false)
  }

  const rows = [...savedIds, ...extraIds]
  const txShown = txEdit ? txDraft : txCfg.model
  const txInfo = txMeta(txModels, txShown)

  return (
    <div className="ed-cfg">
      <div className="ed-scope-filter">
        <button
          type="button"
          className={`ed-tab ${cfgTab === 'config' ? 'on' : ''}`}
          onClick={() => { setCfgTab('config'); setErr('') }}
        >
          Configuración
        </button>
        <button
          type="button"
          className={`ed-tab ${cfgTab === 'keys' ? 'on' : ''}`}
          onClick={() => { setCfgTab('keys'); setErr('') }}
        >
          API-KEYS
        </button>
        <button
          type="button"
          className={`ed-tab ${cfgTab === 'export' ? 'on' : ''}`}
          onClick={() => { setCfgTab('export'); setErr('') }}
        >
          Exportar
        </button>
      </div>

      {cfgTab === 'config' && (
        <div className="ed-cfg-keys">
          <div className="ed-key-row">
            <div className="ed-key-row-head">
              <span className="ed-key-name">Transcripción</span>
              {!txEdit && <span className="ed-key-set">{txInfo.label}</span>}
              {!txEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={openTxEdit} disabled={busy}>
                    Editar
                  </button>
                </div>
              )}
            </div>
            <div className="ed-key-form">
              <label className="field">
                <span>Modelo Whisper</span>
                <select
                  className="select"
                  value={txShown}
                  disabled={!txEdit || busy}
                  onChange={(e) => setTxDraft(e.target.value)}
                >
                  {txModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
              {txInfo.hint ? <p className="ed-key-hint">{txInfo.hint}</p> : null}
              {txEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={cancelTxEdit} disabled={busy}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="primary small"
                    onClick={saveTx}
                    disabled={busy || txDraft === txCfg.model}
                  >
                    {busy ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="ed-key-row">
            <div className="ed-key-row-head">
              <span className="ed-key-name">Chat IA</span>
              {!aiEdit && aiCfg && (
                <span className={`ed-key-set ${aiCfg.available ? '' : 'off'}`}>{aiProv} · {aiModel}</span>
              )}
              {!aiEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={() => setAiEdit(true)} disabled={busy}>Editar</button>
                </div>
              )}
            </div>
            <div className="ed-key-form">
              <label className="field">
                <span>Proveedor</span>
                <select
                  className="select"
                  value={aiProv}
                  disabled={!aiEdit || busy}
                  onChange={(e) => {
                    const id = e.target.value
                    setAiProv(id)
                    const pv = (aiCfg?.providers || []).find((x) => x.id === id)
                    if (pv) setAiModel(pv.default_model)
                  }}
                >
                  {(aiCfg?.providers || []).map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.has_key}>
                      {p.label}{p.has_key ? '' : ' (sin key)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Modelo</span>
                {aiProv === 'lmstudio' ? (
                  <select
                    className="select"
                    value={aiModel}
                    disabled={!aiEdit || busy || lmStatus === 'loading'}
                    onChange={(e) => setAiModel(e.target.value)}
                  >
                    {!lmModels.length && (
                      <option value={aiModel}>
                        {lmStatus === 'loading' ? 'Consultando modelos…' : (aiModel || '—')}
                      </option>
                    )}
                    {lmModels.length > 0 && aiModel && !lmModels.some((m) => m.id === aiModel) && (
                      <option value={aiModel}>{aiModel}</option>
                    )}
                    {lmModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}{m.loaded ? ' · cargado' : ''}{m.tool_use ? ' · tools' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="ed-cfg-input"
                    value={aiModel}
                    disabled={!aiEdit || busy}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="modelo"
                  />
                )}
              </label>
              {(aiCfg?.providers || []).find((p) => p.id === aiProv)?.local && (
                <label className="field">
                  <span>Servidor (base URL)</span>
                  <input
                    className="ed-cfg-input"
                    value={aiBaseUrl}
                    disabled={!aiEdit || busy}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                    placeholder="http://localhost:1234/v1"
                  />
                </label>
              )}
              {!aiEdit && aiCfg && !aiCfg.available && <p className="ed-key-hint">{aiCfg.reason}</p>}
              {aiProv === 'openrouter' && aiEdit && (
                <p className="ed-key-hint">Con <b>openrouter/free</b> elige solo un modelo gratis disponible (recomendado). O escribe uno concreto, p. ej. <b>nvidia/nemotron-3-super-120b-a12b:free</b>.</p>
              )}
              {aiProv === 'lmstudio' && lmStatus === 'loading' && (
                <p className="ed-key-hint">Consultando modelos en LM Studio…</p>
              )}
              {aiProv === 'lmstudio' && lmStatus === 'off' && (
                <div className="ed-lm-status">
                  <p className="ed-key-hint warn">{lmReason}</p>
                  <button type="button" className="ghost small" onClick={() => setLmTick((n) => n + 1)} disabled={busy}>
                    Reintentar
                  </button>
                </div>
              )}
              {aiProv === 'lmstudio' && lmStatus === 'ok' && !lmModels.length && (
                <div className="ed-lm-status">
                  <p className="ed-key-hint warn">No hay modelos LLM en LM Studio. Descarga uno y pulsa Reintentar.</p>
                  <button type="button" className="ghost small" onClick={() => setLmTick((n) => n + 1)} disabled={busy}>
                    Reintentar
                  </button>
                </div>
              )}
              {aiProv === 'lmstudio' && lmStatus === 'ok' && lmModels.length > 0 && aiEdit && (
                <p className="ed-key-hint">Elige un modelo con <b>tools</b> si quieres que el chat use herramientas. Los marcados como <b>cargado</b> ya están en memoria.</p>
              )}
              {aiEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={() => { setAiEdit(false); if (aiCfg) { setAiProv(aiCfg.provider); setAiModel(aiCfg.model); setAiBaseUrl(aiCfg.base_url || '') } }} disabled={busy}>Cancelar</button>
                  <button type="button" className="primary small" onClick={saveAi} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
                </div>
              )}
            </div>
          </div>

          <div className="ed-key-row">
            <div className="ed-key-row-head">
              <span className="ed-key-name">Azure Vision</span>
              {!azVisionEdit && (
                <span className={`ed-key-set ${setKeys.azure_vision && azVisionEndpoint ? '' : 'off'}`}>
                  {setKeys.azure_vision && azVisionEndpoint ? 'Configurado' : 'Sin configurar'}
                </span>
              )}
              {!azVisionEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={() => setAzVisionEdit(true)} disabled={busy}>Editar</button>
                </div>
              )}
            </div>
            <div className="ed-key-form">
              <p className="ed-key-hint">OCR y análisis de imagen. Recurso propio de Azure Vision (distinto de Azure Speech).</p>
              <label className="field">
                <span>Endpoint</span>
                <input
                  className="ed-cfg-input"
                  value={azVisionEndpoint}
                  disabled={!azVisionEdit || busy}
                  onChange={(e) => setAzVisionEndpoint(e.target.value)}
                  placeholder="https://<recurso>.cognitiveservices.azure.com"
                />
              </label>
              {azVisionEdit && (
                <label className="field">
                  <span>Clave {setKeys.azure_vision ? '(deja vacío para conservar la actual)' : ''}</span>
                  <input
                    className="ed-cfg-input"
                    type="password"
                    autoComplete="off"
                    value={azVisionKey}
                    onChange={(e) => setAzVisionKey(e.target.value)}
                    placeholder="Clave de Azure Vision"
                  />
                </label>
              )}
              {azVisionEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={() => { setAzVisionEdit(false); setAzVisionKey(''); reload() }} disabled={busy}>Cancelar</button>
                  <button type="button" className="primary small" onClick={saveAzVision} disabled={busy || !azVisionEndpoint.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>
                </div>
              )}
            </div>
          </div>

          <div className="ed-key-row">
            <div className="ed-key-row-head">
              <span className="ed-key-name">Microsoft Foundry</span>
              {!azFoundryEdit && (
                <span className={`ed-key-set ${setKeys.azure_foundry && azFoundryEndpoint && azFoundryDeployment ? '' : 'off'}`}>
                  {setKeys.azure_foundry && azFoundryEndpoint && azFoundryDeployment ? 'Configurado' : 'Sin configurar'}
                </span>
              )}
              {!azFoundryEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={() => setAzFoundryEdit(true)} disabled={busy}>Editar</button>
                </div>
              )}
            </div>
            <div className="ed-key-form">
              <p className="ed-key-hint">IA generativa (guiones, hooks, títulos, prompts visuales). Recurso propio de Azure AI Foundry / Azure OpenAI. Complementa a Speech y Vision.</p>
              <label className="field">
                <span>Endpoint</span>
                <input
                  className="ed-cfg-input"
                  value={azFoundryEndpoint}
                  disabled={!azFoundryEdit || busy}
                  onChange={(e) => setAzFoundryEndpoint(e.target.value)}
                  placeholder="https://<recurso>.services.ai.azure.com/openai/v1"
                />
              </label>
              <label className="field">
                <span>Deployment / modelo</span>
                <input
                  className="ed-cfg-input"
                  value={azFoundryDeployment}
                  disabled={!azFoundryEdit || busy}
                  onChange={(e) => setAzFoundryDeployment(e.target.value)}
                  placeholder="nombre del deployment (p. ej. gpt-5-mini)"
                />
              </label>
              <label className="field">
                <span>API version (opcional)</span>
                <input
                  className="ed-cfg-input"
                  value={azFoundryApiVersion}
                  disabled={!azFoundryEdit || busy}
                  onChange={(e) => setAzFoundryApiVersion(e.target.value)}
                  placeholder="2024-10-21"
                />
              </label>
              {azFoundryEdit && (
                <label className="field">
                  <span>Clave {setKeys.azure_foundry ? '(deja vacío para conservar la actual)' : ''}</span>
                  <input
                    className="ed-cfg-input"
                    type="password"
                    autoComplete="off"
                    value={azFoundryKey}
                    onChange={(e) => setAzFoundryKey(e.target.value)}
                    placeholder="Clave de Foundry"
                  />
                </label>
              )}
              {azFoundryEdit && (
                <div className="ed-key-actions">
                  <button type="button" className="ghost small" onClick={() => { setAzFoundryEdit(false); setAzFoundryKey(''); reload() }} disabled={busy}>Cancelar</button>
                  <button type="button" className="primary small" onClick={saveAzFoundry} disabled={busy || !azFoundryEndpoint.trim() || !azFoundryDeployment.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>
                </div>
              )}
            </div>
          </div>

          {err && <div className="ed-mat-err">{err}</div>}
        </div>
      )}

      {cfgTab === 'keys' && (
        <div className="ed-cfg-keys">
          {/* Barra: Agregar + Probar, arriba de la lista */}
          <div className="ed-key-toolbar">
            {unused.length > 0 && (
              <button type="button" className="ghost small ed-key-add" onClick={openAdd} disabled={busy || testing || !!form}>
                <Icon name="add" size={16} /> Agregar
              </button>
            )}
            <button type="button" className="ghost small ed-key-test" onClick={runTest} disabled={testing || busy || rows.length === 0}>
              {testing ? 'Probando…' : (<><Icon name="check_circle" size={16} /> Probar</>)}
            </button>
          </div>

          {rows.length === 0 && !form && (
            <div className="ed-mat-empty">Aún no hay claves. Pulsa Agregar.</div>
          )}

          {/* Alta de un proveedor nuevo (flujo Agregar; sin cambios) */}
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

          {rows.map((id) => {
            const meta = provider(id) || {}
            const count = Math.max(1, keyCounts[id] || 1)
            const editingExtra = form?.mode === 'addExtra' && form.id === id
            const single = count === 1
            const editing0 = form?.mode === 'edit' && form.id === id && (form.index || 0) === 0
            return (
              <div className={`ed-key-row${single ? ' compact' : ''}`} key={id}>
                <div className="ed-key-row-head">
                  <span className="ed-key-ico"><Icon name={meta.icon || 'vpn_key'} size={15} /></span>
                  <span className="ed-key-name">{providerLabel(id)}</span>
                  {meta.use && <span className="ed-key-use" title={providerHint(id)}>{meta.use}</span>}
                  {meta.wired === false && (
                    <span className="ed-key-unused" title="La clave se guarda y se puede probar, pero ninguna función de la app la usa todavía.">sin uso</span>
                  )}
                  {count > 1 && <span className="ed-key-count">{count}</span>}
                  {single && !editing0 && (
                    <div className="ed-key-actions">
                      <KeyStatus testing={testing} res={resultFor(id, 0)} />
                      <button type="button" className="ghost small" onClick={() => openEdit(id, 0)} disabled={busy || testing}>Editar</button>
                      <button type="button" className="ghost small danger" onClick={() => remove(id, 0)} disabled={busy || testing}>Quitar</button>
                      <button type="button" className="icon-btn ed-key-otra" title={`Otra clave de ${providerLabel(id)}`} onClick={() => openAddExtra(id)} disabled={busy || testing || !!form}>
                        <Icon name="add" size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {single ? (
                  <>
                    {editing0 && (
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
                    {editingExtra && (
                      <KeyForm
                        selectId={id}
                        providers={[{ id, label: providerLabel(id) }]}
                        selectLocked
                        hint={`Otra clave de ${providerLabel(id)} (de otra cuenta).`}
                        value={value}
                        setValue={setValue}
                        busy={busy}
                        onSave={save}
                        onCancel={cancel}
                      />
                    )}
                  </>
                ) : (
                  <div className="ed-key-slots">
                    {Array.from({ length: count }).map((_, index) => {
                      const editing = form?.mode === 'edit' && form.id === id && (form.index || 0) === index
                      const res = resultFor(id, index)
                      return (
                        <div className="ed-key-slot" key={index}>
                          <div className="ed-key-slot-head">
                            <span className="ed-key-num">#{index + 1}</span>
                            <KeyStatus testing={testing} res={res} />
                            {!editing && (
                              <div className="ed-key-actions">
                                <button type="button" className="ghost small" onClick={() => openEdit(id, index)} disabled={busy || testing}>Editar</button>
                                <button type="button" className="ghost small danger" onClick={() => remove(id, index)} disabled={busy || testing}>Quitar</button>
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
                    {editingExtra ? (
                      <KeyForm
                        selectId={id}
                        providers={[{ id, label: providerLabel(id) }]}
                        selectLocked
                        hint={`Otra clave de ${providerLabel(id)} (de otra cuenta).`}
                        value={value}
                        setValue={setValue}
                        busy={busy}
                        onSave={save}
                        onCancel={cancel}
                      />
                    ) : (
                      <button type="button" className="ghost small ed-key-otra" onClick={() => openAddExtra(id)} disabled={busy || testing || !!form}>
                        <Icon name="add" size={14} /> otra
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {err && <div className="ed-mat-err">{err}</div>}
        </div>
      )}

      {cfgTab === 'export' && (
        <div className="ed-cfg-export">
          <label className="field">
            <span>FPS de proyectos nuevos</span>
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
            El preview usa el canvas; el MP4 usa esta calidad. El FPS de cada proyecto se cambia en la barra del reproductor.
          </p>
          {onAudioDb && (
            <label className="field">
              <span>Nivel de audio (dB)</span>
              <select
                className="select"
                value={audioDb}
                onChange={(e) => onAudioDb(Number(e.target.value))}
              >
                {(AUDIO_DB_PRESETS.includes(Number(audioDb))
                  ? AUDIO_DB_PRESETS
                  : [...AUDIO_DB_PRESETS, Number(audioDb)].sort((a, b) => a - b)
                ).map((db) => (
                  <option key={db} value={db}>{db} dB</option>
                ))}
              </select>
              <p className="ed-key-hint">
                Nivel de audio objetivo del render (LUFS). No cambia la vista previa.
              </p>
            </label>
          )}
          {err && <div className="ed-mat-err">{err}</div>}
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function KeyStatus({ testing, res }) {
  if (testing) return <span className="ed-key-testing">Probando…</span>
  if (!res) return null
  const cls = res.ok === true ? 'ok' : res.ok === false ? 'fail' : 'unknown'
  const icon = res.ok === true ? '✓' : res.ok === false ? '✕' : '?'
  return (
    <span className={`ed-key-status ${cls}`} title={res.message || ''}>
      <span className="ed-key-dot" />{icon}
    </span>
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
      <div className="field">
        <span>API key</span>
        <div className="ed-key-input-row">
          <input
            className="ed-yt-url"
            type="password"
            autoComplete="off"
            placeholder="Pega la clave…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && onSave()}
          />
          {providerKeysUrl(selectId) && (
            <a
              className="ghost small ed-key-go"
              href={providerKeysUrl(selectId)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Obtener API key de ${providerLabel(selectId)}`}
            >
              <Icon name="open_in_new" size={14} /> Ir
            </a>
          )}
        </div>
      </div>
      <div className="ed-key-actions">
        <button type="button" className="ghost small" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="button" className="primary small" onClick={onSave} disabled={busy || !value.trim()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
