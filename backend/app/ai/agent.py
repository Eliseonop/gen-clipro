"""Agente del Chat IA: orquesta proveedor ↔ tools MCP y emite eventos.

Generador asíncrono de eventos (para SSE). No implementa operaciones del editor:
decide contexto, ejecuta tools del MCP existente (auto-esperando jobs con
progreso) y traduce el stream del proveedor a eventos de UI. Fuente de verdad:
``timeline_store``/``timeline_ops``.
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from ..mcp_server import audit, registry
from . import conversations
from .mcp_client import McpToolset
from .providers import get_provider

MAX_ITERS = 8
JOB_POLL_SECONDS = 1.0
JOB_MAX_POLLS = 600  # ~10 min de techo por job


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
        "nivel si encajan, o encadenar tools. No expliques nombres técnicos de "
        "tools al usuario.",
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


def _is_job(data) -> bool:
    return (isinstance(data, dict) and "id" in data
            and data.get("status") in ("pending", "running", "done", "error", "cancelled"))


async def _wait_job(tools: McpToolset, tool_name: str, data: dict, emit) -> dict:
    """Sondea get_job emitiendo progreso hasta que termina. Devuelve el estado final."""
    job_id = data["id"]
    for _ in range(JOB_MAX_POLLS):
        await emit({"type": "job", "tool": tool_name, "job_id": job_id,
                    "status": data.get("status"), "progress": data.get("progress", 0),
                    "message": data.get("message", "")})
        if data.get("status") in ("done", "error", "cancelled"):
            break
        await asyncio.sleep(JOB_POLL_SECONDS)
        jr = await tools.call("get_job", {"job_id": job_id})
        if not jr.get("ok") or not isinstance(jr.get("data"), dict):
            break
        data = jr["data"]
    ok = data.get("status") != "error"
    return {"ok": ok, "data": data, "text": json.dumps(data, ensure_ascii=False)}


async def run_chat(project_id: str, message: str, *, context: dict | None = None,
                   conversation_id: str | None = None,
                   max_iters: int = MAX_ITERS) -> AsyncIterator[dict]:
    """Corre un turno de chat. Emite: start/text/tool_start/tool_result/job/
    reload/final/error/done."""
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

    cid = conversations.get_or_create(conversation_id, project_id)
    ctx = {**(context or {}), "project_id": project_id}

    queue: asyncio.Queue = asyncio.Queue()
    state = {"touched": False, "final": ""}

    async def emit(ev: dict) -> None:
        if ev.get("type") == "tool_result" and ev.get("ok") and _is_mutating(ev.get("tool", "")):
            state["touched"] = True
        if ev.get("type") == "final":
            state["final"] = ev.get("text", "")
        await queue.put(ev)

    async def worker() -> None:
        try:
            async with McpToolset.open() as tools:
                specs = await tools.tool_specs()
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
                        res = await tools.call(name, args)
                    if _is_job(res.get("data")) and res.get("data", {}).get("status") in ("pending", "running"):
                        res = await _wait_job(tools, name, res["data"], emit)
                    return res

                await provider.run(
                    system=system, history=conversations.history(project_id, cid),
                    user_message=message, tools=specs, call_tool=call_tool,
                    emit=emit, max_iters=max_iters,
                )
        except Exception as exc:  # noqa: BLE001
            await emit({"type": "error", "message": f"Error del agente: {exc}"})
        finally:
            await queue.put(None)

    await emit({"type": "start", "conversation_id": cid})
    task = asyncio.create_task(worker())
    try:
        while True:
            ev = await queue.get()
            if ev is None:
                break
            yield ev
    finally:
        await task

    conversations.append(project_id, cid, "user", message)
    if state["final"]:
        conversations.append(project_id, cid, "assistant", state["final"])
    if state["touched"]:
        yield {"type": "reload"}
    yield {"type": "done"}


async def sse(project_id: str, message: str, **kwargs) -> AsyncIterator[str]:
    """Envuelve run_chat como stream SSE (``data: {json}\\n\\n``)."""
    async for ev in run_chat(project_id, message, **kwargs):
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
