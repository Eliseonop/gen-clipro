"""Adaptador stateful: liga proyecto + timeline_ops + timeline_history.

Es la capa que envuelven tanto los endpoints HTTP como (más adelante) las tools
del MCP. Aplica una operación estructural sobre el timeline del proyecto de forma
segura: snapshot → aplicar → validar → guardar, con undo/redo/checkpoints.

Historial persistido por proyecto en ``data/history/<pid>.json``.
"""
from __future__ import annotations

import json

from . import config, projects, timeline_history, timeline_ops
from .schemas import Timeline

HISTORY_DIR = config.DATA_DIR / "history"

# Operaciones expuestas (allow-list). Todas: fn(timeline, **params) -> EditResult.
OPS = {
    "add_track": timeline_ops.add_track,
    "remove_track": timeline_ops.remove_track,
    "add_clip": timeline_ops.add_clip,
    "move_clip": timeline_ops.move_clip,
    "remove_clip": timeline_ops.remove_clip,
    "split_clip": timeline_ops.split_clip,
    "set_clip_layout": timeline_ops.set_clip_layout,
    "reframe_clip": timeline_ops.reframe_clip,
    "add_subtitles": timeline_ops.add_subtitles,
    "set_project_format": timeline_ops.set_project_format,
    # Etapa 4.5 — propiedades por-clip y material nuevo.
    "set_clip_opacity": timeline_ops.set_clip_opacity,
    "set_clip_speed": timeline_ops.set_clip_speed,
    "set_clip_transition": timeline_ops.set_clip_transition,
    "set_text_role": timeline_ops.set_text_role,
    "set_clip_effects": timeline_ops.set_clip_effects,
    "set_clip_audio_fx": timeline_ops.set_clip_audio_fx,
    "set_clip_keyframes": timeline_ops.set_clip_keyframes,
    "add_shape": timeline_ops.add_shape,
    "duplicate_clip": timeline_ops.duplicate_clip,
    "link_tracks": timeline_ops.link_tracks,
    "unlink_track": timeline_ops.unlink_track,
}


def _history_path(pid: str):
    return HISTORY_DIR / f"{pid}.json"


def _load_history(pid: str) -> dict:
    p = _history_path(pid)
    if not p.exists():
        return timeline_history.empty_history()
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - un historial ilegible no debe romper la edición
        return timeline_history.empty_history()


def _save_history(pid: str, hist: dict) -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    _history_path(pid).write_text(json.dumps(hist, ensure_ascii=False), encoding="utf-8")


def _current(pid: str) -> dict:
    proj = projects.get_project(pid)
    if proj is None:
        raise ValueError("Proyecto no encontrado.")
    return proj.timeline.model_dump() if proj.timeline else Timeline().model_dump()


def _result(pid: str, timeline_dict: dict, changed, warnings, hist: dict) -> dict:
    return {
        "timeline": timeline_dict,
        "changed": list(changed or []),
        "warnings": list(warnings or []),
        "can_undo": timeline_history.can_undo(hist),
        "can_redo": timeline_history.can_redo(hist),
        "checkpoints": timeline_history.list_checkpoints(hist),
    }


def apply_op(pid: str, op: str, params: dict | None = None) -> dict:
    """Aplica una operación estructural de forma transaccional."""
    fn = OPS.get(op)
    if fn is None:
        raise ValueError(f"Operación desconocida: {op} (usa {list(OPS)})")
    current = _current(pid)
    res = fn(Timeline(**current), **(params or {}))

    # Rechazar solo errores NUEVOS (no bloquear por suciedad preexistente).
    before = set(timeline_ops.validate_timeline(Timeline(**current)))
    after = timeline_ops.validate_timeline(res.timeline)
    new_errors = [e for e in after if e not in before]
    if new_errors:
        raise ValueError("La operación dejaría el timeline inválido: " + "; ".join(new_errors))

    hist = timeline_history.snapshot(_load_history(pid), current)
    _save_history(pid, hist)
    new = res.timeline.model_dump()
    projects.save_timeline(pid, new)
    return _result(pid, new, res.changed, res.warnings, hist)


def undo(pid: str) -> dict:
    hist, restored = timeline_history.undo(_load_history(pid), _current(pid))
    if restored is None:
        return _result(pid, _current(pid), [], ["nada que deshacer"], hist)
    _save_history(pid, hist)
    projects.save_timeline(pid, restored)
    return _result(pid, restored, ["undo"], [], hist)


def redo(pid: str) -> dict:
    hist, restored = timeline_history.redo(_load_history(pid), _current(pid))
    if restored is None:
        return _result(pid, _current(pid), [], ["nada que rehacer"], hist)
    _save_history(pid, hist)
    projects.save_timeline(pid, restored)
    return _result(pid, restored, ["redo"], [], hist)


def checkpoint(pid: str, name: str) -> dict:
    hist = timeline_history.checkpoint(_load_history(pid), name, _current(pid))
    _save_history(pid, hist)
    return _result(pid, _current(pid), [name], [], hist)


def restore_checkpoint(pid: str, name: str) -> dict:
    hist = _load_history(pid)
    tl = timeline_history.restore_checkpoint(hist, name)
    if tl is None:
        raise ValueError(f"Checkpoint inexistente: {name}")
    hist = timeline_history.snapshot(hist, _current(pid))   # el restore también se puede deshacer
    _save_history(pid, hist)
    projects.save_timeline(pid, tl)
    return _result(pid, tl, ["restore"], [], hist)
