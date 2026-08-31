"""DTO semántico: traduce el schema interno a lo que la IA necesita ver.

No expone el schema crudo ni vuelca datos pesados (keyframes, words, segmentos
completos): resúmenes y listas breves. ``capabilities()`` describe los VERBOS
que el editor soporta hoy, para que el agente se adapte entre versiones.
"""
from __future__ import annotations

from math import gcd

from ..schemas import Project, Timeline

# Verbos disponibles en el editor (refleja el estado actual tras los últimos
# cambios: velocidad de clip, biblioteca cross-proyecto…).
CAPABILITIES = [
    "clip.position:top|bottom|full",
    "clip.reframe:center|manual|keyframes|auto",
    "clip.look:bw|cinematic|vintage|contrast|warm|cool|saturated",
    "clip.speed:0.1-10|keep_pitch|reverse",
    "clip.appear|exit:fade|zoom|slide|pop",
    "subtitles.fragmentation:max_words",
    "format:9:16|1:1|16:9|custom",
    "media.library",
    "history.undo_redo|checkpoints",
]


def capabilities() -> list[str]:
    return list(CAPABILITIES)


def aspect_ratio(width: int, height: int) -> str:
    """Reduce w:h a una razón legible ('720x1280' -> '9:16')."""
    if width <= 0 or height <= 0:
        return "?"
    d = gcd(width, height)
    return f"{width // d}:{height // d}"


def _clip_timeline_duration(clip) -> float:
    span = max(0.0, (clip.out_point or 0.0) - (clip.in_point or 0.0))
    if clip.kind == "text":
        return span
    speed = clip.speed or 1.0
    return span / speed if speed > 0 else span


def _timeline_dto(tl: Timeline | None) -> dict:
    if tl is None:
        return {"present": False, "tracks": [], "clip_count": 0, "duration": 0.0,
                "kinds": {"video": 0, "audio": 0, "text": 0}}
    kinds = {"video": 0, "audio": 0, "text": 0}
    end = 0.0
    for c in tl.clips:
        kinds[c.kind] = kinds.get(c.kind, 0) + 1
        end = max(end, (c.start or 0.0) + _clip_timeline_duration(c))
    return {
        "present": True,
        "tracks": [{"id": t.id, "kind": t.kind, "name": t.name} for t in tl.tracks],
        "clip_count": len(tl.clips),
        "duration": round(end, 3),
        "kinds": kinds,
    }


def _media_dto(proj: Project) -> dict:
    clip_list = [
        {
            "index": c.index,
            "label": c.label or c.filename,
            "duration": round((c.end or 0.0) - (c.start or 0.0), 3),
            "has_transcript": c.transcript is not None,
        }
        for c in proj.clips
    ]
    audio_list = [
        {"id": a.id, "label": a.label or a.filename, "duration": a.duration}
        for a in proj.audios
    ]
    return {
        "clips": len(proj.clips),
        "audios": len(proj.audios),
        "transcripts": len(proj.transcripts),
        "clip_list": clip_list,
        "audio_list": audio_list,
    }


def _format_dto(tl: Timeline | None) -> dict:
    w = tl.width if tl else 720
    h = tl.height if tl else 1280
    fps = tl.fps if tl else 30
    return {"aspect": aspect_ratio(w, h), "width": w, "height": h, "fps": fps}


def _clip_summary(c) -> dict:
    """Resumen escaneable de un clip (sin words/keyframes; eso va en clip_detail)."""
    d = {
        "id": c.id,
        "track_id": c.track_id,
        "kind": c.kind,
        "name": c.name,
        "start": round(c.start or 0.0, 3),
        "duration": round(_clip_timeline_duration(c), 3),
        "in_point": c.in_point,
        "out_point": c.out_point,
        "frame": c.frame,
        "layout": c.layout,
        "look": c.look,
        "speed": c.speed,
        "muted": c.muted,
        "has_reframe": c.reframe is not None,
    }
    if c.kind == "text":
        d["text"] = c.text
        d["word_count"] = len(c.words or [])
    return d


