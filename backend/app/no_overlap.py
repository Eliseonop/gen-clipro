"""Una pista NUNCA tiene dos clips en el mismo instante.

Espejo de ``frontend/src/features/editor/noOverlap.js`` (+ ``magnetic.js``): la
misma regla para el editor y para el MCP. ``timeline_store.apply_op`` pasa cada
operación por ``settle_timeline``, que resuelve lo que esa operación haya montado:

  * un clip que CRECE por la derecha (velocidad, duración) empuja a los de detrás
    en su pista;
  * un clip nuevo o movido que cae encima de otro sube a la pista vecina libre de
    su tipo (encima en la pila, debajo en el audio) o a una nueva, en el mismo
    instante;
  * las pistas magnéticas (``track.magnetic``) se empaquetan: sin huecos desde 0.

Los solapes que ya traía el proyecto (antes se podía) no se tocan si esos clips
no cambian. Funciones puras: nunca mutan la entrada.
"""
from __future__ import annotations

import uuid

from .clip_speed import clip_timeline_duration
from .schemas import Timeline, TimelineTrack
from .track_stack import display_order, insert_track, is_stack_track

# Solape mínimo que cuenta (s): los redondeos de duración no mueven nada.
SETTLE_EPS = 0.05
_PREFIX = {"video": "V", "audio": "A", "text": "T"}


def _end(c) -> float:
    return float(c.start or 0.0) + clip_timeline_duration(c)


def _overlap(a, b) -> float:
    return min(_end(a), _end(b)) - max(float(a.start or 0.0), float(b.start or 0.0))


def _same(a, b) -> bool:
    return abs(float(a or 0.0) - float(b or 0.0)) < 1e-6


def _free(clips, track_id: str, start: float, dur: float, exclude: str) -> bool:
    end = start + max(0.0, dur)
    for c in clips:
        if c.track_id != track_id or c.id == exclude:
            continue
        if start < _end(c) and float(c.start or 0.0) < end and _end(c) > float(c.start or 0.0):
            return False
    return True


def _new_track(tracks, kind: str, style: dict | None) -> TimelineTrack:
    prefix = _PREFIX.get(kind, "K")
    nums = []
    for t in tracks:
        if t.kind == kind:
            digits = "".join(ch for ch in str(t.name or "") if ch.isdigit())
            nums.append(int(digits) if digits else 0)
    n = (max(nums) if nums else 0) + 1
    return TimelineTrack(id=f"{prefix}{n}-{uuid.uuid4().hex[:6]}", kind=kind, name=f"{prefix}{n}",
                         style=dict(style) if style else None)


def _lift(tl: Timeline, clip) -> tuple[str | None, str | None]:
    """Pista a la que sube ``clip`` (in place en ``tl``). Devuelve (track_id, creada)."""
    rows = display_order(tl.tracks)
    i = next((k for k, t in enumerate(rows) if t.id == clip.track_id), -1)
    if i < 0:
        return None, None
    src = rows[i]
    up = is_stack_track(src)   # la pila crece hacia arriba (delante); el audio, hacia abajo
    j = i - 1 if up else i + 1
    nxt = rows[j] if 0 <= j < len(rows) else None
    dur = clip_timeline_duration(clip)
    if (nxt is not None and nxt.kind == src.kind and not nxt.locked and not nxt.hidden
            and _free(tl.clips, nxt.id, float(clip.start or 0.0), dur, clip.id)):
        return nxt.id, None
    nt = _new_track(tl.tracks, src.kind, src.style if src.kind == "text" else None)
    at = next(k for k, t in enumerate(tl.tracks) if t.id == src.id)
    # En la pila "encima" es DESPUÉS en el array; en el audio, "debajo" también.
    insert_track(tl.tracks, nt, at + 1)
    return nt.id, nt.id


def pack_magnetic(tl: Timeline, track_id: str, priority: set[str] | None = None) -> bool:
    """Empaqueta la pista (in place): orden por ``start`` y sin huecos desde 0. En un
    empate van delante los de ``priority`` (recién soltados). True si cambió algo."""
    pri = priority or set()
    row = [(i, c) for i, c in enumerate(tl.clips) if c.track_id == track_id]

    def key(item):
        i, c = item
        return (round(float(c.start or 0.0), 4), 0 if c.id in pri else 1, i)

    cursor = 0.0
    changed = False
    for _, c in sorted(row, key=key):
        s = round(cursor, 3)
        if not _same(s, c.start):
            c.start = s
            changed = True
        cursor += clip_timeline_duration(c)
    return changed


def touched_clip_ids(before: Timeline, after: Timeline) -> set[str]:
    """Clips nuevos o cuyo hueco (pista, inicio o fin) cambió."""
    old = {c.id: c for c in before.clips}
    out: set[str] = set()
    for c in after.clips:
        b = old.get(c.id)
        if b is None or b.track_id != c.track_id or not _same(b.start, c.start) or not _same(_end(b), _end(c)):
            out.add(c.id)
    return out


def settle_timeline(before: Timeline, after: Timeline, eps: float = SETTLE_EPS) -> tuple[Timeline, list[str], list[str]]:
    """Resuelve los solapes que ha creado el paso ``before`` → ``after``.

    Devuelve ``(timeline, pistas_creadas, avisos)``; si no hay nada que resolver,
    el mismo ``after``.
    """
    touched = touched_clip_ids(before, after)
    magnetic = {t.id for t in after.tracks if getattr(t, "magnetic", False)}
    if not touched and not magnetic:
        return after, [], []
    out = after.model_copy(deep=True)
    old = {c.id: c for c in before.clips}
    created: list[str] = []
    notes: list[str] = []

    for tid in magnetic:
        if pack_magnetic(out, tid, touched):
            notes.append(f"pista magnética {tid}: empaquetada sin huecos")

    order = sorted((c for c in out.clips if c.id in touched and c.track_id not in magnetic),
                   key=lambda c: float(c.start or 0.0))
    for c in order:
        hits = [x for x in out.clips if x.id != c.id and x.track_id == c.track_id
                and _end(x) > float(x.start or 0.0) and _overlap(c, x) > eps]
        if not hits:
            continue
        b = old.get(c.id)
        grew = (b is not None and b.track_id == c.track_id and _same(b.start, c.start)
                and _end(c) > _end(b))
        if grew and all(float(h.start or 0.0) >= _end(b) - eps for h in hits):
            # Creció por la derecha y solo pisa a los de detrás: se empujan.
            shift = _end(c) - min(float(h.start or 0.0) for h in hits)
            origin = _end(b) - eps
            moved = 0
            for x in out.clips:
                if x.track_id == c.track_id and x.id != c.id and float(x.start or 0.0) >= origin:
                    x.start = round(float(x.start or 0.0) + shift, 3)
                    moved += 1
            notes.append(f"{c.id} creció: {moved} clip(s) de {c.track_id} se desplazaron {round(shift, 3)} s")
            continue
        src = c.track_id
        to, new = _lift(out, c)
        if to is None:
            continue
        c.track_id = to
        if new:
            created.append(new)
        notes.append(f"{c.id} no cabía en {src} (ocupada): va en {'la pista nueva ' if new else ''}{to}")
    if not created and not notes:
        return after, [], []
    return out, created, notes
