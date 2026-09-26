"""Sticks: personajes de la biblioteca clasificados por expresión.

Una colección (subcarpeta de ``material_root``) se convierte en un *stick*
—un personaje que se agrega desde la línea de tiempo— cuando contiene un
manifiesto ``stick.json``. Cada stick es UNA carpeta; se crea desde la
Biblioteca («Nuevo stick») o a mano.

La expresión (feliz, triste, enojado…) de cada recurso sale, por prioridad, de:

1. su entrada en ``items`` del manifiesto (lo que se elige en la Biblioteca al
   recategorizar; nunca se mueve el archivo, así los clips ya usados siguen
   encontrándolo);
2. la SUBCARPETA donde está: ``<stick>/triste/llora.mp4`` → ``sad``. La carpeta
   se compara con el ``id`` y la ``label`` de la expresión, sin tildes ni
   mayúsculas. Una subcarpeta que no es ninguna expresión es una categoría
   propia (``bailando/`` → «Bailando»);
3. si no, ``otros``.

Así, soltar un archivo en la subcarpeta correcta (desde la web o desde el
explorador) ya lo categoriza.

Formato de ``stick.json`` (``schema: "stick/1"``)::

    {
      "name": "Scientific", "emoji": "🔬", "order": 0,
      "chroma": {"color": "#00FF00"},
      "expressions": [{"id": "happy", "label": "Feliz", "emoji": "😄"}, ...],
      "items": [{"file": "...mp4", "kind": "video", "expression": "happy",
                 "title": "Giving thumbs up"}, ...]
    }

El menú «Agregar Stick» de la timeline lo usa así: stick → Vídeo/Imagen →
galería agrupada por expresión. Al agregar, el clip nace con croma configurado.
"""
from __future__ import annotations

import json
import re
import shutil
import unicodedata
from pathlib import Path
from typing import BinaryIO, Iterable

from . import collections

MANIFEST = "stick.json"
_KINDS = ("video", "image")
# Tipo de colección → columna del stick. El GIF va con las imágenes (animado).
_STICK_KIND = {"video": "video", "image": "image", "gif": "image"}
DEFAULT_CHROMA = "#00FF00"
OTHER = "otros"

# Taxonomía por defecto de un stick nuevo (misma que scientist_stick).
DEFAULT_EXPRESSIONS: list[dict] = [
    {"id": "happy", "label": "Feliz", "emoji": "😄"},
    {"id": "sad", "label": "Triste", "emoji": "😢"},
    {"id": "angry", "label": "Enojado", "emoji": "😠"},
    {"id": "surprised", "label": "Sorprendido", "emoji": "😮"},
    {"id": "scared", "label": "Asustado", "emoji": "😨"},
    {"id": "confused", "label": "Confundido", "emoji": "😕"},
    {"id": "thinking", "label": "Pensando", "emoji": "🤔"},
    {"id": "explaining", "label": "Explicando", "emoji": "👉"},
    {"id": "tired", "label": "Cansado", "emoji": "😴"},
    {"id": "neutral", "label": "Neutral", "emoji": "🙂"},
    {"id": OTHER, "label": "Otros", "emoji": "✨"},
]

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
# Sufijos de los generadores de vídeo que ensucian el título: _1080p, _20260916183013…
_NOISE = re.compile(r"_(?:\d{3,4}p|\d{8,})(?=_|$)")
_BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


# --- utilidades --------------------------------------------------------------

