"""Tools de RENDER / EXPORT + gestión de jobs (Etapa 7).

``export_project`` lanza el render final (reusa ``jobs.start_export_job`` +
``compose.py``). ``list_jobs``/``cancel_job`` gestionan los jobs en memoria del
mismo proceso.
"""
from __future__ import annotations

from .. import jobs, projects
from ..schemas import Timeline
from . import dto
from .registry import tool


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def export_project(project_id: str, timeline: dict | None = None) -> dict:
    """Renderiza el vídeo final componiendo toda la timeline (job en segundo plano).

    Por defecto usa la timeline guardada del proyecto (la que dejaron las tools de
    edición); pásale ``timeline`` solo si quieres exportar una distinta. Espera
    con ``wait_for_job`` y recoge ``result.export_url``.
    """
    proj = _project_or_raise(project_id)
    tl = Timeline(**timeline) if timeline else proj.timeline
    if tl is None or not tl.clips:
        raise ValueError("La timeline está vacía: no hay nada que exportar.")
    job = jobs.create_job()
    jobs.start_export_job(job, project_id, tl.model_dump())
    return dto.job_dto(job)


def list_jobs() -> dict:
    """Lista todos los jobs conocidos (de este proceso) con su estado."""
    return {"jobs": [dto.job_dto(j) for j in jobs.all_jobs()]}


def cancel_job(job_id: str) -> dict:
    """Pide cancelar un job (cooperativo, best-effort).

    Aborta en el siguiente tick de progreso; un FFmpeg ya en marcha no se
    interrumpe hasta ese punto. Falla si el job no existe o ya terminó.
    """
    job = jobs.get_job(job_id)
    if job is None:
        raise ValueError(f"Job no encontrado: {job_id}")
    if not jobs.request_cancel(job_id):
        raise ValueError(f"El job {job_id} ya terminó; no se puede cancelar.")
    return dto.job_dto(job)


def register(mcp) -> None:
    tool(mcp, access="write")(export_project)
    tool(mcp, access="read")(list_jobs)
    tool(mcp, access="write")(cancel_job)
