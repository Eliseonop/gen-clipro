"""Biblioteca de efectos de sonido (Sound Effects).

Lee una carpeta de SFX que contiene un ``sfx_library.json`` con metadatos
(nombre, categoría, carpeta, uso típico). Si no hay JSON, escanea los audios.
La carpeta por defecto es ``<repo>/SFX_LIBRARY``; el usuario puede fijar otra
que se guarda en ``settings.json`` (clave ``sfx_folder``).
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from . import config, settings

FAVORITES_CAT = "favoritos"

_DEFAULT_BASE = config.BASE_DIR.parent / "SFX_LIBRARY"
_AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}


def get_base() -> Path | None:
    """Carpeta activa de la biblioteca de SFX, o None si no se encuentra."""
    custom = (settings.load() or {}).get("sfx_folder")
    if custom:
        p = Path(custom)
        if p.exists() and p.is_dir():
            return p
    if _DEFAULT_BASE.exists() and _DEFAULT_BASE.is_dir():
        return _DEFAULT_BASE
    return None


def set_folder(path: str) -> Path | None:
    p = Path((path or "").strip())
    if not p.exists() or not p.is_dir():
        return None
    settings.save({"sfx_folder": str(p)})
    return p


def _entry(folder: str, filename: str, category: str = "", uso: str = "", name: str | None = None) -> dict:
    rel = f"{folder}/{filename}" if folder else filename
    return {
        "id": rel,
        "name": name or Path(filename).stem,
        "file": filename,
        "folder": folder,
        "category": category or folder,
        "uso": uso,
        "url": f"/api/sfx/file/{quote(rel)}",
    }


def _scan(base: Path) -> list[dict]:
    items: list[dict] = []
    for p in sorted(base.rglob("*")):
        if p.is_file() and p.suffix.lower() in _AUDIO_EXT:
            rel = p.relative_to(base)
            folder = str(rel.parent).replace("\\", "/") if rel.parent != Path(".") else ""
            items.append(_entry(folder, p.name))
    return items


def load_index() -> dict:
    """Devuelve {available, base, categories, items}. No falla si no hay carpeta."""
    base = get_base()
    if base is None:
        return {"available": False, "base": None, "categories": [], "items": []}

    jf = base / "sfx_library.json"
    categories: list[dict] = []
    items: list[dict] = []
    if jf.exists():
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
            for k, v in (data.get("categorias") or {}).items():
                categories.append({
                    "id": k,
                    "label": (v or {}).get("etiqueta", k),
                    "count": (v or {}).get("cantidad", 0),
                })
            for s in data.get("sonidos") or []:
                items.append(_entry(
                    s.get("carpeta", ""), s.get("archivo", ""),
                    category=s.get("categoria", ""), uso=s.get("uso_tipico", ""),
                    name=s.get("sonido"),
                ))
        except Exception:
            items = _scan(base)
    else:
        items = _scan(base)

    return {"available": True, "base": str(base), "categories": categories, "items": items}


def _favorite_sfx_ids() -> set[str]:
    favs = ((settings.load() or {}).get("favorites") or {}).get("sfx") or []
    return {str(x) for x in favs}


def filter_sfx_items(items: list, q: str = "", category: str = "", favorite_ids: list | None = None) -> list:
    """Filtra por búsqueda y categoría. ``favoritos`` usa ids marcados con estrella."""
    out = list(items or [])
    cat = (category or "").strip().lower()
    if cat == FAVORITES_CAT:
        favs = set(favorite_ids or [])
        out = [it for it in out if it.get("id") in favs]
    elif cat:
        out = [it for it in out if cat in (str(it.get("folder", "")).lower() + " " + str(it.get("category", "")).lower())]
    ql = (q or "").strip().lower()
    if ql:
        def match(it: dict) -> bool:
            hay = f"{it.get('name', '')} {it.get('category', '')} {it.get('uso', '')} {it.get('folder', '')}".lower()
            return all(tok in hay for tok in ql.split())
        out = [it for it in out if match(it)]
    return out


def with_favorites_category(categories: list, items: list, favorite_ids: list | None) -> list:
    favs = set(favorite_ids or [])
    count = sum(1 for it in (items or []) if it.get("id") in favs)
    extra = {"id": FAVORITES_CAT, "label": "Favoritos", "count": count}
    rest = [c for c in (categories or []) if c.get("id") != FAVORITES_CAT]
    return [extra, *rest]


def search(q: str = "", category: str = "", limit: int = 300) -> dict:
    idx = load_index()
    fav_ids = list(_favorite_sfx_ids())
    items = filter_sfx_items(idx["items"], q=q, category=category, favorite_ids=fav_ids)
    total = len(items)
    return {
        "available": idx["available"], "base": idx["base"],
        "categories": with_favorites_category(idx["categories"], idx["items"], fav_ids),
        "total": total,
        "items": items[:limit],
    }


def resolve(relpath: str) -> Path | None:
    """Ruta segura de un SFX dentro de la biblioteca activa."""
    base = get_base()
    if base is None:
        return None
    base = base.resolve()
    target = (base / relpath).resolve()
    if base != target and base not in target.parents:
        return None
    return target if target.exists() else None
