"""Agente del Chat IA: orquesta proveedor ↔ tools MCP y emite eventos.

Es un generador asíncrono de eventos (para SSE). No implementa ninguna operación
del editor: solo decide contexto, ejecuta las tools del MCP existente y traduce
el stream del proveedor a eventos de UI. La fuente de verdad sigue siendo
``timeline_store``/``timeline_ops``.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

from ..mcp_server import audit, registry
from . import conversations
from .mcp_client import McpToolset
from .providers import get_provider

MAX_ITERS = 8


def _access(tool: str) -> str:
    spec = registry.registered().get(tool)
    return spec.access if spec else "read"


def _is_mutating(tool: str) -> bool:
    return _access(tool) in ("write", "destructive")


def _system_prompt(context_summary: str | None, context: dict | None) -> str:
    ctx = context or {}
    lines = [
        "Eres el asistente del editor de vídeo. Operas el editor SOLO a través de "
        "las herramientas disponibles (no inventes operaciones). Habla en español, "
        "breve y claro. Antes de editar, oriéntate con el contexto; usa "
        "get_timeline / inspect_clip / list_media solo si necesitas detalle.",
        "Cuando el usuario diga 'ese clip', 'este', 'el anterior', usa el clip "
        "seleccionado o el contexto de la conversación; si hay ambigüedad real, "
        "pregunta en vez de adivinar.",
        "Para tareas largas (crear un short) puedes usar los workflows de alto "
        "nivel si encajan, o encadenar tools. Los trabajos (jobs) se esperan con "
        "wait_for_job. No expliques nombres técnicos de tools al usuario.",
    ]
    hint = []
    if ctx.get("project_id"):
        hint.append(f"project_id={ctx['project_id']}")
    if ctx.get("selected_clip_id"):
        hint.append(f"clip seleccionado={ctx['selected_clip_id']}")
    if ctx.get("selected_track_id"):
        hint.append(f"pista seleccionada={ctx['selected_track_id']}")
    if ctx.get("current_time") is not None:
        hint.append(f"tiempo actual={ctx['current_time']}s")
    if hint:
        lines.append("Contexto del editor: " + ", ".join(hint) + ".")
    if context_summary:
        lines.append("Resumen del proyecto:\n" + context_summary)
    return "\n\n".join(lines)


def _compact_context(data: dict | None) -> str:
    """Resumen mínimo (tokens) del get_project_context para el system prompt."""
    if not isinstance(data, dict):
        return ""
    fmt = data.get("format") or {}
    tl = data.get("timeline") or {}
    media = data.get("media") or {}
    hist = data.get("history") or {}
    parts = [
        f"nombre: {(data.get('project') or {}).get('name')}",
        f"formato: {fmt.get('aspect')} ({fmt.get('width')}x{fmt.get('height')} {fmt.get('fps')}fps)",
        f"timeline: {tl.get('clip_count', 0)} clips, {tl.get('duration', 0)}s, pistas={len(tl.get('tracks') or [])}",
        f"material: {media.get('clips', 0)} clips, {media.get('audios', 0)} audios, {media.get('images', 0)} imágenes",
        f"undo={hist.get('can_undo')} redo={hist.get('can_redo')}",
    ]
    return " · ".join(str(p) for p in parts)


async def run_chat(project_id: str, message: str, *, context: dict | None = None,
                   conversation_id: str | None = None,
                   max_iters: int = MAX_ITERS) -> AsyncIterator[dict]:
    """Corre un turno de chat. Emite eventos: start/text/tool_start/tool_result/
    reload/final/done/error."""
    if not (project_id or "").strip():
        yield {"type": "error", "message": "Falta project_id."}
        return
    if not (message or "").strip():
        yield {"type": "error", "message": "Mensaje vacío."}
        return

    provider = get_provider()
    reason = provider.unavailable_reason()
    if reason:
        yield {"type": "error", "message": reason}
        return

    cid, conv = conversations.get_or_create(conversation_id, project_id)
    ctx = {**(context or {}), "project_id": project_id}
    yield {"type": "start", "conversation_id": cid}

    touched = False
    final_text = ""
    try:
        async with McpToolset.open() as tools:
            specs = await tools.tool_specs()

            # Contexto compacto del proyecto (una lectura in-process, auditada).
            summary = ""
            with audit.source("ai_chat"):
                try:
                    ctxres = await tools.call("get_project_context", {"project_id": project_id})
                    summary = _compact_context(ctxres.get("data"))
                except Exception:  # noqa: BLE001
                    summary = ""

            system = _system_prompt(summary, ctx)

            async def call_tool(name: str, args: dict) -> dict:
                with audit.source("ai_chat"):
                    return await tools.call(name, args)

            async for ev in provider.stream(
                system=system, history=conversations.history(conv),
                user_message=message, tools=specs, call_tool=call_tool,
                max_iters=max_iters,
            ):
                if ev.get("type") == "tool_result" and ev.get("ok") and _is_mutating(ev.get("tool", "")):
                    touched = True
                if ev.get("type") == "final":
                    final_text = ev.get("text", "")
                yield ev
    except Exception as exc:  # noqa: BLE001
        yield {"type": "error", "message": f"Error del agente: {exc}"}
        return

    conversations.append(conv, "user", message)
    if final_text:
        conversations.append(conv, "assistant", final_text)
    if touched:
        yield {"type": "reload"}
    yield {"type": "done"}


async def sse(project_id: str, message: str, **kwargs) -> AsyncIterator[str]:
    """Envuelve run_chat como stream SSE (``data: {json}\\n\\n``)."""
    async for ev in run_chat(project_id, message, **kwargs):
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
