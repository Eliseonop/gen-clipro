"""Preparación del editor de reencuadre (auto-tracking + keyframes manuales).

Flujo:
  1. Descargar un *proxy* ligero (<=480p) SOLO del tramo a editar, con yt-dlp
     (``download_ranges``). Se cachea en ``backend/data/proxies/<key>.mp4`` y se
     sirve al navegador para poder arrastrar la caja sobre fotogramas reales.
  2. Pasar el detector de caras (YuNet) por el proxy → un ``track`` de posiciones.
  3. Sembrar unos pocos keyframes a partir del track (el usuario los corrige).

El render final (clipper) reusa estos keyframes con un recorte en movimiento.
"""
from __future__ import annotations

import hashlib
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable

from . import config, detect
from .schemas import Keyframe, ReframePrep, TrackPoint

ProgressCb = Callable[[float, str], None]

PROXY_DIR = config.DATA_DIR / "proxies"
PROXY_DIR.mkdir(exist_ok=True)


def _key(url: str, start: float, end: float) -> str:
    raw = f"{url}|{round(start, 2)}|{round(end, 2)}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def proxy_path(key: str) -> Path | None:
    """Ruta del proxy cacheado (validando que ``key`` sea uno de los nuestros)."""
    if not key or not all(c in "0123456789abcdef" for c in key):
        return None
    p = PROXY_DIR / f"{key}.mp4"
    return p if p.exists() else None


def _download_proxy(url: str, start: float, end: float, key: str, on_progress: ProgressCb) -> Path:
    """Descarga un proxy <=480p del tramo [start, end] y lo deja en <key>.mp4."""
    from yt_dlp.utils import download_range_func

    from . import ytdlp

    out = PROXY_DIR / f"{key}.mp4"
    outtmpl = str(PROXY_DIR / f"{key}.%(ext)s")

    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes") or 0
            frac = (done / total) if total else 0.0
            on_progress(0.5 * frac, "Descargando previsualización…")

    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestvideo[height<=480]+bestaudio/best[height<=480]/best",
        "merge_output_format": "mp4",
        "outtmpl": outtmpl,
        "download_ranges": download_range_func(None, [(start, end)]),
        "force_keyframes_at_cuts": True,
        "progress_hooks": [hook],
    }

    ytdlp.call(opts, lambda ydl: ydl.download([url]))

    if out.exists():
        return out
    # Por si el contenedor final no fuese .mp4: coger lo que haya con ese prefijo.
    for f in PROXY_DIR.glob(f"{key}.*"):
        return f
    raise RuntimeError("No se pudo descargar la previsualización del tramo.")


def _local_media_path(url: str) -> Path | None:
    from . import storage
    return storage.try_local_media(url)


def _ffmpeg_proxy(src: Path, start: float, end: float, key: str, on_progress: ProgressCb) -> Path:
    """Recorta un archivo local a un proxy ligero para el editor."""
    out = PROXY_DIR / f"{key}.mp4"
    on_progress(0.08, "Recortando previsualización con FFmpeg…")
    stop = threading.Event()
    t0 = time.monotonic()

    def pulse() -> None:
        while not stop.wait(1.2):
            secs = int(time.monotonic() - t0)
            on_progress(
                min(0.45, 0.08 + secs * 0.012),
                f"Recortando previsualización… {secs}s (FFmpeg, no está colgado)",
            )

    th = threading.Thread(target=pulse, daemon=True)
    th.start()
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-to", str(end),
        "-i", str(src),
        "-vf", "scale=-2:480",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "28",
        "-an",
        str(out),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True)
    finally:
        stop.set()
    if proc.returncode != 0 or not out.exists():
        raise RuntimeError(f"No se pudo preparar la previsualización:\n{(proc.stderr or '')[-600:]}")
    on_progress(0.48, "Previsualización lista.")
    return out


def _seed_keyframes(track: list[dict], duration: float) -> list[Keyframe]:
    """Convierte el track denso en unos pocos keyframes espaciados en el tiempo."""
    if not track:
        return [Keyframe(t=0.0, cx=0.5, cy=0.5)]
    interval = max(1.0, duration / 8.0)   # como mucho ~8-9 keyframes semilla
    out: list[Keyframe] = []
    last = -1e9
    for p in track:
        if not out or p["t"] - last >= interval:
            out.append(Keyframe(t=p["t"], cx=p["cx"], cy=p["cy"]))
            last = p["t"]
    if track and out[-1].t < track[-1]["t"] - 0.01:
        p = track[-1]
        out.append(Keyframe(t=p["t"], cx=p["cx"], cy=p["cy"]))
    return out


def prepare(url: str, start: float, end: float, samples: int, on_progress: ProgressCb,
            track_faces: bool = True) -> ReframePrep:
    """Descarga (o reusa) el proxy; el tracking de caras es opcional."""
    key = _key(url, start, end)
    proxy = proxy_path(key)
    if proxy is None:
        on_progress(0.04, "No hay previsualización en caché. Generándola…")
        local = _local_media_path(url)
        if local is not None:
            proxy = _ffmpeg_proxy(local, start, end, key, on_progress)
        else:
            proxy = _download_proxy(url, start, end, key, on_progress)
    else:
        on_progress(0.45, "Usando previsualización en caché…")

    if track_faces:
        on_progress(0.5, "Analizando caras en el tramo…")
        info = detect.face_track(proxy, samples=samples, on_progress=on_progress)
        keyframes = _seed_keyframes(info["track"], info["duration"])
    else:
        on_progress(0.85, "Previsualización lista.")
        info = detect.video_info(proxy)
        keyframes = []

    return ReframePrep(
        proxy_url=f"/api/reframe/proxy/{key}",
        duration=info["duration"],
        width=info["width"],
        height=info["height"],
        fps=info["fps"],
        track=[TrackPoint(**p) for p in info["track"]],
        keyframes=keyframes,
    )
