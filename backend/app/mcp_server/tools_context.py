"""Tools de LECTURA de contexto. Etapa 2: solo ``get_project_context``."""
from __future__ import annotations

from .. import projects, timeline_history, timeline_store
from . import dto
from .registry import tool


def _history_summary(pid: str) -> dict:
    hist = timeline_store._load_history(pid)
    return {
        "can_undo": timeline_history.can_undo(hist),
        "can_redo": timeline_history.can_redo(hist),
        "checkpoints": timeline_history.list_checkpoints(hist),
    }


def get_project_context(project_id: str) -> dict:
    """Resumen semántico y eficiente de un proyecto del editor.

    Devuelve formato de salida, inventario de material (clips/audios/
    transcripciones con listas breves), estado de la timeline, historial
    (undo/redo/checkpoints) y las ``capabilities`` que el editor soporta. Es el
    primer paso recomendado para orientarse antes de editar.
    """
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return dto.project_context(proj, history=_history_summary(project_id))


def register(mcp) -> None:
    """Registra las tools de contexto en el MCP (con auditoría/política)."""
    tool(mcp, access="read")(get_project_context)
