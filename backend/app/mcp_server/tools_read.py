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
    """Timeline: pistas y clips con sus propiedades (sin words/keyframes)."""
    proj = _project_or_raise(project_id)
    return dto.timeline_detail(proj.timeline)


def inspect_clip(project_id: str, clip_id: str) -> dict:
    """Un clip COMPLETO (reframe/keyframes, words, transform). Solo el que vas a tocar."""
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


def search_transcript(project_id: str, query: str, limit: int = 20) -> dict:
    """Busca texto en las transcripciones (con tiempos) para editar POR CONTENIDO."""
    proj = _project_or_raise(project_id)
    q = (query or "").strip().lower()
    if not q:
        raise ValueError("Falta el texto a buscar (query).")
    matches: list[dict] = []
    for tr in proj.transcripts or []:
        for seg in tr.segments or []:
            if q in (seg.text or "").lower():
                matches.append({"scope": "project", "transcript_id": tr.id,
                                "start": seg.start, "end": seg.end, "text": seg.text})
    for c in proj.clips or []:
        tr = getattr(c, "transcript", None)
        if tr:
            for seg in tr.segments or []:
                if q in (seg.text or "").lower():
                    matches.append({"scope": "clip", "clip_index": c.index,
                                    "start": seg.start, "end": seg.end, "text": seg.text})
    return {"query": query, "count": len(matches), "matches": matches[:max(1, int(limit))]}


def register(mcp) -> None:
    tool(mcp, access="read")(get_timeline)
    tool(mcp, access="read")(inspect_clip)
    tool(mcp, access="read")(list_media)
    tool(mcp, access="read")(search_transcript)
