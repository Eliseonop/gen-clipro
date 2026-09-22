"""Sticks: personajes de la biblioteca clasificados por expresión.

Una colección (subcarpeta de ``material_root``) se convierte en un *stick*
—un personaje que se agrega desde la línea de tiempo— cuando contiene un
manifiesto ``stick.json`` que agrupa sus recursos por expresión (feliz, triste,
enojado…). El manifiesto es editable a mano; su presencia marca la carpeta como
stick y aporta el nombre, el emoji, el color de croma y las etiquetas en español.

Formato de ``stick.json`` (``schema: "stick/1"``)::

    {
      "name": "Scientific", "emoji": "🔬", "order": 0,
      "chroma": {"color": "#00FF00"},
      "expressions": [{"id": "happy", "label": "Feliz", "emoji": "😄"}, ...],
      "items": [{"file": "...mp4", "kind": "video", "expression": "happy",
                 "title": "Giving thumbs up"}, ...]
    }

El menú lo usa así: elegir stick → Vídeo/Imagen → galería agrupada por expresión
(variantes en horizontal). Al agregar, el clip nace con croma configurado.
"""
from __future__ import annotations

import json
from pathlib import Path

from . import collections

MANIFEST = "stick.json"
_KINDS = ("video", "image")
DEFAULT_CHROMA = "#00FF00"


def _read_manifest(base: Path, cid: str) -> dict | None:
    p = base / cid / MANIFEST
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — un JSON roto no debe tumbar la lista
        return None
    return data if isinstance(data, dict) else None


def _chroma_color(man: dict) -> str:
    c = man.get("chroma") if isinstance(man.get("chroma"), dict) else {}
    return str(c.get("color") or DEFAULT_CHROMA)


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
        items = [it for it in (man.get("items") or []) if isinstance(it, dict)]
        kinds = {k: 0 for k in _KINDS}
        cover = ""
        for it in items:
            k = it.get("kind")
            file = it.get("file")
            if k not in _KINDS or not file:
                continue
            entry = collections._entry(cid, Path(file))
            if collections.resolve(entry["filename"]) is None:
                continue  # archivo del manifiesto que ya no está en disco
            kinds[k] += 1
            if not cover and k == "image":
                cover = entry["url"]
        out.append({
            "id": cid,
            "name": man.get("name") or cid,
            "emoji": man.get("emoji") or "",
            "order": int(man.get("order") if man.get("order") is not None else 999),
            "kinds": kinds,
            "count": sum(kinds.values()),
            "cover_url": cover,
        })
    out.sort(key=lambda s: (s["order"], s["name"].lower()))
    return {"available": True, "sticks": out}


def stick_detail(cid: str) -> dict:
    """Recursos de un stick agrupados por expresión, separados vídeo/imagen."""
    base = collections.get_root()
    cid = collections._safe_collection_id(cid)
    man = _read_manifest(base, cid) if base is not None else None
    if man is None:
        raise LookupError("Stick no encontrado.")
    color = _chroma_color(man)

    expr_defs = [e for e in (man.get("expressions") or []) if isinstance(e, dict) and e.get("id")]
    order_index = {e["id"]: i for i, e in enumerate(expr_defs)}
    labels = {e["id"]: e for e in expr_defs}

    buckets: dict[str, dict[str, list[dict]]] = {k: {} for k in _KINDS}
    for it in (man.get("items") or []):
        if not isinstance(it, dict):
            continue
        k = it.get("kind")
        file = it.get("file")
        if k not in _KINDS or not file:
            continue
        entry = collections._entry(cid, Path(file))
        if collections.resolve(entry["filename"]) is None:
            continue  # el archivo del manifiesto ya no existe en disco
        eid = it.get("expression") or "otros"
        card = {
            **entry,                          # id, collection, name, kind, filename, url
            "title": it.get("title") or entry["name"],
            "expression": eid,
            "chroma_color": color,
            "scope": "collection",
        }
        buckets[k].setdefault(eid, []).append(card)

    def build(groups: dict[str, list[dict]]) -> list[dict]:
        eids = sorted(groups.keys(), key=lambda e: (order_index.get(e, 999), e))
        out: list[dict] = []
        for eid in eids:
            meta = labels.get(eid, {})
            out.append({
                "id": eid,
                "label": meta.get("label") or eid.replace("_", " ").title(),
                "emoji": meta.get("emoji") or "",
                "items": groups[eid],
            })
        return out

    return {
        "id": cid,
        "name": man.get("name") or cid,
        "emoji": man.get("emoji") or "",
        "chroma_color": color,
        "kinds": {k: sum(len(v) for v in buckets[k].values()) for k in _KINDS},
        "video": build(buckets["video"]),
        "image": build(buckets["image"]),
    }
