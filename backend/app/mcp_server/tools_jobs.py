"""Tools de LECTURA de jobs (Etapa 3).

Aprovechan que el MCP corre en el MISMO proceso que FastAPI: los jobs viven en
memoria (``app.jobs``) y estas tools los leen directamente, viendo el mismo
estado que el editor del humano.
"""
from __future__ import annotations

import time

from .. import jobs
from . import dto
from .registry import tool

_DONE = ("done", "error")


def _job_or_raise(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        raise ValueError(f"Job no encontrado: {job_id}")
    return job


def _status(job) -> str:
    return job.status.value if hasattr(job.status, "value") else job.status


def get_job(job_id: str) -> dict:
    """Estado de un job (status, progreso, mensaje) + resumen del resultado."""
    return dto.job_dto(_job_or_raise(job_id))


def wait_for_job(job_id: str, timeout_s: float = 60.0, poll_interval: float = 0.5) -> dict:
    """Espera a que el job termine o venza timeout_s (devuelve timed_out:true). Prefiérelo al polling."""
    timeout_s = min(max(float(timeout_s), 0.0), 600.0)
    poll_interval = min(max(float(poll_interval), 0.05), 5.0)
    job = _job_or_raise(job_id)
    start = time.monotonic()
    while True:
        if _status(job) in _DONE:
            return dto.job_dto(job)
        if time.monotonic() - start >= timeout_s:
            out = dto.job_dto(job)
            out["timed_out"] = True
            return out
        time.sleep(poll_interval)
        job = _job_or_raise(job_id)


def register(mcp) -> None:
    tool(mcp, access="read")(get_job)
    tool(mcp, access="read")(wait_for_job)
