"""Timing por palabra dentro de un segmento.

Usa los timestamps REALES de Whisper. La "ventana activa" de una palabra
(karaoke) va desde su inicio hasta el inicio de la siguiente (se sostiene el
resaltado), acotada al fin del segmento.
"""
from __future__ import annotations

from app.resolve.schemas import Project, Segment, Word


def word_active_windows(words: list[Word], seg_end: float) -> list[tuple[float, float]]:
    """Para cada palabra: (t_activa_ini, t_activa_fin) absolutos.

    La palabra i está activa desde ``words[i].start`` hasta ``words[i+1].start``
    (o ``seg_end`` para la última). Garantiza ventanas no vacías.
    """
    n = len(words)
    out: list[tuple[float, float]] = []
    for i in range(n):
        t0 = float(words[i].start)
        t1 = float(words[i + 1].start) if i + 1 < n else float(seg_end)
        if t1 <= t0:
            t1 = t0 + 0.04
        out.append((t0, t1))
    return out


def active_word_index(windows: list[tuple[float, float]], t: float) -> int:
    """Índice de la palabra activa en el instante ``t`` (-1 si ninguna)."""
    for i, (t0, t1) in enumerate(windows):
        if t0 <= t < t1:
            return i
    if windows and t >= windows[-1][1]:
        return len(windows) - 1
    return -1


def segment_of(project: Project, t: float) -> Segment | None:
    """Segmento visible en el instante ``t`` (o None)."""
    for s in project.segments:
        if s.start <= t < s.end:
            return s
    return None
