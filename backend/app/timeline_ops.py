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

import math
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from . import fragment, shapes
from .clip_kind import (
    clip_fits_track,
    has_generated_duration,
    is_visual_clip,
)
from .clip_speed import SPEED_MAX, SPEED_MIN
from .schemas import Keyframe, Reframe, Timeline, TimelineClip, TimelineTrack, Word
from .track_stack import insert_track, reorder_track as _reorder_tracks

TRACK_KINDS = ("video", "audio", "text")
FRAME_POSITIONS = ("full", "top", "bottom", "free")

# Formato de salida = proporción × resolución (lado corto).
# Espejo de frontend/src/lib/projectFormat.js.
ASPECTS = {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1),
           "4:3": (4, 3), "3:4": (3, 4), "4:5": (4, 5)}
RESOLUTIONS = (480, 720, 1080, 2160)
DIM_MIN, DIM_MAX = 144, 4096
_RATIO_TOL = 0.01


def even_dim(n: float) -> int:
    """Dimensión válida para H.264/yuv420p: par y dentro de [DIM_MIN, DIM_MAX]."""
    # floor(x + .5) = Math.round de JS; round() de Python redondea .5 al par.
    c = min(DIM_MAX, max(DIM_MIN, math.floor(float(n) + 0.5)))
    return int(math.floor(c / 2 + 0.5) * 2)


def size_for_ratio(rw: float, rh: float, short_side: float) -> tuple[int, int]:
    """(w, h) para la proporción rw:rh con ``short_side`` px en el lado corto;
    el lado largo se limita a DIM_MAX reduciendo el corto."""
    r = rw / rh
    s = max(DIM_MIN, float(short_side))
    k = r if r >= 1 else 1 / r
    if s * k > DIM_MAX:
        s = DIM_MAX / k
    long = s * k
    return (even_dim(long), even_dim(s)) if r >= 1 else (even_dim(s), even_dim(long))


def aspect_of(width: int, height: int) -> str | None:
    """Id de ASPECTS que coincide con w:h (tolerancia 1 %), o ``None``."""
    if width <= 0 or height <= 0:
        return None
    r = width / height
    for aid, (rw, rh) in ASPECTS.items():
        if abs(r - rw / rh) / (rw / rh) < _RATIO_TOL:
            return aid
    return None


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


def _clamp01(v, default: float = 0.5) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return default


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
        elif not clip_fits_track(c.kind, kind_of[c.track_id]):
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


def _clip_tl_dur(c: TimelineClip) -> float:
    span = max(0.0, (c.out_point or 0.0) - (c.in_point or 0.0))
    if c.kind in ("text", "image", "shape"):
        return span
    sp = float(c.speed or 1.0)
    return span / sp if sp > 0 else span


def _apply_audio_to_clip(c: TimelineClip, volume=None, muted=None, audio_fx=None,
                         replace_fx: bool = False, fade: str | None = None,
                         fade_dur: float = 0.5) -> None:
    from .clip_keyframes import apply_volume_fade, clamp_volume
    if c.kind not in ("video", "audio"):
        raise ValueError("volumen/audio_fx solo aplica a clips de vídeo o audio")
    if volume is not None:
        c.volume = clamp_volume(volume)
    if muted is not None:
        c.muted = bool(muted)
    if audio_fx is not None:
        if not isinstance(audio_fx, dict):
            raise ValueError("audio_fx debe ser un objeto")
        from .audio_fx import AUDIO_FX_IDS
        bad = [k for k in audio_fx if k not in AUDIO_FX_IDS]
        if bad:
            raise ValueError(f"audio_fx: efectos no válidos {bad} (usa {list(AUDIO_FX_IDS)})")
        base = {} if replace_fx else dict(c.audio_fx or {})
        base.update(audio_fx)
        c.audio_fx = base or None
    if fade:
        if fade not in ("in", "out"):
            raise ValueError("fade debe ser 'in' o 'out'")
        data = apply_volume_fade(c.model_dump(), _clip_tl_dur(c), fade, fade_dur)
        c.volume = data.get("volume", c.volume)
        c.keyframes = data.get("keyframes")


# --- Pistas --------------------------------------------------------------

def add_track(tl: Timeline, kind: str, name: str | None = None, track_id: str | None = None) -> EditResult:
    if kind not in TRACK_KINDS:
        raise ValueError(f"kind de pista inválido: {kind} (usa {TRACK_KINDS})")
    out = _copy(tl)
    tid = track_id or _uid("K")
    if any(t.id == tid for t in out.tracks):
        raise ValueError(f"Ya existe una pista con id {tid}")
    prefix = {"video": "V", "audio": "A", "text": "T"}[kind]
    insert_track(out.tracks, TimelineTrack(id=tid, kind=kind, name=name or f"{prefix}{len(out.tracks) + 1}"))
    return EditResult(out, changed=[tid])


def reorder_track(tl: Timeline, track_id: str, target_track_id: str, place: str = "above") -> EditResult:
    """Coloca la pista justo encima (``above``) o debajo (``below``) de otra, tal
    como se ven en la timeline. Vídeo y texto comparten pila (``track_stack``): un
    texto debajo de un vídeo queda DETRÁS de él. El audio solo se ordena entre audio."""
    out = _copy(tl)
    out.tracks = _reorder_tracks(out.tracks, track_id, target_track_id, place)
    return EditResult(out, changed=[track_id])


def rename_track(tl: Timeline, track_id: str, name: str) -> EditResult:
    """Cambia el nombre visible de una pista (A1, SFX, Voz…). El id no cambia."""
    label = (name or "").strip()[:32]
    if not label:
        raise ValueError("el nombre de la pista no puede estar vacío")
    out = _copy(tl)
    t = _find_track(out, track_id)
    t.name = label
    return EditResult(out, changed=[track_id])


def remove_track(tl: Timeline, track_id: str) -> EditResult:
    out = _copy(tl)
    _find_track(out, track_id)
    removed = [c.id for c in out.clips if c.track_id == track_id]
    out.tracks = [t for t in out.tracks if t.id != track_id]
    for t in out.tracks:
        if t.linked_track_id == track_id:
            t.linked_track_id = None
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
    if not clip_fits_track(c.kind, track.kind):
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
        if not clip_fits_track(c.kind, track.kind):
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
    from .clip_speed import clip_speed, clip_timeline_duration

    out = _copy(tl)
    c = _find_clip(out, clip_id)
    # Duración y corte en tiempo de TIMELINE → fuente (velocidad e invertido),
    # como editorModel.splitClipAt. Antes se ignoraba la velocidad.
    speed = 1.0 if c.kind == "text" else clip_speed(c)
    dur = _clip_dur(c) if c.kind == "text" else clip_timeline_duration(c)
    rel = at_time - c.start
    if rel <= 1e-6 or rel >= dur - 1e-6:
        raise ValueError(f"at_time {at_time} debe caer DENTRO del clip [{c.start}, {c.start + dur}]")
    reverse = bool(c.reverse) and c.kind != "text"
    cut = (c.out_point - rel * speed) if reverse else (c.in_point + rel * speed)

    a = c.model_copy(deep=True)
    a.id = _uid("c")
    if reverse:
        a.in_point = _round(cut)
    else:
        a.out_point = _round(cut)
    a.source_duration = c.source_duration

    b = c.model_copy(deep=True)
    b.id = _uid("c")
    b.start = _round(c.start + rel)
    if reverse:
        b.out_point = _round(cut)
    else:
        b.in_point = _round(cut)
    # Keyframes de pose (tiempo LOCAL): la parte derecha continúa la animación
    # donde iba, en vez de reiniciarla (espejo de editorModel.splitClipAt).
    if isinstance(b.keyframes, dict) and b.keyframes.get("items"):
        b.keyframes = {**b.keyframes, "items": [
            {**k, "id": _uid("k"), "t": round(float(k.get("t", 0)) - rel, 4)}
            for k in b.keyframes["items"] if isinstance(k, dict)]}

    if c.kind == "text" and c.words:
        wa, wb = _split_words(c.words, rel)
        a.words, b.words = wa, wb

    idx = out.clips.index(c)
    out.clips[idx:idx + 1] = [a, b]
    return EditResult(out, changed=[a.id, b.id], warnings=_warn_overlaps(out, c.track_id))


