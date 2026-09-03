"""Visión: darle OJOS a la IA + descripción de material.

``get_frame`` extrae un fotograma de un clip para que un modelo multimodal
lo VEA (el agente adjunta la imagen al modelo). ``set_clip_ai_description``
guarda la descripción que genera la IA en un campo aparte (``description_ai``),
sin pisar la descripción manual del usuario.
"""
from __future__ import annotations

import base64
import shutil
import subprocess
import tempfile
from pathlib import Path

from .. import projects, storage
from .registry import tool

MAX_FRAME_PX = 768


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def _clip_or_raise(proj, clip_index: str):
    c = next((c for c in proj.clips if str(c.index) == str(clip_index)), None)
    if c is None:
        raise ValueError(f"Clip no encontrado en el material: {clip_index}")
    return c


def _clip_file(proj, clip) -> Path:
    scope = getattr(clip, "asset_scope", None) or "project"
    path = (storage.resolve_library_media("video", clip.filename) if scope == "library"
            else storage.resolve_media(proj, "video", clip.filename))
    if path is None or not path.exists():
        raise ValueError("No se encuentra el archivo del clip.")
    return path


def get_frame(project_id: str, clip_index: str, at_time: float | None = None) -> dict:
    """Devuelve un fotograma (imagen) de un clip del material para que lo VEAS.

    ``at_time`` es el segundo dentro del clip (por defecto, el centro). Úsalo para
    entender/describir de qué va un clip antes de editarlo o etiquetarlo.
    """
    proj = _project_or_raise(project_id)
    clip = _clip_or_raise(proj, clip_index)
    path = _clip_file(proj, clip)
    dur = max(0.0, (clip.end or 0.0) - (clip.start or 0.0))
    t = dur / 2 if at_time is None else max(0.0, min(float(at_time), max(0.0, dur - 0.05)))

    exe = shutil.which("ffmpeg")
    if not exe:
        raise ValueError("ffmpeg no está disponible para extraer el fotograma.")
    tmp = Path(tempfile.gettempdir()) / f"videoyt_frame_{clip.index}_{int(t * 1000)}.jpg"
    cmd = [exe, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(path),
           "-frames:v", "1",
           "-vf", f"scale='min({MAX_FRAME_PX},iw)':'min({MAX_FRAME_PX},ih)':force_original_aspect_ratio=decrease",
           "-q:v", "4", str(tmp)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
            raise ValueError(f"No se pudo extraer el fotograma: {r.stderr[-200:]}")
        data = tmp.read_bytes()
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
    return {
        "clip_index": clip.index,
        "at_time": round(t, 2),
        "mime": "image/jpeg",
        # El agente detecta image_b64 y adjunta la imagen al modelo multimodal.
        "image_b64": base64.b64encode(data).decode("ascii"),
        "note": "fotograma del clip (imagen adjunta para que la veas)",
    }


def set_clip_ai_description(project_id: str, clip_index: str, description: str) -> dict:
    """Guarda una descripción generada por la IA para un clip, en un campo APARTE
    (``description_ai``). NO toca la descripción manual del usuario."""
    _project_or_raise(project_id)
    item = projects.update_material(project_id, "clips", str(clip_index),
                                    {"description_ai": (description or "").strip()})
    if item is None:
        raise ValueError(f"Clip no encontrado: {clip_index}")
    return {"ok": True, "clip_index": int(clip_index) if str(clip_index).isdigit() else clip_index,
            "description_ai": item.get("description_ai")}


def register(mcp) -> None:
    tool(mcp, access="read")(get_frame)
    tool(mcp, access="write")(set_clip_ai_description)
