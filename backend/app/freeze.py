"""Congelar fotograma (#11): una imagen fija del fotograma de un clip de vídeo.

El editor parte el clip en el cabezal e inserta esta imagen con la misma pose,
recorte y efectos (``frontend/src/lib/freezeFrame.js``). La imagen se saca a la
resolución NATIVA del material (así su transformación es la misma que la del
vídeo: 1 px de fuente = 1 px de fuente) y con el mismo tratamiento de color que el
export: un vídeo sin etiqueta de color se interpreta como BT.709
(``compose.ASSUME_BT709_FILTER``), si no el fotograma congelado cambiaría de tono
respecto al vídeo que lo rodea.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from .schemas import ImageInfo, Project, TimelineClip

FREEZE_DUR = 3.0   # duración por defecto del fotograma congelado (como CapCut)


def extract_still(path: Path, at_time: float, *, untagged: bool = False) -> bytes:
    """PNG (bytes) del fotograma en ``at_time`` (s del archivo) a resolución nativa."""
    exe = shutil.which("ffmpeg")
    if not exe:
        raise ValueError("ffmpeg no está disponible para congelar el fotograma.")
    from .compose import ASSUME_BT709_FILTER

    t = max(0.0, float(at_time))
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "still.png"
        vf = f"{ASSUME_BT709_FILTER},format=rgb24" if untagged else "format=rgb24"
        cmd = [exe, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(path),
               "-frames:v", "1", "-vf", vf, str(out)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if r.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            # Pasado el último fotograma, FFmpeg no devuelve nada: el último que haya.
            cmd = [exe, "-y", "-hide_banner", "-loglevel", "error", "-sseof", "-0.2", "-i", str(path),
                   "-update", "1", "-vf", vf, str(out)]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if r.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            raise ValueError(f"No se pudo extraer el fotograma: {(r.stderr or '')[-200:]}")
        return out.read_bytes()


def freeze_frame_image(project: Project, clip: TimelineClip, src_time: float) -> ImageInfo:
    """Guarda como imagen del proyecto el fotograma ``src_time`` (s del archivo) del
    material de ``clip`` y la devuelve."""
    if clip.kind != "video":
        raise ValueError("Solo se puede congelar un fotograma de un clip de vídeo.")
    from . import compose, images

    path = compose._clip_path(project, clip)
    if path is None or not path.exists():
        raise ValueError("No se encuentra el archivo del clip.")
    t = min(max(float(src_time), 0.0), max(0.0, float(clip.source_duration or src_time)))
    data = extract_still(path, t, untagged=compose._color_untagged(path))
    name = f"{Path(clip.filename or 'clip').stem}_congelado_{t:.2f}s.png"
    label = f"{clip.name or Path(clip.filename or 'clip').stem} · congelado {t:.2f}s"
    return images.import_image(project, name, data, label=label, origin="freeze", source="generated")
