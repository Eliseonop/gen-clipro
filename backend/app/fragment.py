"""Fragmentación de transcripción → clips de texto. ESPEJO de la lógica JS.

Réplica en Python de `frontend/src/features/editor/editorModel.js`
(`textClipsFromTranscript` / `splitClipByMaxWords` / `relSegmentWords`) y de
`textKaraoke.js` (`chunkCaptionText` / `splitCaptionWords`). El backend la usa
para que `add_subtitles` genere exactamente los mismos clips que el editor.

La paridad JS↔Python está garantizada por golden fixtures compartidos
(`shared/fragmentation_cases.json`) que ambos lados comprueban.

Trabaja sobre dicts (mismos nombres de campo que el modelo del timeline). Las
palabras se asignan a cada fragmento POR ÍNDICE (los cortes caen entre palabras),
y con `words[]` reales cuyo conteo cuadra con el texto, el tiempo sale de esas
marcas (relativo al fragmento).
"""
from __future__ import annotations

import uuid

from .text_role import resolve_text_role


def _uid(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def _r3(v: float) -> float:
    return round(float(v), 3)


def _get(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def split_caption_words(text: str) -> list[str]:
    return [w for w in (text or "").split() if w]


def chunk_caption_text(text: str, max_words) -> list[str]:
    words = split_caption_words(text)
    if not words:
        return []
    try:
        n = int(max_words)
    except (TypeError, ValueError):
        return [" ".join(words)]
    if n < 1:
        return [" ".join(words)]
    return [" ".join(words[i:i + n]) for i in range(0, len(words), n)]


def _clip_dur(clip: dict) -> float:
    return max(0.0, float(clip.get("out_point", 0)) - float(clip.get("in_point", 0)))


def make_text_clip(track_id: str, start: float, dur: float, text: str, style: dict | None,
                   text_role: str = "free") -> dict:
    role = "caption" if text_role == "caption" else "free"
    st = dict(style or {})
    return {
        "id": _uid("c"), "track_id": track_id, "kind": "text", "asset_kind": "text",
        "asset_id": _uid("t"), "filename": "", "name": (text or "Texto")[:22],
        "start": _r3(max(0.0, start)), "in_point": 0.0,
        "out_point": _r3(max(0.5, dur)), "source_duration": _r3(max(0.5, dur)),
        "volume": 1, "muted": False, "reframe": None, "text": text or "Texto",
        "style": st, "words": [], "text_role": role,
    }


def _rel_segment_words(segment: dict, src: dict, clip_start: float, dur: float) -> list[dict]:
    ws = _get(segment, "words") or []
    if not ws:
        return []
    s_start = float(_get(src, "start", 0))
    s_in = float(_get(src, "in_point", 0))
    out = []
    for w in ws:
        w_start = _get(w, "start", 0) or 0
        w_end = _get(w, "end", w_start) or w_start
        tl_start = s_start + (float(w_start) - s_in)
        tl_end = s_start + (float(w_end) - s_in)
        rs = min(max(0.0, tl_start - clip_start), dur)
        re = min(max(0.0, tl_end - clip_start), dur)
        item = {"text": (_get(w, "text", "") or "").strip(), "start": _r3(rs), "end": _r3(max(rs, re))}
        prob = _get(w, "prob")
        if prob is not None:
            item["prob"] = prob
        out.append(item)
    return out


def split_clip_by_max_words(clip: dict, max_words) -> list[dict]:
    if resolve_text_role(clip) == "free":
        return [clip]
    chunks = chunk_caption_text(clip.get("text") or "", max_words)
    if len(chunks) <= 1:
        return [clip]
    total = len(split_caption_words(clip.get("text") or "")) or 1
    dur = _clip_dur(clip)
    base = float(clip.get("start", 0))
    words = clip.get("words") or []
    has_words = isinstance(words, list) and len(words) == total
    origin = clip.get("origin")
    origin_start = (origin.get("word_range") or [0])[0] if origin else 0
    out = []
    acc = 0
    n_chunks = len(chunks)
    for i, text in enumerate(chunks):
        n = len(split_caption_words(text))
        frm, to = acc, acc + n
        acc = to
        frag_words: list[dict] = []
        if has_words:
            sl = words[frm:to]
            w0 = float(sl[0]["start"]) if sl else dur * (frm / total)
            wn = float(sl[-1]["end"]) if sl else dur * (to / total)
            start = base + w0
            d = max(0.05, wn - w0)
            for w in sl:
                item = {"text": w["text"], "start": _r3(max(0.0, float(w["start"]) - w0)),
                        "end": _r3(max(0.0, float(w["end"]) - w0))}
                if w.get("prob") is not None:
                    item["prob"] = w["prob"]
                frag_words.append(item)
        else:
            start = base + dur * (frm / total)
            end = base + dur if i == n_chunks - 1 else base + dur * (to / total)
            d = max(0.05, end - start)
        frag = {
            **clip, "id": _uid("c"), "asset_id": _uid("t"), "text": text,
            "name": text[:22], "start": _r3(start), "in_point": 0.0,
            "out_point": _r3(d), "source_duration": _r3(d),
            "style": dict(clip.get("style") or {}), "words": frag_words,
        }
        if origin:
            frag["origin"] = {**origin, "fragment_index": i, "word_range": [origin_start + frm, origin_start + to]}
        out.append(frag)
    return out


def text_clips_from_transcript(src: dict, segments, track_id: str, style: dict | None,
                               transcript_id: str | None = None) -> list[dict]:
    """Segmentos de Whisper → clips de texto, recortados al tramo del clip fuente,
    con `words[]` reales por fragmento y `origin` hacia la transcripción."""
    clip_len = float(_get(src, "out_point", 0)) - float(_get(src, "in_point", 0))
    s_start = float(_get(src, "start", 0))
    s_in = float(_get(src, "in_point", 0))
    max_words = (style or {}).get("max_words", 8)
    news: list[dict] = []
    for seg_index, s in enumerate(segments or []):
        ls = float(_get(s, "start", 0)) - s_in
        le = float(_get(s, "end", 0)) - s_in
        if le <= 0 or ls >= clip_len:
            continue
        start = s_start + max(0.0, ls)
        end = s_start + min(clip_len, le)
        text = (_get(s, "text", "") or "").strip()
        if not text:
            continue
        made = make_text_clip(track_id, start, max(0.4, end - start), text, style, text_role="caption")
        made["words"] = _rel_segment_words(s, src, made["start"], _clip_dur(made))
        made["origin"] = {
            "transcript_id": transcript_id,
            "segment_index": _get(s, "index", seg_index),
            "source_range": {"start": _get(s, "start", 0), "end": _get(s, "end", 0)},
            "word_range": [0, len(split_caption_words(text))],
        }
        news.extend(split_clip_by_max_words(made, max_words))
    return news
