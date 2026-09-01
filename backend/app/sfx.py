"""Biblioteca de efectos de sonido (Sound Effects).

Lee una carpeta de SFX que contiene un ``sfx_library.json`` con metadatos
(nombre, categoría, carpeta, uso típico). Si no hay JSON, escanea los audios.
La carpeta por defecto es ``<repo>/SFX_LIBRARY``; el usuario puede fijar otra
que se guarda en ``settings.json`` (clave ``sfx_folder``).
"""
from __future__ import annotations

import json
import re
import shutil
import threading
from datetime import date
from pathlib import Path
from urllib.parse import quote

from . import config, settings

FAVORITES_CAT = "favoritos"

_DEFAULT_BASE = config.BASE_DIR.parent / "SFX_LIBRARY"
_AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}
_write_lock = threading.Lock()
_CAT_NUM = re.compile(r"^(\d+)_")
_SLUG_KEEP = re.compile(r"[^A-Za-z0-9]+")


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


def _slug(label: str) -> str:
    s = _SLUG_KEEP.sub("_", (label or "").strip()).strip("_").upper()
    return (s[:40] or "SFX")


def _next_cat_num(base: Path, categorias: dict) -> int:
    n = 0
    keys = list((categorias or {}).keys())
    try:
        keys.extend(p.name for p in base.iterdir() if p.is_dir())
    except OSError:
        pass
    for key in keys:
        m = _CAT_NUM.match(str(key))
        if m:
            n = max(n, int(m.group(1)))
    return n + 1


def _unique_filename(folder: Path, filename: str) -> str:
    stem = Path(filename).stem
    ext = Path(filename).suffix
    candidate = filename
    n = 2
    while (folder / candidate).exists():
        candidate = f"{stem}_{n}{ext}"
        n += 1
    return candidate


def _sonido_row(it: dict) -> dict:
    return {
        "sonido": it.get("name", ""),
        "archivo": it.get("file", ""),
        "carpeta": it.get("folder", ""),
        "categoria": it.get("category", ""),
        "uso_tipico": it.get("uso", ""),
    }


def _library_from_scan(base: Path) -> dict:
    items = _scan(base)
    cats: dict = {}
    sonidos = []
    for it in items:
        folder = it.get("folder") or ""
        if folder:
            meta = cats.setdefault(folder, {"etiqueta": folder, "uso_tipico": "", "cantidad": 0})
            meta["cantidad"] = int(meta.get("cantidad") or 0) + 1
        sonidos.append(_sonido_row(it))
    return {
        "generado": date.today().isoformat(),
        "total": len(sonidos),
        "categorias": cats,
        "sonidos": sonidos,
    }


def _read_library(base: Path) -> dict:
    jf = base / "sfx_library.json"
    if jf.exists():
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("categorias", {})
                data.setdefault("sonidos", [])
                return data
        except Exception:
            pass
    return _library_from_scan(base)


def _write_library(base: Path, data: dict) -> None:
    data["total"] = len(data.get("sonidos") or [])
    (base / "sfx_library.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8",
    )


def _safe_folder_id(raw: str) -> str:
    folder = Path((raw or "").strip()).name
    if not folder or folder in {".", ".."} or folder != (raw or "").strip():
        raise ValueError("Categoría no válida.")
    return folder


def _ensure_dir(base: Path, folder: str) -> Path:
    dest_dir = (base / folder).resolve()
    root = base.resolve()
    if dest_dir != root and root not in dest_dir.parents:
        raise ValueError("Categoría no válida.")
    dest_dir.mkdir(parents=True, exist_ok=True)
    return dest_dir


def _pick_category(base: Path, cats: dict, category_id: str, new_category: str) -> tuple[str, str, dict]:
    new_label = (new_category or "").strip()
    if new_label:
        folder = f"{_next_cat_num(base, cats):02d}_{_slug(new_label)}"
        meta = cats.setdefault(folder, {"etiqueta": new_label, "uso_tipico": "", "cantidad": 0})
        return folder, new_label, meta
    folder = _safe_folder_id(category_id)
    meta = cats.setdefault(folder, {"etiqueta": folder, "uso_tipico": "", "cantidad": 0})
    return folder, (meta.get("etiqueta") or folder), meta


def _cat_dto(folder: str, meta: dict) -> dict:
    m = meta or {}
    return {
        "id": folder,
        "label": m.get("etiqueta") or folder,
        "count": int(m.get("cantidad") or 0),
    }


def create_category(label: str) -> dict:
    """Crea una categoría vacía (carpeta + JSON) o reutiliza si ya existe la etiqueta."""
    base = get_base()
    if base is None:
        raise ValueError("No hay biblioteca de SFX.")
    name = (label or "").strip()
    if not name:
        raise ValueError("Ponle nombre a la categoría.")
    want = name.lower()
    with _write_lock:
        lib = _read_library(base)
        cats = lib.setdefault("categorias", {})
        for folder, meta in cats.items():
            etiqueta = str((meta or {}).get("etiqueta") or folder).strip()
            if etiqueta.lower() == want or str(folder).lower() == want:
                _ensure_dir(base, folder)
                return _cat_dto(folder, meta or {})
        folder, _label, meta = _pick_category(base, cats, "", name)
        _ensure_dir(base, folder)
        _write_library(base, lib)
    return _cat_dto(folder, meta)


