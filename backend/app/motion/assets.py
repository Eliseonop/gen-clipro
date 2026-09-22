"""Imágenes del proyecto dentro de composiciones (``asset:image/<id>``).

Los bloques html de una escena referencian imágenes del material como
``asset:image/<id>``. Al generar el HTML se incrustan como data URI REDUCIDO
(``window.__ASSETS``) para que el preview (iframe srcdoc), el ``__rebuild`` en
vivo y el render Playwright (``set_content``, sin origen ni red) vean lo mismo.
La composición guardada solo lleva la referencia, no los bytes.
"""
from __future__ import annotations

import base64
import io
import logging
import re
from functools import lru_cache

from .models import MotionComposition

log = logging.getLogger(__name__)

ASSET_RE = re.compile(r"asset:image/([A-Za-z0-9_.-]+)")
MAX_SIDE = 1400          # px del lado largo tras reducir
JPEG_QUALITY = 84


def referenced_ids(comp: MotionComposition) -> list[str]:
    ids: list[str] = []
    for layer in comp.layers:
        for text in (layer.html, layer.css, layer.content if layer.type == "image" else None):
            for m in ASSET_RE.finditer(text or ""):
                if m.group(1) not in ids:
                    ids.append(m.group(1))
    return ids


def image_path(project_id: str, image_id: str):
    from .. import projects, storage
    if image_id.startswith("lib_"):   # imagen guardada en la biblioteca
        from .. import library
        item = next((x for x in library.list_library().get("images") or [] if x.get("id") == image_id), None)
        return storage.resolve_library_media("image", item["filename"]) if item else None
    proj = projects.get_project(project_id)
    if proj is None:
        return None
    for im in proj.images or []:
        if im.id == image_id:
            return storage.resolve_media(proj, "image", im.filename)
    return None


@lru_cache(maxsize=64)
def _data_uri(path_str: str, mtime: float, max_side: int) -> str | None:
    from PIL import Image
    try:
        with Image.open(path_str) as im:
            im.load()
            has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            im = im.convert("RGBA" if has_alpha else "RGB")
            im.thumbnail((max_side, max_side))
            buf = io.BytesIO()
            if has_alpha:
                im.save(buf, "PNG", optimize=True)
                mime = "image/png"
            else:
                im.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
                mime = "image/jpeg"
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo incrustar la imagen %s: %s", path_str, exc)
        return None
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def data_uri_for(project_id: str, image_id: str, max_side: int = MAX_SIDE) -> str | None:
    path = image_path(project_id, image_id)
    if path is None or not path.exists():
        return None
    return _data_uri(str(path), path.stat().st_mtime, max_side)


def embedded_assets(comp: MotionComposition) -> dict[str, str]:
    """``{id: data_uri}`` de las imágenes referenciadas.

    Sin ``project_id`` solo se resuelven las de la Biblioteca (``lib_…``), que no
    dependen del proyecto: así se ven en la galería las plantillas guardadas."""
    pid = (comp.metadata or {}).get("project_id") or ""
    out: dict[str, str] = {}
    for iid in referenced_ids(comp):
        if not pid and not iid.startswith("lib_"):
            continue
        uri = data_uri_for(pid, iid)
        if uri:
            out[iid] = uri
    return out
