const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)$/i

export function isImageFile(file) {
  if (!file) return false
  if ((file.type || '').startsWith('image/')) return true
  return IMAGE_FILE_RE.test(file.name || '')
}

export function extFromMime(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  if (t.includes('webp')) return 'webp'
  if (t.includes('gif')) return 'gif'
  if (t.includes('bmp')) return 'bmp'
  return 'png'
}

export function isHttpUrl(s) {
  try {
    const u = new URL(String(s || '').trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function filenameFromUrl(url) {
  try {
    const u = new URL(url)
    const base = decodeURIComponent(u.pathname.split('/').pop() || '')
    const clean = base.split('?')[0]
    if (clean && IMAGE_FILE_RE.test(clean)) return clean
  } catch { /* noop */ }
  return 'imagen.png'
}

export function imageSrcsFromHtml(html) {
  if (!html) return []
  const out = []
  const re = /<img[^>]+src=["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html))) out.push(m[1].trim())
  return out
}

export function imageUrlsFromText(text) {
  const s = String(text || '').trim()
  const m = s.match(/https?:\/\/\S+/i)
  const url = m ? m[0].replace(/[),.;]+$/, '') : ''
  if (!isHttpUrl(url)) return []
  if (IMAGE_FILE_RE.test(url.split('?')[0])) return [url]
  return []
}

export function dataUrlToFile(dataUrl, name = 'imagen.png') {
  const m = String(dataUrl || '').match(/^data:(image\/[\w+.-]+);base64,(.+)$/i)
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ext = extFromMime(m[1])
  const filename = IMAGE_FILE_RE.test(name) ? name : `imagen.${ext}`
  return new File([bytes], filename, { type: m[1] })
}

function fileKey(file) {
  return `${file.name}:${file.size}:${file.type}`
}

function dedupeFiles(files) {
  const seen = new Set()
  const out = []
  for (const f of files) {
    if (!f || !isImageFile(f)) continue
    const k = fileKey(f)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
  }
  return out
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))]
}

export function collectPastePayload(clipboardData) {
  const files = []
  const urls = []
  if (!clipboardData) return { files, urls }

  const listed = clipboardData.files
  if (listed && listed.length) {
    for (const f of listed) files.push(f)
  }

  const items = clipboardData.items
  if (items && items.length) {
    for (const it of items) {
      if (it.kind === 'file' && String(it.type || '').startsWith('image/')) {
        const f = it.getAsFile?.()
        if (f) files.push(f)
      }
    }
  }

  const html = clipboardData.getData?.('text/html') || ''
  const plain = (clipboardData.getData?.('text/plain') || clipboardData.getData?.('text/uri-list') || '').trim()
  for (const src of imageSrcsFromHtml(html)) {
    if (src.startsWith('data:image/')) {
      const f = dataUrlToFile(src)
      if (f) files.push(f)
    } else if (isHttpUrl(src)) {
      urls.push(src)
    }
  }
  urls.push(...imageUrlsFromText(plain))

  const uniqueFiles = dedupeFiles(files)
  if (uniqueFiles.length) return { files: uniqueFiles, urls: [] }
  return { files: [], urls: unique(urls) }
}

export function hasImagePaste(payload) {
  return Boolean(payload && (payload.files?.length || payload.urls?.length))
}

export async function collectFromClipboardItems(items) {
  const files = []
  const urls = []
  for (const item of items || []) {
    const types = item.types || []
    const imgType = types.find((t) => String(t).startsWith('image/'))
    if (imgType) {
      const blob = await item.getType(imgType)
      const name = (blob && blob.name) || `captura.${extFromMime(imgType)}`
      files.push(new File([blob], name, { type: imgType || blob.type || 'image/png' }))
    }
    if (types.includes('text/html')) {
      const html = await (await item.getType('text/html')).text()
      for (const src of imageSrcsFromHtml(html)) {
        if (src.startsWith('data:image/')) {
          const f = dataUrlToFile(src)
          if (f) files.push(f)
        } else if (isHttpUrl(src)) urls.push(src)
      }
    }
    if (types.includes('text/plain')) {
      const text = await (await item.getType('text/plain')).text()
      urls.push(...imageUrlsFromText(text))
    }
    if (types.includes('text/uri-list')) {
      const text = await (await item.getType('text/uri-list')).text()
      urls.push(...imageUrlsFromText(text))
    }
  }
  const uniqueFiles = dedupeFiles(files)
  if (uniqueFiles.length) return { files: uniqueFiles, urls: [] }
  return { files: [], urls: unique(urls) }
}

export async function resolvePasteImages(payload, fetchRemote) {
  const files = [...(payload?.files || [])]
  for (const url of payload?.urls || []) {
    if (!fetchRemote) throw new Error('No se pudo descargar la imagen.')
    files.push(await fetchRemote(url))
  }
  return dedupeFiles(files)
}