def _find_sonido(sonidos: list, relpath: str) -> int:
    rel = (relpath or "").replace("\\", "/").strip()
    for i, s in enumerate(sonidos or []):
        folder = str(s.get("carpeta") or "").replace("\\", "/")
        archivo = str(s.get("archivo") or "")
        key = f"{folder}/{archivo}" if folder else archivo
        if key == rel:
            return i
    return -1


def _retarget_favorite(old_id: str, new_id: str) -> None:
    if not old_id or old_id == new_id:
        return
    cur = settings.load()
    fav = cur.get("favorites") or {}
    ids = [new_id if str(x) == old_id else str(x) for x in (fav.get("sfx") or [])]
    settings.save({"favorites": {**fav, "sfx": ids}})


def add_sound(
    filename: str,
    data: bytes,
    *,
    name: str | None = None,
    category_id: str = "",
    new_category: str = "",
    uso: str | None = None,
) -> dict:
    """Copia un audio a la biblioteca y lo registra en ``sfx_library.json``."""
    base = get_base()
    if base is None:
        raise ValueError("No hay biblioteca de SFX.")
    raw_name = Path(filename or "").name
    if not raw_name or raw_name in {".", ".."}:
        raise ValueError("Nombre de archivo no válido.")
    if Path(raw_name).suffix.lower() not in _AUDIO_EXT:
        raise ValueError("Formato de audio no válido.")
    if not data:
        raise ValueError("Archivo vacío.")

    display = (name or "").strip() or Path(raw_name).stem

    with _write_lock:
        lib = _read_library(base)
        cats = lib.setdefault("categorias", {})
        sonidos = lib.setdefault("sonidos", [])
        folder, cat_label, meta = _pick_category(base, cats, category_id, new_category)
        uso_txt = (uso or "").strip() or (meta.get("uso_tipico") or "")
        dest_dir = _ensure_dir(base, folder)
        safe_file = _unique_filename(dest_dir, raw_name)
        (dest_dir / safe_file).write_bytes(data)
        sonidos.append({
            "sonido": display,
            "archivo": safe_file,
            "carpeta": folder,
            "categoria": cat_label,
            "uso_tipico": uso_txt,
        })
        cats[folder]["cantidad"] = int(cats[folder].get("cantidad") or 0) + 1
        _write_library(base, lib)

    return _entry(folder, safe_file, category=cat_label, uso=uso_txt, name=display)


def update_sound(
    relpath: str,
    *,
    name: str | None = None,
    category_id: str = "",
    new_category: str = "",
    uso: str | None = None,
) -> dict:
    """Actualiza metadatos de un SFX y mueve el archivo si cambia la categoría."""
    base = get_base()
    if base is None:
        raise ValueError("No hay biblioteca de SFX.")
    rel = (relpath or "").replace("\\", "/").strip()

    with _write_lock:
        lib = _read_library(base)
        cats = lib.setdefault("categorias", {})
        sonidos = lib.setdefault("sonidos", [])
        idx = _find_sonido(sonidos, rel)
        if idx < 0:
            raise ValueError("Efecto de sonido no encontrado.")
        row = sonidos[idx]
        old_folder = str(row.get("carpeta") or "").replace("\\", "/")
        old_file = str(row.get("archivo") or "")
        old_id = f"{old_folder}/{old_file}" if old_folder else old_file

        display = (name if name is not None else row.get("sonido") or "").strip() or Path(old_file).stem
        uso_txt = row.get("uso_tipico") or ""
        if uso is not None:
            uso_txt = (uso or "").strip()

        folder = old_folder
        cat_label = row.get("categoria") or old_folder
        want_new = (new_category or "").strip()
        want_id = (category_id or "").strip()
        if want_new or (want_id and want_id != old_folder):
            folder, cat_label, _meta = _pick_category(base, cats, category_id, new_category)

        dest_file = old_file
        if folder != old_folder:
            src = (base / old_folder / old_file) if old_folder else (base / old_file)
            dest_dir = _ensure_dir(base, folder)
            dest_file = _unique_filename(dest_dir, old_file)
            if src.exists():
                shutil.move(str(src), str(dest_dir / dest_file))
            old_meta = cats.get(old_folder)
            if old_meta is not None:
                old_meta["cantidad"] = max(0, int(old_meta.get("cantidad") or 0) - 1)
            cats[folder]["cantidad"] = int(cats[folder].get("cantidad") or 0) + 1

        row.update({
            "sonido": display,
            "archivo": dest_file,
            "carpeta": folder,
            "categoria": cat_label,
            "uso_tipico": uso_txt,
        })
        _write_library(base, lib)
        new_id = f"{folder}/{dest_file}" if folder else dest_file
        _retarget_favorite(old_id, new_id)

    return _entry(folder, dest_file, category=cat_label, uso=uso_txt, name=display)
