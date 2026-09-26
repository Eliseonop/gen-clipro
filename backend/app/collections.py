"""Biblioteca global de material reutilizable (colecciones externas).

Generaliza el patrón de ``sfx.py`` a todos los tipos de medio: una carpeta
**raíz** (``material_root`` en ``settings.json``; por defecto
``config.ASSETS_DIR / "material"``) cuyas **subcarpetas** son *colecciones*
(scientist_stick, fondos, fx, sfx…). Los archivos se sirven **en su sitio** vía
``/api/collections/file/{ref}`` (sin copiar al proyecto) y el export los resuelve
por ``asset_scope == "collection"`` en ``compose._clip_path``.

Las preferencias por colección (activa / favorita / etiqueta) viven en
``settings.json`` bajo ``collections_meta``. La raíz nunca se escanea entera: solo
las subcarpetas directas son colecciones y cada una se recorre de forma recursiva.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import BinaryIO, Iterable
from urllib.parse import quote

from . import config, settings

# Extensión → tipo de recurso. El GIF es su propia categoría aunque sea imagen.
_VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg", ".wmv", ".flv"}
_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
_AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".wma"}
_KINDS = ("video", "image", "gif", "audio")


def kind_for(path: Path) -> str | None:
    """Tipo de recurso por extensión, o None si no es medio soportado."""
    ext = path.suffix.lower()
    if ext == ".gif":
        return "gif"
    if ext in _VIDEO_EXT:
        return "video"
    if ext in _IMAGE_EXT:
        return "image"
    if ext in _AUDIO_EXT:
        return "audio"
    return None


def get_root() -> Path | None:
    """Carpeta raíz de material, o None si no existe."""
    custom = (settings.load() or {}).get("material_root")
    if custom:
        p = Path(custom)
        if p.exists() and p.is_dir():
            return p
    default = config.ASSETS_DIR / "material"
    if default.exists() and default.is_dir():
        return default
    return None


def set_root(path: str) -> Path | None:
    p = Path((path or "").strip())
    if not p.exists() or not p.is_dir():
        return None
    settings.save({"material_root": str(p)})
    return p


def _meta() -> dict:
    raw = (settings.load() or {}).get("collections_meta")
    return dict(raw) if isinstance(raw, dict) else {}


def _prefs_for(cid: str) -> dict:
    m = _meta().get(cid)
    return dict(m) if isinstance(m, dict) else {}


def set_prefs(
    collection_id: str,
    *,
    enabled: bool | None = None,
    favorite: bool | None = None,
    label: str | None = None,
) -> dict:
    """Actualiza (merge) las preferencias de una colección y las persiste."""
    cid = _safe_collection_id(collection_id)
    meta = _meta()
    cur = dict(meta.get(cid) or {})
    if enabled is not None:
        cur["enabled"] = bool(enabled)
    if favorite is not None:
        cur["favorite"] = bool(favorite)
    if label is not None:
        text = str(label).strip()
        if text:
            cur["label"] = text
        else:
            cur.pop("label", None)
    meta[cid] = cur
    settings.save({"collections_meta": meta})
    return cur


def _safe_collection_id(raw: str) -> str:
    """El id de colección es el nombre de una subcarpeta directa de la raíz."""
    name = Path((raw or "").strip()).name
    if not name or name in {".", ".."} or name != (raw or "").strip():
        raise ValueError("Colección no válida.")
    return name


def _entry(collection: str, rel: Path) -> dict:
    relstr = str(rel).replace("\\", "/")
    ref = f"{collection}/{relstr}"
    return {
        "id": f"col_{ref}",
        "collection": collection,
        "name": rel.stem,
        "kind": kind_for(rel),
        "filename": ref,
        "url": f"/api/collections/file/{quote(ref)}",
    }


def _scan_dir(base: Path, collection: str) -> list[dict]:
    items: list[dict] = []
    coll_dir = base / collection
    if not coll_dir.is_dir():
        return items
    for p in sorted(coll_dir.rglob("*")):
        if p.is_file() and kind_for(p) is not None:
            items.append(_entry(collection, p.relative_to(coll_dir)))
    return items


def _first_image_url(items: list[dict]) -> str:
    for it in items:
        if it.get("kind") in ("image", "gif"):
            return it.get("url", "")
    return ""


def list_collections() -> dict:
    """Devuelve {available, root, collections}. No falla si no hay raíz."""
    base = get_root()
    if base is None:
        return {"available": False, "root": None, "collections": []}
    meta = _meta()
    out: list[dict] = []
    for sub in sorted(p for p in base.iterdir() if p.is_dir()):
        cid = sub.name
        pref = meta.get(cid) if isinstance(meta.get(cid), dict) else {}
        items = _scan_dir(base, cid)
        out.append({
            "id": cid,
            "name": (pref.get("label") or cid),
            "path": str(sub),
            "count": len(items),
            "enabled": bool(pref.get("enabled", True)),
            "favorite": bool(pref.get("favorite", False)),
            "cover_url": _first_image_url(items),
            # Carpeta de un personaje stick (ver stick_library): la Biblioteca la
            # abre agrupada por expresión.
            "stick": (sub / "stick.json").is_file(),
        })
    # Favoritas primero, luego alfabético.
    out.sort(key=lambda c: (not c["favorite"], c["name"].lower()))
    return {"available": True, "root": str(base), "collections": out}


def _match(item: dict, q: str) -> bool:
    if not q:
        return True
    hay = f"{item.get('name', '')} {item.get('collection', '')}".lower()
    return all(tok in hay for tok in q.lower().split())


def search(q: str = "", kind: str = "", collection: str = "", limit: int = 500) -> dict:
    """Busca en las colecciones activas. Autodetecta el tipo y cuenta por categoría."""
    base = get_root()
    cols = list_collections()["collections"]
    enabled = {c["id"] for c in cols if c["enabled"]}
    favorite = {c["id"] for c in cols if c["favorite"]}
    want_kind = (kind or "").strip().lower()
    want_coll = (collection or "").strip()
    ql = (q or "").strip()

    counts = {k: 0 for k in _KINDS}
    items: list[dict] = []
    if base is not None:
        for cid in sorted(enabled):
            if want_coll and cid != want_coll:
                continue
            for it in _scan_dir(base, cid):
                if not _match(it, ql):
                    continue
                counts[it["kind"]] = counts.get(it["kind"], 0) + 1
                if want_kind and it["kind"] != want_kind:
                    continue
                it = {**it, "favorite": cid in favorite}
                items.append(it)
    counts["all"] = sum(counts[k] for k in _KINDS)
    return {
        "available": base is not None,
        "root": str(base) if base else None,
        "counts": counts,
        "total": len(items),
        "items": items[:limit],
        "collections": cols,
    }


def create_collection(name: str) -> str:
    """Crea una carpeta (colección) vacía bajo la raíz. Devuelve su id."""
    base = get_root()
    if base is None:
        raise ValueError("No hay carpeta raíz de material.")
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(name or "")).strip(" .")
    if not clean:
        raise ValueError("Ponle un nombre a la carpeta.")
    cid, n = clean, 2
    while (base / cid).exists():
        cid, n = f"{clean} {n}", n + 1
    (base / cid).mkdir(parents=True)
    return cid


def add_files(collection: str, files: Iterable[tuple[str, BinaryIO]]) -> dict:
    """Guarda archivos de medio en la raíz de una colección (nombre único).

    ``files`` = ``[(nombre, stream)]``. Devuelve ``{saved, errors}``.
    """
    base = get_root()
    cid = _safe_collection_id(collection)
    folder = base / cid if base is not None else None
    if folder is None or not folder.is_dir():
        raise LookupError("Carpeta no encontrada.")
    saved: list[dict] = []
    errors: list[dict] = []
    for raw_name, stream in files:
        name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", Path(str(raw_name or "")).name).strip(" .")
        if not name or kind_for(Path(name)) is None:
            errors.append({"file": raw_name, "error": "Tipo de archivo no soportado."})
            continue
        target = folder / name
        stem, suffix, n = target.stem, target.suffix, 2
        while target.exists():
            target = folder / f"{stem}_{n}{suffix}"
            n += 1
        with target.open("wb") as out:
            shutil.copyfileobj(stream, out)
        saved.append(_entry(cid, target.relative_to(folder)))
    return {"saved": saved, "errors": errors}


def resolve(ref: str) -> Path | None:
    """Ruta segura ``raíz/<coll>/<rel>`` para un ``filename`` de colección.

    ``ref`` es ``"<collection>/<relpath>"``. Misma comprobación anti-traversal
    que ``sfx.resolve``: el objetivo debe quedar dentro de la raíz.
    """
    base = get_root()
    if base is None or not ref:
        return None
    base = base.resolve()
    target = (base / str(ref).replace("\\", "/")).resolve()
    if base != target and base not in target.parents:
        return None
    return target if target.exists() and target.is_file() else None
