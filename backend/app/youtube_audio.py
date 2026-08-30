"""Extraer el audio de un vídeo de YouTube (yt-dlp + ffmpeg → m4a)."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, urlparse

from . import config

ProgressCb = Callable[[float, str], None]


def is_youtube_url(url: str) -> bool:
    raw = (url or "").strip()
    if not raw:
        return False
    if "://" not in raw:
        raw = "https://" + raw
    try:
        host = (urlparse(raw).hostname or "").lower()
    except Exception:
        return False
    if host.startswith("www."):
        host = host[4:]
    return host in ("youtube.com", "youtu.be", "m.youtube.com") or host.endswith(".youtube.com")


def youtube_id_from_url(url: str) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = "https://" + raw
    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    host = (parsed.hostname or "").lower()
    if host.endswith("youtu.be"):
        vid = parsed.path.strip("/").split("/")[0]
        return vid or None
    qs = parse_qs(parsed.query)
    if qs.get("v"):
        return qs["v"][0] or None
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 2 and parts[0] in ("shorts", "live", "embed"):
        return parts[1]
    return None


def probe_duration(path: Path) -> float:
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        return round(float((proc.stdout or "0").strip() or 0), 3)
    except Exception:
        return 0.0


def extract_audio(url: str, out_path: Path, on_progress: ProgressCb) -> dict:
    """Descarga el audio del vídeo y lo deja en ``out_path`` (m4a)."""
    from . import heatmap, transcribe, ytdlp

    on_progress(0.02, "Obteniendo info…")
    info: dict = {}
    try:
        info = heatmap._extract_info(url) or {}
    except Exception:
        info = {}
    title = (info.get("title") or "").strip()
    video_id = info.get("id") or youtube_id_from_url(url) or ""

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        raw = transcribe._download_audio(
            url, Path(tmp), lambda frac, msg: on_progress(0.05 + 0.7 * frac, msg),
        )
        on_progress(0.8, "Convirtiendo audio…")
        cmd = [
            "ffmpeg", "-y", "-i", str(raw), "-vn",
            "-c:a", "aac", "-b:a", config.AUDIO_BITRATE,
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not out_path.exists():
            raise RuntimeError(ytdlp.friendly_error(RuntimeError(
                (proc.stderr or "FFmpeg no pudo extraer el audio.")[-800:]
            )))

    duration = probe_duration(out_path)
    on_progress(0.98, "Audio listo.")
    return {"duration": duration, "title": title, "video_id": video_id}
