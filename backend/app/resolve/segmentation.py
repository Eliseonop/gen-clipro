"""Segmentación inteligente: agrupa palabras (con timestamps) en subtítulos.

No corta por Nº de caracteres a ciegas. Puntúa cada posible corte combinando
pausas, puntuación, longitud, Nº de palabras, duración y legibilidad (CPS).
Función pura y testeable. **Nunca reescribe los tiempos de las palabras.**
"""
from __future__ import annotations

from dataclasses import dataclass

from app.resolve.schemas import Segment, Word

_SENTENCE_END = ".?!…"
_CLAUSE_END = ",;:—"


@dataclass
class SegParams:
    max_chars_line: int = 20      # max caracteres por línea
    max_words_line: int = 4       # max palabras por línea
    max_lines: int = 2            # max líneas por subtítulo
    min_seg_dur: float = 0.7      # duración mínima antes de permitir corte "blando"
    max_seg_dur: float = 3.5      # duración máxima de un subtítulo
    pause_break: float = 0.35     # pausa (s) entre palabras que fuerza corte
    target_cps: float = 15.0      # chars/segundo objetivo (legibilidad)
    prefer_punctuation: bool = True

    @classmethod
    def from_dict(cls, d: dict | None) -> "SegParams":
        d = d or {}
        f = {k: d[k] for k in cls.__dataclass_fields__ if k in d}  # type: ignore[attr-defined]
        return cls(**f)


def _clean(text: str) -> str:
    return (text or "").strip()


def _last_char(text: str) -> str:
    t = _clean(text)
    return t[-1:] if t else ""


def _wrap_lines(texts: list[str], p: SegParams) -> list[int]:
    """Reparte las palabras del segmento en líneas y devuelve las posiciones
    (0-based) tras las que hay salto. Envuelve por chars y por Nº de palabras."""
    breaks: list[int] = []
    line_chars = 0
    line_words = 0
    for i, t in enumerate(texts):
        wlen = len(t)
        # ¿cabe en la línea actual? (+1 por el espacio si ya hay algo)
        add = wlen + (1 if line_words else 0)
        too_long = line_words and (line_chars + add > p.max_chars_line)
        too_many = line_words >= p.max_words_line
        if too_long or too_many:
            breaks.append(i - 1)          # salto antes de la palabra i
            line_chars, line_words = wlen, 1
        else:
            line_chars += add
            line_words += 1
    return breaks


def _make_segment(words: list[Word], i0: int, i1: int, p: SegParams) -> Segment:
    texts = [_clean(words[j].text) for j in range(i0, i1 + 1)]
    breaks = _wrap_lines(texts, p)
    # Construir el texto con saltos de línea en las posiciones marcadas.
    parts: list[str] = []
    bset = set(breaks)
    for k, t in enumerate(texts):
        parts.append(t)
        if k in bset:
            parts.append("\n")
        elif k < len(texts) - 1:
            parts.append(" ")
    text = "".join(parts).replace(" \n", "\n").replace("\n ", "\n")
    return Segment(i0=i0, i1=i1, start=round(words[i0].start, 3), end=round(words[i1].end, 3),
                   text=text, line_breaks=breaks)


def segment_words(words: list[Word], params: dict | SegParams | None = None) -> list[Segment]:
    """Agrupa ``words`` en subtítulos según ``params``. Devuelve ``list[Segment]``."""
    p = params if isinstance(params, SegParams) else SegParams.from_dict(params)
    n = len(words)
    if n == 0:
        return []

    cap_words = max(1, p.max_words_line * p.max_lines)
    cap_chars = max(1, p.max_chars_line * p.max_lines)

    segments: list[Segment] = []
    start = 0
    cur_chars = 0
    for i in range(n):
        wlen = len(_clean(words[i].text))
        cur_chars = wlen if i == start else cur_chars + 1 + wlen
        nwords = i - start + 1
        dur = words[i].end - words[start].start

        gap_next = (words[i + 1].start - words[i].end) if i + 1 < n else 1e9
        ends_sentence = _last_char(words[i].text) in _SENTENCE_END
        ends_clause = _last_char(words[i].text) in _CLAUSE_END

        must_break = (
            i == n - 1
            or ends_sentence
            or gap_next >= p.pause_break
            or nwords >= cap_words
            or cur_chars >= cap_chars
            or dur >= p.max_seg_dur
        )
        # Corte "blando": en coma/cláusula cuando el segmento ya es suficientemente
        # largo, para respetar frases naturales sin fragmentar de más.
        want_break = (
            p.prefer_punctuation and ends_clause
            and (dur >= p.min_seg_dur or nwords >= max(2, cap_words // 2))
        )

        if must_break or want_break:
            segments.append(_make_segment(words, start, i, p))
            start = i + 1
            cur_chars = 0

    return segments
