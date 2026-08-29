"""Análisis del heatmap ("Most Replayed") de un vídeo de YouTube.

yt-dlp ya expone el heatmap en el campo ``heatmap`` de la información del
vídeo: una lista de puntos ``{start_time, end_time, value}`` con value en
el rango 0.0 - 1.0. Aquí lo leemos, filtramos por umbral y agrupamos los
puntos contiguos en "tramos de alto interés".
"""
from __future__ import annotations

from . import ytdlp
from .schemas import AnalyzeResponse, Segment, VideoInfo


def _extract_info(url: str) -> dict:
    """Descarga solo los metadatos del vídeo (sin bajar el vídeo en sí)."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    return ytdlp.call(opts, lambda ydl: ydl.extract_info(url, download=False))


def _pick_segments(
    heatmap: list[dict],
    duration: float,
    min_score: float,
    max_clips: int,
    max_duration: int,
    padding: int,
) -> list[Segment]:
    """Convierte los puntos del heatmap en tramos recortables.

    1. Marca los puntos cuyo valor supera ``min_score``.
    2. Agrupa los puntos marcados que son contiguos en el tiempo.
    3. A cada grupo le aplica padding, lo recorta a ``max_duration`` y le
       asigna como score el pico máximo del grupo.
    4. Se queda con los ``max_clips`` de mayor score y los ordena por tiempo.
    """
    points = sorted(heatmap, key=lambda p: p["start_time"])

    runs: list[list[dict]] = []
    current: list[dict] = []
    for p in points:
        if p["value"] >= min_score:
            current.append(p)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)

    segments: list[Segment] = []
    for run in runs:
        start = max(0.0, run[0]["start_time"] - padding)
        end = min(duration, run[-1]["end_time"] + padding)
        # Recorta a la duración máxima manteniendo el arranque del tramo.
        if end - start > max_duration:
            end = start + max_duration
        score = max(p["value"] for p in run)
        segments.append(
            Segment(
                index=0,  # se reasigna tras ordenar
                start=round(start, 2),
                end=round(end, 2),
                score=round(score, 4),
                duration=round(end - start, 2),
            )
        )

    # Los mejores por score, luego reordenados cronológicamente.
    segments.sort(key=lambda s: s.score, reverse=True)
    segments = segments[:max_clips]
    segments.sort(key=lambda s: s.start)
    for i, seg in enumerate(segments, start=1):
        seg.index = i
    return segments


def analyze(
    url: str,
    min_score: float,
    max_clips: int,
    max_duration: int,
    padding: int,
) -> AnalyzeResponse:
    """Punto de entrada: analiza un vídeo y devuelve info + tramos."""
    info = _extract_info(url)

    video = VideoInfo(
        id=info.get("id", ""),
        title=info.get("title", "(sin título)"),
        duration=float(info.get("duration") or 0),
        thumbnail=info.get("thumbnail"),
        uploader=info.get("uploader"),
    )

    heatmap = info.get("heatmap") or []
    if not heatmap:
        return AnalyzeResponse(video=video, segments=[], has_heatmap=False)

    segments = _pick_segments(
        heatmap,
        duration=video.duration,
        min_score=min_score,
        max_clips=max_clips,
        max_duration=max_duration,
        padding=padding,
    )
    return AnalyzeResponse(video=video, segments=segments, has_heatmap=True)
