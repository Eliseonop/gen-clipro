"""Workflows de alto nivel (Etapa 8): crear un short de una sola llamada.

Cada tool valida y lanza UN job que corre todo el pipeline en el servidor con
progreso por etapas. El agente lo espera con ``wait_for_job`` y recoge
``result.export_url``.
"""
from __future__ import annotations

from .. import jobs, projects
from . import dto
from .registry import tool


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def create_short_from_youtube(project_id: str, url: str, crop_mode: str = "smart_face",
                              count: int = 1, model: str = "base", language: str | None = None,
                              subtitles: bool = True, export: bool = True,
                              min_score: float = 0.40, max_duration: int = 60,
                              padding: int = 10) -> dict:
    """Crea un short vertical de punta a punta desde un vídeo de YouTube.

    Pipeline (un solo job): analiza el heatmap → recorta el mejor tramo a vertical
    (``crop_mode``) → timeline 9:16 → transcribe → subtítulos → export. Espera con
    ``wait_for_job``; el resultado trae ``export_url``.
    """
    _project_or_raise(project_id)
    if not (url or "").strip():
        raise ValueError("Falta la URL de YouTube.")
    params = {
        "url": url, "crop_mode": crop_mode, "count": count, "model": model,
        "language": language, "subtitles": subtitles, "export": export,
        "min_score": min_score, "max_duration": max_duration, "padding": padding,
    }
    job = jobs.create_job()
    jobs.start_short_youtube_job(job, project_id, params)
    return dto.job_dto(job)


def make_short_from_library(project_id: str, asset_id: str, asset_kind: str = "clips",
                            model: str = "base", language: str | None = None,
                            subtitles: bool = True, export: bool = True) -> dict:
    """Crea un short desde un clip que YA está en el proyecto (sin descargar).

    Pipeline (un solo job): timeline 9:16 con el clip → transcribe → subtítulos →
    export. ``asset_id`` es el index del clip. Espera con ``wait_for_job``.
    """
    proj = _project_or_raise(project_id)
    if not any(str(c.index) == str(asset_id) for c in proj.clips):
        raise ValueError(f"Clip no encontrado en el proyecto: {asset_id}")
    params = {
        "asset_id": str(asset_id), "asset_kind": asset_kind, "model": model,
        "language": language, "subtitles": subtitles, "export": export,
    }
    job = jobs.create_job()
    jobs.start_short_library_job(job, project_id, params)
    return dto.job_dto(job)


def register(mcp) -> None:
    tool(mcp, access="write")(create_short_from_youtube)
    tool(mcp, access="write")(make_short_from_library)
