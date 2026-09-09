"""Export SRT y WebVTT desde los segmentos del proyecto.

Formatos de intercambio: Resolve Free los importa (aunque pierde el estilo).
Texto plano por segmento, con saltos de línea. Sin animación por palabra.
"""
from __future__ import annotations

from app.resolve.schemas import Project


def _srt_time(t: float) -> str:
    t = max(0.0, float(t))
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _vtt_time(t: float) -> str:
    return _srt_time(t).replace(",", ".")


def build_srt(project: Project) -> str:
    lines: list[str] = []
    for idx, s in enumerate(project.segments, start=1):
        lines.append(str(idx))
        lines.append(f"{_srt_time(s.start)} --> {_srt_time(s.end)}")
        lines.append(s.text.strip())
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def build_vtt(project: Project) -> str:
    out: list[str] = ["WEBVTT", ""]
    for s in project.segments:
        out.append(f"{_vtt_time(s.start)} --> {_vtt_time(s.end)}")
        out.append(s.text.strip())
        out.append("")
    return "\n".join(out).rstrip() + "\n"
