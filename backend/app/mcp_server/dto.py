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
