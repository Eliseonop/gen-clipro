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
export const composeClipJob = (params) => post('/api/clip/compose', params)
export const createTranscribeJob = (params) => post('/api/transcribe', params)
export const prepareReframe = (params) => post('/api/reframe/prepare', params)
export const getJob = (jobId) => get(`/api/job/${jobId}`)

// --- Proyectos ---
export const listProjects = () => get('/api/projects')
export const createProject = (name) => post('/api/projects', { name })
export const getProject = (id) => get(`/api/projects/${id}`)
export const deleteProject = (id) => del(`/api/projects/${id}`)
export const pickFolder = () => post('/api/pick-folder', {})
export const setProjectFolder = (id, path) => post(`/api/projects/${id}/folder`, { path })

// --- Audio (TTS) + ajustes ---
export const listVoices = () => get('/api/voices')
export const createTtsJob = (params) => post('/api/tts', params)
export const createYoutubeAudioJob = (params) => post('/api/youtube-audio', params)
export const listLibrary = () => get('/api/library')
export const saveLibraryItem = (params) => post('/api/library/save', params)
export const unsaveLibraryItem = (id) => del(`/api/library/${id}`)
export const getSettings = () => get('/api/settings')
export const putSettings = (data) => put('/api/settings', data)

// --- Materiales (etiquetar / eliminar / manifest) ---
export const uploadImages = (pid, files) => {
  const body = new FormData()
  for (const f of files) body.append('files', f)
  return req(`/api/projects/${pid}/images`, { method: 'POST', body })
}
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
export const deleteMaterial = (pid, kind, id) => del(`/api/projects/${pid}/materials/${kind}/${id}`)
export const autoDescribeClip = (pid, index) => post(`/api/projects/${pid}/materials/clips/${index}/auto-describe`, {})
export const getManifest = (pid) => get(`/api/projects/${pid}/manifest`)
export const putManifest = (pid, data) => put(`/api/projects/${pid}/manifest`, data)
export const transcribeClip = (pid, index, model) =>
  post(`/api/projects/${pid}/clips/${index}/transcribe`, model ? { model } : {})

// --- Editor de vídeo (timeline) ---
export const getTimeline = (pid) => get(`/api/projects/${pid}/timeline`)
export const saveTimeline = (pid, timeline) => put(`/api/projects/${pid}/timeline`, timeline)
export const exportTimeline = (pid, timeline) => post(`/api/projects/${pid}/export`, { timeline })

// --- Chat IA (agente sobre el MCP) ---
export const getAiConfig = () => get('/api/ai/config')

// Streaming SSE: llama onEvent(ev) por cada evento del agente.
export async function aiChat({ projectId, message, conversationId, context, signal }, onEvent) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, message, conversation_id: conversationId, context }),
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

// --- Subtítulos ---
export const generateSubtitles = (pid, params) => post(`/api/projects/${pid}/subtitles`, params)
