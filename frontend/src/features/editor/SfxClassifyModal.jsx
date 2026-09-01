import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { matchSfxCategory, realSfxCategories, sfxDraftFromFile, sfxDraftFromSaved, sfxSavePayload, upsertSfxCategory } from '../../lib/sfxName'
import { createSfxCategory, listSfx, updateSfx, uploadSfx } from '../../services/api'
import { useExclusiveMedia, useToggle } from './MaterialClipGrid'

const AUDIO_FILE_RE = /\.(mp3|wav|ogg|m4a|aac|flac)$/i

function isAudioFile(file) {
  if (!file) return false
  if ((file.type || '').startsWith('audio/')) return true
  return AUDIO_FILE_RE.test(file.name || '')
}

function defaultMeta(categories, defaultCategory) {
  const cats = realSfxCategories(categories)
  const cat = cats.find((c) => c.id === defaultCategory)
    || cats.find((c) => c.id === '13_OTHER')
    || cats[0]
  return { categoryId: cat?.id || '', categoryLabel: cat?.label || cat?.id || '', uso: '' }
}

export default function SfxClassifyModal({ categories, defaultCategory, editSfx, onClose, onChanged }) {
  const [catList, setCatList] = useState(() => realSfxCategories(categories))
  const defaults = defaultMeta(catList, defaultCategory)
  const [rows, setRows] = useState(() => (
    editSfx ? [{ key: 1, ...sfxDraftFromSaved(editSfx), saving: false, error: '' }] : []
  ))
  const [hover, setHover] = useState(false)
  const [err, setErr] = useState('')
  const [busyAll, setBusyAll] = useState(false)
  const fileRef = useRef(null)
  const keyRef = useRef(2)
  const rowsRef = useRef(rows)
  const catListRef = useRef(catList)
  const urlsRef = useRef([])
  const onPlay = useExclusiveMedia()
  const editing = !!editSfx
  rowsRef.current = rows
  catListRef.current = catList

  useEffect(() => () => {
    urlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u) } catch { /* noop */ } })
  }, [])

  useEffect(() => {
    setCatList((prev) => {
      let next = prev
      for (const c of realSfxCategories(categories)) next = upsertSfxCategory(next, c)
      return next
    })
  }, [categories])

  useEffect(() => {
    let alive = true
    listSfx('', '').then((data) => {
      if (!alive) return
      setCatList((prev) => {
        let next = prev
        for (const c of realSfxCategories(data.categories)) next = upsertSfxCategory(next, c)
        return next
      })
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const fallback = defaultMeta(catList, defaultCategory).categoryId
    if (!fallback) return
    setRows((prev) => {
      let changed = false
      const next = prev.map((r) => {
        if (r.saved || r.categoryId) return r
        changed = true
        return { ...r, categoryId: fallback }
      })
      if (!changed) return prev
      rowsRef.current = next
      return next
    })
  }, [catList, defaultCategory])

  function rememberCat(cat) {
    setCatList((prev) => upsertSfxCategory(prev, cat))
    onChanged?.()
  }

  function patch(key, extra) {
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...extra } : r))
      rowsRef.current = next
      return next
    })
  }

  function takeFiles(list) {
    const audio = [...(list || [])].filter(isAudioFile)
    if (!audio.length) {
      setErr('Suelta un MP3, WAV u OGG.')
      return
    }
    setErr('')
    setRows((prev) => {
      const seen = new Set(prev.filter((r) => r.file).map((r) => `${r.file.name}:${r.file.size}`))
      const added = audio.filter((file) => !seen.has(`${file.name}:${file.size}`)).map((file) => {
        const previewUrl = URL.createObjectURL(file)
        urlsRef.current.push(previewUrl)
        return {
          key: keyRef.current++,
          ...sfxDraftFromFile(file, defaults),
          previewUrl,
          saving: false,
          error: '',
        }
      })
      const next = [...prev, ...added]
      rowsRef.current = next
      return next
    })
  }

  async function saveRowByKey(key) {
    const row = rowsRef.current.find((r) => r.key === key)
    if (!row || row.saved || row.saving) return true
    const payload = sfxSavePayload(row, catListRef.current)
    if (!payload.categoryId && !payload.newCategory) {
      patch(key, { error: 'Pon una categoría.' })
      return false
    }
    patch(key, { saving: true, error: '' })
    try {
      if (row.sfxId) await updateSfx(row.sfxId, payload)
      else {
        if (!row.file) throw new Error('Sin archivo.')
        await uploadSfx(row.file, payload)
      }
      patch(key, { saved: true, saving: false, error: '' })
      await onChanged?.()
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
          <h3><Icon name="graphic_eq" size={18} /> {editing ? 'Editar SFX' : 'Nuevo SFX'}</h3>
          <button className="icon-btn" onClick={onClose} title="Cerrar"><Icon name="close" size={18} /></button>
        </div>

        {!editing && (
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
            <span className="ed-sfx-drop-name">{rows.length ? 'Suelta más audios' : 'Suelta el audio aquí'}</span>
            {!rows.length && <span className="ed-sfx-drop-hint">Uno o varios · MP3, WAV, OGG, M4A</span>}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          onChange={(e) => {
            takeFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {rows.length > 0 && (
          <SfxSoundRows
            rows={rows}
            cats={catList}
            onPlay={onPlay}
            onPatch={patch}
            onSave={(row) => saveRowByKey(row.key)}
            onCreated={rememberCat}
            busy={busyAll}
          />
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

export function SfxSoundRows({ rows, cats, onPlay, onPatch, onSave, onCreated, busy }) {
  return (
    <div className="ed-sfx-table-wrap">
      <table className="ed-sfx-table">
        <thead>
          <tr>
            <th className="play">Play</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Uso típico</th>
            <th className="act">Guardar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SfxDraftRow
              key={row.key}
              row={row}
              cats={cats}
              onPlay={onPlay}
              disabled={busy || row.saved}
              onChange={(extra) => onPatch(row.key, extra)}
              onSave={() => onSave(row)}
              onCreated={onCreated}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SfxDraftRow({ row, cats, onPlay, disabled, onChange, onSave, onCreated }) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  const locked = disabled || row.saved || row.saving
  return (
    <tr className={row.saved ? 'saved' : ''}>
      <td className="play">
        <audio
          ref={ref}
          src={row.previewUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
        <button type="button" className="ed-play-round" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'} disabled={!row.previewUrl}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={16} />
        </button>
      </td>
      <td>
        <input value={row.name} disabled={locked} onChange={(e) => onChange({ name: e.target.value })} />
      </td>
      <td>
        <SfxCategoryCell row={row} cats={cats} locked={locked} onChange={onChange} onCreated={onCreated} />
      </td>
      <td>
        <input
          value={row.uso}
          disabled={locked}
          placeholder="Para qué sirve"
          onChange={(e) => onChange({ uso: e.target.value })}
        />
      </td>
      <td className="act">
        {row.saved ? (
          <span className="ed-sfx-saved" title="Guardado"><Icon name="check" size={16} /></span>
        ) : (
          <button type="button" className="ghost small" disabled={locked} onClick={onSave}>
            {row.saving ? '…' : 'Guardar'}
          </button>
        )}
        {row.error && <span className="ed-sfx-row-err" title={row.error}>{row.error}</span>}
      </td>
    </tr>
  )
}

function SfxCategoryCell({ row, cats, locked, onChange, onCreated }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const known = (cats || []).some((c) => c.id === row.categoryId)

  function cancel() {
    setCreating(false)
    setDraft('')
    setHint('')
  }

  async function confirm() {
    const name = draft.trim()
    if (!name) {
      setHint('Ponle nombre.')
      return
    }
    const hit = matchSfxCategory(name, cats)
    if (hit.categoryId) {
      onChange({ categoryId: hit.categoryId })
      cancel()
      return
    }
    setBusy(true)
    setHint('')
    try {
      const cat = await createSfxCategory(name)
      onCreated?.(cat)
      onChange({ categoryId: cat.id })
      cancel()
    } catch (e) {
      setHint(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (creating) {
    return (
      <div className="ed-sfx-cat-field">
        <input
          value={draft}
          disabled={busy || locked}
          autoFocus
          placeholder="Nueva categoría"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
            if (e.key === 'Escape') cancel()
          }}
        />
        <button type="button" className="ed-sfx-cat-x" title="Cancelar" disabled={busy} onClick={cancel}>
          <Icon name="close" size={15} />
        </button>
        <button type="button" className="ed-sfx-cat-ok" title="Crear categoría" disabled={busy} onClick={confirm}>
          <Icon name="check" size={16} />
        </button>
        {hint && <span className="ed-sfx-row-err">{hint}</span>}
      </div>
    )
  }

  return (
    <div className="ed-sfx-cat-field">
      <select
        className="ed-sfx-cat-select"
        value={row.categoryId || ''}
        disabled={locked}
        onChange={(e) => onChange({ categoryId: e.target.value })}
      >
        {!row.categoryId && <option value="">Elige…</option>}
        {(cats || []).map((c) => (
          <option key={c.id} value={c.id}>{c.label || c.id}</option>
        ))}
        {row.categoryId && !known && (
          <option value={row.categoryId}>{row.categoryLabel || row.categoryId}</option>
        )}
      </select>
      <button type="button" className="ed-sfx-cat-plus" title="Nueva categoría" disabled={locked} onClick={() => { setCreating(true); setDraft(''); setHint('') }}>
        <Icon name="add" size={16} />
      </button>
    </div>
  )
}
