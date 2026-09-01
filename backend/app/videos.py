"""Importar un vídeo local al proyecto como material de vídeo."""
from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import quote

from . import projects, storage
from .schemas import AudioInfo, ClipInfo
from .youtube_audio import probe_duration

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mp4v", ".mpg", ".mpeg", ".wmv", ".flv"}


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _next_index(project) -> int:
    existing = [int(getattr(c, "index", 0) or 0) for c in (getattr(project, "clips", None) or [])]
    return max([*existing, 99999]) + 1


def import_video(project, filename: str, data: bytes) -> ClipInfo:
    ext = Path(filename or "").suffix.lower()
    if ext not in VIDEO_EXTS:
        raise ValueError("Formato de vídeo no válido. Usa MP4, MOV, MKV, WEBM…")
    if not data:
        raise ValueError("Archivo vacío.")

    storage.ensure_dirs(storage.project_base(project))
    ident = _new_id()
    stem = storage.safe_name(Path(filename).stem)
    dest_name = f"{stem}_{ident}{ext}"
    dest = storage.resolve_media(project, "video", dest_name)
    if dest is None:
        raise ValueError("No se pudo guardar el vídeo.")
    dest.write_bytes(data)

    try:
        duration = float(probe_duration(dest))
    except Exception:
        duration = 0.0

    info = ClipInfo(
        index=_next_index(project),
        filename=dest_name,
        url=f"/api/media/{project.id}/video/{quote(dest_name)}",
        start=0.0,
        end=duration,
        source_url=None,
        label=Path(filename).stem,
        origin="import",
        source="external",
    )
    projects.add_clips(project.id, [info])
    return info


AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".wma"}


def import_audio(project, filename: str, data: bytes) -> AudioInfo:
    ext = Path(filename or "").suffix.lower()
    if ext not in AUDIO_EXTS:
        raise ValueError("Formato de audio no válido. Usa MP3, WAV, M4A…")
    if not data:
        raise ValueError("Archivo vacío.")

    storage.ensure_dirs(storage.project_base(project))
    ident = _new_id()
    stem = storage.safe_name(Path(filename).stem)
    dest_name = f"{stem}_{ident}{ext}"
    dest = storage.resolve_media(project, "audio", dest_name)
    if dest is None:
        raise ValueError("No se pudo guardar el audio.")
    dest.write_bytes(data)

    try:
        duration = float(probe_duration(dest))
    except Exception:
        duration = 0.0

    info = AudioInfo(
        id=ident,
        filename=dest_name,
        url=f"/api/media/{project.id}/audio/{quote(dest_name)}",
        duration=duration,
        label=Path(filename).stem,
        origin="import",
        source="external",
    )
    projects.add_audio(project.id, info)
    return info

