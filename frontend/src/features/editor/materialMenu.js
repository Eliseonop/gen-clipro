export function canDeleteMaterial(item) {
  return Boolean(item) && item.scope !== 'library'
}

export function materialIdent(kind, item) {
  if (kind === 'clips') return String(item.index ?? item.id)
  return String(item.id)
}

export function materialMenuItems({ saved, canDelete, canDownload }) {
  const items = [
    { id: 'save', label: saved ? 'Quitar de guardados' : 'Guardar' },
  ]
  if (canDownload) items.push({ id: 'download', label: 'Descargar' })
  if (canDelete) items.push({ id: 'delete', label: 'Eliminar', danger: true })
  return items
}

export function canDownloadMaterial(item) {
  return Boolean(item?.url)
}

export async function downloadMaterialFile(item) {
  const url = item?.url
  if (!url) throw new Error('Este material no tiene archivo.')
  const name = String(item.filename || item.label || 'material').split(/[\\/]/).pop()
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar el archivo.')
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = href
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(href)
  }
}

export function materialDeleteTitle(kind) {
  if (kind === 'clips') return '¿Eliminar clip?'
  if (kind === 'images') return '¿Eliminar imagen?'
  return '¿Eliminar audio?'
}

export function materialLabel(item) {
  return item?.label || item?.name || item?.filename || 'este material'
}
