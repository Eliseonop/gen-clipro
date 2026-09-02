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
    "api_keys": {},
}

_KEY_MASKS = {"", "true", "false", "********", "••••", "••••••••"}


def _merge_favorites(raw) -> dict:
    base = {"sfx": [], "audios": [], "textStyles": []}
    if not isinstance(raw, dict):
        return base
    return {
        "sfx": [str(x) for x in (raw.get("sfx") or [])],
        "audios": [str(x) for x in (raw.get("audios") or [])],
        "textStyles": list(raw.get("textStyles") or []),
    }


def _secret(value) -> str:
    if value is True or value is False or value is None:
        return ""
    text = str(value).strip()
    if text.lower() in _KEY_MASKS or text in _KEY_MASKS:
        return ""
    return text


def _api_keys_map(raw) -> dict:
    out = {}
    if isinstance(raw, dict) and isinstance(raw.get("api_keys"), dict):
        for k, v in raw["api_keys"].items():
            kid = str(k or "").strip()
            val = _secret(v)
            if kid and val:
                out[kid] = val
    if isinstance(raw, dict):
        legacy = _secret(raw.get("gemini_api_key"))
        if legacy and "gemini" not in out:
            out["gemini"] = legacy
    return out


def load() -> dict:
    if not _FILE.exists():
        return {
            "tts": dict(DEFAULTS["tts"]),
            "favorites": _merge_favorites(None),
            "yt_history": [],
            "api_keys": {},
        }
    try:
        data = json.loads(_FILE.read_text(encoding="utf-8"))
        out = {**DEFAULTS, **data}
        out["favorites"] = _merge_favorites(out.get("favorites"))
        out["api_keys"] = _api_keys_map(out)
        return out
    except Exception:
        return dict(DEFAULTS)


def save(data: dict) -> dict:
    with _lock:
        current = load()
        incoming = dict(data or {})
        incoming.pop("gemini_api_key_set", None)

        merged = dict(current.get("api_keys") or {})
        patch = incoming.pop("api_keys", None)
        if "gemini_api_key" in incoming:
            text = _secret(incoming.pop("gemini_api_key"))
            if text:
                merged["gemini"] = text
        if isinstance(patch, dict):
            for k, v in patch.items():
                kid = str(k or "").strip()
                if not kid:
                    continue
                if v is True or v is False:
                    continue
                val = "" if v is None else str(v).strip()
                if val in _KEY_MASKS or val.lower() in _KEY_MASKS:
                    if not val:
                        merged.pop(kid, None)
                    continue
                merged[kid] = val

        current.update(incoming)
        current["api_keys"] = merged
        if merged.get("gemini"):
            current["gemini_api_key"] = merged["gemini"]
        else:
            current.pop("gemini_api_key", None)

        _FILE.parent.mkdir(exist_ok=True)
        _FILE.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
        return current


def public() -> dict:
    """Ajustes para el frontend: no expone secretos de API."""
    data = dict(load())
    keys = _api_keys_map(data)
    data.pop("gemini_api_key", None)
    data["gemini_api_key_set"] = bool(keys.get("gemini"))
    data["api_keys"] = {k: True for k in keys}
    return data
