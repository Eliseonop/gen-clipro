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
    "export": {"fps": 30, "quality": "standard"},
    "transcribe": {"model": "base"},
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
            "export": dict(DEFAULTS["export"]),
            "transcribe": dict(DEFAULTS["transcribe"]),
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

        if "export" in incoming:
            from .export_settings import normalize as _export_norm
            incoming["export"] = _export_norm({
                **(current.get("export") or {}),
                **(incoming.get("export") or {}),
            })

        if "transcribe" in incoming:
            from .transcribe_settings import normalize as _tx_norm
            incoming["transcribe"] = _tx_norm({
                **(current.get("transcribe") or {}),
                **(incoming.get("transcribe") or {}),
            })

        current.update(incoming)
        current["api_keys"] = merged
        if merged.get("gemini"):
            current["gemini_api_key"] = merged["gemini"]
        else:
            current.pop("gemini_api_key", None)

        _FILE.parent.mkdir(exist_ok=True)
        _FILE.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
        return current


def api_key(name: str) -> str:
    """Clave de un proveedor (Pexels, GIPHY, Gemini…). Vacío si no está configurada."""
    kid = str(name or "").strip()
    if not kid:
        return ""
    return str(_api_keys_map(load()).get(kid) or "").strip()


# --- Varias keys por proveedor (para fallback) --------------------------------
# La clave primaria vive en ``api_keys[provider]`` (compatibilidad total con los
# consumidores actuales). Las adicionales en ``api_keys_extra[provider]: [..]``.
# El índice 0 es la primaria; 1.. las extra. Los valores NUNCA se exponen al
# frontend (ver ``public``); la gestión desde la UI es por índice.

def _read_file() -> dict:
    if not _FILE.exists():
        return {}
    try:
        return json.loads(_FILE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _write_file(data: dict) -> None:
    _FILE.parent.mkdir(exist_ok=True)
    _FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _keys_list_from(d: dict, provider: str) -> list[str]:
    out: list[str] = []
    prim = str((d.get("api_keys") or {}).get(provider) or "").strip()
    if prim:
        out.append(prim)
    for k in (d.get("api_keys_extra") or {}).get(provider) or []:
        s = str(k or "").strip()
        if s:
            out.append(s)
    return out


def _set_keys_list(d: dict, provider: str, keys: list[str]) -> None:
    ak = d.setdefault("api_keys", {})
    ex = d.setdefault("api_keys_extra", {})
    keys = [str(k).strip() for k in keys if str(k).strip()]
    if keys:
        ak[provider] = keys[0]
        if len(keys) > 1:
            ex[provider] = keys[1:]
        else:
            ex.pop(provider, None)
    else:
        ak.pop(provider, None)
        ex.pop(provider, None)
    if provider == "gemini":
        if ak.get("gemini"):
            d["gemini_api_key"] = ak["gemini"]
        else:
            d.pop("gemini_api_key", None)


def keys_for(provider: str) -> list[str]:
    """Todas las claves de un proveedor (primaria + extra), en orden de uso."""
    kid = str(provider or "").strip()
    return _keys_list_from(load(), kid) if kid else []


def key_count(provider: str) -> int:
    return len(keys_for(provider))


def add_key(provider: str, value: str) -> int:
    """Añade una clave (a la primaria si no hay, si no como extra). Devuelve el total."""
    kid = str(provider or "").strip()
    val = str(value or "").strip()
    if not kid:
        raise ValueError("Proveedor vacío.")
    if not val:
        raise ValueError("La API key está vacía.")
    with _lock:
        d = _read_file()
        keys = _keys_list_from(d, kid)
        keys.append(val)
        _set_keys_list(d, kid, keys)
        _write_file(d)
        return len(keys)


def set_key(provider: str, index: int, value: str) -> int:
    kid = str(provider or "").strip()
    val = str(value or "").strip()
    if not val:
        raise ValueError("La API key está vacía.")
    with _lock:
        d = _read_file()
        keys = _keys_list_from(d, kid)
        if 0 <= index < len(keys):
            keys[index] = val
        else:
            keys.append(val)
        _set_keys_list(d, kid, keys)
        _write_file(d)
        return len(keys)


def remove_key(provider: str, index: int) -> int:
    kid = str(provider or "").strip()
    with _lock:
        d = _read_file()
        keys = _keys_list_from(d, kid)
        if 0 <= index < len(keys):
            keys.pop(index)
        _set_keys_list(d, kid, keys)
        _write_file(d)
        return len(keys)


def public() -> dict:
    """Ajustes para el frontend: no expone secretos de API."""
    data = dict(load())
    keys = _api_keys_map(data)
    # Conteo de claves por proveedor (primaria + extra) SIN exponer valores.
    providers = set(keys) | set((data.get("api_keys_extra") or {}).keys())
    counts = {p: len(_keys_list_from(data, p)) for p in providers}
    counts = {p: n for p, n in counts.items() if n > 0}
    data.pop("gemini_api_key", None)
    data.pop("api_keys_extra", None)   # nunca al frontend
    data["gemini_api_key_set"] = bool(keys.get("gemini"))
    data["api_keys"] = {k: True for k in keys}
    data["api_keys_counts"] = counts
    from .export_settings import normalize as _export_norm
    from .transcribe_settings import public_view as _tx_public
    data["export"] = _export_norm(data.get("export"))
    data["transcribe"] = _tx_public(data.get("transcribe"))
    return data
