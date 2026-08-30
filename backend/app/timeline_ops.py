"""Operaciones estructurales del timeline — la FUENTE ÚNICA de la edición.

Funciones puras ``Timeline -> EditResult``: NO mutan la entrada, devuelven un
timeline nuevo más ``changed`` (ids afectados) y ``warnings`` (avisos no fatales,
p. ej. solapes) para el ciclo observar→actuar→verificar del agente.

Reglas:
  * Precondición inválida (clip/pista inexistente, corte fuera de rango, kind que
    no cuadra con la pista) → ``ValueError``.
  * Coherencia del estado resultante (refs, in/out, start) → ``validate_timeline``.

Este módulo es consumido por dos adaptadores finos: endpoints HTTP (frontend) y
tools del MCP. Los snapshots/undo viven en una capa aparte para mantener estas
funciones puras y componibles.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from .schemas import Timeline, TimelineClip, TimelineTrack, Word

TRACK_KINDS = ("video", "audio", "text")
FRAME_POSITIONS = ("full", "top", "bottom", "free")

# Formatos de salida (espejo de FORMATS en editorModel.js).
FORMATS = {"9:16": (720, 1280), "16:9": (1280, 720), "1:1": (1080, 1080),
           "4:5": (864, 1080), "4:3": (960, 720)}


@dataclass
class EditResult:
    """Resultado de una operación: el timeline nuevo + qué cambió."""
    timeline: Timeline
    changed: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _uid(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def _copy(tl: Timeline) -> Timeline:
    """Copia profunda: las ops trabajan sobre ella y nunca tocan la entrada."""
    if isinstance(tl, dict):
        tl = Timeline(**tl)
    return tl.model_copy(deep=True)


def _clip_dur(c: TimelineClip) -> float:
    return max(0.0, float(c.out_point) - float(c.in_point))


def _find_clip(tl: Timeline, clip_id: str) -> TimelineClip:
    for c in tl.clips:
        if c.id == clip_id:
            return c
    raise ValueError(f"Clip inexistente: {clip_id}")


def _find_track(tl: Timeline, track_id: str) -> TimelineTrack:
    for t in tl.tracks:
        if t.id == track_id:
            return t
    raise ValueError(f"Pista inexistente: {track_id}")


def _round(v: float) -> float:
    return round(float(v), 3)


# --- Lectura / validación ------------------------------------------------

def track_overlaps(tl: Timeline, track_id: str) -> list[tuple[str, str]]:
    """Pares de clips que se solapan en el tiempo dentro de una misma pista."""
    row = sorted((c for c in tl.clips if c.track_id == track_id), key=lambda c: c.start)
    out: list[tuple[str, str]] = []
    for i in range(len(row) - 1):
        a = row[i]
        if a.start + _clip_dur(a) > row[i + 1].start + 1e-6:
            out.append((a.id, row[i + 1].id))
    return out


def validate_timeline(tl: Timeline) -> list[str]:
    """Incidencias DURAS del estado (refs rotas, rangos imposibles). Vacío = sano.

    Los solapes NO se listan aquí (son avisos, no errores): usar ``track_overlaps``.
    """
    if isinstance(tl, dict):
        tl = Timeline(**tl)
    issues: list[str] = []
    kind_of = {t.id: t.kind for t in tl.tracks}
    for c in tl.clips:
        if c.track_id not in kind_of:
            issues.append(f"clip {c.id}: pista inexistente {c.track_id}")
        elif kind_of[c.track_id] != c.kind:
            issues.append(f"clip {c.id}: kind '{c.kind}' no cuadra con la pista '{kind_of[c.track_id]}'")
        if c.start < 0:
            issues.append(f"clip {c.id}: start negativo ({c.start})")
        if c.in_point < 0:
            issues.append(f"clip {c.id}: in_point negativo ({c.in_point})")
        if c.out_point <= c.in_point:
            issues.append(f"clip {c.id}: rango de fuente vacío o invertido [{c.in_point}, {c.out_point}]")
        if c.source_duration and c.out_point > c.source_duration + 1e-6:
            issues.append(f"clip {c.id}: out_point {c.out_point} excede la duración de fuente {c.source_duration}")
    return issues


def _warn_overlaps(tl: Timeline, track_id: str) -> list[str]:
    return [f"solape en {track_id}: {a} ↔ {b}" for a, b in track_overlaps(tl, track_id)]


# --- Pistas --------------------------------------------------------------

def add_track(tl: Timeline, kind: str, name: str | None = None, track_id: str | None = None) -> EditResult:
    if kind not in TRACK_KINDS:
        raise ValueError(f"kind de pista inválido: {kind} (usa {TRACK_KINDS})")
    out = _copy(tl)
    tid = track_id or _uid("K")
    if any(t.id == tid for t in out.tracks):
        raise ValueError(f"Ya existe una pista con id {tid}")
    prefix = {"video": "V", "audio": "A", "text": "T"}[kind]
    out.tracks.append(TimelineTrack(id=tid, kind=kind, name=name or f"{prefix}{len(out.tracks) + 1}"))
    return EditResult(out, changed=[tid])


def remove_track(tl: Timeline, track_id: str) -> EditResult:
    out = _copy(tl)
    _find_track(out, track_id)
    removed = [c.id for c in out.clips if c.track_id == track_id]
    out.tracks = [t for t in out.tracks if t.id != track_id]
    out.clips = [c for c in out.clips if c.track_id != track_id]
    return EditResult(out, changed=[track_id, *removed])


# --- Clips ---------------------------------------------------------------

def add_clip(tl: Timeline, clip: dict | TimelineClip) -> EditResult:
    out = _copy(tl)
    if isinstance(clip, dict):
        data = dict(clip)
        if not data.get("id"):
            data["id"] = _uid("c")   # id requerido por el modelo; lo generamos si falta
        c = TimelineClip(**data)
    else:
        c = clip.model_copy(deep=True)
        if not c.id:
            c.id = _uid("c")
    track = _find_track(out, c.track_id)   # pista debe existir
    if track.kind != c.kind:
        raise ValueError(f"kind '{c.kind}' no cuadra con la pista '{track.kind}'")
    if any(x.id == c.id for x in out.clips):
        raise ValueError(f"Ya existe un clip con id {c.id}")
    out.clips.append(c)
    return EditResult(out, changed=[c.id], warnings=_warn_overlaps(out, c.track_id))


def move_clip(tl: Timeline, clip_id: str, start: float | None = None, track_id: str | None = None) -> EditResult:
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if track_id is not None:
        track = _find_track(out, track_id)
        if track.kind != c.kind:
            raise ValueError(f"no se puede mover un clip '{c.kind}' a una pista '{track.kind}'")
        c.track_id = track_id
    if start is not None:
        if start < 0:
            raise ValueError("start no puede ser negativo")
        c.start = _round(start)
    return EditResult(out, changed=[clip_id], warnings=_warn_overlaps(out, c.track_id))


def remove_clip(tl: Timeline, clip_id: str) -> EditResult:
    out = _copy(tl)
    _find_clip(out, clip_id)   # valida existencia
    out.clips = [c for c in out.clips if c.id != clip_id]
    return EditResult(out, changed=[clip_id])


def _split_words(words: list[Word], rel: float) -> tuple[list[Word], list[Word]]:
    """Reparte words[] (relativas al clip) en el punto ``rel``.

    Regla de borde determinista: una palabra que empieza exactamente en ``rel``
    va a la SEGUNDA mitad. La segunda mitad se re-relativiza (resta ``rel``).
    """
    first = [w for w in words if w.start < rel - 1e-9]
    second = [w.model_copy(update={"start": _round(w.start - rel), "end": _round(max(0.0, w.end - rel))})
              for w in words if w.start >= rel - 1e-9]
    return first, second


def split_clip(tl: Timeline, clip_id: str, at_time: float) -> EditResult:
    """Parte un clip en el instante absoluto ``at_time`` de la timeline."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    dur = _clip_dur(c)
    rel = at_time - c.start
    if rel <= 1e-6 or rel >= dur - 1e-6:
        raise ValueError(f"at_time {at_time} debe caer DENTRO del clip [{c.start}, {c.start + dur}]")
    cut = c.in_point + rel

    a = c.model_copy(deep=True)
    a.id = _uid("c")
    a.out_point = _round(cut)
    a.source_duration = c.source_duration

    b = c.model_copy(deep=True)
    b.id = _uid("c")
    b.start = _round(c.start + rel)
    b.in_point = _round(cut)

    if c.kind == "text" and c.words:
        wa, wb = _split_words(c.words, rel)
        a.words, b.words = wa, wb

    idx = out.clips.index(c)
    out.clips[idx:idx + 1] = [a, b]
    return EditResult(out, changed=[a.id, b.id], warnings=_warn_overlaps(out, c.track_id))