def add_subtitles(tl: Timeline, source_clip_id: str, segments, style: dict | None = None,
                  track_id: str | None = None, transcript_id: str | None = None) -> EditResult:
    """Genera clips de texto desde una transcripción y los coloca en una pista de
    texto, alineados al clip fuente. Usa el mismo motor que el editor
    (``fragment.py``, espejo de editorModel.js): `words[]` reales + `origin`.

    Si ``track_id`` es None usa la primera pista de texto o crea una. ``style`` por
    defecto = el de la pista destino (para heredar tema/estilo).
    """
    out = _copy(tl)
    src = _find_clip(out, source_clip_id)

    created: list[str] = []
    if track_id is not None:
        track = _find_track(out, track_id)
        if track.kind != "text":
            raise ValueError(f"la pista {track_id} no es de texto")
        tid = track_id
    else:
        existing = next((t for t in out.tracks if t.kind == "text"), None)
        if existing is None:
            tid = _uid("T")
            track = TimelineTrack(id=tid, kind="text", name="Subtítulos")
            insert_track(out.tracks, track)
            created = [tid]
        else:
            tid, track = existing.id, existing

    st = style if style is not None else (track.style or {})
    src_dict = {"start": src.start, "in_point": src.in_point, "out_point": src.out_point}
    made = fragment.text_clips_from_transcript(src_dict, list(segments or []), tid, st, transcript_id)

    new_ids: list[str] = []
    for cd in made:
        c = TimelineClip(**cd)
        out.clips.append(c)
        new_ids.append(c.id)
    return EditResult(out, changed=[*created, *new_ids], warnings=_warn_overlaps(out, tid))


def set_project_format(tl: Timeline, aspect: str | None = None, width: int | None = None,
                       height: int | None = None, fps: int | None = None,
                       resolution: int | None = None) -> EditResult:
    """Cambia el formato de salida.

    * ``aspect`` (16:9, 9:16, 1:1, 4:3, 3:4, 4:5) cambia la proporción conservando
      el lado corto actual.
    * ``resolution`` (480/720/1080/2160 = lado corto) cambia el tamaño conservando
      la proporción (la de ``aspect`` si se pasa a la vez).
    * ``width``/``height`` explícitos mandan sobre lo anterior (se redondean a par).

    El material master se re-adapta al formato en el render (recipe_layout), sin
    re-cortar clips."""
    out = _copy(tl)
    if aspect is not None and aspect not in ASPECTS:
        raise ValueError(f"aspect inválido: {aspect} (usa {list(ASPECTS)})")
    if resolution is not None and int(resolution) not in RESOLUTIONS:
        raise ValueError(f"resolution inválida: {resolution} (usa {list(RESOLUTIONS)})")
    if aspect is not None or resolution is not None:
        rw, rh = ASPECTS[aspect] if aspect is not None else (out.width, out.height)
        short = int(resolution) if resolution is not None else min(out.width, out.height)
        out.width, out.height = size_for_ratio(rw, rh, short)
    if width is not None:
        out.width = even_dim(width)
    if height is not None:
        out.height = even_dim(height)
    if fps is not None:
        if fps <= 0:
            raise ValueError("fps debe ser > 0")
        out.fps = int(fps)
    return EditResult(out)


REFRAME_MODES = ("center", "manual", "keyframes")


def reframe_clip(tl: Timeline, clip_id: str, mode: str = "center", zoom: float | None = None,
                 pan_from: dict | None = None, pan_to: dict | None = None,
                 keyframes: list | None = None) -> EditResult:
    """Encuadra un clip visual (vídeo o imagen: reframe/paneo/zoom).

    * ``center``   → recorte centrado (con ``zoom``).
    * ``manual``   → ``zoom`` + paneo: estático en ``pan_from``, o animado
      ``pan_from → pan_to`` (cada uno ``{"cx", "cy"}`` en 0-1).
    * ``keyframes``→ aplica keyframes ya calculados (lo usa el modo ``auto`` de
      face-tracking, que corre como job en la capa de tool y luego llama aquí).

    El agente casi nunca escribe keyframes a mano; el MCP los genera. ``t`` de los
    keyframes va en tiempo de FUENTE (in_point..out_point).
    """
    if mode not in REFRAME_MODES:
        raise ValueError(f"mode inválido: {mode} (usa {REFRAME_MODES})")
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if not is_visual_clip(c):
        raise ValueError("reframe solo aplica a clips de vídeo o imagen")
    z = 1.0 if zoom is None else float(zoom)
    if not (0.1 <= z <= 1.0):
        raise ValueError("zoom debe estar en [0.1, 1.0]")

    if mode == "center":
        kfs = [Keyframe(t=c.in_point, cx=0.5, cy=0.5)]
    elif mode == "manual":
        frm = pan_from or {"cx": 0.5, "cy": 0.5}
        fcx, fcy = _clamp01(frm.get("cx", 0.5)), _clamp01(frm.get("cy", 0.5))
        if pan_to is None:
            kfs = [Keyframe(t=c.in_point, cx=fcx, cy=fcy)]
        else:
            kfs = [Keyframe(t=c.in_point, cx=fcx, cy=fcy),
                   Keyframe(t=c.out_point, cx=_clamp01(pan_to.get("cx", 0.5)), cy=_clamp01(pan_to.get("cy", 0.5)))]
    else:  # keyframes
        if not keyframes:
            raise ValueError("mode 'keyframes' requiere una lista de keyframes")
        kfs = [k if isinstance(k, Keyframe) else Keyframe(**k) for k in keyframes]

    reframe = c.reframe.model_copy(deep=True) if c.reframe else Reframe()
    reframe.zoom = z
    reframe.keyframes = kfs
    c.reframe = reframe
    return EditResult(out, changed=[clip_id])


