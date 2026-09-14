import { useCallback, useEffect, useRef, useState } from 'react'
import {
  autoSplitSceneDirection, getDirectionPack, getSceneDirection, placeDirectionMaterial,
  reuseDirectionScene, saveSceneDirection,
} from '../../services/api'
import { makeSegment, patchSegment, removeSegment, retimeSegment, segmentAt, sortSegments } from './directionModel'

const SAVE_DELAY = 700
const PACK_DELAY = 350

// Escaleta de Dirección de escena: carga, edición con autoguardado y paquete del tramo.
export function useSceneDirection(projectId, { focus } = {}) {
  const [info, setInfo] = useState(null)        // { units, script_source, modes, materials, duration }
  const [segments, setSegments] = useState([])
  const [selId, setSelId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pack, setPack] = useState(null)        // { text, tokens, pack, skeleton, brief_defaults }
  const dirty = useRef(false)
  const segRef = useRef(segments)
  segRef.current = segments
  const focusDone = useRef(false)

  const load = useCallback(async ({ keepSelection = true } = {}) => {
    if (!projectId) return
    setError('')
    try {
      const data = await getSceneDirection(projectId)
      setInfo({ units: data.units || [], script_source: data.script_source, modes: data.modes || [],
        materials: data.materials || [], duration: data.duration || 0 })
      const segs = sortSegments(data.segments || [])
      dirty.current = false
      setSegments(segs)
      setSelId((cur) => (keepSelection && segs.some((s) => s.id === cur) ? cur : segs[0]?.id || null))
      return { data, segs }
    } catch (e) {
      setError(e.message || 'No se pudo cargar la dirección de escena.')
      return null
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Carga inicial + foco: el tramo que contiene el rango pedido, o uno nuevo con ese rango.
  useEffect(() => {
    let alive = true
    load({ keepSelection: false }).then((res) => {
      if (!alive || !res || focusDone.current || !focus) return
      focusDone.current = true
      const hit = segmentAt(res.segs, (focus.start + focus.end) / 2)
      const exact = hit && Math.abs(hit.start - focus.start) < 0.05 && Math.abs(hit.end - focus.end) < 0.05
      if (hit && (exact || !focus.explicit)) { setSelId(hit.id); return }
      if (!focus.explicit) return   // cursor fuera de todo tramo: no inventar uno de 0 s
      const seg = makeSegment(focus, res.data.units || [], res.data.script_source)
      dirty.current = true
      setSegments(sortSegments([...res.segs, seg]))
      setSelId(seg.id)
    })
    return () => { alive = false }
  }, [load, focus])

  // Autoguardado con debounce (solo cambios del usuario).
  useEffect(() => {
    if (!dirty.current || !projectId) return
    const t = setTimeout(async () => {
      setSaving(true)
      try {
        await saveSceneDirection(projectId, { segments: segRef.current })
        dirty.current = false
      } catch (e) {
        setError(e.message || 'No se pudo guardar.')
      } finally {
        setSaving(false)
      }
    }, SAVE_DELAY)
    return () => clearTimeout(t)
  }, [segments, projectId])

  const edit = useCallback((fn) => { dirty.current = true; setSegments((s) => fn(s)) }, [])
  const selected = segments.find((s) => s.id === selId) || null
  const units = info?.units || []

  const api = {
    patch: (id, p) => edit((s) => patchSegment(s, id, p)),
    retime: (id, range) => edit((s) => retimeSegment(s, id, range, units)),
    remove: (id) => {
      edit((s) => removeSegment(s, id))
      setSelId((cur) => (cur === id ? null : cur))
    },
    add: (range) => {
      const seg = makeSegment(range, units, info?.script_source)
      edit((s) => sortSegments([...s, seg]))
      setSelId(seg.id)
      return seg
    },
  }

  const autoSplit = useCallback(async () => {
    setError('')
    try {
      const { segments: segs } = await autoSplitSceneDirection(projectId, segRef.current)
      edit(() => sortSegments(segs))
      setSelId((cur) => (segs.some((s) => s.id === cur) ? cur : segs[0]?.id || null))
    } catch (e) {
      setError(e.message || 'No se pudo dividir el guion.')
    }
  }, [projectId, edit])

  // Paquete de contexto del tramo seleccionado (lo que verá la IA), con debounce.
  useEffect(() => {
    if (!projectId || !selected) { setPack(null); return }
    let alive = true
    const t = setTimeout(() => {
      getDirectionPack(projectId, { segment: selected, segments: segRef.current })
        .then((p) => { if (alive) setPack(p) })
        .catch(() => { if (alive) setPack(null) })
    }, PACK_DELAY)
    return () => { alive = false; clearTimeout(t) }
  }, [projectId, selected])

  const flush = useCallback(async () => {
    if (!dirty.current) return
    await saveSceneDirection(projectId, { segments: segRef.current })
    dirty.current = false
  }, [projectId])

  const place = useCallback(async (sid, material) => {
    await flush()
    const out = await placeDirectionMaterial(projectId, sid, material)
    await load()
    return out
  }, [projectId, flush, load])

  const reuse = useCallback(async (sid) => {
    await flush()
    const out = await reuseDirectionScene(projectId, sid)
    await load()
    return out
  }, [projectId, flush, load])

  return {
    info, segments, selected, selId, setSelId, loading, saving, error, setError, pack,
    ...api, autoSplit, reload: load, flush, place, reuse,
  }
}