def set_project_format(tl: Timeline, aspect: str | None = None, width: int | None = None,
                       height: int | None = None, fps: int | None = None) -> EditResult:
    """Cambia el formato de salida. ``aspect`` (9:16, 16:9, 1:1, 4:5, 4:3) resuelve
    ancho/alto; o se pasan ``width``/``height`` explícitos. El material master se
    re-adapta al formato en el render (recipe_layout), sin re-cortar clips."""
    out = _copy(tl)
    if aspect is not None:
        if aspect not in FORMATS:
            raise ValueError(f"aspect inválido: {aspect} (usa {list(FORMATS)})")
        out.width, out.height = FORMATS[aspect]
    if width is not None:
        out.width = int(width)
    if height is not None:
        out.height = int(height)
    if fps is not None:
        if fps <= 0:
            raise ValueError("fps debe ser > 0")
        out.fps = int(fps)
    return EditResult(out)


def set_clip_layout(tl: Timeline, clip_id: str, position: str | None = None,
                    start: float | None = None, duration: float | None = None) -> EditResult:
    """Coloca un clip: posición (full/top/bottom/free) y opcionalmente timing.

    Cubre "este arriba / este abajo durante N s": ``position`` mapea a ``frame`` y
    ``duration`` fija ``out_point = in_point + duration`` (acotado a la fuente).
    """
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if position is not None:
        if position not in FRAME_POSITIONS:
            raise ValueError(f"position inválida: {position} (usa {FRAME_POSITIONS})")
        c.frame = position
    if start is not None:
        if start < 0:
            raise ValueError("start no puede ser negativo")
        c.start = _round(start)
    if duration is not None:
        if duration <= 0:
            raise ValueError("duration debe ser > 0")
        end = c.in_point + duration
        if c.source_duration:
            end = min(end, c.source_duration)
        c.out_point = _round(end)
    return EditResult(out, changed=[clip_id])
