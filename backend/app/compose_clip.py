"""Genera un clip 9:16 combinando hasta 2 capas (fuentes distintas o la misma)."""
from __future__ import annotations

import hashlib
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Callable
from urllib.parse import quote, unquote

from . import clipper, config, projects, storage
from .compose_layout import slot_pixels
from .schemas import ClipInfo, CompLayer, Keyframe

ProgressCb = Callable[[float, str], None]

_MEDIA_RE = re.compile(r"/api/media/([^/]+)/(video|audio)/(.+)$")


def resolve_local_media(url: str) -> Path:
    m = _MEDIA_RE.search(url or "")
    if not m:
        raise RuntimeError(f"URL de material no reconocida: {url}")
    pid, kind, filename = m.group(1), m.group(2), unquote(m.group(3))
    proj = projects.get_project(pid)
    if proj is None:
        raise RuntimeError("Proyecto no encontrado para el material.")
    path = storage.resolve_media(proj, kind, filename)
    if path is None or not path.exists():
        raise RuntimeError(f"No se encontró el archivo {filename}.")
    return path


def is_http_url(url: str) -> bool:
    u = (url or "").lower()
    return u.startswith("http://") or u.startswith("https://")


def resolve_layer_source(url: str, tmp_dir: Path, cache: dict[str, Path],
                         on_progress: ProgressCb) -> Path:
    if url in cache:
        return cache[url]
    if is_http_url(url):
        sub = tmp_dir / hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
        sub.mkdir(parents=True, exist_ok=True)
        cache[url] = clipper._download_source(url, sub, on_progress)
    else:
        cache[url] = resolve_local_media(url)
    return cache[url]


def _filter_graph(layers: list[CompLayer], sources: list[Path], out_dur: float) -> str:
    W, H = config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT
    parts = [f"color=c=black:s={W}x{H}:d={out_dur:.3f}:r=30,format=yuv420p[bg]"]
    for i, layer in enumerate(layers):
        x, y, w, h = slot_pixels(layer.slot, i, layer.custom_rect)
        crop = clipper._single_reframe_filter(
            sources[i], layer.zoom, layer.keyframes or [Keyframe(t=0, cx=0.5, cy=0.5)],
            layer.pan_mode or "smooth", w, h,
        )
        layer_dur = max(0.1, layer.end - layer.start)
        delay = max(0.0, float(layer.delay or 0))
        pad_end = max(0.0, out_dur - delay - layer_dur)
        tpad = ""
        if delay > 0.02:
            tpad += f",tpad=start_mode=add:start_duration={delay:.3f}"
        if pad_end > 0.05:
            tpad += f",tpad=stop_mode=clone:stop_duration={pad_end:.3f}"
        parts.append(f"[{i}:v]{crop}{tpad},setsar=1,format=yuv420p[v{i}]")

    last = "bg"
    n = len(layers)
    for i, layer in enumerate(layers):
        x, y, w, h = slot_pixels(layer.slot, i, layer.custom_rect)
        nxt = "vout" if i == n - 1 else f"s{i}"
        layer_dur = max(0.1, layer.end - layer.start)
        delay = max(0.0, float(layer.delay or 0))
        enable = f":enable='between(t,{delay:.3f},{delay + layer_dur:.3f})'"
        parts.append(f"[{last}][v{i}]overlay={x}:{y}:eof_action=pass{enable}[{nxt}]")
        last = nxt
    return ";".join(parts)


def generate_composition(
    project_id: str,
    layers: list[CompLayer],
    label: str | None,
    description: str | None,
    index: int,
    video_dir: Path,
    on_progress: ProgressCb,
) -> ClipInfo:
    if not layers or len(layers) > 8:
        raise RuntimeError("La composición admite entre 1 y 8 capas.")
    for layer in layers:
        if layer.end - layer.start < 0.3:
            raise RuntimeError("Una de las capas es demasiado corta.")

    out_dur = max((layer.delay or 0) + (layer.end - layer.start) for layer in layers)
    cache: dict[str, Path] = {}
    video_dir.mkdir(parents=True, exist_ok=True)
    prefix = storage.safe_name(label or "clip")
    filename = f"{prefix}_{index}.mp4"
    out_path = video_dir / filename

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        sources: list[Path] = []
        n = len(layers)
        for i, layer in enumerate(layers):
            on_progress(0.05 + 0.35 * (i / max(1, n)), f"Preparando fuente {i + 1}/{n}…")
            sources.append(resolve_layer_source(layer.url, tmp_dir, cache, on_progress))

        on_progress(0.45, "Componiendo clip…")
        filt = _filter_graph(layers, sources, out_dur)
        cmd = ["ffmpeg", "-y"]
        for layer, src in zip(layers, sources):
            dur = max(0.1, layer.end - layer.start)
            cmd += ["-ss", str(layer.start), "-t", str(dur), "-i", str(src)]
        cmd += [
            "-filter_complex", filt,
            "-map", "[vout]",
            "-map", "0:a?",
            "-t", f"{out_dur:.3f}",
            "-c:v", "libx264",
            "-crf", str(config.VIDEO_CRF),
            "-preset", config.VIDEO_PRESET,
            "-c:a", "aac",
            "-b:a", config.AUDIO_BITRATE,
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            # Reintento sin audio si la primera fuente no tiene pista.
            cmd_no_a = ["ffmpeg", "-y"]
            for layer, src in zip(layers, sources):
                dur = max(0.1, layer.end - layer.start)
                cmd_no_a += ["-ss", str(layer.start), "-t", str(dur), "-i", str(src)]
            cmd_no_a += [
                "-filter_complex", filt,
                "-map", "[vout]",
                "-t", f"{out_dur:.3f}",
                "-c:v", "libx264",
                "-crf", str(config.VIDEO_CRF),
                "-preset", config.VIDEO_PRESET,
                "-an",
                str(out_path),
            ]
            proc2 = subprocess.run(cmd_no_a, capture_output=True, text=True)
            if proc2.returncode != 0:
                raise RuntimeError(f"FFmpeg falló al componer:\n{(proc.stderr or proc2.stderr)[-800:]}")

    first_http = next((L.url for L in layers if is_http_url(L.url)), None)
    on_progress(1.0, "Clip compuesto.")
    return ClipInfo(
        index=index,
        filename=filename,
        url=f"/api/media/{project_id}/video/{quote(filename)}",
        start=0.0,
        end=round(out_dur, 2),
        source_url=first_http,
        label=label,
        description=description,
        reframe=None,
    )
