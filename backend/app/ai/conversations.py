"""Memoria de conversación en memoria (por proceso). Provider-neutral.

Guarda solo turnos de TEXTO (usuario/asistente) para resolver referencias
("ese clip", "hazlo más corto") sin arrastrar los internals de tool-calling. El
estado real del editor se re-inyecta cada turno vía ``get_project_context``, así
que no hace falta un historial infinito.
"""
from __future__ import annotations

import threading
import uuid

MAX_TURNS = 12  # pares usuario/asistente que se conservan

_convos: dict[str, dict] = {}
_lock = threading.Lock()


def get_or_create(conversation_id: str | None, project_id: str) -> tuple[str, dict]:
    with _lock:
        if conversation_id and conversation_id in _convos:
            return conversation_id, _convos[conversation_id]
        cid = conversation_id or uuid.uuid4().hex[:12]
        _convos[cid] = {"project_id": project_id, "messages": []}
        return cid, _convos[cid]


def history(conv: dict) -> list[dict]:
    return list(conv.get("messages") or [])[-(MAX_TURNS * 2):]


def append(conv: dict, role: str, text: str) -> None:
    if not text:
        return
    msgs = conv.setdefault("messages", [])
    msgs.append({"role": role, "text": text})
    if len(msgs) > MAX_TURNS * 4:
        conv["messages"] = msgs[-(MAX_TURNS * 2):]


def reset() -> None:
    """Solo para tests."""
    with _lock:
        _convos.clear()
