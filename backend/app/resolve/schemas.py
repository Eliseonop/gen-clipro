"""Modelo del documento interno de subtítulos (la fuente de verdad del generador).

Dataclasses puras (stdlib) para que el motor sea testeable sin dependencias.
Portado tal cual desde mi-davinci: el generador Fusion consume este ``Project``.

Convenciones:
  - Tiempos en segundos (float). ``words[]`` es INMUTABLE tras la transcripción
    (fuente de verdad temporal); la segmentación solo agrupa, nunca reescribe.
  - Posición de estilo: ``x``/``y`` normalizados 0..1 con **0=arriba/izquierda,
    1=abajo/derecha** (como en pantalla/ASS). El generador Fusion convierte a su
    propio eje (Y hacia arriba) al exportar.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Word:
    """Una palabra con timestamps absolutos (en tiempo de medio)."""
    text: str
    start: float
    end: float
    prob: float | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"text": self.text, "start": round(self.start, 3), "end": round(self.end, 3)}
        if self.prob is not None:
            d["prob"] = round(self.prob, 3)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Word":
        return cls(text=str(d["text"]), start=float(d["start"]), end=float(d["end"]),
                   prob=(float(d["prob"]) if d.get("prob") is not None else None))


@dataclass
class Segment:
    """Unidad de subtítulo: rango de palabras ``words[i0..i1]`` (inclusive).

    ``line_breaks`` son posiciones 0-based *dentro del segmento* tras las que se
    inserta un salto de línea (p.ej. [1] parte "a b | c d" tras la 2a palabra).
    """
    i0: int
    i1: int
    start: float
    end: float
    text: str
    line_breaks: list[int] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"i0": self.i0, "i1": self.i1, "start": round(self.start, 3),
                "end": round(self.end, 3), "text": self.text, "line_breaks": list(self.line_breaks)}

    @classmethod
    def from_dict(cls, d: dict) -> "Segment":
        return cls(i0=int(d["i0"]), i1=int(d["i1"]), start=float(d["start"]), end=float(d["end"]),
                   text=str(d.get("text", "")), line_breaks=list(d.get("line_breaks", [])))


@dataclass
class Project:
    """Documento completo. Serializable a/desde JSON (fuente de verdad)."""
    id: str = ""
    media: str = ""
    fps: float = 30.0
    w: int = 1920
    h: int = 1080
    duration: float = 0.0
    language: str | None = None
    words: list[Word] = field(default_factory=list)
    segments: list[Segment] = field(default_factory=list)
    preset: str = "word-pop"
    style: dict = field(default_factory=dict)       # overrides del usuario sobre el preset
    animation: dict = field(default_factory=dict)   # overrides de animación
    seg_params: dict = field(default_factory=dict)  # parámetros de segmentación
    export: dict = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "project": {"id": self.id, "media": self.media, "fps": self.fps, "w": self.w,
                        "h": self.h, "duration": self.duration, "language": self.language},
            "words": [w.to_dict() for w in self.words],
            "segments": [s.to_dict() for s in self.segments],
            "preset": self.preset,
            "style": dict(self.style),
            "animation": dict(self.animation),
            "seg_params": dict(self.seg_params),
            "export": dict(self.export),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Project":
        p = d.get("project", d)
        return cls(
            id=str(p.get("id", "")), media=str(p.get("media", "")),
            fps=float(p.get("fps", 30.0)), w=int(p.get("w", 1920)), h=int(p.get("h", 1080)),
            duration=float(p.get("duration", 0.0)), language=p.get("language"),
            words=[Word.from_dict(w) for w in d.get("words", [])],
            segments=[Segment.from_dict(s) for s in d.get("segments", [])],
            preset=str(d.get("preset", "word-pop")),
            style=dict(d.get("style", {})), animation=dict(d.get("animation", {})),
            seg_params=dict(d.get("seg_params", {})), export=dict(d.get("export", {})),
        )

    # -- helpers de conveniencia -------------------------------------------
    def seg_words(self, seg: Segment) -> list[Word]:
        return self.words[seg.i0: seg.i1 + 1]

    def seg_word_texts(self, seg: Segment) -> list[str]:
        return [w.text for w in self.seg_words(seg)]