def timeline_detail(tl: Timeline | None) -> dict:
    """Timeline en detalle escaneable: formato, pistas y clips (sin datos pesados)."""
    if tl is None:
        return {"present": False, "format": _format_dto(None), "tracks": [],
                "clips": [], "duration": 0.0}
    end = 0.0
    for c in tl.clips:
        end = max(end, (c.start or 0.0) + _clip_timeline_duration(c))
    return {
        "present": True,
        "format": _format_dto(tl),
        "tracks": [
            {"id": t.id, "kind": t.kind, "name": t.name,
             "hidden": t.hidden, "muted": t.muted, "locked": t.locked}
            for t in tl.tracks
        ],
        "clips": [_clip_summary(c) for c in tl.clips],
        "duration": round(end, 3),
    }


def clip_detail(clip) -> dict:
    """Un clip en detalle COMPLETO: incluye reframe/keyframes, words, transform, origin."""
    data = clip.model_dump()
    data["timeline_duration"] = round(_clip_timeline_duration(clip), 3)
    return data


def media_list(proj: Project) -> dict:
    """Inventario detallado de material del proyecto."""
    return {
        "clips": [
            {
                "index": c.index,
                "filename": c.filename,
                "label": c.label,
                "description": c.description,
                "start": c.start,
                "end": c.end,
                "duration": round((c.end or 0.0) - (c.start or 0.0), 3),
                "origin": c.origin,
                "source": c.source,
                "has_transcript": c.transcript is not None,
            }
            for c in proj.clips
        ],
        "audios": [
            {
                "id": a.id,
                "filename": a.filename,
                "label": a.label,
                "duration": a.duration,
                "voice": a.voice,
                "engine": a.engine,
                "origin": a.origin,
                "source": a.source,
            }
            for a in proj.audios
        ],
        "transcripts": [
            {
                "id": t.id,
                "title": t.title,
                "language": t.language,
                "segment_count": len(t.segments),
                "duration": t.duration,
            }
            for t in proj.transcripts
        ],
    }


def job_dto(job) -> dict:
    """Estado de un job + resumen del resultado según su tipo."""
    status = job.status.value if hasattr(job.status, "value") else job.status
    d = {"id": job.id, "status": status, "progress": job.progress, "message": job.message}
    if job.error:
        d["error"] = job.error
    result: dict = {}
    if job.clips:
        result["clips"] = len(job.clips)
    if job.export_url:
        result["export_url"] = job.export_url
    if job.transcript is not None:
        result["transcript_id"] = job.transcript.id
    if job.audio is not None:
        result["audio_id"] = job.audio.id
    if job.reframe_prep is not None:
        result["reframe_prep"] = True
    if result:
        d["result"] = result
    return d


def project_context(proj: Project, *, history: dict | None = None) -> dict:
    """DTO de contexto: resumen semántico y eficiente del proyecto."""
    tl = proj.timeline
    fmt_w = tl.width if tl else 720
    fmt_h = tl.height if tl else 1280
    fmt_fps = tl.fps if tl else 30
    hist = history or {}
    return {
        "project": {
            "id": proj.id,
            "name": proj.name,
            "created_at": proj.created_at,
            "folder": proj.folder,
        },
        "format": {
            "aspect": aspect_ratio(fmt_w, fmt_h),
            "width": fmt_w,
            "height": fmt_h,
            "fps": fmt_fps,
        },
        "media": _media_dto(proj),
        "timeline": _timeline_dto(tl),
        "history": {
            "can_undo": bool(hist.get("can_undo", False)),
            "can_redo": bool(hist.get("can_redo", False)),
            "checkpoints": list(hist.get("checkpoints", [])),
        },
        "capabilities": capabilities(),
    }
