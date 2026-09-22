"""Plantillas DEL USUARIO: composiciones que salieron bien y se guardan para reutilizar (§16).

Flujo: la IA compone algo desde cero porque ninguna plantilla encajaba → el
usuario lo valida en la vista previa → «Guardar como plantilla». A partir de ahí
aparece en el catálogo que ve la IA y en la galería de Motion Studio, y la
biblioteca crece con el uso.

Variables sin plantillas a mano: las «ranuras» de una plantilla guardada son los
TEXTOS y las IMÁGENES que contiene. Al instanciarla se pasan sustituciones:

    params = {"texts": {"Texto original": "Texto nuevo"},
              "images": {"lib_abc": "id_de_otra_imagen"}}

Las imágenes se copian a la Biblioteca al guardar (ids ``lib_…``), que se
resuelven desde cualquier proyecto. La composición se escala al formato de
destino con el mismo truco que las plantillas visuales.
"""
from __future__ import annotations

import copy
import html as _html
import json
import re
import threading
import time
import unicodedata
import uuid
from html.parser import HTMLParser
from typing import Any

from ... import config
from ..models import MotionComposition
from .base import Template

CATEGORY = "user"
MAX_TEXTS = 14
MAX_TEXT_CHARS = 80
_ASSET_RE = re.compile(r"asset:image/([A-Za-z0-9_.-]+)")
_lock = threading.Lock()


def _file():
    # Se calcula en cada llamada para que los tests puedan aislar DATA_DIR.
    return config.DATA_DIR / "motion_user_templates.json"


def _load() -> list[dict]:
    try:
        data = json.loads(_file().read_text(encoding="utf-8"))
        return [e for e in data.get("templates", []) if isinstance(e, dict) and e.get("key")]
    except (OSError, ValueError):
        return []


