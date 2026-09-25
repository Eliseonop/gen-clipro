// Pequeña capa de acceso a la API del backend.

async function req(path, options) {
  const res = await fetch(path, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const d = err.detail
    const msg = typeof d === 'string' ? d : (d && d.message) || `Error ${res.status}`
    const e = new Error(msg)
    e.status = res.status
    e.detail = d
    throw e
  }
  return res.json()
}

const get = (path) => req(path)
const post = (path, body) =>
  req(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const put = (path, body) =>
  req(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const patch = (path, body) =>
  req(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const del = (path) => req(path, { method: 'DELETE' })

// --- Vídeo / clips ---
export const analyze = (params) => post('/api/analyze', params)
export const createClipJob = (params) => post('/api/clip', params)
export const prepareReframe = (params) => post('/api/reframe/prepare', params)
export const getJob = (jobId) => get(`/api/job/${jobId}`)

// --- Proyectos ---
export const listProjects = () => get('/api/projects')
export const createProject = (name, groupId = null) => post('/api/projects', { name, group_id: groupId })
export const deleteProject = (id) => del(`/api/projects/${id}`)
export const renameProject = (id, name) => patch(`/api/projects/${id}`, { name })
export const duplicateProject = (id) => post(`/api/projects/${id}/duplicate`, {})
// Carpetas del inicio (solo organizan la lista; null = sin carpeta).
export const listProjectGroups = () => get('/api/project-groups')
export const createProjectGroup = (name) => post('/api/project-groups', { name })
export const renameProjectGroup = (id, name) => patch(`/api/project-groups/${id}`, { name })
export const deleteProjectGroup = (id) => del(`/api/project-groups/${id}`)
export const moveProjectToGroup = (id, groupId) => post(`/api/projects/${id}/group`, { group_id: groupId })
export const pickFolder = () => post('/api/pick-folder', {})
// Abre el explorador del sistema resaltando el archivo del material (solo local).
export const revealMaterial = ({ projectId, kind, filename, scope }) =>
  post('/api/media/reveal', { project_id: projectId, kind, filename, scope })

// --- Audio (TTS) + ajustes ---
export const listVoices = () => get('/api/voices')
export const createTtsJob = (params) => post('/api/tts', params)
export const createYoutubeAudioJob = (params) => post('/api/youtube-audio', params)
export const listLibrary = () => get('/api/library')
export const saveLibraryItem = (params) => post('/api/library/save', params)
export const unsaveLibraryItem = (id) => del(`/api/library/${id}`)
// Título/descripción de un material guardado (biblioteca).
export const updateLibraryItem = (id, data) => patch(`/api/library/${encodeURIComponent(id)}`, data)
// --- Biblioteca de material reutilizable (colecciones externas) ---
export const listCollections = () => get('/api/collections')
export const setCollectionsRoot = (path) => post('/api/collections/root', { path })
export const searchCollections = ({ q = '', kind = '', collection = '' } = {}) =>
  get(`/api/collections/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}&collection=${encodeURIComponent(collection)}`)
export const updateCollection = (cid, data) => patch(`/api/collections/${encodeURIComponent(cid)}`, data)

// --- Sticks (personajes de la biblioteca con stick.json, para "Agregar Stick") ---
export const listSticks = () => get('/api/sticks')
export const getStick = (cid) => get(`/api/sticks/${encodeURIComponent(cid)}`)

export const getSettings = () => get('/api/settings')
export const putSettings = (data) => put('/api/settings', data)
// API keys: prueba todas, y gestión de varias claves por proveedor (por índice).
export const testApiKeys = () => post('/api/settings/api-keys/test', {})
export const addApiKey = (provider, value) => post(`/api/settings/api-keys/${provider}`, { value })
export const setApiKeyAt = (provider, index, value) => put(`/api/settings/api-keys/${provider}/${index}`, { value })
export const deleteApiKeyAt = (provider, index) => del(`/api/settings/api-keys/${provider}/${index}`)

// --- Materiales (etiquetar / eliminar / manifest) ---
export const uploadImages = (pid, files) => {
  const body = new FormData()
  for (const f of files) body.append('files', f)
  return req(`/api/projects/${pid}/images`, { method: 'POST', body })
}
// Beats (#12) del audio de un clip: { times: [s del archivo], bpm }.
export const detectBeats = (pid, clip) => post(`/api/projects/${pid}/beats`, { clip })
// Congelar fotograma (#11): imagen fija del fotograma `time` (s del archivo) del clip.
export const freezeFrame = (pid, clip, time) => post(`/api/projects/${pid}/freeze-frame`, { clip, time })
export const trackObject = (pid, clip, box, at) => post(`/api/projects/${pid}/track-object`, { clip, box, at })
export const soundDesign = (pid, clip) => post(`/api/projects/${pid}/sound-design`, { clip })
export const listRecipes = () => get('/api/recipes')
export const applyRecipe = (pid, recipe, clipIds, params = {}) =>
  post(`/api/projects/${pid}/recipes/${encodeURIComponent(recipe)}`, { clip_ids: clipIds, params })
export async function fetchRemoteImage(url) {
  const res = await fetch('/api/images/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const d = err.detail
    throw new Error(typeof d === 'string' ? d : (d && d.message) || `Error ${res.status}`)
  }
  const blob = await res.blob()
  const raw = res.headers.get('Content-Disposition') || ''
  const m = raw.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)
  const name = decodeURIComponent((m?.[1] || 'imagen.png').replace(/"/g, '').trim())
  return new File([blob], name, { type: blob.type || 'image/png' })
}
export const uploadVideo = (pid, file) => {
  const body = new FormData()
  body.append('file', file)
  return req(`/api/projects/${pid}/videos`, { method: 'POST', body })
}
export const uploadAudio = (pid, file) => {
  const body = new FormData()
  body.append('file', file)
  return req(`/api/projects/${pid}/audios`, { method: 'POST', body })
}
export const updateMaterial = (pid, kind, id, data) => patch(`/api/projects/${pid}/materials/${kind}/${id}`, data)
// Clip Editor → "Crear clip": segmentos POR REFERENCIA (sin render) de un vídeo del material.
export const createSegments = (pid, ident, segments) =>
  post(`/api/projects/${pid}/clips/${encodeURIComponent(ident)}/segments`, { segments })
// Seguimiento de caras de un material (o de un rango de su archivo); se cachea en el material.
export const faceTrackMaterial = (pid, ident, params = {}) =>
  post(`/api/projects/${pid}/clips/${encodeURIComponent(ident)}/face-track`, params)
export const deleteMaterial =(pid, kind, id) => del(`/api/projects/${pid}/materials/${kind}/${id}`)
export const getManifest = (pid) => get(`/api/projects/${pid}/manifest`)
export const putManifest = (pid, data) => put(`/api/projects/${pid}/manifest`, data)
export const transcribeClip = (pid, index, model) =>
  post(`/api/projects/${pid}/clips/${index}/transcribe`, model ? { model } : {})

export const searchExplore = ({ q, page = 1, media = 'all', provider = 'all' } = {}) =>
  get(`/api/explore/search?q=${encodeURIComponent(q || '')}&page=${page}&media=${encodeURIComponent(media)}&provider=${encodeURIComponent(provider)}`)
export const suggestExploreKeywords = (pid, text) =>
  post('/api/explore/keywords', { project_id: pid || '', text: text || '' })
export const importExplore = (pid, item) => post(`/api/projects/${pid}/explore/import`, item)

// --- Editor de vídeo (timeline) ---
export const getTimeline = (pid) => get(`/api/projects/${pid}/timeline`)
export const saveTimeline = (pid, timeline) => put(`/api/projects/${pid}/timeline`, timeline)
export const exportTimeline = (pid, timeline) => post(`/api/projects/${pid}/export`, { timeline })

// --- Azure AI (Speech STT + Vision) ---
// Las credenciales viven SOLO en el backend; aquí solo se pide el resultado.
export const getAiStatus = () => get('/api/ai/status')
// Transcribe un audio del proyecto (engine: 'whisper' | 'azure'). Devuelve un Job.
export const transcribeAudio = (params) => post('/api/ai/speech/transcribe', params)
// Vision sobre una imagen del proyecto (por nombre) o un archivo subido.
function visionForm({ projectId, filename, file, language, force } = {}) {
  const body = new FormData()
  if (file) body.append('file', file)
  if (projectId) body.append('project_id', projectId)
  if (filename) body.append('filename', filename)
  if (language) body.append('language', language)
  if (force) body.append('force', 'true')
  return body
}
export const analyzeImage = (opts) =>
  req('/api/ai/vision/analyze', { method: 'POST', body: visionForm(opts) })
export const ocrImage = (opts) =>
  req('/api/ai/vision/ocr', { method: 'POST', body: visionForm(opts) })

// --- Microsoft Foundry (capa de IA generativa) ---
// Credenciales SOLO en el backend. Complementa Speech/Vision, no los reemplaza.
// Asistente contextual libre (devuelve {text, model, usage}).
export const foundryChat = ({ projectId, message, context, language } = {}) =>
  post('/api/ai/foundry/chat', { project_id: projectId, message, context, language })
// Operaciones estructuradas: op ∈ improve_script | generate_hooks | generate_titles |
// generate_description | suggest_resources | visual_prompt | analyze_scene | assistant.
export const foundryGenerate = (body) => post('/api/ai/foundry/generate', body)
// Analizar material con visión de Foundry → Job (resumen en job.result).
// body: { only_missing?, rename_generic?, items?: [{kind:'clips'|'images', id}] }
export const analyzeMaterials = (projectId, body = {}) =>
  post(`/api/projects/${projectId}/ai/analyze-materials`, body)

// --- Chat IA (agente sobre el MCP) ---
export const getAiConfig = () => get('/api/ai/config')
export const getLmStudioModels = (baseUrl) =>
  get(`/api/ai/lmstudio/models${baseUrl ? `?base_url=${encodeURIComponent(baseUrl)}` : ''}`)
export const getConversations = (pid) => get(`/api/ai/conversations?project_id=${encodeURIComponent(pid)}`)
export const getConversation = (pid, cid) => get(`/api/ai/conversations/${pid}/${cid}`)
export const deleteConversation = (pid, cid) => del(`/api/ai/conversations/${pid}/${cid}`)
export const getMcpAudit = (pid, limit = 60) =>
  get(`/api/mcp/audit?limit=${limit}${pid ? `&project_id=${encodeURIComponent(pid)}` : ''}`)

// Streaming SSE genérico: POST + parse de eventos `data: {json}`. Llama onEvent(ev) por evento.
export async function streamSSE(url, body, onEvent, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal,
  })
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}))
    const d = err.detail
    throw new Error((d && (d.message || d)) || `Error ${res.status}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const line = chunk.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try { onEvent(JSON.parse(payload)) } catch { /* evento no-JSON: ignorar */ }
    }
  }
}

// Streaming SSE: llama onEvent(ev) por cada evento del agente.
export async function aiChat({ projectId, message, conversationId, context, signal }, onEvent) {
  await streamSSE('/api/ai/chat',
    { project_id: projectId, message, conversation_id: conversationId, context },
    onEvent, signal)
}

// --- Motion Studio (motion graphics editables) ---
export const listMotion = (pid) => get(`/api/projects/${pid}/motion`)
export const listMotionTemplates = (pid) => get(`/api/projects/${pid}/motion/templates`)
// Plantillas del usuario (§16): una composición validada pasa a la biblioteca.
export const saveUserTemplate = (pid, { compositionId, name, bestFor, tags }) =>
  post(`/api/projects/${pid}/motion/templates/user`,
    { composition_id: compositionId, name, best_for: bestFor || '', tags: tags || [] })
export const deleteUserTemplate = (pid, key) =>
  del(`/api/projects/${pid}/motion/templates/user/${encodeURIComponent(key)}`)
export const createMotion = (pid, body) => post(`/api/projects/${pid}/motion`, body || {})
export const getMotion = (pid, cid) => get(`/api/projects/${pid}/motion/${cid}`)
export const updateMotion = (pid, cid, composition) => put(`/api/projects/${pid}/motion/${cid}`, composition)
export const deleteMotion = (pid, cid) => del(`/api/projects/${pid}/motion/${cid}`)
export const motionPreviewUrl = (pid, cid, version) =>
  `/api/projects/${pid}/motion/${cid}/preview.html${version != null ? `?v=${version}` : ''}`
// Preview en vivo de una PLANTILLA (motor real, sin guardar) para la galería.
export const motionTemplatePreviewUrl = (pid, key, { theme, accent, w, h } = {}) => {
  const q = new URLSearchParams()
  if (theme) q.set('theme', theme)
  if (accent) q.set('accent', accent)
  if (w) q.set('w', String(w))
  if (h) q.set('h', String(h))
  const s = q.toString()
  return `/api/projects/${pid}/motion/templates/${key}/preview.html${s ? `?${s}` : ''}`
}
// Historias con stickman: vocabulario, reparto del proyecto, storyboard IA (SSE),
// compilación a composición y prompts para IAs de imagen/vídeo externas.
export const getStickLibrary = (pid) => get(`/api/projects/${pid}/motion/stick/library`)
export const getStickCast = (pid) => get(`/api/projects/${pid}/motion/stick/cast`)
export const streamStickStoryboard = (pid, body, onEvent, signal) =>
  streamSSE(`/api/projects/${pid}/motion/stick/storyboard`, body, onEvent, signal)
export const compileStick = (pid, body) => post(`/api/projects/${pid}/motion/stick/compile`, body || {})
export const getStickPrompts = (pid, storyboard) => post(`/api/projects/${pid}/motion/stick/prompts`, { storyboard })
export const renderMotion = (pid, cid) => post(`/api/projects/${pid}/motion/${cid}/render`, {})
export const addMotionToTimeline = (pid, cid, body) =>
  post(`/api/projects/${pid}/motion/${cid}/add-to-timeline`, body || {})
// "Generar Motion": contexto compacto de UN tramo + foco del editor (para MCP).
export const getMotionSegmentContext = (pid, { start, end, playhead, clipId } = {}) => {
  const q = new URLSearchParams()
  if (start != null) q.set('start', String(start))
  if (end != null) q.set('end', String(end))
  if (playhead != null) q.set('playhead', String(playhead))
  if (clipId) q.set('clip_id', clipId)
  return get(`/api/projects/${pid}/motion/segment-context?${q}`)
}
export const setMotionFocus = (pid, { start, end, playhead, clipId } = {}) =>
  post(`/api/projects/${pid}/motion/focus`, { start, end, playhead, clip_id: clipId || null })

// "Generar recurso": la IA analiza el tramo y propone recursos VISUALES eligiendo
// plantillas de la biblioteca. SSE: start / seed / suggestions / done.
export const suggestResources = (pid, { start, end, playhead, clipId, hint } = {}, onEvent, signal) =>
  streamSSE(`/api/projects/${pid}/motion/resource/suggest`,
    { start, end, playhead, clip_id: clipId || null, hint: hint || '' }, onEvent, signal)
// Instancia una plantilla como borrador del tramo (sin IA, inmediato).
export const buildResource = (pid, { start, end, template, params }) =>
  post(`/api/projects/${pid}/motion/resource/build`, { start, end, template, params: params || {} })
// Sin plantilla que encaje: la IA compone el borrador desde cero.
// SSE: start / text / tool_* / created / error / done.
export const createMotionFromProposal = (pid, { start, end, playhead, clipId, proposal, variantOf },
  onEvent, signal) =>
  streamSSE(`/api/projects/${pid}/motion/generate/create`,
    { start, end, playhead, clip_id: clipId || null, proposal, variant_of: variantOf || null },
    onEvent, signal)

// Nota de contexto de un material de la timeline: qué representa el fragmento en
// la historia. SSE: note (por clip) / error / done. No guarda: eso lo hace el
// guardado normal de la timeline.
export const suggestClipNotes = (pid, clipIds, onEvent, signal) =>
  streamSSE(`/api/projects/${pid}/clip-notes/suggest`,
    { clip_ids: Array.isArray(clipIds) ? clipIds : [clipIds] }, onEvent, signal)

// "Generar Escena" (docs/GENERAR_ESCENA.md). `range` = { start, end, playhead, clipId }.
// Con `directionId` el backend usa el tramo de la escaleta y su paquete de contexto.
const sceneBody = ({ start, end, playhead, clipId, directionId } = {}, extra = {}) =>
  ({ start, end, playhead, clip_id: clipId || null, direction_id: directionId || null, ...extra })

// "Dirección de escena": escaleta de tramos del guion (app/scene_direction.py).
export const getSceneDirection = (pid) => get(`/api/projects/${pid}/scene-direction`)
export const saveSceneDirection = (pid, doc) => put(`/api/projects/${pid}/scene-direction`, doc)
export const autoSplitSceneDirection = (pid, segments) =>
  post(`/api/projects/${pid}/scene-direction/auto-split`, { segments })
export const getDirectionPack = (pid, { segment, segments, pace }) =>
  post(`/api/projects/${pid}/scene-direction/pack`, { segment, segments, pace })
export const patchDirectionSegment = (pid, sid, patch) =>
  req(`/api/projects/${pid}/scene-direction/${encodeURIComponent(sid)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  })
