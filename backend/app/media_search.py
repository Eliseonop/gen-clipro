"""Búsqueda de material externo (Pexels + GIPHY) para la pestaña Explorar."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from . import settings

PEXELS_PHOTOS = "https://api.pexels.com/v1/search"
PEXELS_VIDEOS = "https://api.pexels.com/videos/search"
GIPHY_SEARCH = "https://api.giphy.com/v1/gifs/search"

_UA = "Mozilla/5.0 (compatible; video-yt/1.0)"
_TIMEOUT = 12
_PER_PAGE = 24

LICENSE = {
    "pexels": "Licencia Pexels (uso libre, atribución recomendada)",
    "giphy": "Contenido GIPHY (consulta sus términos de uso)",
}


def _fetch_json(url: str, headers: dict | None = None, timeout: float = _TIMEOUT) -> dict:
    req = Request(url, headers={"User-Agent": _UA, "Accept": "application/json", **(headers or {})})
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except HTTPError as exc:
        raise ValueError(f"Error {exc.code} al consultar la API.") from None
    except URLError:
        raise ValueError("No se pudo conectar con la fuente.") from None
    except TimeoutError:
        raise ValueError("La búsqueda tardó demasiado.") from None
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        raise ValueError("La fuente devolvió una respuesta inválida.") from None
    if not isinstance(data, dict):
        raise ValueError("La fuente devolvió una respuesta inválida.")
    return data


def _num(v, default=None):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    return n


def _int(v, default=None):
    n = _num(v, default)
    return int(n) if n is not None else default


def pick_video_preview(files: list[dict] | None) -> str | None:
    """MP4 más ligero para hover (no el master)."""
    mp4s = [f for f in (files or []) if f.get("link") and "mp4" in str(f.get("file_type") or "mp4").lower()]
    if not mp4s:
        mp4s = [f for f in (files or []) if f.get("link")]
    if not mp4s:
        return None
    return min(mp4s, key=lambda f: _int(f.get("width"), 99999) or 99999).get("link")


def pick_video_download(files: list[dict] | None) -> str | None:
    """MP4 de calidad usable (HD ≤ 1920), no 4K."""
    mp4s = [f for f in (files or []) if f.get("link") and "mp4" in str(f.get("file_type") or "mp4").lower()]
    if not mp4s:
        mp4s = [f for f in (files or []) if f.get("link")]
    if not mp4s:
        return None
    hd = [f for f in mp4s if str(f.get("quality") or "").lower() == "hd" and (_int(f.get("width"), 0) or 0) <= 1920]
    if hd:
        return max(hd, key=lambda f: _int(f.get("width"), 0) or 0).get("link")
    under = [f for f in mp4s if (_int(f.get("width"), 0) or 0) <= 1920]
    pool = under or mp4s
    return max(pool, key=lambda f: _int(f.get("width"), 0) or 0).get("link")


def map_pexels_photo(photo: dict) -> dict | None:
    pid = str(photo.get("id") or "")
    src = photo.get("src") if isinstance(photo.get("src"), dict) else {}
    download = src.get("original") or src.get("large2x") or src.get("large")
    if not pid or not download:
        return None
    thumb = src.get("medium") or src.get("large") or src.get("tiny") or download
    return {
        "id": f"pexels:photo:{pid}",
        "provider": "pexels",
        "external_id": pid,
        "kind": "photo",
        "title": (photo.get("alt") or "").strip() or None,
        "thumb_url": thumb,
        "preview_url": None,
        "download_url": download,
        "width": _int(photo.get("width")),
        "height": _int(photo.get("height")),
        "duration": None,
        "author": (photo.get("photographer") or "").strip() or None,
        "source_url": photo.get("url") or f"https://www.pexels.com/photo/{pid}/",
        "license_info": LICENSE["pexels"],
    }


def map_pexels_video(video: dict) -> dict | None:
    vid = str(video.get("id") or "")
    files = video.get("video_files") if isinstance(video.get("video_files"), list) else []
    download = pick_video_download(files)
    if not vid or not download:
        return None
    user = video.get("user") if isinstance(video.get("user"), dict) else {}
    return {
        "id": f"pexels:video:{vid}",
        "provider": "pexels",
        "external_id": vid,
        "kind": "video",
        "title": (video.get("url") or "").rstrip("/").split("/")[-1].replace("-", " ") or None,
        "thumb_url": video.get("image"),
        "preview_url": pick_video_preview(files),
        "download_url": download,
        "width": _int(video.get("width")),
        "height": _int(video.get("height")),
        "duration": _num(video.get("duration")),
        "author": (user.get("name") or "").strip() or None,
        "source_url": video.get("url") or f"https://www.pexels.com/video/{vid}/",
        "license_info": LICENSE["pexels"],
    }


def map_giphy_gif(gif: dict) -> dict | None:
    gid = str(gif.get("id") or "")
    images = gif.get("images") if isinstance(gif.get("images"), dict) else {}
    original = images.get("original") if isinstance(images.get("original"), dict) else {}
    preview = images.get("preview_gif") if isinstance(images.get("preview_gif"), dict) else {}
    still = images.get("original_still") if isinstance(images.get("original_still"), dict) else {}
    downsized = images.get("downsized") if isinstance(images.get("downsized"), dict) else {}
    download = original.get("url") or downsized.get("url") or preview.get("url")
    if not gid or not download:
        return None
    user = gif.get("user") if isinstance(gif.get("user"), dict) else {}
    w = _int(original.get("width")) or _int(gif.get("width"))
    h = _int(original.get("height")) or _int(gif.get("height"))
    return {
        "id": f"giphy:gif:{gid}",
        "provider": "giphy",
        "external_id": gid,
        "kind": "gif",
        "title": (gif.get("title") or "").strip() or None,
        "thumb_url": still.get("url") or preview.get("url") or download,
        "preview_url": preview.get("url") or downsized.get("url") or download,
        "download_url": download,
        "width": w,
        "height": h,
        "duration": None,
        "author": (user.get("display_name") or user.get("username") or gif.get("username") or "").strip() or None,
        "source_url": gif.get("url") or f"https://giphy.com/gifs/{gid}",
        "license_info": LICENSE["giphy"],
    }


def merge_items(*groups: list[dict]) -> list[dict]:
    """Entrelaza grupos para mezclar fotos, vídeos y GIFs en la galería."""
    queues = [list(g) for g in groups if g]
    out: list[dict] = []
    seen: set[str] = set()
    while queues:
        nxt = []
        for q in queues:
            if not q:
                continue
            item = q.pop(0)
            key = item.get("id")
            if key and key not in seen:
                seen.add(key)
                out.append(item)
            if q:
                nxt.append(q)
        queues = nxt
    return out


def _want(media: str, provider: str, kind: str, src: str) -> bool:
    media = (media or "all").lower()
    provider = (provider or "all").lower()
    if provider not in ("all", src):
        return False
    if media == "all":
        return True
    if media == "photos":
        media = "photo"
    if media == "videos":
        media = "video"
    if media == "gifs":
        media = "gif"
    return media == kind


class MediaSearchService:
    def search(
        self,
        query: str,
        page: int = 1,
        media: str = "all",
        provider: str = "all",
        per_page: int = _PER_PAGE,
    ) -> dict:
        q = (query or "").strip()
        page = max(1, int(page or 1))
        per_page = max(4, min(int(per_page or _PER_PAGE), 40))
        configured = {
            "pexels": bool(settings.api_key("pexels")),
            "giphy": bool(settings.api_key("giphy")),
        }
        empty = {
            "query": q,
            "page": page,
            "has_more": False,
            "partial": False,
            "warning": None,
            "items": [],
            "errors": [],
            "configured": configured,
        }
        if not q:
            return empty

        jobs = []
        errors: list[dict] = []
        need_pexels = _want(media, provider, "photo", "pexels") or _want(media, provider, "video", "pexels")
        need_giphy = _want(media, provider, "gif", "giphy")
        if need_pexels and not configured["pexels"]:
            errors.append({"provider": "pexels", "message": "Falta la clave de Pexels en Ajustes."})
        else:
            if _want(media, provider, "photo", "pexels"):
                jobs.append(("pexels", "photo", self._pexels_photos, q, page, per_page))
            if _want(media, provider, "video", "pexels"):
                jobs.append(("pexels", "video", self._pexels_videos, q, page, min(per_page, 16)))
        if need_giphy and not configured["giphy"]:
            errors.append({"provider": "giphy", "message": "Falta la clave de GIPHY en Ajustes."})
        elif need_giphy:
            jobs.append(("giphy", "gif", self._giphy_gifs, q, page, per_page))

        groups: dict[str, list[dict]] = {}
        more = False
        if jobs:
            with ThreadPoolExecutor(max_workers=3) as pool:
                futs = {
                    pool.submit(fn, q, page, n): (src, kind)
                    for src, kind, fn, q, page, n in jobs
                }
                for fut in as_completed(futs):
                    src, kind = futs[fut]
                    try:
                        items, has_more = fut.result()
                        groups[kind] = items
                        more = more or has_more
                    except ValueError as exc:
                        errors.append({"provider": src, "message": str(exc)})
                    except Exception as exc:  # noqa: BLE001
                        errors.append({"provider": src, "message": str(exc) or "Fuente no disponible."})

        items = merge_items(groups.get("photo") or [], groups.get("video") or [], groups.get("gif") or [])
        uniq_err: list[dict] = []
        seen_src: set[str] = set()
        for e in errors:
            src = e.get("provider") or ""
            if src in seen_src:
                continue
            seen_src.add(src)
            uniq_err.append(e)
        errors = uniq_err
        partial = bool(errors) and bool(items)
        warning = "Algunas fuentes no están disponibles." if partial else None
        if errors and not items:
            missing = [e.get("provider") for e in errors if "clave" in (e.get("message") or "").lower()]
            if "pexels" in missing and "giphy" in missing:
                warning = "Faltan las claves de Pexels y GIPHY en Ajustes."
            else:
                warning = errors[0]["message"]
        return {
            "query": q,
            "page": page,
            "has_more": more,
            "partial": partial,
            "warning": warning,
            "items": items,
            "errors": errors,
            "configured": configured,
        }

    def _pexels_photos(self, query: str, page: int, per_page: int) -> tuple[list[dict], bool]:
        key = settings.api_key("pexels")
        if not key:
            raise ValueError("Falta la clave de Pexels en Ajustes.")
        url = f"{PEXELS_PHOTOS}?{urlencode({'query': query, 'page': page, 'per_page': per_page})}"
        data = _fetch_json(url, headers={"Authorization": key})
        photos = [map_pexels_photo(p) for p in (data.get("photos") or [])]
        items = [p for p in photos if p]
        total = _int(data.get("total_results"), 0) or 0
        return items, bool(data.get("next_page")) or (page * per_page < total)

    def _pexels_videos(self, query: str, page: int, per_page: int) -> tuple[list[dict], bool]:
        key = settings.api_key("pexels")
        if not key:
            raise ValueError("Falta la clave de Pexels en Ajustes.")
        url = f"{PEXELS_VIDEOS}?{urlencode({'query': query, 'page': page, 'per_page': per_page})}"
        data = _fetch_json(url, headers={"Authorization": key})
        videos = [map_pexels_video(v) for v in (data.get("videos") or [])]
        items = [v for v in videos if v]
        total = _int(data.get("total_results"), 0) or 0
        return items, bool(data.get("next_page")) or (page * per_page < total)

    def _giphy_gifs(self, query: str, page: int, per_page: int) -> tuple[list[dict], bool]:
        key = settings.api_key("giphy")
        if not key:
            raise ValueError("Falta la clave de GIPHY en Ajustes.")
        offset = (page - 1) * per_page
        url = f"{GIPHY_SEARCH}?{urlencode({'api_key': key, 'q': query, 'limit': per_page, 'offset': offset, 'rating': 'g'})}"
        data = _fetch_json(url)
        gifs = [map_giphy_gif(g) for g in (data.get("data") or [])]
        items = [g for g in gifs if g]
        pag = data.get("pagination") if isinstance(data.get("pagination"), dict) else {}
        total = _int(pag.get("total_count"), 0) or 0
        return items, offset + len(items) < total


media_search = MediaSearchService()
