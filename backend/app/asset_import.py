"""Importa un resultado de Explorar al almacenamiento local del proyecto."""
from __future__ import annotations

from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from . import images, projects, videos
from .schemas import ExploreItem

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
MAX_BYTES = 80 * 1024 * 1024
TIMEOUT = 45

_ALLOWED_SUFFIXES = (
    "pexels.com",
    "giphy.com",
    "vimeocdn.com",
    "vimeo.com",
)


def allowed_download_url(url: str) -> bool:
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    host = parsed.hostname or ""
    host = host.lower().lstrip("www.")
    return any(host == d or host.endswith("." + d) for d in _ALLOWED_SUFFIXES)


def _download(url: str) -> bytes:
    if not allowed_download_url(url):
        raise ValueError("La URL de descarga no es de Pexels o GIPHY.")
    req = Request(url, headers={"User-Agent": _UA, "Accept": "*/*"})
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            chunks: list[bytes] = []
            total = 0
            while True:
                piece = resp.read(64 * 1024)
                if not piece:
                    break
                total += len(piece)
                if total > MAX_BYTES:
                    raise ValueError("El archivo es demasiado grande.")
                chunks.append(piece)
            data = b"".join(chunks)
    except HTTPError as exc:
        raise ValueError(f"No se pudo descargar el material ({exc.code}).") from None
    except URLError:
        raise ValueError("No se pudo descargar el material.") from None
    except TimeoutError:
        raise ValueError("La descarga tardó demasiado.") from None
    if not data:
        raise ValueError("La descarga no devolvió datos.")
    return data


def _filename(item: ExploreItem) -> str:
    stem = (item.title or item.author or item.kind or "stock").strip() or "stock"
    if item.kind == "video":
        return f"{stem}.mp4"
    if item.kind == "gif":
        return f"{stem}.gif"
    return f"{stem}.jpg"


class AssetImportService:
    def import_item(self, project_id: str, item: ExploreItem):
        proj = projects.get_project(project_id)
        if proj is None:
            raise LookupError("Proyecto no encontrado.")
        kind = (item.kind or "").lower()
        if kind not in ("photo", "video", "gif"):
            raise ValueError("Tipo de material no válido.")
        data = _download(item.download_url)
        meta = dict(
            label=(item.title or item.author or None),
            description=item.title,
            origin=item.provider,
            source="external",
            provider=item.provider,
            external_id=str(item.external_id),
            source_url=item.source_url,
            author=item.author,
            license_info=item.license_info,
        )
        name = _filename(item)
        if kind == "video":
            info = videos.import_video(proj, name, data, **meta)
            return {"kind": "clips", "item": info.model_dump()}
        info = images.import_image(proj, name, data, keep_gif=(kind == "gif"), **{
            k: meta[k] for k in meta
            if k in ("label", "description", "origin", "source", "provider", "external_id", "source_url", "author", "license_info")
        })
        return {"kind": "images", "item": info.model_dump()}


asset_import = AssetImportService()