def crop_clip(tl: Timeline, clip_ids: list[str] | None = None, track_id: str | None = None,
              reset: bool = False, cx: float | None = None, cy: float | None = None,
              w: float | None = None, h: float | None = None) -> EditResult:
    """Recorte de clips visuales libres (el modal "Recortar" del editor).

    Ventana sobre la FUENTE en fracciones 0-1: centro ``cx``/``cy`` y tamaño ``w``/``h``
    (→ ``reframe.crop_w/crop_h`` + centro en ``reframe.keyframes``). ``reset`` =
    Restablecer: fotograma completo. El recorte es FIJO en todo el clip (como CapCut):
    sustituye el encuadre animado/seguimiento y fija ``cx``/``cy`` en los snapshots de
    ``keyframes.items`` (el resto de propiedades animadas no se toca).

    Objetivo: ``clip_ids`` y/o todos los clips visuales de ``track_id``. Una sola
    operación → un solo paso de undo.
    """
    out = _copy(tl)
    ids = list(clip_ids or [])
    if track_id is not None:
        _find_track(out, track_id)
        ids += [c.id for c in out.clips if c.track_id == track_id and is_visual_clip(c)]
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise ValueError("indica clip_ids o un track_id con clips visuales")
    if reset:
        cx, cy, w, h = 0.5, 0.5, 1.0, 1.0
    if w is None or h is None:
        raise ValueError("indica w y h (0.05-1) o reset=true")
    w = min(1.0, max(0.05, float(w)))
    h = min(1.0, max(0.05, float(h)))
    # Mismo acotado que clampCrop (clipLayout.js): la ventana no se sale de la fuente.
    cx = 0.5 if w >= 1 else min(1 - w / 2, max(w / 2, float(0.5 if cx is None else cx)))
    cy = 0.5 if h >= 1 else min(1 - h / 2, max(h / 2, float(0.5 if cy is None else cy)))

    changed: list[str] = []
    for cid in ids:
        c = _find_clip(out, cid)
        if not is_visual_clip(c):
            raise ValueError(f"el clip {cid} no es de vídeo ni imagen")
        if c.layout != "overlay":
            raise ValueError(f"el clip {cid} no es un objeto libre (layout=overlay); usa reframe_clip")
        rf = c.reframe.model_copy(deep=True) if c.reframe else Reframe()
        k0 = rf.keyframes[0] if rf.keyframes else None
        rf.crop_w = round(w, 4)
        rf.crop_h = round(h, 4)
        rf.keyframes = [Keyframe(t=c.in_point, cx=round(cx, 4), cy=round(cy, 4),
                                 zoom=k0.zoom if k0 else None, pan_mode=k0.pan_mode if k0 else None)]
        c.reframe = rf
        kf = c.keyframes if isinstance(c.keyframes, dict) else None
        if kf and kf.get("items"):
            items = []
            for it in kf["items"]:
                props = dict(it.get("props") or {})
                if "cx" in props or "cy" in props:
                    props["cx"], props["cy"] = round(cx, 4), round(cy, 4)
                items.append({**it, "props": props})
            c.keyframes = {**kf, "items": items}
        changed.append(cid)
    return EditResult(out, changed=changed)


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
        if has_generated_duration(c):
            c.out_point = _round(end)
            c.source_duration = _round(max(c.source_duration or 0.0, end))
        else:
            if c.source_duration:
                end = min(end, c.source_duration)
            c.out_point = _round(end)
    return EditResult(out, changed=[clip_id])


# --- Etapa 4.5: propiedades por-clip (efectos, anim, shapes…) ------------

APPEAR = ("none", "fade", "dissolve", "wipe", "zoom", "slide_up", "slide_left", "pop")
EXIT = ("none", "fade", "dissolve", "wipe", "zoom", "slide_down", "slide_right", "pop")


def set_clip_opacity(tl: Timeline, clip_id: str, opacity: float) -> EditResult:
    """Opacidad estática del clip (0 = transparente, 1 = opaco)."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    o = float(opacity)
    if not (0.0 <= o <= 1.0):
        raise ValueError("opacity debe estar en [0, 1]")
    c.opacity = o
    return EditResult(out, changed=[clip_id])


def set_clip_speed(tl: Timeline, clip_id: str, speed: float | None = None,
                   keep_pitch: bool | None = None, reverse: bool | None = None) -> EditResult:
    """Velocidad del clip (0.1–10; la fuente fija, la barra cambia). No aplica a
    text/image/shape. ``keep_pitch`` mantiene el tono; ``reverse`` invierte."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if c.kind in ("text", "image", "shape"):
        raise ValueError("speed no aplica a clips de texto/imagen/figura")
    if speed is not None:
        s = float(speed)
        if not (SPEED_MIN <= s <= SPEED_MAX):
            raise ValueError(f"speed debe estar en [{SPEED_MIN}, {SPEED_MAX}]")
        c.speed = s
    if keep_pitch is not None:
        c.keep_pitch = bool(keep_pitch)
    if reverse is not None:
        c.reverse = bool(reverse)
    return EditResult(out, changed=[clip_id])


def set_clip_transition(tl: Timeline, clip_id: str, appear: str | None = None,
                        exit: str | None = None) -> EditResult:
    """Transiciones de entrada (``appear``) y salida (``exit``) del clip."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if appear is not None:
        if appear not in APPEAR:
            raise ValueError(f"appear inválido: {appear} (usa {APPEAR})")
        c.appear = appear
    if exit is not None:
        if exit not in EXIT:
            raise ValueError(f"exit inválido: {exit} (usa {EXIT})")
        c.exit = exit
    return EditResult(out, changed=[clip_id])


def set_text_role(tl: Timeline, clip_id: str, role: str) -> EditResult:
    """Rol de un clip de texto: ``caption`` (subtítulo) o ``free`` (texto libre)."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if c.kind != "text":
        raise ValueError("text_role solo aplica a clips de texto")
    if role not in ("caption", "free"):
        raise ValueError("role debe ser 'caption' o 'free'")
    c.text_role = role
    return EditResult(out, changed=[clip_id])


# Claves aceptadas por update_clip → sub-op que las aplica (orden de aplicación).
_UPDATE_CLIP_KEYS = ("opacity", "speed", "keep_pitch", "reverse", "appear", "exit",
                     "position", "start", "duration", "role", "note", "flip_h", "flip_v",
                     "blend_mode", "disabled")


def set_clip_blend(tl: Timeline, clip_id: str, blend_mode: str | None) -> EditResult:
    """Modo de fusión (#8) de un clip visual o de texto (``clip_blend.BLEND_MODES``;
    ``None``/"normal" lo quita)."""
    from .clip_blend import BLEND_MODES

    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if c.kind == "audio":
        raise ValueError("blend_mode no aplica a clips de audio")
    mode = blend_mode or "normal"
    if mode not in BLEND_MODES:
        raise ValueError(f"blend_mode debe ser uno de {list(BLEND_MODES)}")
    c.blend_mode = None if mode == "normal" else mode
    return EditResult(out, changed=[clip_id])


