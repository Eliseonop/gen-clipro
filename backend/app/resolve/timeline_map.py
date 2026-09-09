"""Mapea el timeline de video-yt a items FCPXML (vídeo/audio con rutas absolutas).

Depende de video-yt (``storage``/``config``) para localizar los archivos de medio
de cada clip. Resuelve rutas por varias ubicaciones conocidas y **omite** los
clips cuyo archivo no encuentra (para no romper la importación), devolviendo
avisos legibles.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.resolve.fcpxml import FcpItem


def _as_dict(obj: Any) -> dict:
    if isinstance(obj, dict):
        return obj
    for attr in ("model_dump", "dict"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                return fn()
            except TypeError:
                return fn(mode="python")
    return dict(getattr(obj, "__dict__", {}) or {})


def _candidate_paths(project, kind: str, filename: str) -> list[Path]:
    """Rutas posibles del archivo de un clip, por orden de probabilidad."""
    from app import config, storage

    out: list[Path] = []
    if not filename:
        return out
    kind_dir = "video" if kind == "video" else "audio" if kind == "audio" else "image"
    p = storage.resolve_media(project, kind_dir, filename)
    if p:
        out.append(p)
    base = storage.project_base(project)
    out.append(base / filename)
    out.append(base / kind_dir / filename)
    out.append(config.OUTPUT_DIR / project.id / filename)
    out.append(config.OUTPUT_DIR / project.id / kind_dir / filename)
    return out


def _resolve_path(project, kind: str, filename: str) -> Path | None:
    for cand in _candidate_paths(project, kind, filename):
        try:
            if cand and cand.exists():
                return cand
        except OSError:
            continue
    return None


def items_from_timeline(project, timeline: Any) -> tuple[list[FcpItem], list[str]]:
    """Convierte los clips de vídeo/audio del timeline en ``FcpItem`` con lanes.

    Vídeo en lanes positivos (V1=1, V2=2…), audio en negativos (A1=-1, A2=-2…),
    según el orden de las pistas. Los clips de texto/forma se ignoran (los
    subtítulos van por caption/SRT/Fusion).
    """
    tl = _as_dict(timeline)
    tracks = tl.get("tracks", []) or []
    clips = tl.get("clips", []) or []

    # Asigna un lane a cada pista.
    lane_of: dict[str, int] = {}
    v = 0
    a = 0
    for tr in tracks:
        td = _as_dict(tr)
        tid = td.get("id")
        kind = td.get("kind")
        if kind == "video":
            v += 1
            lane_of[tid] = v
        elif kind == "audio":
            a += 1
            lane_of[tid] = -a
        # las pistas de texto no entran como asset-clip

    items: list[FcpItem] = []
    warnings: list[str] = []
    for c in clips:
        cd = _as_dict(c)
        kind = cd.get("kind")
        if kind not in ("video", "audio"):
            continue
        tid = cd.get("track_id")
        lane = lane_of.get(tid)
        if lane is None:
            continue
        filename = cd.get("filename") or ""
        path = _resolve_path(project, kind, filename)
        if path is None:
            warnings.append(f"No se encontró el medio de «{cd.get('name') or filename}» — omitido.")
            continue
        in_p = float(cd.get("in_point") or 0.0)
        out_p = float(cd.get("out_point") or 0.0)
        speed = float(cd.get("speed") or 1.0) or 1.0
        src_dur = float(cd.get("source_duration") or 0.0)
        span = max(0.04, (out_p - in_p) / speed) if out_p > in_p else max(0.04, src_dur)
        items.append(FcpItem(
            path=str(path),
            kind=kind,
            offset=float(cd.get("start") or 0.0),
            duration=span,
            src_in=in_p,
            src_duration=src_dur or span,
            lane=lane,
            name=str(cd.get("name") or Path(filename).stem or kind),
        ))
    return items, warnings
