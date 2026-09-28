"""Descargar un vídeo de YouTube COMPLETO al material, en la calidad elegida.

La "calidad" es la etiqueta de YouTube (720p, 1080p, 2160p…), que mide el lado
CORTO del fotograma: un Short de 1080x1920 también es «1080p». yt-dlp la expone
en ``format_note`` ("1080p60 HDR"); si falta (otros sitios), se usa
min(ancho, alto).

Por calidad se elige un único formato de vídeo: SDR antes que HDR (el export no
hace tonemapping), más fps, descarga directa antes que HLS (m3u8, por trozos y
más lenta) y H.264 antes que VP9/AV1 (se decodifica mejor en la vista previa).
El audio se une aparte con yt-dlp (m4a si lo hay).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Callable

ProgressCb = Callable[[float, str], None]

# Por debajo de esto no sirve para editar; solo se ofrece si no hay nada mejor.
MIN_QUALITY = 360

_NOTE_RE = re.compile(r"(\d{3,4})p")
_CODEC_RANK = (("avc1", 0), ("h264", 0), ("vp09", 1), ("vp9", 1), ("av01", 2))


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _is_video(f: dict) -> bool:
    if (f.get("vcodec") or "") == "none":
        return False
    if f.get("has_drm") or (f.get("ext") or "") == "mhtml":   # storyboards
        return False
    return bool(f.get("format_id")) and quality_of(f) is not None


def _is_audio(f: dict) -> bool:
    return (f.get("vcodec") or "") == "none" and (f.get("acodec") or "none") != "none"


def quality_of(f: dict) -> int | None:
    """Etiqueta de calidad (p) de un formato de yt-dlp, o None si no es vídeo."""
    m = _NOTE_RE.search(str(f.get("format_note") or ""))
    if m:
        return int(m.group(1))
    w, h = int(_num(f.get("width"))), int(_num(f.get("height")))
    if w and h:
        return min(w, h)
    return h or None


def _codec_rank(f: dict) -> int:
    vc = (f.get("vcodec") or "").lower()
    for prefix, rank in _CODEC_RANK:
        if vc.startswith(prefix):
            return rank
    return 3


def _rank(f: dict) -> tuple:
    sdr = (f.get("dynamic_range") or "SDR").upper() == "SDR"
    direct = "m3u8" not in (f.get("protocol") or "")
    return (sdr, _num(f.get("fps")), direct, -_codec_rank(f), _num(f.get("tbr")), _num(f.get("filesize")))


def _size(f: dict | None) -> int:
    if not f:
        return 0
    return int(_num(f.get("filesize")) or _num(f.get("filesize_approx")))


def _best_audio(formats: list[dict]) -> dict | None:
    audios = [f for f in formats if _is_audio(f)]
    if not audios:
        return None
    return max(audios, key=lambda f: (
        not str(f.get("format_id")).endswith("-drc"),    # sin compresión de rango
        (f.get("ext") or "") == "m4a",
        _num(f.get("abr")) or _num(f.get("tbr")),
    ))


def _by_quality(formats: list[dict]) -> dict[int, dict]:
    """Mejor formato de vídeo de cada calidad."""
    groups: dict[int, list[dict]] = {}
    for f in formats:
        if _is_video(f):
            groups.setdefault(quality_of(f), []).append(f)
    return {q: max(fs, key=_rank) for q, fs in groups.items()}


def available_qualities(info: dict) -> list[dict]:
    """Calidades descargables, de mejor a peor: [{quality, fps, size}].

    ``size`` es la estimación en bytes (vídeo + audio) o None si YouTube no la da.
    """
    formats = info.get("formats") or []
    best = _by_quality(formats)
    audio = _best_audio(formats)
    out = []
    for q in sorted(best, reverse=True):
        f = best[q]
        needs_audio = (f.get("acodec") or "") == "none"
        size = _size(f) and _size(f) + (_size(audio) if needs_audio else 0)
        fps = int(round(_num(f.get("fps")))) or None
        out.append({"quality": q, "fps": fps, "size": size or None})
    return [x for x in out if x["quality"] >= MIN_QUALITY] or out


def resolve_quality(qualities: list[dict], wanted: int | None) -> int | None:
    """Calidad a descargar: la pedida, o la mejor ≤ pedida; sin pedir → la mejor."""
    avail = [x["quality"] for x in qualities]
    if not avail:
        return None
    if not wanted:
        return avail[0]
    lower = [q for q in avail if q <= wanted]
    return lower[0] if lower else avail[-1]


def format_spec(info: dict, quality: int) -> str:
    """Selector de yt-dlp para ``quality``: el formato elegido + el mejor audio."""
    f = _by_quality(info.get("formats") or []).get(quality)
    if f is None:
        raise ValueError(f"El vídeo no tiene calidad {quality}p.")
    fid = f["format_id"]
    if (f.get("acodec") or "") != "none":
        return fid
    return f"{fid}+bestaudio[ext=m4a]/{fid}+bestaudio/{fid}"


def _mb(n: float) -> str:
    mb = n / 1_048_576
    return f"{mb:.1f} MB" if mb < 10 else f"{mb:.0f} MB"


def fetch_info(url: str) -> dict:
    """Metadatos de yt-dlp (formatos incluidos), sin descargar."""
    from . import heatmap
    return heatmap._extract_info(url) or {}


def download(url: str, quality: int | None, dest_dir: Path, on_progress: ProgressCb,
             info: dict | None = None) -> dict:
    """Descarga el vídeo en ``dest_dir`` y devuelve {path, quality, title, video_id}.

    ``info`` = metadatos ya pedidos (``fetch_info``) para no repetir la consulta.
    """
    from . import ytdlp

    on_progress(0.02, "Consultando calidades…")
    if info is None:
        info = fetch_info(url)
    q = resolve_quality(available_qualities(info), quality)
    if q is None:
        raise RuntimeError("Este vídeo no tiene formatos de vídeo descargables.")

    # Vídeo y audio se bajan por separado: el vídeo ocupa casi toda la barra.
    parts: list[str] = []

    def hook(d: dict) -> None:
        if d.get("status") != "downloading":
            return
        name = d.get("filename") or ""
        if name not in parts:
            parts.append(name)
        total = _num(d.get("total_bytes") or d.get("total_bytes_estimate"))
        done = _num(d.get("downloaded_bytes"))
        frac = done / total if total else 0.0
        if parts.index(name) == 0:
            size = f" · {_mb(done)} de {_mb(total)}" if total else ""
            on_progress(0.05 + 0.8 * frac, f"Descargando {q}p{size}…")
        else:
            on_progress(0.85 + 0.08 * frac, "Descargando audio…")

    def pp_hook(d: dict) -> None:
        if d.get("status") == "started" and d.get("postprocessor") == "Merger":
            on_progress(0.94, "Uniendo vídeo y audio…")

    dest_dir = Path(dest_dir)
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "format": format_spec(info, q),
        "merge_output_format": "mp4",
        "outtmpl": str(dest_dir / "source.%(ext)s"),
        "progress_hooks": [hook],
        "postprocessor_hooks": [pp_hook],
    }
    ytdlp.call(opts, lambda ydl: ydl.download([url]))

    files = [p for p in dest_dir.glob("source.*") if p.suffix not in (".part", ".ytdl")]
    if not files:
        raise RuntimeError("No se pudo descargar el vídeo.")
    path = next((p for p in files if p.suffix == ".mp4"), files[0])
    return {
        "path": path,
        "quality": q,
        "title": (info.get("title") or "").strip(),
        "video_id": info.get("id") or "",
    }


def download_to_project(project, url: str, quality: int | None, on_progress: ProgressCb,
                        info: dict | None = None):
    """Descarga el vídeo completo y lo añade al material. Devuelve (ClipInfo, calidad)."""
    import tempfile

    from . import storage, videos
    from .youtube_audio import youtube_id_from_url

    # El temporal va junto al material: mover el MP4 (GB en 4K) es un rename.
    base = storage.ensure_dirs(storage.project_base(project))
    with tempfile.TemporaryDirectory(prefix=".ytdl-", dir=base) as tmp:
        res = download(url, quality, Path(tmp), on_progress, info=info)
        on_progress(0.97, "Añadiendo al material…")
        title = res["title"] or "youtube"
        vid = res["video_id"] or youtube_id_from_url(url) or None
        clip = videos.import_video_file(
            project, res["path"], f"{storage.safe_name(title)}{res['path'].suffix}",
            label=f"{title} · {res['quality']}p",
            origin="youtube", source="external",
            provider="youtube", external_id=vid, source_url=url,
        )
    return clip, res["quality"]
