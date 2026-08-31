"""Tools de LECTURA sobre el proyecto/timeline (Etapa 3)."""
from __future__ import annotations

from .. import projects
from . import dto
from .registry import tool


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def get_timeline(project_id: str) -> dict:
    """Timeline del proyecto en detalle escaneable.

    Formato de salida, pistas y clips con sus propiedades (posición, duración,
    frame/layout/look/speed…). NO incluye datos pesados (``words``, keyframes de
    reframe): para eso usa ``inspect_clip`` sobre un clip concreto.
    """
    proj = _project_or_raise(project_id)
    return dto.timeline_detail(proj.timeline)


def inspect_clip(project_id: str, clip_id: str) -> dict:
    """Un clip de la timeline en detalle COMPLETO (reframe/keyframes, words, transform)."""
    proj = _project_or_raise(project_id)
    clips = proj.timeline.clips if proj.timeline else []
    for c in clips:
        if c.id == clip_id:
            return dto.clip_detail(c)
    raise ValueError(f"Clip no encontrado en la timeline: {clip_id}")


def list_media(project_id: str) -> dict:
    """Inventario detallado del material del proyecto (clips, audios, transcripciones)."""
    proj = _project_or_raise(project_id)
    return dto.media_list(proj)


def register(mcp) -> None:
    tool(mcp, access="read")(get_timeline)
    tool(mcp, access="read")(inspect_clip)
    tool(mcp, access="read")(list_media)
