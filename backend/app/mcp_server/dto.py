"""DTO semántico: traduce el schema interno a lo que la IA necesita ver.

No expone el schema crudo ni vuelca datos pesados (keyframes, words, segmentos
completos): resúmenes y listas breves. ``capabilities()`` describe los VERBOS
que el editor soporta hoy, para que el agente se adapte entre versiones.
"""
from __future__ import annotations

from math import gcd

from ..schemas import Project, Timeline
from ..text_role import resolve_text_role

# Verbos disponibles en el editor (refleja el estado actual tras los últimos
# cambios: velocidad de clip, biblioteca cross-proyecto…).
CAPABILITIES = [
    "clip.position:top|bottom|full",
    "clip.reframe:center|manual|keyframes|auto",
    "clip.look:bw|cinematic|vintage|contrast|warm|cool|saturated",
    "clip.speed:0.1-10|keep_pitch|reverse",
    "clip.transition:fade|dissolve|wipe|zoom|slide|pop",
    "clip.opacity:0-1",
    "clip.volume:0-2|mute|fade_in|fade_out",
    "clip.effects:blur|grayscale|sepia|brightness|contrast|saturation",
    "clip.audio_fx:eq|compressor|reverb|echo|denoise|distortion",
    "clip.keyframes:x|y|scale|rotation|opacity|volume|audio_fx",
    "clip.animate:zoom|spin|slide|fade|pop|pulse|follow_audio",
    "clip.duplicate",
    "subtitles.fragmentation:max_words",
    "text.role:caption|free",
    "format:9:16|1:1|16:9|4:5|4:3|custom",
    "media.library",
    "media.image",
    "media.shape",
    "voice:kokoro|piper|gemini",
    "tracks.link",
    "tracks.rename",
    "tracks.audio:volume|mute|fx|fade",
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
    if clip.kind in ("text", "image"):
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
        "tracks": [{"id": t.id, "kind": t.kind, "name": t.name, "linked_track_id": t.linked_track_id} for t in tl.tracks],
        "clip_count": len(tl.clips),
        "duration": round(end, 3),
        "kinds": kinds,
    }


def _media_dto(proj: Project) -> dict:
    clip_list = [
        {
            "id": c.id or str(c.index),
            "index": c.index,
            "label": c.label or c.filename,
            "description": c.description,
            "duration": round((c.end or 0.0) - (c.start or 0.0), 3),
            "has_transcript": c.transcript is not None,
        }
        for c in proj.clips
    ]
    audio_list = [
        {"id": a.id, "label": a.label or a.filename, "description": a.description, "duration": a.duration}
        for a in proj.audios
    ]
    image_list = [
        {"id": im.id, "label": im.label or im.filename, "description": im.description,
         "width": im.width, "height": im.height}
        for im in getattr(proj, "images", []) or []
    ]
    return {
        "clips": len(proj.clips),
        "audios": len(proj.audios),
        "images": len(getattr(proj, "images", []) or []),
        "transcripts": len(proj.transcripts),
        "clip_list": clip_list,
        "audio_list": audio_list,
        "image_list": image_list,
    }


def _format_dto(tl: Timeline | None) -> dict:
    w = tl.width if tl else 720
    h = tl.height if tl else 1280
    fps = tl.fps if tl else 30
    return {"aspect": aspect_ratio(w, h), "width": w, "height": h, "fps": fps}


def _lineage_root(c) -> str:
    return c.dup_of or c.id


def _dup_counts(clips) -> dict[str, int]:
    roots: dict[str, int] = {}
    for c in clips or []:
        root = _lineage_root(c)
        roots[root] = roots.get(root, 0) + 1
    return {c.id: max(0, roots.get(_lineage_root(c), 1) - 1) for c in (clips or [])}


def _clip_summary(c, dup_count: int = 0, track_kind: str | None = None) -> dict:
    """Resumen escaneable de un clip (sin words/keyframes; eso va en clip_detail)."""
    d = {
        "id": c.id,
        "track_id": c.track_id,
        "track_kind": track_kind or c.kind,
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
        "face_track_mode": getattr(c.reframe, "face_track_mode", None) if c.reframe else None,
        "asset_id": c.asset_id,
        "asset_kind": c.asset_kind,
        "asset_scope": c.asset_scope,
        "dup_of": c.dup_of,
        "dup_count": dup_count,
        "description": c.description,
        "trim": {
            "in_point": c.in_point,
            "out_point": c.out_point,
            "source_duration": c.source_duration,
        },
    }
    if c.kind in ("video", "audio"):
        d["volume"] = round(c.volume if c.volume is not None else 1.0, 3)
        d["has_audio_fx"] = bool(c.audio_fx)
    if c.kind == "text":
        d["text"] = c.text
        d["text_role"] = resolve_text_role(c)
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
    counts = _dup_counts(tl.clips)
    kinds_by_id = {t.id: t.kind for t in tl.tracks}
    return {
        "present": True,
        "format": _format_dto(tl),
        "tracks": [
            {"id": t.id, "kind": t.kind, "name": t.name,
             "hidden": t.hidden, "muted": t.muted, "locked": t.locked,
             "linked_track_id": t.linked_track_id}
            for t in tl.tracks
        ],
        "clips": [_clip_summary(c, counts.get(c.id, 0), kinds_by_id.get(c.track_id)) for c in tl.clips],
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
                "id": c.id or str(c.index),
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
                "description": a.description,
                "origin": a.origin,
                "source": a.source,
            }
            for a in proj.audios
        ],
        "images": [
            {
                "id": im.id,
                "filename": im.filename,
                "label": im.label,
                "description": im.description,
                "width": im.width,
                "height": im.height,
                "origin": im.origin,
                "source": im.source,
            }
            for im in getattr(proj, "images", []) or []
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


def analyze_dto(resp) -> dict:
    """Resultado de analyze_youtube: info del vídeo + tramos del heatmap."""
    return {
        "video": {
            "id": resp.video.id,
            "title": resp.video.title,
            "duration": resp.video.duration,
            "uploader": resp.video.uploader,
        },
        "has_heatmap": resp.has_heatmap,
        "segments": [
            {
                "index": s.index,
                "start": s.start,
                "end": s.end,
                "duration": s.duration,
                "score": round(s.score, 3),
            }
            for s in resp.segments
        ],
    }


def job_dto(job) -> dict:
    """Estado de un job + resumen del resultado según su tipo."""
    status = job.status.value if hasattr(job.status, "value") else job.status
    # Cancelación cooperativa: si se pidió cancelar y no llegó a 'done', se
    # reporta como 'cancelled' (aunque internamente acabe en error).
    if getattr(job, "cancel_requested", False) and status != "done":
        status = "cancelled"
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
    }
