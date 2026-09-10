import { useRef, useState } from 'react'
import { aiChat } from '../../services/api'

// Chat IA de Motion Studio: reutiliza el agente SSE (mismas tools MCP). La IA
// genera/edita la COMPOSICIÓN (motion_create/update_composition); al recibir un
// composition_id avisa al padre para cargarla en el preview.
const MOTION_TOOLS = new Set(['motion_create_composition', 'motion_update_composition', 'motion_add_to_timeline'])

export default function MotionAIChat({ projectId, compId, onCompositionChanged, onReloadTimeline }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef(null)

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '', tools: [] }])
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let acc = ''
    try {
      await aiChat(
        {
          projectId,
          message: text,
          context: { project_id: projectId, motion_composition_id: compId || null, surface: 'motion_studio' },
          signal: ctrl.signal,
        },
        (ev) => {
          if (ev.type === 'text') {
            acc += ev.text || ''
            setMessages((m) => patchLast(m, { text: acc }))
          } else if (ev.type === 'tool_start') {
            setMessages((m) => patchLast(m, { tools: [...(lastTools(m)), labelFor(ev.tool)] }))
          } else if (ev.type === 'tool_result') {
            // El resultado de la tool viene como {ok, data:{...}, text}: el id está en data.
            const cid = ev.result?.data?.composition_id || ev.result?.composition_id
            if (ev.ok && MOTION_TOOLS.has(ev.tool) && cid) onCompositionChanged?.(cid)
          } else if (ev.type === 'reload') {
            onReloadTimeline?.()
          } else if (ev.type === 'error') {
            acc += `\n⚠️ ${ev.message || 'Error'}`
            setMessages((m) => patchLast(m, { text: acc }))
          }
        },
      )
    } catch (e) {
      setMessages((m) => patchLast(m, { text: acc + `\n⚠️ ${e.message}` }))
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  return (
    <div className="motion-chat">
      <div className="motion-chat-log">
        {messages.length === 0 && (
          <div className="motion-chat-hint">
            Pídele a la IA un motion graphic. Ej: “Créame una animación de SUSCRÍBETE
            que entre desde la derecha con rebote durante 3 segundos.”
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`motion-chat-msg ${m.role}`}>
            {m.tools?.length > 0 && (
              <div className="motion-chat-tools">{m.tools.join(' · ')}</div>
            )}
            <div className="motion-chat-text">{m.text || (busy && i === messages.length - 1 ? '…' : '')}</div>
          </div>
        ))}
      </div>
      <div className="motion-chat-input">
        <textarea
          rows={2}
          value={input}
          placeholder="Describe tu motion graphic…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        />
        <button type="button" onClick={send} disabled={busy || !input.trim()}>
          {busy ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

function patchLast(list, patch) {
  const out = list.slice()
  const i = out.length - 1
  if (i >= 0) out[i] = { ...out[i], ...patch }
  return out
}
function lastTools(list) {
  const last = list[list.length - 1]
  return last?.tools || []
}
function labelFor(tool) {
  const map = {
    motion_create_composition: 'Creando composición',
    motion_update_composition: 'Editando composición',
    motion_add_to_timeline: 'Añadiendo a la timeline',
    motion_list_templates: 'Buscando plantillas',
    motion_get_composition: 'Leyendo composición',
  }
  return map[tool] || tool
}