def set_clip_flip(tl: Timeline, clip_id: str, flip_h: bool | None = None,
                  flip_v: bool | None = None) -> EditResult:
    """Voltear (#7) en horizontal/vertical: espejo del contenido en los ejes del
    clip (vídeo, imagen, figura o texto). ``None`` deja ese eje como está."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if c.kind == "audio":
        raise ValueError("flip no aplica a clips de audio")
    if flip_h is not None:
        c.flip_h = bool(flip_h)
    if flip_v is not None:
        c.flip_v = bool(flip_v)
    return EditResult(out, changed=[clip_id])


def update_clip(tl: Timeline, clip_id: str, patch: dict | None = None) -> EditResult:
    """Actualiza varias propiedades escalares de un clip en UNA sola operación.

    Consolida los setters escalares (opacity, speed/keep_pitch/reverse,
    appear/exit, position/start/duration, role, flip_h/flip_v, blend_mode, disabled) encadenando las sub-ops puras →
    un único snapshot de undo. Los grupos ausentes no se tocan; cada sub-op valida
    su rango y lanza ``ValueError`` como siempre.
    """
    patch = patch or {}
    unknown = [k for k in patch if k not in _UPDATE_CLIP_KEYS]
    if unknown:
        raise ValueError(f"patch: claves no válidas {unknown} (usa {list(_UPDATE_CLIP_KEYS)})")
    if not any(k in patch for k in _UPDATE_CLIP_KEYS):
        raise ValueError("patch vacío: indica al menos una propiedad a cambiar")

    cur = tl
    warnings: list[str] = []
    if "opacity" in patch:
        r = set_clip_opacity(cur, clip_id, patch["opacity"])
        cur, warnings = r.timeline, warnings + r.warnings
    if any(k in patch for k in ("speed", "keep_pitch", "reverse")):
        r = set_clip_speed(cur, clip_id, speed=patch.get("speed"),
                           keep_pitch=patch.get("keep_pitch"), reverse=patch.get("reverse"))
        cur, warnings = r.timeline, warnings + r.warnings
    if any(k in patch for k in ("appear", "exit")):
        r = set_clip_transition(cur, clip_id, appear=patch.get("appear"), exit=patch.get("exit"))
        cur, warnings = r.timeline, warnings + r.warnings
    if any(k in patch for k in ("position", "start", "duration")):
        r = set_clip_layout(cur, clip_id, position=patch.get("position"),
                            start=patch.get("start"), duration=patch.get("duration"))
        cur, warnings = r.timeline, warnings + r.warnings
    if "role" in patch:
        r = set_text_role(cur, clip_id, patch["role"])
        cur, warnings = r.timeline, warnings + r.warnings
    if "note" in patch:
        r = set_clip_note(cur, clip_id, patch["note"])
        cur, warnings = r.timeline, warnings + r.warnings
    if any(k in patch for k in ("flip_h", "flip_v")):
        r = set_clip_flip(cur, clip_id, flip_h=patch.get("flip_h"), flip_v=patch.get("flip_v"))
        cur, warnings = r.timeline, warnings + r.warnings
    if "blend_mode" in patch:
        r = set_clip_blend(cur, clip_id, patch["blend_mode"])
        cur, warnings = r.timeline, warnings + r.warnings
    if "disabled" in patch:
        # Desactivar (#10, tecla V): el clip se queda en la timeline pero no se ve,
        # no suena ni se exporta.
        cur = _copy(cur)
        _find_clip(cur, clip_id).disabled = bool(patch["disabled"])

    return EditResult(cur, changed=[clip_id], warnings=warnings)


def freeze_frame(tl: Timeline, clip_id: str, at_time: float, image: dict,
                 duration: float = 3.0) -> EditResult:
    """Congelar fotograma (#11): inserta en ``at_time`` la imagen ``image``
    ({id, filename, label}: el fotograma ya extraído, ver ``freeze.py``) con la
    misma pose, recorte y efectos que el vídeo en ese instante; parte el vídeo y
    desplaza ``duration`` s la parte derecha y lo que venga detrás en su pista.
    Espejo de ``frontend/src/lib/freezeFrame.js``."""
    from .clip_anim import clip_pose
    from .clip_keyframes import clip_props_at, keyframes_enabled
    from .clip_mask import clip_masks_at
    from .clip_speed import clip_speed, clip_timeline_duration
    from .reframe_math import frame_at

    out = _copy(tl)
    v = _find_clip(out, clip_id)
    if v.kind != "video":
        raise ValueError("solo se puede congelar un fotograma de un clip de vídeo")
    dur = max(0.1, float(duration))
    tdur = clip_timeline_duration(v)
    rel = float(at_time) - v.start
    if rel < -1e-3 or rel > tdur + 1e-3:
        raise ValueError(f"at_time {at_time} debe caer dentro del clip [{v.start}, {v.start + tdur}]")
    rel = min(max(rel, 0.0), tdur)
    sp = clip_speed(v)
    src = (v.out_point - rel * sp) if v.reverse else (v.in_point + rel * sp)
    src = min(max(src, v.in_point), v.out_point)

    pose = clip_pose(v, rel)
    rf = v.reframe
    reframe = None
    if rf is not None:
        if keyframes_enabled(v):
            p = clip_props_at(v, rel)
            fr = {"cx": p["cx"], "cy": p["cy"], "zoom": p["zoom"]}
        else:
            fr = frame_at(rf.keyframes, src, rf.zoom or 1.0, rf.pan_mode or "smooth")
        kf = Keyframe(t=0, cx=fr["cx"], cy=fr["cy"], zoom=fr.get("zoom"), pan_mode="smooth",
                      fit=fr.get("fit"))
        reframe = rf.model_copy(deep=True)
        reframe.zoom = fr.get("zoom") or rf.zoom
        reframe.keyframes = [kf]
        if rf.dual_crop:
            f2 = frame_at(rf.keyframes2 or rf.keyframes, src, rf.zoom2 or rf.zoom or 1.0,
                          rf.pan_mode or "smooth")
            reframe.keyframes2 = [Keyframe(t=0, cx=f2["cx"], cy=f2["cy"], zoom=f2.get("zoom"),
                                           pan_mode="smooth", fit=f2.get("fit"))]
        else:
            reframe.keyframes2 = []
    bg = dict(v.bg_removal) if isinstance(v.bg_removal, dict) else None
    frozen = TimelineClip(
        id=_uid("c"), track_id=v.track_id, kind="image", asset_kind="images",
        asset_id=str(image["id"]), filename=image["filename"],
        name=image.get("label") or image["filename"],
        start=0.0, in_point=0.0, out_point=_round(dur), source_duration=_round(dur),
        layout=v.layout, frame=v.frame, reframe=reframe,
        transform={"x": pose["x"], "y": pose["y"], "scale": pose["scale"], "rotation": pose["rotation"]},
        opacity=pose["opacity"] if pose["opacity"] < 1 else None,
        effects=dict(v.effects or {}), look=v.look or "none",
        masks=clip_masks_at(v, rel, include_adjust=True),
        flip_h=v.flip_h, flip_v=v.flip_v, blend_mode=v.blend_mode,
        bg_removal=({**bg, "auto": {**(bg.get("auto") or {}), "enabled": False}}
                    if bg and (bg.get("chroma") or {}).get("enabled") else None),
    )

    # Partir el vídeo (o poner el congelado delante / detrás si el cabezal está en
    # un borde) y desplazar lo que viene detrás en la misma pista.
    can_split = 0.1 < abs(src - v.in_point) and 0.1 < abs(v.out_point - src)
    if can_split:
        pivot = v.start + rel
    else:
        pivot = v.start if rel < tdur / 2 else v.start + tdur
    frozen.start = _round(pivot)
    shifted: list[TimelineClip] = []
    for c in out.clips:
        if c.id != v.id and c.track_id == v.track_id and c.start >= pivot - 1e-3:
            c.start = _round(c.start + dur)
            shifted.append(c)
    idx = out.clips.index(v)
    if can_split:
        right = v.model_copy(deep=True)
        right.id = _uid("c")
        cut = _round(src)
        if v.reverse:
            v.in_point, right.out_point = cut, cut
        else:
            v.out_point, right.in_point = cut, cut
        right.start = _round(pivot + dur)
        if isinstance(right.keyframes, dict) and right.keyframes.get("items"):
            right.keyframes = {**right.keyframes, "items": [
                {**k, "id": _uid("k"), "t": round(float(k.get("t", 0)) - rel, 4)}
                for k in right.keyframes["items"] if isinstance(k, dict)]}
        out.clips[idx:idx + 1] = [v, frozen, right]
        changed = [v.id, frozen.id, right.id]
    elif pivot <= v.start + 1e-6:
        v.start = _round(v.start + dur)
        out.clips[idx:idx + 1] = [frozen, v]
        changed = [frozen.id, v.id]
    else:
        out.clips[idx:idx + 1] = [v, frozen]
        changed = [v.id, frozen.id]
    return EditResult(out, changed=changed + [c.id for c in shifted])


BEAT_EVERY = (1, 2, 4)


def set_clip_beats(tl: Timeline, clip_id: str, beats: dict | None) -> EditResult:
    """Beats (#12) de un clip de audio o vídeo: ``{times: [s del archivo], bpm,
    every: 1|2|4}`` (``every`` = uno de cada N, para imán y marcas). None los quita."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if c.kind not in ("audio", "video"):
        raise ValueError("los beats solo aplican a clips de audio o vídeo")
    if beats is None:
        c.beats = None
        return EditResult(out, changed=[clip_id])
    if not isinstance(beats, dict):
        raise ValueError("beats debe ser un objeto {times, bpm, every}")
    times = sorted(round(float(t), 3) for t in (beats.get("times") or []) if float(t) >= 0)
    every = int(beats.get("every") or 1)
    if every not in BEAT_EVERY:
        raise ValueError(f"every debe ser uno de {list(BEAT_EVERY)}")
    c.beats = {"times": times, "bpm": round(float(beats.get("bpm") or 0.0), 1), "every": every}
    return EditResult(out, changed=[clip_id])


def set_markers(tl: Timeline, markers: list | None) -> EditResult:
    """Sustituye los marcadores de la timeline (#12): ``[{t, label?, color?, id?}]``
    en segundos de timeline."""
    out = _copy(tl)
    norm = []
    for m in markers or []:
        if not isinstance(m, dict) or m.get("t") is None:
            raise ValueError("cada marcador necesita 't' (segundos de timeline)")
        item = {"id": str(m.get("id") or _uid("m")), "t": _round(max(0.0, float(m["t"])))}
        if m.get("label"):
            item["label"] = str(m["label"])[:60]
        if m.get("color"):
            item["color"] = str(m["color"])
        norm.append(item)
    out.markers = sorted(norm, key=lambda m: m["t"])
    return EditResult(out, changed=[m["id"] for m in out.markers])


def paste_clip_attributes(tl: Timeline, source_clip_id: str, target_clip_ids: list,
                          groups: list | None = None) -> EditResult:
    """Pegar atributos (#13): copia los grupos ``groups`` (``clip_attrs.ATTR_GROUP_IDS``;
    ``None`` = todos) del clip ``source_clip_id`` a cada clip de ``target_clip_ids``,
    sin tocar su contenido ni sus tiempos. Espejo de ``lib/clipAttrs.js``."""
    from .clip_attrs import ATTR_GROUP_IDS, group_applies, paste_attributes

    wanted = list(ATTR_GROUP_IDS) if groups is None else [str(g) for g in groups]
    bad = [g for g in wanted if g not in ATTR_GROUP_IDS]
    if bad:
        raise ValueError(f"groups: grupos no válidos {bad} (usa {list(ATTR_GROUP_IDS)})")
    if not wanted:
        raise ValueError("groups vacío: indica al menos un grupo")
    targets = [str(t) for t in (target_clip_ids or []) if str(t) != source_clip_id]
    if not targets:
        raise ValueError("target_clip_ids: indica al menos un clip destino distinto del origen")
    out = _copy(tl)
    src = _find_clip(out, source_clip_id).model_dump()
    changed: list[str] = []
    warnings: list[str] = []
    for tid in dict.fromkeys(targets):
        i = next((j for j, c in enumerate(out.clips) if c.id == tid), None)
        if i is None:
            raise ValueError(f"Clip inexistente: {tid}")
        cur = out.clips[i].model_dump()
        ok = [g for g in wanted if group_applies(g, src, cur)]
        skipped = [g for g in wanted if g not in ok]
        if skipped and groups is not None:
            warnings.append(f"{tid} ({cur['kind']}): no admite {skipped}")
        if not ok:
            continue
        out.clips[i] = TimelineClip.model_validate(paste_attributes(cur, src, ok))
        changed.append(tid)
    if not changed:
        raise ValueError("ningún clip destino admite esos grupos")
    return EditResult(out, changed=changed, warnings=warnings)


def follow_object(tl: Timeline, follower_clip_id: str, video_clip_id: str, track: list,
                  box_w: float, anchor_t: float, dims: dict, mode: str = "position_scale",
                  min_gap: float = 0.1) -> EditResult:
    """Seguimiento (#15): el clip ``follower_clip_id`` acompaña al objeto seguido en
    el vídeo ``video_clip_id`` (``track`` de ``object_track.track_object``). Escribe
    keyframes de pose (lineales) y quita los que había dentro del tramo seguido.
    ``dims`` = {srcW, srcH, outW, outH}; ``anchor_t`` = s de timeline en que se marcó."""
    from .clip_keyframes import KF_SNAP, upsert_keyframe_at
    from .object_track import follow_keys

    out = _copy(tl)
    video = _find_clip(out, video_clip_id)
    follower = _find_clip(out, follower_clip_id)
    if video.kind != "video":
        raise ValueError("solo se siguen objetos de un clip de vídeo")
    if follower.id == video.id or follower.kind == "audio":
        raise ValueError("el clip que acompaña debe ser otro clip visual (texto, figura, imagen…)")
    keys = follow_keys(video.model_dump(), follower.model_dump(), track, dims, box_w, anchor_t, mode, min_gap)
    if not keys:
        raise ValueError("el objeto seguido no coincide en el tiempo con ese clip")
    data = follower.model_dump()
    lo, hi = keys[0]["t"] - KF_SNAP, keys[-1]["t"] + KF_SNAP
    kf = data.get("keyframes") if isinstance(data.get("keyframes"), dict) else {}
    if kf.get("enabled"):
        data["keyframes"] = {**kf, "items": [k for k in kf.get("items") or []
                                              if not (lo <= float(k.get("t", 0)) <= hi)]}
    for k in keys:
        patch = {p: k[p] for p in ("x", "y", "scale", "rotation") if p in k}
        data = upsert_keyframe_at(data, k["t"], patch, "linear")
    i = next(j for j, c in enumerate(out.clips) if c.id == follower_clip_id)
    out.clips[i] = TimelineClip.model_validate(data)
    return EditResult(out, changed=[follower_clip_id])


_SFX_TRACK_RE = re.compile(r"^sfx\b", re.I)
_AMBIENCE_FADE = 0.4


def add_sound_design(tl: Timeline, clip_id: str, sounds: list) -> EditResult:
    """Sonorizar con IA (#17): coloca los sonidos propuestos por ``sound_design.propose``
    ([{sfx: {id, name, duration}, start, duration, volume, kind, what}], tiempos locales
    de la escena ``clip_id``) en pistas «SFX» sin pisar nada (crea «SFX 2»… si hace
    falta). El ambiente entra y sale con fundido. Espejo de ``lib/soundDesign.js``."""
    from .clip_keyframes import apply_volume_fade
    from .clip_speed import clip_timeline_duration

    out = _copy(tl)
    scene = _find_clip(out, clip_id)
    s0, scene_dur = scene.start, clip_timeline_duration(scene)
    changed: list[str] = []

    def overlaps(track_id: str, start: float, dur: float) -> bool:
        return any(c.track_id == track_id and c.start < start + dur - 1e-6
                   and c.start + _clip_tl_dur(c) > start + 1e-6 for c in out.clips)

    for s in sounds or []:
        sfx = (s or {}).get("sfx") or {}
        if not sfx.get("id"):
            continue
        src = float(sfx.get("duration") or 0)
        start = _round(s0 + min(max(0.0, float(s.get("start") or 0)), max(0.0, scene_dur - 0.1)))
        want = max(0.1, min(float(s.get("duration") or 0.1), s0 + scene_dur - start))
        dur = _round(min(want, src) if src > 0 else want)
        track = next((t for t in out.tracks if t.kind == "audio" and not t.locked
                      and _SFX_TRACK_RE.match(t.name or "") and not overlaps(t.id, start, dur)), None)
        if track is None:
            n = sum(1 for t in out.tracks if t.kind == "audio" and _SFX_TRACK_RE.match(t.name or ""))
            track = TimelineTrack(id=_uid("K"), kind="audio", name=f"SFX {n + 1}" if n else "SFX")
            out.tracks.append(track)
            changed.append(track.id)
        what = str(s.get("what") or "").strip() or None
        data = TimelineClip(
            id=_uid("c"), track_id=track.id, kind="audio", asset_kind="sfx", asset_id=str(sfx["id"]),
            filename=str(sfx["id"]), name=sfx.get("name") or Path(str(sfx["id"])).stem, start=start,
            in_point=0.0, out_point=dur, source_duration=_round(src if src > 0 else dur),
            volume=min(1.0, max(0.05, float(s.get("volume") or 0.8))), note=what,
            note_source="ai" if what else None,
        ).model_dump()
        if s.get("kind") == "ambience" and dur > 1:
            data = apply_volume_fade(data, dur, "in", _AMBIENCE_FADE)
            data = apply_volume_fade(data, dur, "out", _AMBIENCE_FADE)
        c = TimelineClip.model_validate(data)
        out.clips.append(c)
        changed.append(c.id)
    if not changed:
        raise ValueError("no hay sonidos que colocar")
    return EditResult(out, changed=changed)


def _top_free_video_track(out: Timeline, start: float, dur: float, created: list) -> TimelineTrack:
    """La pista de vídeo de ARRIBA si está libre en [start, start+dur); si no, una
    pista de vídeo nueva encima de todas (su id va a ``created``)."""
    vids = [t for t in out.tracks if t.kind == "video"]
    top = vids[-1] if vids else None
    busy = top is not None and any(
        c.track_id == top.id and c.start < start + dur - 1e-6 and c.start + _clip_tl_dur(c) > start + 1e-6
        for c in out.clips)
    if top is not None and not busy and not top.locked:
        return top
    track = TimelineTrack(id=_uid("K"), kind="video", name=f"V{len(vids) + 1}")
    insert_track(out.tracks, track)
    created.append(track.id)
    return track


def add_cinema_bars(tl: Timeline, ratio: str | float = "2.39", start: float = 0.0,
                    duration: float | None = None, animate: bool = False) -> EditResult:
    """Barras de cine (#20): figura ``letterbox`` a lo ancho del cuadro, con el grosor
    que deja lo visible en la proporción ``ratio`` (2.39, 2, 1.85, 16:9 o un número).
    Sin ``duration`` cubre hasta el final de la timeline. ``animate`` = las barras
    entran en 1 s (keyframes de ``draw``)."""
    from .clip_keyframes import upsert_keyframe_at

    r = shapes.CINEMA_RATIOS.get(str(ratio))
    if r is None:
        try:
            r = float(ratio)
        except (TypeError, ValueError):
            raise ValueError(f"ratio: usa {list(shapes.CINEMA_RATIOS)} o un número") from None
    if r <= 0:
        raise ValueError("ratio debe ser > 0")
    out = _copy(tl)
    end = max((c.start + _clip_tl_dur(c) for c in out.clips), default=0.0)
    dur = float(duration) if duration is not None else (end - start if end - start > 0.05 else 5.0)
    if dur <= 0:
        raise ValueError("duration debe ser > 0")
    bar = shapes.cinema_bar(out.width / out.height, r)
    if bar <= 0:
        raise ValueError("con este formato esa proporción no deja barras (el vídeo ya es más ancho)")
    start, dur = _round(max(0.0, float(start))), _round(dur)
    created: list[str] = []
    track = _top_free_video_track(out, start, dur, created)
    shape = shapes.normalize_shape({"type": "letterbox", "bar": bar})
    data = TimelineClip(id=_uid("c"), track_id=track.id, kind="shape", asset_kind="shape", asset_id="letterbox",
                        filename="", name="Barras de cine", start=start, in_point=0.0, out_point=dur,
                        source_duration=dur, shape=shape, layout="fill", frame="full").model_dump()
    if animate:
        data = upsert_keyframe_at(data, 0.0, {"draw": 0.0}, "linear")
        data = upsert_keyframe_at(data, min(1.0, dur), {"draw": 1.0}, "ease-in-out")
    c = TimelineClip.model_validate(data)
    out.clips.append(c)
    return EditResult(out, changed=[*created, c.id])


def add_adjustment_layer(tl: Timeline, start: float = 0.0, duration: float = 5.0,
                         filters: list | None = None, effects: dict | None = None,
                         intensity: float = 1.0, track_id: str | None = None) -> EditResult:
    """Capa de ajuste (#19): un clip que filtra todo lo que tiene debajo durante su
    tramo. Sin ``track_id`` va en la pista de vídeo de ARRIBA si está libre en ese
    tramo; si no, en una pista de vídeo nueva encima de todas."""
    if duration is None or float(duration) <= 0:
        raise ValueError("duration debe ser > 0")
    if start < 0:
        raise ValueError("start no puede ser negativo")
    if not (0.0 <= float(intensity) <= 1.0):
        raise ValueError("intensity debe estar en [0, 1]")
    out = _copy(tl)
    start, dur = _round(float(start)), _round(float(duration))
    created: list[str] = []
    if track_id is not None:
        track = _find_track(out, track_id)
        if track.kind != "video":
            raise ValueError("una capa de ajuste va en una pista de vídeo")
    else:
        track = _top_free_video_track(out, start, dur, created)
    c = TimelineClip(id=_uid("c"), track_id=track.id, kind="adjustment", asset_kind="adjustment",
                     asset_id="adjustment", filename="", name="Capa de ajuste", start=start,
                     in_point=0.0, out_point=dur, source_duration=dur, opacity=float(intensity))
    out.clips.append(c)
    r = EditResult(out, changed=[*created, c.id])
    if filters is not None or effects:
        r2 = set_clip_effects(out, c.id, effects=effects or {}, filters=filters)
        return EditResult(r2.timeline, changed=r.changed)
    return r


def apply_recipe(tl: Timeline, recipe: str, clip_ids: list | None = None,
                 params: dict | None = None) -> EditResult:
    """Receta en un clic (#21): uno de los trucos montado de una vez con las piezas del
    editor (ver ``recipes.py``). Una sola operación: se deshace de golpe."""
    from . import recipes

    new_tl, changed, warnings = recipes.apply(_copy(tl), recipe, clip_ids, params)
    return EditResult(new_tl, changed=changed, warnings=warnings)


def set_clip_note(tl: Timeline, clip_id: str, note: str | None,
                  source: str = "user") -> EditResult:
    """Nota semántica del fragmento: qué representa dentro de la historia.

    ``note=None`` o vacío la borra. ``source='ai'`` marca la nota como propuesta
    automática, para que la UI pueda distinguirla de lo que escribió el usuario;
    una propuesta de IA NO pisa una nota escrita por el usuario (eso lo decide
    quien llama, igual que ``description_ai`` en los materiales).
    """
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    text = (note or "").strip()
    if len(text) > 400:
        text = text[:399].rstrip() + "…"
    c.note = text or None
    c.note_source = (source if text and source in ("user", "ai") else None)
    return EditResult(out, changed=[clip_id])


def set_clip_bg_removal(tl: Timeline, clip_id: str, bg_removal: dict | None,
                        replace: bool = False) -> EditResult:
    """Eliminar fondo del clip: matte de IA y/o chroma key (ver ``clip_bg.py``).

    MERGE por secciones (``auto`` / ``chroma`` / ``outline``) por defecto: un patch que solo
    toca la tolerancia del croma no puede borrar la clave de caché del matte ya
    calculado. ``replace=True`` sustituye todo; ``bg_removal=None`` lo quita.
    No toca el archivo original: es una propiedad del clip, y nada más.
    """
    from .clip_bg import bg_capable, normalize_bg

    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if bg_removal is None:
        c.bg_removal = None
        return EditResult(out, changed=[clip_id])
    if not bg_capable(c):
        raise ValueError("bg_removal solo aplica a clips de vídeo o imagen")
    if not isinstance(bg_removal, dict):
        raise ValueError("bg_removal debe ser un objeto")
    base = {} if replace else dict(c.bg_removal or {})
    merged = dict(base)
    for key, val in bg_removal.items():
        if key in ("auto", "chroma", "outline") and isinstance(val, dict):
            section = dict(base.get(key) or {})
            section.update(val)
            merged[key] = section
        else:
            merged[key] = val
    c.bg_removal = normalize_bg(merged)
    return EditResult(out, changed=[clip_id])


def set_clip_effects(tl: Timeline, clip_id: str, effects: dict | None = None, replace: bool = False,
                     filters: list | None = None) -> EditResult:
    """Efectos visuales del clip (blur/grayscale/sepia/brightness…). Por defecto
    MERGE sobre los existentes; ``replace=True`` los sustituye. Solo clips visuales.
    ``filters`` = pila de filtros de color [{id, amount 0–1}] (#18; [] los quita)."""
    from .clip_filters import FILTER_IDS

    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if not is_visual_clip(c) and c.kind != "adjustment":
        raise ValueError("effects solo aplica a clips visuales (vídeo/imagen) o capas de ajuste")
    if effects is None and filters is None:
        raise ValueError("pasa effects y/o filters")
    if effects is not None:
        if not isinstance(effects, dict):
            raise ValueError("effects debe ser un objeto")
        base = {} if replace else dict(c.effects or {})
        base.update(effects)
        c.effects = base or None
    if filters is not None:
        stack = []
        for f in filters:
            fid = f.get("id") if isinstance(f, dict) else f
            if fid not in FILTER_IDS:
                raise ValueError(f"filtro desconocido: {fid} (usa {list(FILTER_IDS)})")
            amount = float(f.get("amount", 1)) if isinstance(f, dict) else 1.0
            stack.append({"id": fid, "amount": min(1.0, max(0.0, amount))})
        c.filters = stack
        c.look = "none"          # el `look` antiguo pasa a la pila
    return EditResult(out, changed=[clip_id])


def set_clip_masks(tl: Timeline, clip_id: str, masks: list | None) -> EditResult:
    """Sustituye las máscaras del clip (lista normalizada; None/[] = sin máscara).

    Tipos: linear (división), film (rollo de película), circle, rectangle, star,
    heart, text, brush. ``target``: "clip" (qué se ve) o "adjust" (dónde actúan los
    ajustes de color). masks[0] es la que anima con keyframes (mx, my, mw, …).
    """
    from .clip_mask import maskable, normalize_mask

    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if not maskable(c):
        raise ValueError("las máscaras solo aplican a vídeo, imagen, figura o texto")
    if masks is not None and not isinstance(masks, list):
        raise ValueError("masks debe ser una lista de máscaras")
    c.masks = [normalize_mask(m) for m in (masks or []) if isinstance(m, dict)]
    return EditResult(out, changed=[clip_id])


def set_clip_audio_fx(tl: Timeline, clip_id: str, audio_fx: dict, replace: bool = False,
                      ramp: dict | None = None) -> EditResult:
    """Efectos y filtros de sonido (``audio_fx.AUDIO_FX_IDS``, 0–1). MERGE por defecto.
    Solo clips de vídeo o audio. ``ramp`` = {start, end, from=0} (s locales del clip)
    anima cada efecto de ``audio_fx`` desde ``from`` hasta su valor (#16)."""
    from .clip_keyframes import upsert_keyframe_at
    from .clip_speed import clip_timeline_duration

    out = _copy(tl)
    c = _find_clip(out, clip_id)
    _apply_audio_to_clip(c, audio_fx=audio_fx, replace_fx=replace)
    if ramp:
        dur = clip_timeline_duration(c)
        try:
            t0, t1 = float(ramp.get("start", 0.0)), float(ramp["end"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("ramp debe ser {start, end, from?} en segundos del clip") from None
        v0 = float(ramp.get("from", 0.0))
        if not (0 <= t0 < t1 <= dur + 1e-6):
            raise ValueError(f"ramp: 0 <= start < end <= {dur:.2f} (duración del clip)")
        data = c.model_dump()
        start_vals = {k: min(1.0, max(0.0, v0)) for k in audio_fx}
        end_vals = {k: min(1.0, max(0.0, float(v))) if v is not True else 1.0 for k, v in audio_fx.items()}
        data = upsert_keyframe_at(data, t0, start_vals)
        data = upsert_keyframe_at(data, t1, end_vals, "ease-in-out")
        i = next(j for j, x in enumerate(out.clips) if x.id == clip_id)
        out.clips[i] = TimelineClip.model_validate(data)
    return EditResult(out, changed=[clip_id])


def set_clip_volume(tl: Timeline, clip_id: str, volume: float | None = None,
                    muted: bool | None = None, fade: str | None = None,
                    fade_dur: float = 0.5) -> EditResult:
    """Volumen 0–2 (100% = 1, máximo 200%), mute y fade in/out por keyframes."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if volume is None and muted is None and not fade:
        raise ValueError("pasa volume, muted y/o fade")
    _apply_audio_to_clip(c, volume=volume, muted=muted, fade=fade, fade_dur=fade_dur)
    return EditResult(out, changed=[clip_id])


def set_track_audio(tl: Timeline, track_id: str, volume: float | None = None,
                    muted: bool | None = None, audio_fx: dict | None = None,
                    replace_fx: bool = False, fade: str | None = None,
                    fade_dur: float = 0.5) -> EditResult:
    """Aplica volumen/mute/fx/fade a todos los clips de audio o vídeo de la pista."""
    out = _copy(tl)
    _find_track(out, track_id)
    if volume is None and muted is None and audio_fx is None and not fade:
        raise ValueError("pasa volume, muted, audio_fx y/o fade")
    changed: list[str] = []
    for c in out.clips:
        if c.track_id != track_id or c.kind not in ("video", "audio"):
            continue
        _apply_audio_to_clip(c, volume=volume, muted=muted, audio_fx=audio_fx,
                             replace_fx=replace_fx, fade=fade, fade_dur=fade_dur)
        changed.append(c.id)
    if not changed:
        raise ValueError("esa pista no tiene clips de audio o vídeo")
    return EditResult(out, changed=changed)


def set_clip_keyframes(tl: Timeline, clip_id: str, keyframes: dict | None) -> EditResult:
    """Animación por keyframes: ``{enabled, items:[{id,t,interpolation,props}]}``.
    ``props`` puede incluir x/y/scale/rotation/opacity y también volume (0–2) y
    efectos de audio (eq/compressor/reverb/echo/denoise/distortion, 0–1).
    ``None`` la borra."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if keyframes is None:
        c.keyframes = None
        return EditResult(out, changed=[clip_id])
    if not isinstance(keyframes, dict):
        raise ValueError("keyframes debe ser un objeto {enabled, items}")
    items = keyframes.get("items")
    if items is not None and not isinstance(items, list):
        raise ValueError("keyframes.items debe ser una lista")
    c.keyframes = {"enabled": bool(keyframes.get("enabled", True)), "items": list(items or [])}
    return EditResult(out, changed=[clip_id])


def animate_clip(tl: Timeline, clip_id: str, motion: str, duration: float | None = None,
                 intensity: float = 1.0, turns: float = 1.0, envelope: list | None = None) -> EditResult:
    """Genera keyframes de pose (zoom, giro, slide, fade, pop) sin que el agente
    los escriba a mano. ``envelope`` es opcional: ``[(t_local, amp), ...]`` 0–1
    (p. ej. RMS de un SFX). En clips fill, el zoom también se escribe en reframe
    para que el export coincida con el preview."""
    from . import clip_motion
    from .clip_speed import clip_speed as _spd

    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if c.kind not in clip_motion.ANIMATABLE:
        raise ValueError("animate_clip solo aplica a vídeo, imagen, texto o figura")
    items = clip_motion.build_motion_items(
        c, motion, duration=duration, intensity=intensity, turns=turns, envelope=envelope)
    c.keyframes = clip_motion.merge_visual_keyframes(c, items)
    m = clip_motion.normalize_motion(motion)
    if m in ("zoom_in", "zoom_out") and not clip_motion.uses_scale_zoom(c):
        spd = _spd(c)
        kfs = []
        last_zoom = 1.0
        for it in items:
            props = it.get("props") if isinstance(it.get("props"), dict) else {}
            z = max(0.1, min(1.0, float(props.get("zoom") or 1.0)))
            last_zoom = z
            kfs.append(Keyframe(
                t=_round(c.in_point + float(it["t"]) * spd),
                cx=_clamp01(props.get("cx", 0.5)),
                cy=_clamp01(props.get("cy", 0.5)),
                zoom=z,
            ))
        reframe = c.reframe.model_copy(deep=True) if c.reframe else Reframe()
        reframe.zoom = last_zoom
        reframe.keyframes = kfs
        c.reframe = reframe
    return EditResult(out, changed=[clip_id])


def add_shape(tl: Timeline, shape: dict | None = None, track_id: str | None = None,
              start: float = 0.0, duration: float | None = None,
              points: list | None = None) -> EditResult:
    """Añade una figura vectorial (rect/línea/flecha/estrella…) como clip. Vive en
    una pista de vídeo (crea una si falta). ``shape`` = {type, fill, stroke, …}.
    ``points`` ([[x, y], …] en 0–1 del cuadro) crea un trazado libre (#14)."""
    out = _copy(tl)
    if points is not None:
        opts = {k: v for k, v in (shape or {}).items() if k not in ("type", "points", "x", "y", "w", "h")}
        shape = shapes.path_shape(points, **opts)
    st = shapes.normalize_shape(shape or {})
    created: list[str] = []
    if track_id is None:
        existing = next((t for t in out.tracks if t.kind == "video"), None)
        if existing is None:
            tid = _uid("K")
            insert_track(out.tracks, TimelineTrack(id=tid, kind="video", name=f"V{len(out.tracks) + 1}"))
            created = [tid]
        else:
            tid = existing.id
    else:
        track = _find_track(out, track_id)
        if track.kind != "video":
            raise ValueError(f"una figura va en pista de vídeo, no '{track.kind}'")
        tid = track_id
    if start < 0:
        raise ValueError("start no puede ser negativo")
    dur = float(duration) if duration is not None else shapes.SHAPE_DEFAULT_DUR
    if dur <= 0:
        raise ValueError("duration debe ser > 0")
    c = TimelineClip(
        id=_uid("c"), track_id=tid, kind="shape", asset_kind="shape", asset_id="",
        filename="", start=_round(start), in_point=0.0, out_point=_round(dur),
        source_duration=_round(dur), shape=st, layout="fill", frame="full",
    )
    out.clips.append(c)
    return EditResult(out, changed=[*created, c.id], warnings=_warn_overlaps(out, tid))


def duplicate_clip(tl: Timeline, clip_id: str, start: float | None = None) -> EditResult:
    """Duplica un clip (marca ``dup_of`` a la raíz del linaje). Por defecto lo
    coloca justo detrás del original en su misma pista."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    d = c.model_copy(deep=True)
    d.id = _uid("c")
    d.dup_of = c.dup_of or c.id
    if start is not None:
        if start < 0:
            raise ValueError("start no puede ser negativo")
        d.start = _round(start)
    else:
        speed = c.speed or 1.0
        d.start = _round(c.start + _clip_dur(c) / (speed if speed > 0 else 1.0))
    out.clips.append(d)
    return EditResult(out, changed=[d.id], warnings=_warn_overlaps(out, d.track_id))


def link_tracks(tl: Timeline, track_id: str, to_track_id: str) -> EditResult:
    """Liga una pista a otra (p.ej. audio↔texto): al cambiar velocidad, la ligada
    se escala. Pasa ``to_track_id`` vacío/igual para desligar."""
    out = _copy(tl)
    track = _find_track(out, track_id)
    if not to_track_id or to_track_id == track_id:
        track.linked_track_id = None
        return EditResult(out, changed=[track_id])
    _find_track(out, to_track_id)   # debe existir
    track.linked_track_id = to_track_id
    return EditResult(out, changed=[track_id])


def unlink_track(tl: Timeline, track_id: str) -> EditResult:
    """Desliga una pista (quita su ``linked_track_id``)."""
    out = _copy(tl)
    track = _find_track(out, track_id)
    track.linked_track_id = None
    return EditResult(out, changed=[track_id])
