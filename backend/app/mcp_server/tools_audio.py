"""Tools de TRANSCRIPCIÓN / AUDIO (Etapa 6).

Envuelven los servicios de transcripción (faster-whisper), TTS (Kokoro/Piper) y
la biblioteca de efectos de sonido. Las tres primeras lanzan jobs (esperar con
``wait_for_job``); ``search_sfx`` es lectura síncrona.
"""
from __future__ import annotations

from .. import heatmap, jobs, projects, sfx
from ..schemas import TTSRequest, TranscribeRequest
from . import dto
from .registry import tool


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def _video_title(url: str) -> str:
    try:
        return heatmap._extract_info(url).get("title", "") or ""
    except Exception:  # noqa: BLE001 - el título es cosmético
        return ""


def transcribe(project_id: str, source: str | None = None, clip_index: str | None = None,
               model: str | None = None, language: str | None = None) -> dict:
    """Transcribe (genera guion con words[] reales). Pasa **o** ``source`` (URL de
    YouTube → guion del proyecto) **o** ``clip_index`` (transcribe ese clip del
    material). ``model``: tiny|base|small|medium|large-v3. Si se omite, usa el
    modelo de Ajustes. Devuelve el job.
    """
    proj = _project_or_raise(project_id)
    has_source = bool(source)
    has_clip = clip_index is not None
    if has_source == has_clip:
        raise ValueError("Pasa 'source' (URL) O 'clip_index', no ambos ni ninguno.")

    job = jobs.create_job()
    if has_source:
        req = TranscribeRequest(url=source, project_id=project_id, model=model, language=language)
        jobs.start_transcribe_job(job, req, _video_title(source))
    else:
        if not any(str(c.index) == str(clip_index) for c in proj.clips):
            raise ValueError(f"Clip no encontrado en el proyecto: {clip_index}")
        jobs.start_clip_transcribe_job(job, project_id, str(clip_index), model, language)
    return dto.job_dto(job)


def generate_subtitles(project_id: str, filename: str, asset_kind: str = "audios",
                       model: str | None = None, language: str | None = None,
                       asset_scope: str = "project") -> dict:
    """Transcribe un audio de la timeline y crea la pista de subtítulos (texto).

    ``filename`` es el archivo del audio; ``asset_kind`` clips|audios;
    ``asset_scope`` project|library. Devuelve el job.
    """
    _project_or_raise(project_id)
    if not filename:
        raise ValueError("Falta 'filename' del audio a subtitular.")
    job = jobs.create_job()
    jobs.start_subtitles_job(job, project_id, filename, asset_kind, model, language, asset_scope)
    return dto.job_dto(job)


def generate_voice(project_id: str, text: str, engine: str = "kokoro", voice: str = "ef_dora",
                   voice2: str | None = None, blend: float = 0.5, speed: float = 1.0,
                   pause: float = 0.4, name: str | None = None, style: str | None = None) -> dict:
    """Genera un audio de narrador (TTS) y lo añade al proyecto. ``engine``:
    kokoro|piper|gemini. Devuelve el job."""
    _project_or_raise(project_id)
    if not (text or "").strip():
        raise ValueError("El texto está vacío.")
    from .. import gemini_tts, piper_tts, tts
    if engine == "gemini":
        reason = gemini_tts.unavailable_reason()
        if reason:
            raise ValueError(reason)
    elif engine == "piper":
        if not piper_tts.available():
            raise ValueError("Piper no está instalado (ejecuta 'python get_piper.py' en backend/).")
    elif engine == "kokoro":
        if not tts.available():
            raise ValueError("Faltan los modelos de Kokoro (ver README).")
    else:
        raise ValueError("Motor TTS no válido.")

    req = TTSRequest(project_id=project_id, text=text, engine=engine, voice=voice,
                     voice2=voice2, blend=blend, speed=speed, pause=pause, name=name,
                     style=style)
    job = jobs.create_job()
    jobs.start_tts_job(job, req)
    return dto.job_dto(job)


def search_sfx(query: str = "", category: str = "", limit: int = 50) -> dict:
    """Busca efectos de sonido en la biblioteca local (SFX). No necesita proyecto."""
    res = sfx.search(q=query, category=category, limit=max(1, min(int(limit), 300)))
    return {
        "available": res["available"],
        "total": res["total"],
        "categories": [c.get("id") for c in res.get("categories", [])],
        "items": [
            {"id": it.get("id"), "name": it.get("name"), "category": it.get("category"),
             "uso": it.get("uso"), "url": it.get("url")}
            for it in res.get("items", [])
        ],
    }


def register(mcp) -> None:
    tool(mcp, access="write")(transcribe)
    tool(mcp, access="write")(generate_subtitles)
    tool(mcp, access="write")(generate_voice)
    tool(mcp, access="read")(search_sfx)
