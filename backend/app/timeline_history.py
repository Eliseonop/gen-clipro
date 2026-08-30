"""Historial del timeline: snapshot / undo / redo / checkpoints.

Core PURO sobre dicts (un timeline se serializa a dict para persistir). Protege
al agente: puede hacer N operaciones y deshacer si se equivoca. El cableado a
disco/proyecto lo hará el adaptador (HTTP/MCP); aquí solo la mecánica.

Estructura del historial::

    {"undo": [tl, ...], "redo": [tl, ...], "checkpoints": {name: tl}}

- ``snapshot(hist, current)`` se llama ANTES de aplicar un cambio: apila el
  estado actual en ``undo`` y limpia ``redo`` (una edición nueva invalida el redo).
- ``undo``/``redo`` intercambian el estado actual con la cima del stack.
- ``checkpoint``/``restore_checkpoint`` marcan puntos seguros con nombre para
  secuencias largas (mejor que deshacer paso a paso).
"""
from __future__ import annotations

import copy

DEFAULT_LIMIT = 50


def empty_history() -> dict:
    return {"undo": [], "redo": [], "checkpoints": {}}


def _to_dict(tl) -> dict:
    if tl is None:
        return {}
    if hasattr(tl, "model_dump"):
        return tl.model_dump()
    return copy.deepcopy(tl)


def _norm(history: dict | None) -> dict:
    h = history or {}
    return {
        "undo": list(h.get("undo") or []),
        "redo": list(h.get("redo") or []),
        "checkpoints": dict(h.get("checkpoints") or {}),
    }


def can_undo(history: dict | None) -> bool:
    return bool(_norm(history)["undo"])


def can_redo(history: dict | None) -> bool:
    return bool(_norm(history)["redo"])


def snapshot(history: dict | None, current, limit: int = DEFAULT_LIMIT) -> dict:
    """Registra ``current`` como punto al que volver; descarta el redo pendiente."""
    h = _norm(history)
    undo = [*h["undo"], _to_dict(current)][-limit:]
    return {"undo": undo, "redo": [], "checkpoints": h["checkpoints"]}


def undo(history: dict | None, current) -> tuple[dict, dict | None]:
    """Devuelve (historial nuevo, timeline restaurado|None)."""
    h = _norm(history)
    if not h["undo"]:
        return h, None
    undo_stack = list(h["undo"])
    restored = undo_stack.pop()
    redo_stack = [*h["redo"], _to_dict(current)]
    return {"undo": undo_stack, "redo": redo_stack, "checkpoints": h["checkpoints"]}, restored


def redo(history: dict | None, current) -> tuple[dict, dict | None]:
    h = _norm(history)
    if not h["redo"]:
        return h, None
    redo_stack = list(h["redo"])
    restored = redo_stack.pop()
    undo_stack = [*h["undo"], _to_dict(current)]
    return {"undo": undo_stack, "redo": redo_stack, "checkpoints": h["checkpoints"]}, restored


def checkpoint(history: dict | None, name: str, current) -> dict:
    h = _norm(history)
    cps = dict(h["checkpoints"])
    cps[name] = _to_dict(current)
    return {"undo": h["undo"], "redo": h["redo"], "checkpoints": cps}


def restore_checkpoint(history: dict | None, name: str) -> dict | None:
    tl = _norm(history)["checkpoints"].get(name)
    return copy.deepcopy(tl) if tl is not None else None


def list_checkpoints(history: dict | None) -> list[str]:
    return list(_norm(history)["checkpoints"].keys())
