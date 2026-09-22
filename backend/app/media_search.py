"""Búsqueda de material externo (Pexels + GIPHY + Pixabay + Unsplash) para Explorar."""
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
PIXABAY_PHOTOS = "https://pixabay.com/api/"
PIXABAY_VIDEOS = "https://pixabay.com/api/videos/"
UNSPLASH_SEARCH = "https://api.unsplash.com/search/photos"

_UA = "Mozilla/5.0 (compatible; video-yt/1.0)"
_TIMEOUT = 12
_PER_PAGE = 24

LICENSE = {
    "pexels": "Licencia Pexels (uso libre, atribución recomendada)",
    "giphy": "Contenido GIPHY (consulta sus términos de uso)",
    "pixabay": "Licencia Pixabay (uso libre, sin atribución obligatoria)",
    "unsplash": "Licencia Unsplash (uso libre, atribución recomendada)",
}

# Nombre legible de cada proveedor (para los avisos de "falta la clave").
_LABEL = {"pexels": "Pexels", "giphy": "GIPHY", "pixabay": "Pixabay", "unsplash": "Unsplash"}


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


def map_pixabay_photo(hit: dict) -> dict | None:
    pid = str(hit.get("id") or "")
    download = hit.get("largeImageURL") or hit.get("fullHDURL") or hit.get("webformatURL")
    if not pid or not download:
        return None
    return {
        "id": f"pixabay:photo:{pid}",
        "provider": "pixabay",
        "external_id": pid,
        "kind": "photo",
        "title": (hit.get("tags") or "").strip() or None,
        "thumb_url": hit.get("webformatURL") or hit.get("previewURL") or download,
        "preview_url": None,
        "download_url": download,
        "width": _int(hit.get("imageWidth")),
        "height": _int(hit.get("imageHeight")),
        "duration": None,
        "author": (hit.get("user") or "").strip() or None,
        "source_url": hit.get("pageURL") or f"https://pixabay.com/photos/-{pid}/",
        "license_info": LICENSE["pixabay"],
    }


def pick_pixabay_stream(videos: dict | None) -> dict | None:
    """Mejor stream usable de un vídeo Pixabay: large/medium ≤ 1920, si no el mayor."""
    streams = [v for v in (videos or {}).values() if isinstance(v, dict) and v.get("url")]
    if not streams:
        return None
    under = [v for v in streams if (_int(v.get("width"), 0) or 0) <= 1920]
    pool = under or streams
    return max(pool, key=lambda v: _int(v.get("width"), 0) or 0)


def pick_pixabay_preview(videos: dict | None) -> dict | None:
    """Stream más ligero (para el hover)."""
    streams = [v for v in (videos or {}).values() if isinstance(v, dict) and v.get("url")]
    if not streams:
        return None
    return min(streams, key=lambda v: _int(v.get("width"), 99999) or 99999)


def map_pixabay_video(hit: dict) -> dict | None:
    vid = str(hit.get("id") or "")
    videos = hit.get("videos") if isinstance(hit.get("videos"), dict) else {}
    best = pick_pixabay_stream(videos)
    if not vid or not best:
        return None
    prev = pick_pixabay_preview(videos)
    return {
        "id": f"pixabay:video:{vid}",
        "provider": "pixabay",
        "external_id": vid,
        "kind": "video",
        "title": (hit.get("tags") or "").strip() or None,
        "thumb_url": best.get("thumbnail") or (prev or {}).get("thumbnail"),
        "preview_url": (prev or best).get("url"),
        "download_url": best.get("url"),
        "width": _int(best.get("width")),
        "height": _int(best.get("height")),
        "duration": _num(hit.get("duration")),
        "author": (hit.get("user") or "").strip() or None,
        "source_url": hit.get("pageURL") or f"https://pixabay.com/videos/-{vid}/",
        "license_info": LICENSE["pixabay"],
    }


