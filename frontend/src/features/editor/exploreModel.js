export const CLASSIC_SUGGESTIONS = [
  'ciencia',
  'películas',
  'cine',
  'épico',
  'futuro',
  'motion',
]

/** @deprecated usar CLASSIC_SUGGESTIONS o themeSuggestions() */
export const EXPLORE_SUGGESTIONS = CLASSIC_SUGGESTIONS

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'u',
  'que', 'qué', 'cual', 'cuál', 'cuales', 'cuáles', 'como', 'cómo', 'cuando', 'cuándo',
  'donde', 'dónde', 'porque', 'porqué', 'por', 'para', 'con', 'sin', 'sobre', 'entre',
  'hasta', 'desde', 'hacia', 'segun', 'según', 'durante', 'mediante', 'contra',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella',
  'aqui', 'aquí', 'alli', 'allí', 'ahi', 'ahí', 'muy', 'mas', 'más', 'pero', 'si', 'sí',
  'no', 'ni', 'ya', 'tan', 'tambien', 'también', 'entonces', 'pues', 'bueno', 'vale',
  'ok', 'okay', 'hola', 'gracias', 'favor', 'porfavor', 'please', 'just', 'really',
  'esto', 'eso', 'aquello', 'algo', 'nada', 'todo', 'todos', 'todas',
  'me', 'te', 'se', 'nos', 'os', 'le', 'les', 'lo', 'mi', 'mis', 'tu', 'tú', 'tus',
  'su', 'sus', 'yo', 'él', 'ella', 'ellos', 'ellas', 'usted', 'ustedes',
  'ser', 'soy', 'es', 'son', 'era', 'fue', 'estar', 'está', 'estan', 'están', 'estoy',
  'haber', 'hay', 'ha', 'han', 'he', 'hacer', 'hace', 'hacen', 'tener', 'tiene', 'tienen',
  'poder', 'puede', 'pueden', 'puedo', 'decir', 'dice', 'ir', 'va', 'van', 'voy',
  'ver', 've', 'ves', 'veo', 'veas', 'vea', 'vemos', 'dar', 'da', 'saber', 'sé', 'quiere', 'quiero', 'quieren',
  'querer', 'voy', 'vamos', 'hay', 'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to',
  'in', 'on', 'for', 'with', 'at', 'from', 'by', 'is', 'are', 'was', 'were', 'be',
  'been', 'this', 'that', 'it', 'as', 'if', 'not', 'so', 'can', 'will', 'would',
  'could', 'should', 'you', 'we', 'they', 'he', 'she', 'i', 'my', 'your', 'our',
])

function themeTokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFC')
    .match(/[a-záéíóúüñ0-9]+/g) || []
}

export function collectThemeText({ project, timelineClips } = {}) {
  const parts = []
  const push = (v) => {
    const s = String(v || '').trim()
    if (s) parts.push(s)
  }
  for (const a of project?.audios || []) {
    push(a.description)
    push(a.text)
  }
  for (const c of project?.clips || []) {
    push(c.description)
    for (const s of c.transcript?.segments || []) push(s.text)
  }
  for (const t of project?.transcripts || []) {
    for (const s of t.segments || []) push(s.text)
  }
  for (const c of timelineClips || []) {
    if (c.kind === 'audio' || c.kind === 'text') {
      push(c.description)
      push(c.text)
    }
  }
  return parts.join('\n')
}

export function extractKeywords(text, { max = 8 } = {}) {
  const words = themeTokens(text).filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  if (!words.length) return []
  const freq = new Map()
  const bump = (k, n) => freq.set(k, (freq.get(k) || 0) + n)
  for (const w of words) bump(w, 1)
  for (let i = 0; i < words.length - 1; i++) bump(`${words[i]} ${words[i + 1]}`, 2.2)
  for (let i = 0; i < words.length - 2; i++) bump(`${words[i]} ${words[i + 1]} ${words[i + 2]}`, 2.6)
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([k]) => k)
    .filter((k, i, arr) => !arr.slice(0, i).some((p) => p !== k && (p.includes(k) || k.includes(p) && p.split(' ').length > k.split(' ').length)))
    .slice(0, max)
}

export function themeSuggestions(text) {
  const found = extractKeywords(text)
  return found.length ? found : CLASSIC_SUGGESTIONS
}

export const RECENT_KEY = 'vy:explore-recent'
export const RECENT_MAX = 20

export const MEDIA_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'photo', label: 'Fotos' },
  { id: 'video', label: 'Videos' },
  { id: 'gif', label: 'GIFs' },
]

export const PROVIDER_FILTERS = [
  { id: 'all', label: 'Todos los proveedores' },
  { id: 'pexels', label: 'Pexels' },
  { id: 'giphy', label: 'GIPHY' },
]

export function kindLabel(kind) {
  if (kind === 'video') return 'Video'
  if (kind === 'gif') return 'GIF'
  return 'Foto'
}

export function providerLabel(provider) {
  if (provider === 'giphy') return 'GIPHY'
  if (provider === 'pexels') return 'Pexels'
  return provider || ''
}

export function formatExploreMeta(item) {
  const bits = []
  if (item?.width && item?.height) bits.push(`${item.width} × ${item.height}`)
  if (item?.kind === 'video' && Number(item.duration) > 0) bits.push(`${Math.round(Number(item.duration))}s`)
  return bits.join(' · ')
}

export function filterExploreItems(items, media = 'all', provider = 'all') {
  return (items || []).filter((it) => {
    if (media && media !== 'all' && it.kind !== media) return false
    if (provider && provider !== 'all' && it.provider !== provider) return false
    return true
  })
}

export function readRecent(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(RECENT_KEY)
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr.map((x) => String(x || '').trim()).filter(Boolean).slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

export function pushRecent(query, storage = globalThis.localStorage) {
  const q = String(query || '').trim()
  if (!q) return readRecent(storage)
  const next = [q, ...readRecent(storage).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX)
  try { storage?.setItem?.(RECENT_KEY, JSON.stringify(next)) } catch { /* quota */ }
  return next
}

const EMPTY_EXPLORE_SESSION = {
  draft: '',
  q: '',
  media: 'all',
  provider: 'all',
  items: [],
  page: 1,
  hasMore: false,
  warning: null,
  searched: false,
  configured: { pexels: false, giphy: false },
}

function cloneExploreSession(s) {
  return {
    ...EMPTY_EXPLORE_SESSION,
    ...s,
    items: Array.isArray(s?.items) ? [...s.items] : [],
    configured: { pexels: false, giphy: false, ...(s?.configured || {}) },
  }
}

let exploreSession = cloneExploreSession(EMPTY_EXPLORE_SESSION)

export function readExploreSession() {
  return cloneExploreSession(exploreSession)
}

export function writeExploreSession(patch) {
  exploreSession = cloneExploreSession({ ...exploreSession, ...patch })
  return readExploreSession()
}

export function resetExploreSession() {
  exploreSession = cloneExploreSession(EMPTY_EXPLORE_SESSION)
  return readExploreSession()
}
