import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { uploadImages, updateMaterial } from '../../services/api'
import { isImageFile } from './imagePaste'

export default function ImageAddModal({ projectId, tick, pendingRef, onClose, onSaved }) {
  const [rows, setRows] = useState([])
  const [hover, setHover] = useState(false)
  const [err, setErr] = useState('')
  const [busyAll, setBusyAll] = useState(false)
  const fileRef = useRef(null)
  const keyRef = useRef(1)
  const rowsRef = useRef(rows)
  const urlsRef = useRef([])
  rowsRef.current = rows

  useEffect(() => () => {
    urlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u) } catch { /* noop */ } })
  }, [])

  function patch(key, extra) {
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...extra } : r))
      rowsRef.current = next
      return next
    })
  }

  function takeFiles(list) {
    const images = [...(list || [])].filter(isImageFile)
    if (!images.length) {
      setErr('Suelta o pega un PNG, JPG, WebP o una captura.')
      return
    }
    setErr('')
    setRows((prev) => {
      const seen = new Set(prev.filter((r) => r.file).map((r) => `${r.file.name}:${r.file.size}`))
      const added = images.filter((file) => !seen.has(`${file.name}:${file.size}`)).map((file) => {
        const previewUrl = URL.createObjectURL(file)
        urlsRef.current.push(previewUrl)
        return {
          key: keyRef.current++,
          file,
          previewUrl,
          description: '',
          saving: false,
          saved: false,
          error: '',
        }
      })
      const next = [...prev, ...added]
      rowsRef.current = next
      return next
    })
  }

  useEffect(() => {
    const files = pendingRef?.current || []
    if (pendingRef) pendingRef.current = []
    if (files.length) takeFiles(files)
  }, [tick])

  function removeRow(key) {
    setRows((prev) => {
      const row = prev.find((r) => r.key === key)
      if (row?.previewUrl) {
        try { URL.revokeObjectURL(row.previewUrl) } catch { /* noop */ }
        urlsRef.current = urlsRef.current.filter((u) => u !== row.previewUrl)
      }
      const next = prev.filter((r) => r.key !== key)
      rowsRef.current = next
      return next
    })
  }

  async function saveRowByKey(key) {
    const row = rowsRef.current.find((r) => r.key === key)
    if (!row || row.saved || row.saving) return true
    if (!row.file) {
      patch(key, { error: 'Sin archivo.' })
      return false
    }
    patch(key, { saving: true, error: '' })
    try {
      const res = await uploadImages(projectId, [row.file])
      const info = res.images?.[0]
      if (!info) throw new Error(res.errors?.[0]?.error || 'No se pudo guardar.')
      const description = (row.description || '').trim()
      if (description) {
        await updateMaterial(projectId, 'images', info.id, { description })
      }
      patch(key, { saved: true, saving: false, error: '' })
      await onSaved?.()
      return true
    } catch (e) {
      patch(key, { saving: false, error: e.message })
      return false
    }
  }

  async function saveAll() {
    const keys = rowsRef.current.filter((r) => !r.saved).map((r) => r.key)
    if (!keys.length) return
    setBusyAll(true)
    setErr('')
    let ok = true
    for (const key of keys) {
      const okOne = await saveRowByKey(key)
      if (!okOne) ok = false
    }
    setBusyAll(false)
    if (ok) onClose?.()
  }

  const pending = rows.filter((r) => !r.saved).length

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ed-sfx-add-modal${rows.length ? ' wide' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><Icon name="image" size={18} /> Nueva imagen</h3>
          <button className="icon-btn" onClick={onClose} title="Cerrar"><Icon name="close" size={18} /></button>
        </div>

        <button
          type="button"
          className={`ed-sfx-drop${hover ? ' on' : ''}${rows.length ? ' slim' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); setHover(true) }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setHover(false)
            takeFiles(e.dataTransfer.files)
          }}
        >
          <Icon name="unarchive" size={rows.length ? 18 : 26} />
          <span className="ed-sfx-drop-name">{rows.length ? 'Suelta o pega más imágenes' : 'Suelta o pega la imagen aquí'}</span>
          {!rows.length && <span className="ed-sfx-drop-hint">Archivo, copiar de internet o captura de Windows · PNG, JPG, WebP, GIF</span>}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.heic"
          onChange={(e) => {
            takeFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {rows.length > 0 && (
          <div className="ed-sfx-table-wrap">
            <table className="ed-sfx-table">
              <thead>
                <tr>
                  <th className="play">Vista</th>
                  <th>Descripción</th>
                  <th className="act">Quitar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={row.saved ? 'saved' : ''}>
                    <td className="play">
                      {row.previewUrl
                        ? <img className="ed-img-draft-thumb" src={row.previewUrl} alt="" />
                        : null}
                    </td>
                    <td>
                      <input
                        value={row.description}
                        disabled={busyAll || row.saved || row.saving}
                        placeholder="De qué trata"
                        onChange={(e) => patch(row.key, { description: e.target.value })}
                      />
                    </td>
                    <td className="act">
                      {row.saved ? (
                        <span className="ed-sfx-saved" title="Guardado"><Icon name="check" size={16} /></span>
                      ) : (
                        <button
                          type="button"
                          className="ghost small danger"
                          disabled={busyAll || row.saving}
                          title="Quitar de la lista"
                          onClick={() => removeRow(row.key)}
                        >
                          <Icon name="delete" size={16} />
                        </button>
                      )}
                      {row.error && <span className="ed-sfx-row-err" title={row.error}>{row.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {err && <p className="ed-sfx-add-err">{err}</p>}
        <div className="modal-actions ed-sfx-add-actions">
          <button className="ghost" type="button" onClick={onClose} disabled={busyAll}>Cancelar</button>
          <button className="primary" type="button" onClick={saveAll} disabled={busyAll || !pending}>
            {busyAll ? 'Guardando…' : pending > 1 ? `Guardar todos (${pending})` : 'Guardar todos'}
          </button>
        </div>
      </div>
    </div>
  )
}
