import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { aiChat, getAiConfig, getConversations, getConversation } from '../../services/api'

// Etiquetas amigables: el usuario NO ve nombres técnicos de tools.
const TOOL_LABELS = {
  analyze_youtube: 'Analizando el vídeo…',
  create_clips_from_segments: 'Creando clips…',
  create_short_from_youtube: 'Creando el short…',
  make_short_from_library: 'Creando el short…',
  transcribe: 'Transcribiendo…',
  generate_subtitles: 'Generando subtítulos…',
  add_subtitles: 'Añadiendo subtítulos…',
  generate_voice: 'Generando narración…',
  fetch_image: 'Buscando la imagen…',
  export_project: 'Exportando…',
  set_project_format: 'Cambiando el formato…',
  reframe_clip: 'Reencuadrando…',
  add_to_timeline: 'Añadiendo a la timeline…',
  move_clip: 'Moviendo el clip…',
  split_clip: 'Cortando el clip…',
  remove_clip: 'Eliminando el clip…',
  duplicate_clip: 'Duplicando el clip…',
  add_shape: 'Añadiendo una figura…',
  set_clip_effects: 'Aplicando efectos…',
  set_clip_speed: 'Cambiando la velocidad…',
  set_clip_opacity: 'Ajustando la opacidad…',
  set_clip_transition: 'Aplicando transición…',
  set_clip_keyframes: 'Animando el clip…',
  animate_clip: 'Animando el clip…',
  set_text_role: 'Ajustando el texto…',
  undo: 'Deshaciendo…',
  redo: 'Rehaciendo…',
  checkpoint: 'Guardando un punto de control…',
  restore_checkpoint: 'Restaurando…',
  wait_for_job: 'Procesando…',
  get_project_context: 'Revisando el proyecto…',
  get_timeline: 'Mirando la timeline…',
  inspect_clip: 'Revisando el clip…',
  list_media: 'Revisando el material…',
  get_frame: 'Mirando el clip…',
  set_clip_ai_description: 'Describiendo el material…',
  list_projects: 'Listando proyectos…',
  search_transcript: 'Buscando en el guion…',
  auto_reframe: 'Reencuadrando (cara)…',
}
const toolLabel = (t) => TOOL_LABELS[t] || 'Trabajando…'

const EXAMPLES = [
  'Pon el proyecto en 9:16.',
  'Crea un short de 30 segundos con las mejores partes y subtítulos.',
  'Agrega subtítulos.',
  'Deshaz lo último.',
]

