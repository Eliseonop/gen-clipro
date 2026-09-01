"""Ajustes persistentes del backend (p.ej. parámetros por defecto del narrador).

Guardados en data/settings.json para que no se pierdan entre sesiones.
"""
from __future__ import annotations

import json
import threading

from . import config

_lock = threading.Lock()
_FILE = config.DATA_DIR / "settings.json"

DEFAULTS = {
    "tts": {"voice": "ef_dora", "speed": 1.0},
    "favorites": {"sfx": [], "audios": [], "textStyles": []},
    "yt_history": [],
}


def _merge_favorites(raw) -> dict:
    base = {"sfx": [], "audios": [], "textStyles": []}
    if not isinstance(raw, dict):
        return base
    return {
        "sfx": [str(x) for x in (raw.get("sfx") or [])],
        "audios": [str(x) for x in (raw.get("audios") or [])],
        "textStyles": list(raw.get("textStyles") or []),
    }


def load() -> dict:
    if not _FILE.exists():
        return {
            "tts": dict(DEFAULTS["tts"]),
            "favorites": _merge_favorites(None),
            "yt_history": [],
        }
    try:
        data = json.loads(_FILE.read_text(encoding="utf-8"))
        out = {**DEFAULTS, **data}
        out["favorites"] = _merge_favorites(out.get("favorites"))
        return out
    except Exception:
        return dict(DEFAULTS)


def save(data: dict) -> dict:
    with _lock:
        current = load()
        incoming = dict(data or {})
        key = incoming.get("gemini_api_key")
        if "gemini_api_key" in incoming:
            text = str(key or "").strip()
            if not text or text in ("true", "********"):
                incoming.pop("gemini_api_key", None)
        current.update(incoming)
        _FILE.parent.mkdir(exist_ok=True)
        _FILE.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
        return current


def public() -> dict:
    """Ajustes para el frontend: no expone la API key de Gemini."""
    data = dict(load())
    has = bool(str(data.get("gemini_api_key") or "").strip())
    data.pop("gemini_api_key", None)
    data["gemini_api_key_set"] = has
    return data
