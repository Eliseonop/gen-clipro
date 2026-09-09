"""Puente entre el modelo de video-yt y el documento del generador Resolve.

video-yt guarda la transcripción como ``Transcript`` (segmentos con ``words[]``
de timing por palabra). El generador Fusion consume un ``Project`` propio. Aquí
aplanamos las palabras y las re-segmentamos con la lógica "inteligente" de
subtítulos (pausas/puntuación) — sin tocar nunca los tiempos originales.
"""
from __future__ import annotations

from typing import Any

from app.resolve.schemas import Project, Segment, Word
from app.resolve.segmentation import segment_words


def _as_dict(obj: Any) -> dict:
    """Acepta un modelo Pydantic (video-yt) o un dict ya serializado."""
    if isinstance(obj, dict):
        return obj
    for attr in ("model_dump", "dict"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                return fn()
            except TypeError:
                return fn(mode="python")  # pydantic v2 con args
    return dict(getattr(obj, "__dict__", {}) or {})


def words_from_transcript(transcript: Any) -> list[Word]:
    """Aplana ``transcript.segments[].words[]`` en una lista ``Word`` absoluta.

    Si un segmento no trae ``words[]`` (modelo sin timing por palabra), lo omite:
    el generador dinámico necesita marcas por palabra. Los tiempos son absolutos
    (en tiempo del medio), tal como los da Whisper.
    """
    t = _as_dict(transcript)
    out: list[Word] = []
    for seg in t.get("segments", []) or []:
        sd = _as_dict(seg)
        for w in sd.get("words", []) or []:
            wd = _as_dict(w)
            text = str(wd.get("text", "")).strip()
            if not text:
                continue
            try:
                start = float(wd.get("start"))
                end = float(wd.get("end"))
            except (TypeError, ValueError):
                continue
            prob = wd.get("prob")
            out.append(Word(text=text, start=start, end=end,
                            prob=(float(prob) if prob is not None else None)))
    out.sort(key=lambda w: (w.start, w.end))
    return out


def _breaks_from_text(text: str, nwords: int) -> list[int]:
    """Posiciones de salto de línea (0-based) a partir de los ``\\n`` del texto.

    El texto de un clip de subtítulo puede venir con saltos (dos líneas). Contamos
    palabras por línea para situar el corte. Si no hay saltos, una sola línea.
    """
    lines = [ln for ln in (text or "").split("\n")]
    if len(lines) <= 1:
        return []
    breaks: list[int] = []
    pos = 0
    for ln in lines[:-1]:
        pos += len(ln.split())
        if 0 < pos < nwords:
            breaks.append(pos - 1)
    return sorted(set(breaks))


def text_clips_to_project(
    timeline: Any,
    *,
    project_id: str = "",
    media: str = "",
    fps: float = 30.0,
    w: int = 1080,
    h: int = 1920,
    language: str | None = None,
    preset: str = "word-pop",
    style: dict | None = None,
    animation: dict | None = None,
) -> Project:
    """Construye el ``Project`` desde los **clips de texto del timeline**.

    Esta es la fuente fiel a lo que el usuario ya montó: cada clip de texto es un
    subtítulo (un ``Segment``), y sus ``words[]`` (relativos al inicio del clip) se
    pasan a tiempo absoluto sumando ``clip.start``. Los clips sin ``words[]`` se
    reparten uniformemente sobre su duración para no perderlos.
    """
    tl = _as_dict(timeline)
    text_clips = [_as_dict(c) for c in (tl.get("clips", []) or []) if _as_dict(c).get("kind") == "text"]
    text_clips.sort(key=lambda c: float(c.get("start") or 0.0))

    words: list[Word] = []
    segments: list[Segment] = []
    for c in text_clips:
        cstart = float(c.get("start") or 0.0)
        raw_words = c.get("words") or []
        text = str(c.get("text") or "").strip()
        i0 = len(words)
        if raw_words:
            for w in raw_words:
                wd = _as_dict(w)
                t = str(wd.get("text", "")).strip()
                if not t:
                    continue
                try:
                    s = cstart + float(wd.get("start"))
                    e = cstart + float(wd.get("end"))
                except (TypeError, ValueError):
                    continue
                prob = wd.get("prob")
                words.append(Word(text=t, start=s, end=e,
                                  prob=(float(prob) if prob is not None else None)))
        else:
            toks = text.replace("\n", " ").split()
            if not toks:
                continue
            dur = max(0.3, float(c.get("out_point") or 0.0) - float(c.get("in_point") or 0.0))
            step = dur / len(toks)
            for k, tok in enumerate(toks):
                words.append(Word(text=tok, start=cstart + k * step, end=cstart + (k + 1) * step))
        i1 = len(words) - 1
        if i1 < i0:
            continue
        seg_text = text or " ".join(wd.text for wd in words[i0:i1 + 1])
        segments.append(Segment(
            i0=i0, i1=i1,
            start=round(words[i0].start, 3), end=round(words[i1].end, 3),
            text=seg_text, line_breaks=_breaks_from_text(seg_text, i1 - i0 + 1),
        ))

    dur = words[-1].end if words else 0.0
    return Project(
        id=project_id, media=media,
        fps=float(tl.get("fps") or fps) or 30.0,
        w=int(tl.get("width") or w), h=int(tl.get("height") or h),
        duration=float(dur), language=language,
        words=words, segments=segments,
        preset=preset, style=dict(style or {}), animation=dict(animation or {}),
    )


def build_project(
    transcript: Any,
    *,
    project_id: str = "",
    media: str = "",
    fps: float = 30.0,
    w: int = 1080,
    h: int = 1920,
    duration: float = 0.0,
    language: str | None = None,
    preset: str = "word-pop",
    style: dict | None = None,
    animation: dict | None = None,
    seg_params: dict | None = None,
) -> Project:
    """Construye el ``Project`` del generador desde un ``Transcript`` de video-yt.

    ``w``/``h`` por defecto = 9:16 vertical (1080x1920), el formato de video-yt.
    """
    words = words_from_transcript(transcript)
    segments = segment_words(words, seg_params)
    t = _as_dict(transcript)
    dur = duration or (words[-1].end if words else 0.0)
    return Project(
        id=project_id,
        media=media,
        fps=float(fps) or 30.0,
        w=int(w),
        h=int(h),
        duration=float(dur),
        language=language or t.get("language"),
        words=words,
        segments=segments,
        preset=preset,
        style=dict(style or {}),
        animation=dict(animation or {}),
        seg_params=dict(seg_params or {}),
    )