export default function EdChat({ project, context, onReload, onBusy }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [cfg, setCfg] = useState(null)
  const [debug, setDebug] = useState(false)
  const convRef = useRef(null)
  const ctxRef = useRef(context)
  const scrollRef = useRef(null)

  useEffect(() => { ctxRef.current = context }, [context])
  useEffect(() => {
    onBusy?.(busy)
    return () => onBusy?.(false)
  }, [busy, onBusy])
  useEffect(() => { getAiConfig().then(setCfg).catch(() => setCfg({ available: false, reason: 'No se pudo consultar el proveedor.' })) }, [])
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }) }, [messages])

  // Cargar el último chat guardado del proyecto.
  useEffect(() => {
    let alive = true
    convRef.current = null
    setMessages([])
    if (!project?.id) return
    ;(async () => {
      try {
        const { conversations } = await getConversations(project.id)
        if (!alive || !conversations?.length) return
        const last = conversations[0]
        const { messages: msgs } = await getConversation(project.id, last.id)
        if (!alive) return
        convRef.current = last.id
        setMessages((msgs || []).map((m) => ({ role: m.role, text: m.text, tools: [], jobs: {}, done: true })))
      } catch { /* sin historial */ }
    })()
    return () => { alive = false }
  }, [project?.id])

  function patchLast(fn) {
    setMessages((prev) => {
      const next = prev.slice()
      const i = next.length - 1
      if (i >= 0) next[i] = fn(next[i])
      return next
    })
  }

  function newChat() {
    if (busy) return
    convRef.current = null
    setMessages([])
  }

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || busy || !project?.id) return
    setInput('')
    setBusy(true)
    setMessages((prev) => [...prev, { role: 'user', text: msg }, { role: 'assistant', text: '', tools: [], jobs: {}, done: false }])
    try {
      await aiChat({ projectId: project.id, message: msg, conversationId: convRef.current, context: ctxRef.current }, (ev) => {
        if (ev.type === 'start') convRef.current = ev.conversation_id
        else if (ev.type === 'text') patchLast((m) => ({ ...m, text: (m.text || '') + ev.delta }))
        else if (ev.type === 'tool_start') patchLast((m) => ({ ...m, tools: [...(m.tools || []), { tool: ev.tool, status: 'run' }] }))
        else if (ev.type === 'tool_result') patchLast((m) => {
          const tools = (m.tools || []).slice()
          for (let i = tools.length - 1; i >= 0; i--) if (tools[i].tool === ev.tool && tools[i].status === 'run') { tools[i] = { ...tools[i], status: ev.ok ? 'ok' : 'err' }; break }
          return { ...m, tools }
        })
        else if (ev.type === 'job') patchLast((m) => ({ ...m, jobs: { ...(m.jobs || {}), [ev.job_id]: { tool: ev.tool, status: ev.status, progress: ev.progress, message: ev.message } } }))
        else if (ev.type === 'status') patchLast((m) => ({ ...m, status: ev.message }))
        else if (ev.type === 'reload') onReload?.()
        else if (ev.type === 'error') patchLast((m) => ({ ...m, error: ev.message, done: true }))
      })
    } catch (e) {
      patchLast((m) => ({ ...m, error: e.message || 'Error de conexión.', done: true }))
    } finally {
      patchLast((m) => ({ ...m, done: true }))
      setBusy(false)
    }
  }

  const unavailable = cfg && !cfg.available

  return (
    <div className="ed-chat">
      <div className="ed-chat-head">
        <button type="button" className="ed-chat-newbtn" onClick={newChat} disabled={busy} title="Nuevo chat">
          <Icon name="add" size={16} /> Nuevo chat
        </button>
        <button type="button" className={`icon-btn ${debug ? 'on' : ''}`} onClick={() => setDebug((v) => !v)} title="Modo debug (nombres de tools)">
          <Icon name="bug_report" size={16} />
        </button>
      </div>

      <div className="ed-chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ed-chat-empty">
            <Icon name="smart_toy" size={26} />
            <p>Dime qué hacer con el editor en lenguaje natural.</p>
            <div className="ed-chat-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => send(ex)} disabled={busy || unavailable}>{ex}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ed-chat-msg ${m.role}`}>
            {m.role === 'assistant' && <div className="ed-chat-who"><Icon name="smart_toy" size={15} /> IA</div>}
            {m.text && <div className="ed-chat-text">{m.text}</div>}
            {(m.tools || []).map((t, j) => (
              <div key={j} className={`ed-chat-tool ${t.status}`}>
                <Icon name={t.status === 'ok' ? 'check_circle' : t.status === 'err' ? 'error' : 'progress_activity'} size={14} />
                <span>{debug ? `${t.tool} · ${t.status}` : toolLabel(t.tool)}</span>
              </div>
            ))}
            {Object.entries(m.jobs || {}).map(([jid, jb]) => {
              const pct = Math.round((jb.progress || 0) * 100)
              const done = jb.status === 'done'
              const err = jb.status === 'error' || jb.status === 'cancelled'
              return (
                <div key={jid} className="ed-chat-job">
                  <div className="ed-chat-job-row">
                    <span>{debug ? `${jb.tool} · ${jb.status}` : (jb.message || toolLabel(jb.tool))}</span>
                    <span className="ed-chat-job-pct">{done ? '100%' : err ? '—' : `${pct}%`}</span>
                  </div>
                  <div className="ed-chat-bar"><div className={`ed-chat-bar-fill ${err ? 'err' : ''}`} style={{ width: `${done ? 100 : pct}%` }} /></div>
                </div>
              )
            })}
            {m.status && !m.done && <div className="ed-chat-tool run"><Icon name="hourglass_top" size={14} /> <span>{m.status}</span></div>}
            {m.error && <div className="ed-chat-tool err"><Icon name="error" size={14} /> <span>{m.error}</span></div>}
            {m.role === 'assistant' && !m.done && !m.text && (m.tools || []).length === 0 && !m.status && (
              <div className="ed-chat-tool run"><Icon name="progress_activity" size={14} /> <span>Pensando…</span></div>
            )}
          </div>
        ))}
      </div>

      {unavailable && (
        <div className="ed-chat-warn"><Icon name="key" size={14} /> {cfg.reason || 'Configura la API key en Configuración.'}</div>
      )}

      <form className="ed-chat-input" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? 'La IA está trabajando…' : 'Escribe una instrucción…'}
          disabled={busy || unavailable}
        />
        <button type="submit" className="icon-btn" disabled={busy || unavailable || !input.trim()} title="Enviar">
          <Icon name={busy ? 'progress_activity' : 'send'} size={18} />
        </button>
      </form>
    </div>
  )
}
