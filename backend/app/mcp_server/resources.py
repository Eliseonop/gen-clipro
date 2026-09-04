"""Resources del MCP (Fase 2): descubrimiento + estado direccionable de solo lectura.

Separación MCP idiomática (§L4): los **resources** son estado sin efectos que el
cliente lee bajo demanda; las **tools** son operaciones. Aquí se exponen:

- ``capabilities://index``  → mapa de dominios+verbos+defaults (espejo de
  ``describe_capabilities()``).
- ``help://<domain>``       → guía larga del dominio (lo que se sacó de las
  descripciones en la Fase 1).
- ``config://runtime``      → GPU, proveedor de IA, binarios, defaults, rutas.
- ``project://{pid}``            → resumen del proyecto (formato, material, timeline, historial).
- ``project://{pid}/timeline``   → timeline en detalle escaneable.
- ``project://{pid}/clip/{cid}`` → un clip COMPLETO.
- ``project://{pid}/media``      → inventario de material.

Nota (§L4): muchos clientes NO cargan resources en contexto automáticamente; por
eso el mismo estado sigue disponible como tools de lectura (get_project_context,
get_timeline, inspect_clip, list_media). Los resources son para clientes que los
leen; las tools, el camino garantizado.
"""
from __future__ import annotations

import json

from .. import projects, timeline_history, timeline_store
from . import capabilities, dto, help_content


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False)


def _project_or_raise(pid: str):
    proj = projects.get_project(pid)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {pid}")
    return proj


def _history(pid: str) -> dict:
    hist = timeline_store._load_history(pid)
    return {
        "can_undo": timeline_history.can_undo(hist),
        "can_redo": timeline_history.can_redo(hist),
        "checkpoints": timeline_history.list_checkpoints(hist),
    }


def register(mcp) -> None:
    """Registra los resources en el MCP."""

    @mcp.resource("capabilities://index", mime_type="application/json",
                  description="Dominios, verbos y defaults del editor (descubrimiento).")
    def _capabilities_index() -> str:
        return _json(capabilities.overview())

    @mcp.resource("help://{domain}", description="Guía de uso de un dominio.")
    def _help(domain: str) -> str:
        guide = help_content.guide(domain)
        if guide is None:
            raise ValueError(f"Dominio sin guía: {domain}. Válidos: {help_content.domains()}")
        return guide

    @mcp.resource("config://runtime", mime_type="application/json",
                  description="GPU, proveedor de IA, binarios, defaults y rutas.")
    def _runtime() -> str:
        return _json(capabilities.runtime_info())

    @mcp.resource("project://{pid}", mime_type="application/json",
                  description="Resumen del proyecto (formato, material, timeline, historial).")
    def _project(pid: str) -> str:
        proj = _project_or_raise(pid)
        return _json(dto.project_context(proj, history=_history(pid)))

    @mcp.resource("project://{pid}/timeline", mime_type="application/json",
                  description="Timeline en detalle (pistas y clips, sin words/keyframes).")
    def _project_timeline(pid: str) -> str:
        proj = _project_or_raise(pid)
        return _json(dto.timeline_detail(proj.timeline))

    @mcp.resource("project://{pid}/clip/{cid}", mime_type="application/json",
                  description="Un clip de la timeline en detalle COMPLETO.")
    def _project_clip(pid: str, cid: str) -> str:
        proj = _project_or_raise(pid)
        clips = proj.timeline.clips if proj.timeline else []
        for c in clips:
            if c.id == cid:
                return _json(dto.clip_detail(c))
        raise ValueError(f"Clip no encontrado en la timeline: {cid}")

    @mcp.resource("project://{pid}/media", mime_type="application/json",
                  description="Inventario de material del proyecto.")
    def _project_media(pid: str) -> str:
        proj = _project_or_raise(pid)
        return _json(dto.media_list(proj))
