"""Catálogo de efectos de vídeo y animaciones, generado desde el frontend.

La fuente de verdad es ``frontend/src/fx`` (registry.js y anims.js). ``npm run
fx:build`` escribe ``fx_assets/catalog.json`` (y el bundle del runtime que usa
el export). Aquí solo se lee: el MCP valida contra él y el export sabe qué
versión de cada efecto hornea.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

ASSETS_DIR = Path(__file__).parent / "fx_assets"
CATALOG_PATH = ASSETS_DIR / "catalog.json"
RUNTIME_PATH = ASSETS_DIR / "runtime.bundle.js"


@lru_cache(maxsize=1)
def catalog() -> dict:
    try:
        return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"categories": [], "effects": [], "anims": [], "slots": []}


def reload() -> None:
    catalog.cache_clear()


def effects() -> list[dict]:
    return list(catalog().get("effects") or [])


def effect(effect_id) -> dict | None:
    eid = str(effect_id or "")
    return next((e for e in effects() if e.get("id") == eid), None)


def anims() -> list[dict]:
    return list(catalog().get("anims") or [])


def anim(anim_id) -> dict | None:
    aid = str(anim_id or "")
    return next((a for a in anims() if a.get("id") == aid), None)


def categories() -> list[dict]:
    return list(catalog().get("categories") or [])


def _param_value(p: dict, v):
    """Mismo criterio que ``paramValue`` de fx/core/params.js."""
    if v is None:
        return p.get("def")
    t = p.get("type")
    if t == "range":
        try:
            n = float(v)
        except (TypeError, ValueError):
            return p.get("def")
        return min(float(p["max"]), max(float(p["min"]), n))
    if t == "toggle":
        return v is True or v == 1 or v == "true"
    if t == "color":
        s = str(v).lower()
        return s if len(s) == 7 and s.startswith("#") and all(c in "0123456789abcdef" for c in s[1:]) else p.get("def")
    if t == "select":
        return str(v) if any(o.get("id") == str(v) for o in p.get("options") or []) else p.get("def")
    if t == "seed":
        try:
            return int(round(float(v)))
        except (TypeError, ValueError):
            return p.get("def")
    return p.get("def")


def resolve_params(effect_manifest: dict, raw: dict | None) -> dict:
    raw = raw or {}
    return {p["id"]: _param_value(p, raw.get(p["id"])) for p in effect_manifest.get("params") or []}