export const placeDirectionMaterial = (pid, sid, material) =>
  post(`/api/projects/${pid}/scene-direction/${encodeURIComponent(sid)}/place-material`, { material: material || null })
export const reuseDirectionScene = (pid, sid) =>
  post(`/api/projects/${pid}/scene-direction/${encodeURIComponent(sid)}/reuse-scene`, {})
export const getSceneDirections = (pid) => get(`/api/projects/${pid}/motion/scene/directions`)
export const listScenePresets = (pid) => get(`/api/projects/${pid}/motion/scene/presets`)
export const saveScenePreset = (pid, { id, name, brief }) =>
  post(`/api/projects/${pid}/motion/scene/presets`, { id: id || null, name, brief })
export const deleteScenePreset = (pid, id) => del(`/api/projects/${pid}/motion/scene/presets/${encodeURIComponent(id)}`)
// SSE: questions / error / done.
export const askSceneQuestions = (pid, range, brief, onEvent, signal) =>
  streamSSE(`/api/projects/${pid}/motion/scene/questions`, sceneBody(range, { brief }), onEvent, signal)
// SSE: plan / error / done.
export const planScene = (pid, range, { brief, answers }, onEvent, signal) =>
  streamSSE(`/api/projects/${pid}/motion/scene/plan`, sceneBody(range, { brief, answers }), onEvent, signal)
