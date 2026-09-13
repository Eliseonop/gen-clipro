"""Extracción de fotogramas y montage (compartido).

Sacado de ``mcp_server/tools_vision.get_frame`` para reutilizarlo desde la capa
de "Generar Motion" (``motion_segment_frames``): dar OJOS a la IA sobre lo que
se ve en un tramo de la timeline, no solo sobre un clip del material.
"""
from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
from pathlib import Path

MAX_FRAME_PX = 768
MONTAGE_MAX_PX = 1024


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def extract_frame(path: Path, at_time: float, *, max_px: int = MAX_FRAME_PX) -> bytes:
    """Devuelve un JPEG (bytes) del fotograma en ``at_time`` (s) del archivo dado.

    Escala manteniendo el aspecto para que el lado mayor no supere ``max_px``.
    Lanza ``ValueError`` si ffmpeg no está o falla la extracción.
    """
    exe = shutil.which("ffmpeg")
    if not exe:
        raise ValueError("ffmpeg no está disponible para extraer el fotograma.")
    t = max(0.0, float(at_time))
    tmp = Path(tempfile.gettempdir()) / f"videoyt_grab_{abs(hash((str(path), int(t * 1000)))) & 0xFFFFFFFF:x}.jpg"
    cmd = [exe, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(path),
           "-frames:v", "1",
           "-vf", f"scale='min({max_px},iw)':'min({max_px},ih)':force_original_aspect_ratio=decrease",
           "-q:v", "4", str(tmp)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
            raise ValueError(f"No se pudo extraer el fotograma: {r.stderr[-200:]}")
        return tmp.read_bytes()
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass


def montage_jpeg(frames: list[bytes], *, max_px: int = MONTAGE_MAX_PX, bg: str = "#12151c") -> bytes:
    """Compone varios JPEG/PNG en una rejilla (1–3 columnas) sobre ``bg`` y escala."""
    from PIL import Image

    tiles = [Image.open(io.BytesIO(raw)).convert("RGB") for raw in frames if raw]
    if not tiles:
        raise ValueError("No se capturó ningún fotograma.")
    # Uniformar tamaño al primero para una rejilla limpia.
    tw, th = tiles[0].size
    tiles = [t if t.size == (tw, th) else t.resize((tw, th), Image.LANCZOS) for t in tiles]

    cols = 1 if len(tiles) == 1 else (2 if len(tiles) <= 4 else 3)
    rows = (len(tiles) + cols - 1) // cols
    gap = max(4, tw // 120)
    sheet = Image.new("RGB", (cols * tw + (cols - 1) * gap, rows * th + (rows - 1) * gap), bg)
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet.paste(t, (c * (tw + gap), r * (th + gap)))

    w, h = sheet.size
    scale = min(1.0, max_px / max(w, h))
    if scale < 1.0:
        sheet = sheet.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    sheet.save(buf, format="JPEG", quality=82)
    return buf.getvalue()
