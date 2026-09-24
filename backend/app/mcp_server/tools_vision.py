"""Visión: darle OJOS a la IA + descripción de material.

``get_frame`` extrae un fotograma de un clip para que un modelo multimodal
lo VEA (el agente adjunta la imagen al modelo). ``set_clip_ai_description``
guarda la descripción que genera la IA en un campo aparte (``description_ai``),
sin pisar la descripción manual del usuario. ``analyze_materials`` hace lo mismo
en lote con la visión de Foundry (``material_ai``), sin pasar por el agente.
"""
from __future__ import annotations

import base64
from pathlib import Path

from .. import frame_grab, jobs, material_ai, projects, storage
from . import dto
from .registry import MCPError, tool

MAX_FRAME_PX = frame_grab.MAX_FRAME_PX


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def _clip_or_raise(proj, clip_index: str):
    c = next((c for c in proj.clips if str(c.index) == str(clip_index)), None)
    if c is None:
        raise ValueError(f"Clip no encontrado en el material: {clip_index}")
    return c


def _clip_file(proj, clip) -> Path:
    scope = getattr(clip, "asset_scope", None) or "project"
    path = (storage.resolve_library_media("video", clip.filename) if scope == "library"
            else storage.resolve_media(proj, "video", clip.filename))
    if path is None or not path.exists():
        raise ValueError("No se encuentra el archivo del clip.")
    return path


def get_frame(project_id: str, clip_index: str, at_time: float | None = None) -> dict:
    """Devuelve un fotograma (imagen) de un clip del material para que lo VEAS. at_time = segundo dentro del clip."""
    proj = _project_or_raise(project_id)
    clip = _clip_or_raise(proj, clip_index)
    path = _clip_file(proj, clip)
    offset, dur = material_ai.clip_span(clip)   # un segmento por referencia empieza en in_point
    t = dur / 2 if at_time is None else max(0.0, min(float(at_time), max(0.0, dur - 0.05)))

    data = frame_grab.extract_frame(path, offset + t, max_px=MAX_FRAME_PX)
    return {
        "clip_index": clip.index,
        "at_time": round(t, 2),
        "mime": "image/jpeg",
        # El agente detecta image_b64 y adjunta la imagen al modelo multimodal.
        "image_b64": base64.b64encode(data).decode("ascii"),
        "note": "fotograma del clip (imagen adjunta para que la veas)",
    }


def set_clip_ai_description(project_id: str, clip_index: str, description: str) -> dict:
    """Guarda tu descripción de un clip en un campo APARTE (description_ai); NO pisa la del usuario."""
    _project_or_raise(project_id)
    item = projects.update_material(project_id, "clips", str(clip_index),
                                    {"description_ai": (description or "").strip()})
    if item is None:
        raise ValueError(f"Clip no encontrado: {clip_index}")
    return {"ok": True, "clip_index": int(clip_index) if str(clip_index).isdigit() else clip_index,
            "description_ai": item.get("description_ai")}


def analyze_materials(project_id: str, only_missing: bool = True, rename_generic: bool = True) -> dict:
    """Analiza clips e imágenes con visión de Foundry: descripción IA + metadata semántica (no pisa lo del usuario). Devuelve job."""
    _project_or_raise(project_id)
    from .. import foundry
    reason = foundry.unavailable_reason()
    if reason:
        raise MCPError("configuration_error", reason)
    job = jobs.create_job()
    jobs.start_material_analysis_job(job, project_id, {"only_missing": bool(only_missing),
                                                       "rename_generic": bool(rename_generic)})
    return dto.job_dto(job)


def register(mcp) -> None:
    tool(mcp, access="read")(get_frame)
    tool(mcp, access="write")(set_clip_ai_description)
    tool(mcp, access="write")(analyze_materials)