def _norm(text: str) -> str:
    """Clave de comparación: sin tildes, minúsculas, solo letras y números."""
    s = unicodedata.normalize("NFKD", str(text or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _slug(text: str, fallback: str = "stick") -> str:
    """Nombre de carpeta a partir de un texto: ``Mi Stick Ñu`` → ``mi_stick_nu``."""
    s = unicodedata.normalize("NFKD", str(text or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")[:40].strip("_")
    return s or fallback


def _pretty_title(stem: str) -> str:
    """Título legible de un archivo sin entrada en el manifiesto."""
    s = _NOISE.sub("", stem).replace("_", " ").strip()
    return s or stem


def _read_manifest(base: Path, cid: str) -> dict | None:
    p = base / cid / MANIFEST
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — un JSON roto no debe tumbar la lista
        return None
    return data if isinstance(data, dict) else None


def _write_manifest(base: Path, cid: str, man: dict) -> None:
    p = base / cid / MANIFEST
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(man, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def _chroma_color(man: dict) -> str:
    c = man.get("chroma") if isinstance(man.get("chroma"), dict) else {}
    return str(c.get("color") or DEFAULT_CHROMA)


def _expr_defs(man: dict) -> list[dict]:
    defs = [e for e in (man.get("expressions") or []) if isinstance(e, dict) and e.get("id")]
    return defs or [dict(e) for e in DEFAULT_EXPRESSIONS]


def _root_and_manifest(cid: str) -> tuple[Path, str, dict]:
    base = collections.get_root()
    cid = collections._safe_collection_id(cid)
    man = _read_manifest(base, cid) if base is not None else None
    if man is None:
        raise LookupError("Stick no encontrado.")
    return base, cid, man


# --- expresiones por carpeta ------------------------------------------------

def _folder_expressions(coll_dir: Path, defs: list[dict]) -> dict[str, dict]:
    """Subcarpetas directas del stick → expresión.

    Devuelve ``{nombre_carpeta: {"id", "label", "emoji", "custom"}}``. Las que no
    coinciden con ninguna expresión definida son categorías propias.
    """
    by_key: dict[str, dict] = {}
    for e in defs:
        for k in (_norm(e["id"]), _norm(e.get("label") or "")):
            if k:
                by_key.setdefault(k, e)
    out: dict[str, dict] = {}
    if not coll_dir.is_dir():
        return out
    for sub in sorted(p for p in coll_dir.iterdir() if p.is_dir()):
        e = by_key.get(_norm(sub.name))
        if e is not None:
            out[sub.name] = {"id": e["id"], "label": e.get("label") or e["id"],
                             "emoji": e.get("emoji") or "", "custom": False}
        else:
            out[sub.name] = {"id": _slug(sub.name, fallback=OTHER), "label": sub.name,
                             "emoji": "📁", "custom": True}
    return out


def _all_expressions(defs: list[dict], folders: dict[str, dict]) -> list[dict]:
    """Taxonomía del manifiesto + categorías propias (subcarpetas), sin repetir."""
    seen: set[str] = set()
    out: list[dict] = []
    for e in defs:
        if e["id"] not in seen:
            seen.add(e["id"])
            out.append({"id": e["id"], "label": e.get("label") or e["id"], "emoji": e.get("emoji") or ""})
    for f in folders.values():
        if f["custom"] and f["id"] not in seen:
            seen.add(f["id"])
            out.append({"id": f["id"], "label": f["label"], "emoji": f["emoji"]})
    return out


# --- recursos del stick -------------------------------------------------------

def _collect(base: Path, cid: str, man: dict) -> tuple[list[dict], list[dict]]:
    """Todos los recursos (vídeo/imagen/GIF) del stick con su expresión y título.

    Devuelve ``(cards, expresiones)``. Los del manifiesto conservan su expresión y
    título; el resto (subidos o copiados a mano) se categoriza por su subcarpeta.
    Los archivos del manifiesto que ya no existen en disco se ignoran.
    """
    coll_dir = base / cid
    defs = _expr_defs(man)
    folders = _folder_expressions(coll_dir, defs)
    exprs = _all_expressions(defs, folders)
    color = _chroma_color(man)

    listed: dict[str, dict] = {}
    for it in (man.get("items") or []):
        if isinstance(it, dict) and it.get("file"):
            listed[str(it["file"]).replace("\\", "/")] = it

    cards: list[dict] = []

    def add(rel: Path, expression: str, title: str) -> None:
        entry = collections._entry(cid, rel)
        kind = _STICK_KIND.get(entry["kind"] or "")
        if kind is None:
            return
        card = {
            **entry,                          # id, collection, name, kind, filename, url
            "rel": str(rel).replace("\\", "/"),
            "stick_kind": kind,
            "title": title,
            "expression": expression,
            "chroma_color": color,
            "scope": "collection",
        }
        if entry["kind"] == "gif":
            card.update(animated=True, loop=True)
        cards.append(card)

    def folder_expr(rel: Path) -> str | None:
        return folders[rel.parts[0]]["id"] if len(rel.parts) > 1 and rel.parts[0] in folders else None

    for relstr, it in listed.items():
        rel = Path(relstr)
        if collections.resolve(f"{cid}/{relstr}") is None:
            continue  # el archivo del manifiesto ya no existe en disco
        expr = it.get("expression") or folder_expr(rel) or OTHER
        add(rel, expr, it.get("title") or _pretty_title(rel.stem))

    if coll_dir.is_dir():
        for p in sorted(coll_dir.rglob("*")):
            if not p.is_file() or p.name == MANIFEST:
                continue
            rel = p.relative_to(coll_dir)
            if str(rel).replace("\\", "/") in listed:
                continue
            add(rel, folder_expr(rel) or OTHER, _pretty_title(rel.stem))
    return cards, exprs


def list_sticks() -> dict:
    """Colecciones con ``stick.json``, ordenadas por ``order`` y luego nombre."""
    base = collections.get_root()
    if base is None:
        return {"available": False, "sticks": []}
    out: list[dict] = []
    for sub in sorted(p for p in base.iterdir() if p.is_dir()):
        cid = sub.name
        man = _read_manifest(base, cid)
        if man is None:
            continue
        cards, _ = _collect(base, cid, man)
        kinds = {k: sum(1 for c in cards if c["stick_kind"] == k) for k in _KINDS}
        cover = next((c["url"] for c in cards if c["stick_kind"] == "image"), "")
        out.append({
            "id": cid,
            "name": man.get("name") or cid,
            "emoji": man.get("emoji") or "",
            "order": int(man.get("order") if man.get("order") is not None else 999),
            "chroma_color": _chroma_color(man),
            "kinds": kinds,
            "count": sum(kinds.values()),
            "cover_url": cover,
        })
    out.sort(key=lambda s: (s["order"], s["name"].lower()))
    return {"available": True, "sticks": out}


def stick_detail(cid: str) -> dict:
    """Recursos de un stick agrupados por expresión.

    ``video``/``image``: grupos NO vacíos por tipo (menú de la timeline).
    ``groups``: TODAS las expresiones en orden, con vídeos e imágenes juntos e
    incluidas las vacías (la Biblioteca las muestra como zonas donde soltar).
    """
    base, cid, man = _root_and_manifest(cid)
    cards, exprs = _collect(base, cid, man)
    order_index = {e["id"]: i for i, e in enumerate(exprs)}
    labels = {e["id"]: e for e in exprs}

    def meta(eid: str) -> dict:
        m = labels.get(eid, {})
        return {"id": eid, "label": m.get("label") or eid.replace("_", " ").title(), "emoji": m.get("emoji") or ""}

    def sort_key(eid: str) -> tuple:
        return (order_index.get(eid, 999), eid)

    def by_kind(kind: str) -> list[dict]:
        groups: dict[str, list[dict]] = {}
        for c in cards:
            if c["stick_kind"] == kind:
                groups.setdefault(c["expression"], []).append(c)
        return [{**meta(eid), "items": groups[eid]} for eid in sorted(groups, key=sort_key)]

    all_ids = sorted({*order_index, *(c["expression"] for c in cards)}, key=sort_key)
    return {
        "id": cid,
        "name": man.get("name") or cid,
        "emoji": man.get("emoji") or "",
        "chroma_color": _chroma_color(man),
        "kinds": {k: sum(1 for c in cards if c["stick_kind"] == k) for k in _KINDS},
        "video": by_kind("video"),
        "image": by_kind("image"),
        "expressions": [meta(eid) for eid in all_ids],
        "groups": [{**meta(eid), "items": [c for c in cards if c["expression"] == eid]} for eid in all_ids],
    }


# --- crear / subir / recategorizar ------------------------------------------

def create_stick(name: str, emoji: str = "", chroma_color: str = DEFAULT_CHROMA) -> dict:
    """Crea un stick nuevo: carpeta + ``stick.json`` + una subcarpeta por expresión.

    Las subcarpetas (``feliz/``, ``triste/``…) permiten también categorizar
    copiando archivos desde el explorador. Devuelve su detalle.
    """
    base = collections.get_root()
    if base is None:
        raise ValueError("No hay carpeta raíz de material. Elige una en la Biblioteca.")
    name = str(name or "").strip()
    if not name:
        raise ValueError("Ponle un nombre al stick.")
    color = str(chroma_color or "").strip()
    if not _HEX.match(color):
        color = DEFAULT_CHROMA

    stem = _slug(name)
    cid, n = stem, 2
    while (base / cid).exists():
        cid, n = f"{stem}_{n}", n + 1
    folder = base / cid
    folder.mkdir(parents=True)
    for e in DEFAULT_EXPRESSIONS:
        (folder / _slug(e["label"], fallback=e["id"])).mkdir(exist_ok=True)

    orders = [s["order"] for s in list_sticks()["sticks"] if s["order"] < 999]
    man = {
        "schema": "stick/1",
        "name": name,
        "emoji": str(emoji or "").strip()[:4],
        "order": (max(orders) + 1) if orders else 0,
        "chroma": {"color": color},
        "expressions": [dict(e) for e in DEFAULT_EXPRESSIONS],
        "items": [],
    }
    _write_manifest(base, cid, man)
    return stick_detail(cid)


def _expression_folder(coll_dir: Path, man: dict, expression: str) -> Path:
    """Subcarpeta de una expresión (la existente que la represente, o una nueva
    con el nombre de su etiqueta: ``sad`` → ``triste/``)."""
    defs = _expr_defs(man)
    for name, f in _folder_expressions(coll_dir, defs).items():
        if f["id"] == expression:
            return coll_dir / name
    label = next((e.get("label") for e in defs if e["id"] == expression), None) or expression
    target = coll_dir / _slug(label, fallback=expression)
    target.mkdir(exist_ok=True)
    return target


def _safe_filename(raw: str) -> str:
    name = _BAD_CHARS.sub("_", Path(str(raw or "")).name).strip(" .")
    return name or "archivo"


def _unique_path(folder: Path, filename: str) -> Path:
    target = folder / filename
    stem, suffix, n = target.stem, target.suffix, 2
    while target.exists():
        target = folder / f"{stem}_{n}{suffix}"
        n += 1
    return target


def add_files(cid: str, files: Iterable[tuple[str, BinaryIO]], expression: str = OTHER) -> dict:
    """Guarda vídeos/imágenes en la subcarpeta de ``expression`` del stick.

    ``files`` = ``[(nombre, stream)]``. Devuelve ``{saved, errors, detail}``.
    """
    base, cid, man = _root_and_manifest(cid)
    coll_dir = base / cid
    _, exprs = _collect(base, cid, man)
    expression = str(expression or OTHER)
    if expression not in {e["id"] for e in exprs}:
        raise ValueError(f"Expresión desconocida: {expression}")
    folder = _expression_folder(coll_dir, man, expression)

    saved: list[str] = []
    errors: list[dict] = []
    for raw_name, stream in files:
        name = _safe_filename(raw_name)
        if _STICK_KIND.get(collections.kind_for(Path(name)) or "") is None:
            errors.append({"file": raw_name, "error": "Solo vídeos o imágenes (mp4, mov, webm, png, jpg, webp, gif…)."})
            continue
        target = _unique_path(folder, name)
        with target.open("wb") as out:
            shutil.copyfileobj(stream, out)
        saved.append(str(target.relative_to(coll_dir)).replace("\\", "/"))
    return {"saved": saved, "errors": errors, "detail": stick_detail(cid)}


def set_expression(cid: str, rel: str, expression: str) -> dict:
    """Cambia la expresión de un recurso SIN mover el archivo (los clips que ya
    lo usan siguen encontrándolo): la guarda en ``items`` del manifiesto."""
    base, cid, man = _root_and_manifest(cid)
    rel = str(rel or "").replace("\\", "/").lstrip("/")
    path = collections.resolve(f"{cid}/{rel}")
    if not rel or path is None or (base / cid).resolve() not in path.parents:
        raise LookupError("Recurso no encontrado en el stick.")
    kind = _STICK_KIND.get(collections.kind_for(path) or "")
    if kind is None:
        raise ValueError("Solo se categorizan vídeos o imágenes.")
    cards, exprs = _collect(base, cid, man)
    expression = str(expression or "")
    if expression not in {e["id"] for e in exprs}:
        raise ValueError(f"Expresión desconocida: {expression}")

    items = [it for it in (man.get("items") or []) if isinstance(it, dict)]
    cur = next((it for it in items if str(it.get("file") or "").replace("\\", "/") == rel), None)
    if cur is None:
        title = next((c["title"] for c in cards if c["rel"] == rel), _pretty_title(Path(rel).stem))
        items.append({"file": rel, "kind": kind, "expression": expression, "title": title})
    else:
        cur["expression"] = expression
    man["items"] = items
    # Una categoría propia (subcarpeta) pasa a la taxonomía para que el
    # manifiesto la recuerde aunque se vacíe la carpeta.
    known = {e["id"] for e in _expr_defs(man)}
    if expression not in known:
        extra = next(e for e in exprs if e["id"] == expression)
        man["expressions"] = [*_expr_defs(man), extra]
    _write_manifest(base, cid, man)
    return stick_detail(cid)