def map_unsplash_photo(hit: dict) -> dict | None:
    pid = str(hit.get("id") or "")
    urls = hit.get("urls") if isinstance(hit.get("urls"), dict) else {}
    download = urls.get("full") or urls.get("regular") or urls.get("raw")
    if not pid or not download:
        return None
    links = hit.get("links") if isinstance(hit.get("links"), dict) else {}
    user = hit.get("user") if isinstance(hit.get("user"), dict) else {}
    title = (hit.get("description") or hit.get("alt_description") or "").strip() or None
    return {
        "id": f"unsplash:photo:{pid}",
        "provider": "unsplash",
        "external_id": pid,
        "kind": "photo",
        "title": title,
        "thumb_url": urls.get("small") or urls.get("thumb") or urls.get("regular") or download,
        "preview_url": None,
        "download_url": download,
        "width": _int(hit.get("width")),
        "height": _int(hit.get("height")),
        "duration": None,
        "author": (user.get("name") or user.get("username") or "").strip() or None,
        "source_url": links.get("html") or f"https://unsplash.com/photos/{pid}",
        "license_info": LICENSE["unsplash"],
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
            "pixabay": bool(settings.api_key("pixabay")),
            "unsplash": bool(settings.api_key("unsplash")),
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

        # (src, kind, fn, per_page) por cada fuente pedida. Si el proveedor no tiene
        # clave se anota como error en vez de lanzarlo; varias fuentes dan la misma
        # clase (varias "photo"), así que se agrupan por (src, kind) para no pisarse.
        jobs: list[tuple] = []
        errors: list[dict] = []

        def _add(src, kind, fn, n):
            if not _want(media, provider, kind, src):
                return
            if not configured.get(src):
                errors.append({"provider": src, "message": f"Falta la clave de {_LABEL[src]} en Ajustes."})
            else:
                jobs.append((src, kind, fn, n))

        _add("pexels", "photo", self._pexels_photos, per_page)
        _add("pexels", "video", self._pexels_videos, min(per_page, 16))
        _add("pixabay", "photo", self._pixabay_photos, per_page)
        _add("pixabay", "video", self._pixabay_videos, min(per_page, 16))
        _add("unsplash", "photo", self._unsplash_photos, per_page)
        _add("giphy", "gif", self._giphy_gifs, per_page)

        results: dict[tuple, list[dict]] = {}
        more = False
        if jobs:
            with ThreadPoolExecutor(max_workers=min(6, len(jobs))) as pool:
                futs = {pool.submit(fn, q, page, n): (src, kind) for src, kind, fn, n in jobs}
                for fut in as_completed(futs):
                    src, kind = futs[fut]
                    try:
                        found, has_more = fut.result()
                        results[(src, kind)] = found
                        more = more or has_more
                    except ValueError as exc:
                        errors.append({"provider": src, "message": str(exc)})
                    except Exception as exc:  # noqa: BLE001
                        errors.append({"provider": src, "message": str(exc) or "Fuente no disponible."})

        # Entrelaza en el orden en que se pidieron las fuentes (determinista) para
        # mezclar proveedores y tipos en la galería.
        items = merge_items(*[results[(s, k)] for (s, k, _fn, _n) in jobs if (s, k) in results])
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
            missing = list(dict.fromkeys(
                e.get("provider") for e in errors if "clave" in (e.get("message") or "").lower()
            ))
            if len(missing) > 1:
                warning = "Faltan claves en Ajustes: " + ", ".join(_LABEL.get(m, m) for m in missing) + "."
            elif missing:
                warning = f"Falta la clave de {_LABEL.get(missing[0], missing[0])} en Ajustes."
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

    def _pixabay_photos(self, query: str, page: int, per_page: int) -> tuple[list[dict], bool]:
        key = settings.api_key("pixabay")
        if not key:
            raise ValueError("Falta la clave de Pixabay en Ajustes.")
        n = max(3, min(int(per_page), 200))
        url = f"{PIXABAY_PHOTOS}?{urlencode({'key': key, 'q': query, 'page': page, 'per_page': n, 'image_type': 'photo', 'safesearch': 'true'})}"
        data = _fetch_json(url)
        hits = [map_pixabay_photo(h) for h in (data.get("hits") or [])]
        items = [h for h in hits if h]
        total = _int(data.get("totalHits"), 0) or 0
        return items, page * n < total

    def _pixabay_videos(self, query: str, page: int, per_page: int) -> tuple[list[dict], bool]:
        key = settings.api_key("pixabay")
        if not key:
            raise ValueError("Falta la clave de Pixabay en Ajustes.")
        n = max(3, min(int(per_page), 200))
        url = f"{PIXABAY_VIDEOS}?{urlencode({'key': key, 'q': query, 'page': page, 'per_page': n, 'safesearch': 'true'})}"
        data = _fetch_json(url)
        hits = [map_pixabay_video(h) for h in (data.get("hits") or [])]
        items = [h for h in hits if h]
        total = _int(data.get("totalHits"), 0) or 0
        return items, page * n < total

    def _unsplash_photos(self, query: str, page: int, per_page: int) -> tuple[list[dict], bool]:
        key = settings.api_key("unsplash")
        if not key:
            raise ValueError("Falta la clave de Unsplash en Ajustes.")
        n = max(1, min(int(per_page), 30))
        url = f"{UNSPLASH_SEARCH}?{urlencode({'query': query, 'page': page, 'per_page': n, 'content_filter': 'high'})}"
        data = _fetch_json(url, headers={"Authorization": f"Client-ID {key}"})
        results = [map_unsplash_photo(h) for h in (data.get("results") or [])]
        items = [r for r in results if r]
        total_pages = _int(data.get("total_pages"), 0) or 0
        return items, page < total_pages


media_search = MediaSearchService()