def _save(rows: list[dict]) -> None:
    f = _file()
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps({"templates": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


# --- Ranuras: textos e imágenes de la composición --------------------------------

class _TextCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("style", "script") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        t = " ".join(data.split())
        if t and not self._skip and any(c.isalnum() for c in t):
            self.out.append(t)


def texts_of(comp: MotionComposition) -> list[str]:
    """Textos visibles de la composición, en orden y sin repetir."""
    found: list[str] = []
    for layer in comp.layers:
        if layer.type == "text" and (layer.content or "").strip():
            found.append(" ".join(layer.content.split()))
        elif layer.type == "html" and layer.html:
            p = _TextCollector()
            p.feed(layer.html)
            found.extend(p.out)
    out: list[str] = []
    for t in found:
        if t not in out and len(t) <= MAX_TEXT_CHARS:
            out.append(t)
    return out[:MAX_TEXTS]


def images_of(comp: MotionComposition) -> list[str]:
    ids: list[str] = []
    for layer in comp.layers:
        for blob in (layer.html, layer.css, layer.content if layer.type == "image" else None):
            for m in _ASSET_RE.finditer(blob or ""):
                if m.group(1) not in ids:
                    ids.append(m.group(1))
    return ids


# --- Guardar / listar / borrar ---------------------------------------------------

def _slug(name: str) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFD", (name or "").lower())
                    if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "_", plain).strip("_")
    return s[:24] or "plantilla"


def save(project_id: str, comp: MotionComposition, *, name: str, best_for: str = "",
         tags: list[str] | None = None, copy_images=None) -> dict:
    """Guarda ``comp`` como plantilla reutilizable. ``copy_images(project_id, id) → lib_id``
    lleva las imágenes a la Biblioteca (inyectable para tests)."""
    name = " ".join((name or "").split())[:48]
    if not name:
        raise ValueError("La plantilla necesita un nombre.")
    if not comp.layers:
        raise ValueError("La composición está vacía.")
    if copy_images is None:
        from ... import library

        def copy_images(pid, iid):
            if iid.startswith("lib_"):
                return iid
            return library.save_from_project(pid, "image", iid)["id"]

    raw = comp.model_dump()
    moved: dict[str, str] = {}
    for iid in images_of(comp):
        try:
            moved[iid] = copy_images(project_id, iid)
        except LookupError:
            continue          # imagen que ya no existe: queda como referencia rota del original
    if moved:
        for layer in raw["layers"]:
            for fld in ("html", "css", "content"):
                if layer.get(fld):
                    layer[fld] = _ASSET_RE.sub(
                        lambda m: f"asset:image/{moved.get(m.group(1), m.group(1))}", layer[fld])
    meta = dict(raw.get("metadata") or {})
    for k in ("draft", "source", "range", "project_id", "created_at"):
        meta.pop(k, None)
    raw["metadata"] = meta
    saved = MotionComposition(**raw)
    entry = {
        "key": f"u_{_slug(name)}_{uuid.uuid4().hex[:6]}",
        "name": name,
        "best_for": " ".join((best_for or "").split())[:160],
        "tags": [str(t)[:24] for t in (tags or [])][:8],
        "texts": texts_of(saved),
        "images": images_of(saved),
        "width": saved.width, "height": saved.height,
        "composition": saved.model_dump(),
        "source_project_id": project_id,
        "created_at": time.time(),
    }
    with _lock:
        rows = _load()
        rows.insert(0, entry)
        _save(rows)
    return _public(entry)


def delete(key: str) -> bool:
    with _lock:
        rows = _load()
        keep = [e for e in rows if e.get("key") != key]
        if len(keep) == len(rows):
            return False
        _save(keep)
    return True


def _public(entry: dict) -> dict:
    return {k: entry.get(k) for k in ("key", "name", "best_for", "tags", "texts", "images",
                                        "width", "height", "created_at")}


def list_saved() -> list[dict]:
    return [_public(e) for e in _load()]


# --- Instanciar --------------------------------------------------------------------

def _replace_text(value: str, subs: dict[str, str], *, escaped: bool) -> str:
    for old, new in subs.items():
        if not old:
            continue
        if escaped:
            value = value.replace(_html.escape(old, quote=False), _html.escape(new, quote=False))
        else:
            value = value.replace(old, new)
    return value


def _scale_layer(layer: dict, k: float, W0: int, H0: int) -> None:
    """Escala una capa text/shape en px; las html se envuelven en un lienzo escalado."""
    if layer.get("type") == "html":
        layer["html"] = (f'<div style="position:absolute;left:0;top:0;width:{W0}px;height:{H0}px;'
                         f'transform:scale({k:.5f});transform-origin:0 0">{layer.get("html") or ""}</div>')
        return
    for fld in ("x", "y", "width", "height"):
        if isinstance(layer.get(fld), (int, float)):
            layer[fld] = layer[fld] * k
    style = layer.get("style") or {}
    for fld in ("fontSize", "padding", "borderRadius", "letterSpacing"):
        if isinstance(style.get(fld), (int, float)):
            style[fld] = style[fld] * k
    shape = layer.get("shape") or {}
    for fld in ("radius", "width", "height", "x2", "y2", "thickness", "borderRadius"):
        if isinstance(shape.get(fld), (int, float)):
            shape[fld] = shape[fld] * k


def build(entry: dict, comp_id: str, params: dict[str, Any]) -> MotionComposition:
    raw = copy.deepcopy(entry["composition"])
    texts = {str(k): str(v) for k, v in (params.get("texts") or {}).items()
             if isinstance(k, str) and v is not None}
    images = {str(k).replace("asset:image/", ""): str(v).replace("asset:image/", "")
              for k, v in (params.get("images") or {}).items() if v}

    W0, H0 = int(raw.get("width") or 1080), int(raw.get("height") or 1920)
    W = int(params.get("width") or W0)
    H = int(params.get("height") or H0)
    k = min(W / W0, H / H0)
    for layer in raw.get("layers", []):
        if texts:
            if layer.get("html"):
                layer["html"] = _replace_text(layer["html"], texts, escaped=True)
            if layer.get("type") == "text" and layer.get("content"):
                layer["content"] = _replace_text(layer["content"], texts, escaped=False)
        if images:
            for fld in ("html", "css", "content"):
                if layer.get(fld):
                    layer[fld] = _ASSET_RE.sub(
                        lambda m: f"asset:image/{images.get(m.group(1), m.group(1))}", layer[fld])
        if abs(k - 1) > 1e-3:
            _scale_layer(layer, k, W0, H0)
        if abs(k - 1) > 1e-3 and (W, H) != (round(W0 * k), round(H0 * k)):
            # Otra proporción: se centra el lienzo escalado.
            dx, dy = (W - W0 * k) / 2, (H - H0 * k) / 2
            if layer.get("type") == "html":
                layer["html"] = layer["html"].replace(
                    "position:absolute;left:0;top:0;", f"position:absolute;left:{dx:.1f}px;top:{dy:.1f}px;", 1)
            else:
                layer["x"] = float(layer.get("x") or 0) + dx
                layer["y"] = float(layer.get("y") or 0) + dy
        if layer.get("type") == "html":
            layer["width"], layer["height"] = W, H
    raw.update({"id": comp_id, "width": W, "height": H, "name": entry.get("name") or raw.get("name")})
    if params.get("duration"):
        raw["duration"] = float(params["duration"])
    meta = dict(raw.get("metadata") or {})
    meta.update({"template": entry["key"], "user_template": True})
    raw["metadata"] = meta
    return MotionComposition(**raw)


def as_templates() -> list[Template]:
    out = []
    for e in _load():
        texts = e.get("texts") or []
        slots = {"texts": "sustituciones {texto_original: texto_nuevo}. Textos: "
                          + "; ".join(f"«{t}»" for t in texts[:MAX_TEXTS])}
        if e.get("images"):
            slots["images"] = ("sustituciones {id_original: id_de_imagen_del_material}. "
                               "Originales: " + ", ".join(e["images"]))
        out.append(Template(
            key=e["key"], name=e.get("name") or e["key"], category=CATEGORY,
            description=e.get("best_for") or "Plantilla guardada por el usuario.",
            parameters={"texts": {}, "images": {}, "duration": None},
            build=lambda cid, params, _e=e: build(_e, cid, params or {}),
            tags=list(e.get("tags") or []) + ["mía"],
            best_for=e.get("best_for") or "Composición guardada por el usuario; reutilízala si encaja.",
            slots=slots, accepts_images=bool(e.get("images")),
        ))
    return out