// SSE: beat_start / beat_done / status / created / error / done. Guarda un borrador.
export const buildScene = (pid, range, { brief, answers, plan, variantOf, onlyBeats }, onEvent, signal) =>
  streamSSE(`/api/projects/${pid}/motion/scene/build`, sceneBody(range, {
    brief, answers, plan, variant_of: variantOf || null, only_beats: onlyBeats || null,
  }), onEvent, signal)

// --- Sound Effects ---
export const listSfx = (q = '', category = '') =>
  get(`/api/sfx?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`)
export const setSfxFolder = (path) => post('/api/sfx/folder', { path })
export const uploadSfx = (file, { name = '', categoryId = '', newCategory = '', uso = '' } = {}) => {
  const body = new FormData()
  body.append('file', file)
  body.append('name', name)
  body.append('category_id', categoryId)
  body.append('new_category', newCategory)
  body.append('uso', uso)
  return req('/api/sfx', { method: 'POST', body })
}
export const updateSfx = (id, { name = '', categoryId = '', newCategory = '', uso = '' } = {}) =>
  patch('/api/sfx', { id, name, category_id: categoryId, new_category: newCategory, uso })
export const createSfxCategory = (label) => post('/api/sfx/category', { label })

// --- Letras recortadas (assets/alfnum) para el texto de Paper Animator ---
export const listLetters = () => get('/api/letters')
export const letterUrl = (file) => `/api/letters/file/${encodeURIComponent(file)}`

