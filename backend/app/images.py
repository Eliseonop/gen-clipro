"""Importar imágenes al proyecto como PNG de trabajo (listo para alpha / quitar fondo)."""
from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import quote

from . import projects, storage
from .schemas import ImageInfo

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif"}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def probe_size(path: Path) -> tuple[int | None, int | None]:
    try:
        import cv2
        img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
        if img is None:
            return None, None
        h, w = img.shape[:2]
        return int(w), int(h)
    except Exception:
        return None, None


def to_working_png(filename: str, data: bytes) -> bytes:
    """Devuelve bytes PNG. Si ya es PNG, no reencoda (conserva alpha)."""
    if data.startswith(PNG_MAGIC):
        return data
    try:
        import cv2
        import numpy as np
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError("unreadable")
        ok, buf = cv2.imencode(".png", img)
        if not ok:
            raise ValueError("encode")
        return bytes(buf)
    except ValueError:
        raise ValueError("No se pudo leer la imagen. Usa PNG, JPG, WebP o GIF.") from None
    except Exception:
        raise ValueError("No se pudo leer la imagen. Usa PNG, JPG, WebP o GIF.") from None


def import_image(project, filename: str, data: bytes) -> ImageInfo:
    """Guarda la imagen como PNG de trabajo en ``image/`` y la registra."""
    ext = Path(filename or "").suffix.lower()
    if ext not in IMAGE_EXTS:
        raise ValueError("Formato no válido. Usa PNG, JPG, WebP o GIF.")
    if not data:
        raise ValueError("Archivo vacío.")
    png = to_working_png(filename, data)
    storage.ensure_dirs(storage.project_base(project))
    ident = _new_id()
    stem = storage.safe_name(Path(filename).stem)
    dest_name = f"{stem}_{ident}.png"
    dest = storage.resolve_media(project, "image", dest_name)
    if dest is None:
        raise ValueError("No se pudo guardar la imagen.")
    dest.write_bytes(png)
    w, h = probe_size(dest)
    info = ImageInfo(
        id=ident,
        filename=dest_name,
        url=f"/api/media/{project.id}/image/{quote(dest_name)}",
        width=w,
        height=h,
        label=Path(filename).stem,
        origin="upload",
        source="external",
    )
    projects.add_image(project.id, info)
    return info
