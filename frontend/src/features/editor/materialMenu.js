export function canDeleteMaterial(item) {
  return Boolean(item) && item.scope !== 'library'
}

export function materialIdent(kind, item) {
  if (kind === 'clips') return String(item.index ?? item.id)
  return String(item.id)
}

export function materialMenuItems({ saved, canDelete }) {
  const items = [
    { id: 'save', label: saved ? 'Quitar de guardados' : 'Guardar' },
  ]
  if (canDelete) items.push({ id: 'delete', label: 'Eliminar', danger: true })
  return items
}

export function materialDeleteTitle(kind) {
  if (kind === 'clips') return '¿Eliminar clip?'
  if (kind === 'images') return '¿Eliminar imagen?'
  return '¿Eliminar audio?'
}

export function materialLabel(item) {
  return item?.label || item?.name || item?.filename || 'este material'
}