// --- Subtítulos ---
export const generateSubtitles = (pid, params) => post(`/api/projects/${pid}/subtitles`, params)

// --- Eliminar fondo ---
// El chroma key NO pasa por la API: es un filtro puro que resuelven el preview y
// el export desde las propiedades del clip. Esto es solo para el matte de IA.
export const listBgProviders = () => get('/api/bg/providers')
export const createBgRemovalJob = (pid, params) => post(`/api/projects/${pid}/bg-removal`, params)
export const createBgAnalyzeJob = (pid, params) => post(`/api/projects/${pid}/bg-analyze`, params)
// Hornea el clip con el fondo eliminado a un WebM transparente (conserva la
// animación) y lo añade al material como vídeo. Devuelve un Job con progreso.
export const createBgCutoutJob = (pid, params) => post(`/api/projects/${pid}/bg-cutout`, params)
// "Lápiz mágico": máscara interactiva de UN fotograma (SAM). Devuelve la máscara
// como Image ya decodificada (alfa = máscara) para pintar el overlay de selección.
export async function segmentBg(pid, body) {
  const res = await fetch(`/api/projects/${pid}/bg-segment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `Error ${res.status}`
    try { msg = (await res.json())?.detail || msg } catch { /* respuesta no JSON */ }
    throw new Error(msg)
  }
  const url = URL.createObjectURL(await res.blob())
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('No se pudo decodificar la máscara.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
export const getBgStatus = (baseKey) => get(`/api/bg/status/${encodeURIComponent(baseKey)}`)
export const getBgCacheStats = () => get('/api/bg/cache')
export const clearBgCache = (baseKey) =>
  del(`/api/bg/cache${baseKey ? `?base_key=${encodeURIComponent(baseKey)}` : ''}`)
export const cancelJob = (jobId) => del(`/api/job/${jobId}`)
