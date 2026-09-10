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

from . import fragment, shapes
from .clip_kind import (
    clip_fits_track,
    has_generated_duration,
    is_visual_clip,
    track_kind_for_clip,
)
from .clip_speed import SPEED_MAX, SPEED_MIN
from .schemas import Keyframe, Reframe, Timeline, TimelineClip, TimelineTrack, Word

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
    out.tracks.append(TimelineTrack(id=tid, kind=kind, name=name or f"{prefix}{len(out.tracks) + 1}"))
    return EditResult(out, changed=[tid])


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
            out.tracks.append(TimelineTrack(id=tid, kind="text", name="Subtítulos"))
            track = out.tracks[-1]
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
                     "position", "start", "duration", "role")


def update_clip(tl: Timeline, clip_id: str, patch: dict | None = None) -> EditResult:
    """Actualiza varias propiedades escalares de un clip en UNA sola operación.

    Consolida los setters escalares (opacity, speed/keep_pitch/reverse,
    appear/exit, position/start/duration, role) encadenando las sub-ops puras →
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

    return EditResult(cur, changed=[clip_id], warnings=warnings)


def set_clip_bg_removal(tl: Timeline, clip_id: str, bg_removal: dict | None,
                        replace: bool = False) -> EditResult:
    """Eliminar fondo del clip: matte de IA y/o chroma key (ver ``clip_bg.py``).

    MERGE por secciones (``auto`` / ``chroma``) por defecto: un patch que solo
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
        if key in ("auto", "chroma") and isinstance(val, dict):
            section = dict(base.get(key) or {})
            section.update(val)
            merged[key] = section
        else:
            merged[key] = val
    c.bg_removal = normalize_bg(merged)
    return EditResult(out, changed=[clip_id])


def set_clip_effects(tl: Timeline, clip_id: str, effects: dict, replace: bool = False) -> EditResult:
    """Efectos visuales del clip (blur/grayscale/sepia/brightness…). Por defecto
    MERGE sobre los existentes; ``replace=True`` los sustituye. Solo clips visuales."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    if not is_visual_clip(c):
        raise ValueError("effects solo aplica a clips visuales (vídeo/imagen)")
    if not isinstance(effects, dict):
        raise ValueError("effects debe ser un objeto")
    base = {} if replace else dict(c.effects or {})
    base.update(effects)
    c.effects = base or None
    return EditResult(out, changed=[clip_id])


def set_clip_audio_fx(tl: Timeline, clip_id: str, audio_fx: dict, replace: bool = False) -> EditResult:
    """Efectos de audio (eq/compressor/reverb/echo/denoise/distortion, 0–1).
    MERGE por defecto. Solo clips de vídeo o audio."""
    out = _copy(tl)
    c = _find_clip(out, clip_id)
    _apply_audio_to_clip(c, audio_fx=audio_fx, replace_fx=replace)
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
              start: float = 0.0, duration: float | None = None) -> EditResult:
    """Añade una figura vectorial (rect/línea/flecha/estrella…) como clip. Vive en
    una pista de vídeo (crea una si falta). ``shape`` = {type, fill, stroke, …}."""
    out = _copy(tl)
    st = shapes.normalize_shape(shape or {})
    created: list[str] = []
    if track_id is None:
        existing = next((t for t in out.tracks if t.kind == "video"), None)
        if existing is None:
            tid = _uid("K")
            out.tracks.append(TimelineTrack(id=tid, kind="video", name=f"V{len(out.tracks) + 1}"))
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
