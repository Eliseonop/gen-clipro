"""Historial de conversaciones del Chat IA, **persistido por proyecto**.

Un archivo por proyecto en ``data/conversations/<project_id>.json`` con varias
conversaciones ``{id, title, created_at, updated_at, messages[]}``. Guarda solo
texto (usuario/asistente) para resolver referencias sin arrastrar los internals
de tool-calling; el estado real del editor se re-inyecta cada turno vía
``get_project_context``. Se recorta a los últimos turnos para no inflar tokens.
"""
from __future__ import annotations

import json
import threading
import time
import uuid

from .. import config

MAX_TURNS = 12  # pares usuario/asistente que se pasan como contexto al modelo
_lock = threading.Lock()


def _dir():
    return config.DATA_DIR / "conversations"


def _path(pid: str):
    return _dir() / f"{pid}.json"


def _now() -> int:
    return int(time.time())


def _load(pid: str) -> dict:
    p = _path(pid)
    if not p.exists():
        return {"conversations": []}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data.get("conversations"), list):
            return {"conversations": []}
        return data
    except Exception:  # noqa: BLE001
        return {"conversations": []}


def _save(pid: str, data: dict) -> None:
    _dir().mkdir(parents=True, exist_ok=True)
    tmp = _path(pid).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(_path(pid))


def _find(convs: list, cid: str) -> dict | None:
    return next((c for c in convs if c.get("id") == cid), None)


def list_conversations(pid: str) -> list[dict]:
    """Resúmenes (sin mensajes) para el selector del chat, más recientes primero."""
    convs = _load(pid).get("conversations", [])
    out = [
        {
            "id": c["id"],
            "title": c.get("title") or "Nuevo chat",
            "created_at": c.get("created_at"),
            "updated_at": c.get("updated_at"),
            "message_count": len(c.get("messages") or []),
        }
        for c in convs
    ]
    return sorted(out, key=lambda c: c.get("updated_at") or 0, reverse=True)


def get_messages(pid: str, cid: str) -> list[dict]:
    conv = _find(_load(pid).get("conversations", []), cid)
    return list(conv.get("messages") or []) if conv else []


def get_or_create(conversation_id: str | None, project_id: str) -> str:
    """Devuelve el id de conversación (creándola si hace falta)."""
    with _lock:
        data = _load(project_id)
        convs = data.setdefault("conversations", [])
        if conversation_id and _find(convs, conversation_id):
            return conversation_id
        cid = uuid.uuid4().hex[:12]
        convs.insert(0, {"id": cid, "title": "", "created_at": _now(),
                         "updated_at": _now(), "messages": []})
        _save(project_id, data)
        return cid


def history(project_id: str, cid: str) -> list[dict]:
    return get_messages(project_id, cid)[-(MAX_TURNS * 2):]


def append(project_id: str, cid: str, role: str, text: str) -> None:
    if not text:
        return
    with _lock:
        data = _load(project_id)
        conv = _find(data.get("conversations", []), cid)
        if conv is None:
            return
        msgs = conv.setdefault("messages", [])
        msgs.append({"role": role, "text": text, "ts": _now()})
        if len(msgs) > MAX_TURNS * 6:
            conv["messages"] = msgs[-(MAX_TURNS * 2):]
        if role == "user" and not conv.get("title"):
            conv["title"] = text.strip()[:60]
        conv["updated_at"] = _now()
        _save(project_id, data)


def delete(project_id: str, cid: str) -> bool:
    with _lock:
        data = _load(project_id)
        convs = data.get("conversations", [])
        before = len(convs)
        data["conversations"] = [c for c in convs if c.get("id") != cid]
        _save(project_id, data)
        return len(data["conversations"]) < before
