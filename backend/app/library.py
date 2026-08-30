"""Biblioteca global de clips y audios reutilizables entre proyectos."""
from __future__ import annotations

import json
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from . import config, projects, storage

_lock = threading.Lock()

_YT_HINTS = ("youtube.com", "youtu.be")


class LibraryInUseError(Exception):
    def __init__(self, used_by: list[dict]):
        self.projects = used_by
        names = ", ".join((p.get("name") or p.get("id") or "") for p in used_by) or "otro proyecto"
        super().__init__(f"En uso en: {names}")


def library_root() -> Path:
    return storage.library_root()


def _file() -> Path:
    return library_root() / "library.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _new_id() -> str:
    return "lib_" + uuid.uuid4().hex[:12]


def _load() -> dict:
    path = _file()
    if not path.exists():
        return {"version": 1, "items": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"version": 1, "items": []}
        data.setdefault("version", 1)
        data.setdefault("items", [])
        return data
    except Exception:
        return {"version": 1, "items": []}


def _save(data: dict) -> None:
    path = _file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _resource_type(item: dict) -> str:
    rt = item.get("resource_type")
    if rt in ("audio", "clip"):
        return rt
    if "index" in item:
        return "clip"
    return "audio"


def infer_origin_source(item: dict, resource_type: str) -> tuple[str, str]:
    if item.get("origin") and item.get("source"):
        return str(item["origin"]), str(item["source"])
    if item.get("origin"):
        origin = str(item["origin"])
        source = "external" if origin == "youtube" else "generated"
        return origin, source
    if resource_type == "audio":
        url = str(item.get("youtube_url") or "")
        if any(h in url.lower() for h in _YT_HINTS):
            return "youtube", "external"
        if item.get("youtube_id"):
            return "youtube", "external"
        return "tts", "generated"
    url = str(item.get("source_url") or item.get("youtube_url") or "")
    if any(h in url.lower() for h in _YT_HINTS):
        return "youtube", "external"
    return "compose", "generated"


def material_dto(item: dict, scope: str) -> dict:
    rt = _resource_type(item)
    origin, source = infer_origin_source(item, rt)
    kind = "video" if rt == "clip" else "audio"
    filename = item.get("filename") or ""
    out = dict(item)
    out["resource_type"] = rt
    out["scope"] = scope
    out["is_saved"] = scope == "library"
    out["origin"] = origin
    out["source"] = source
    if scope == "library":
        out["url"] = f"/api/library/media/{kind}/{quote(filename)}"
    return out


def list_library() -> dict:
    items = _load()["items"]
    clips, audios = [], []
    for it in items:
        dto = material_dto(it, "library")
        if dto["resource_type"] == "clip":
            clips.append(dto)
        else:
            audios.append(dto)
    clips.sort(key=lambda x: x.get("saved_at") or "", reverse=True)
    audios.sort(key=lambda x: x.get("saved_at") or "", reverse=True)
    return {"clips": clips, "audios": audios}


def _find_item(data: dict, item_id: str) -> dict | None:
    return next((x for x in data["items"] if x.get("id") == item_id), None)


def save_from_project(project_id: str, resource_type: str, ident: str) -> dict:
    if resource_type not in ("audio", "clip"):
        raise LookupError("Tipo no válido.")
    proj = projects.get_project(project_id)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    disk_kind = "audio" if resource_type == "audio" else "video"
    asset_kind = "audios" if resource_type == "audio" else "clips"
    raw = None
    if resource_type == "audio":
        for a in proj.audios:
            if str(a.id) == str(ident):
                raw = a.model_dump()
                break
    else:
        for c in proj.clips:
            if str(c.index) == str(ident):
                raw = c.model_dump()
                break
    if raw is None:
        raise LookupError("Material no encontrado.")
    src = storage.resolve_media(proj, disk_kind, raw["filename"])
    if src is None or not src.exists():
        raise LookupError("Archivo no encontrado.")

    lib_id = _new_id()
    ext = Path(raw["filename"]).suffix or (".m4a" if resource_type == "audio" else ".mp4")
    stem = storage.safe_name(raw.get("label") or Path(raw["filename"]).stem)
    dest_name = f"{stem}_{lib_id[4:]}{ext}"
    dest = library_root() / disk_kind / dest_name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)

    origin, source = infer_origin_source(raw, resource_type)
    duration = raw.get("duration")
    if duration is None and raw.get("start") is not None and raw.get("end") is not None:
        duration = float(raw["end"]) - float(raw["start"])
    entry = {
        "id": lib_id,
        "resource_type": resource_type,
        "scope": "library",
        "source": source,
        "origin": origin,
        "filename": dest_name,
        "label": raw.get("label"),
        "description": raw.get("description") or raw.get("text"),
        "duration": duration,
        "created_at": raw.get("created_at"),
        "saved_at": _now(),
        "saved_from_project_id": project_id,
        "voice": raw.get("voice"),
        "voice2": raw.get("voice2"),
        "blend": raw.get("blend"),
        "speed": raw.get("speed"),
        "pause": raw.get("pause"),
        "text": raw.get("text"),
        "engine": raw.get("engine"),
        "youtube_url": raw.get("youtube_url") or (raw.get("source_url") if origin == "youtube" else None),
        "youtube_id": raw.get("youtube_id"),
        "start": raw.get("start"),
        "end": raw.get("end"),
        "source_url": raw.get("source_url"),
        "reframe": raw.get("reframe"),
    }

    try:
        with _lock:
            data = _load()
            data["items"].append(entry)
            _save(data)
        projects.retarget_timeline_asset(
            project_id, asset_kind, ident, raw["filename"], lib_id, dest_name,
        )
        removed = projects.remove_material(project_id, asset_kind, str(ident))
        if removed is None:
            raise LookupError("Material no encontrado.")
    except Exception:
        with _lock:
            data = _load()
            data["items"] = [x for x in data["items"] if x.get("id") != lib_id]
            _save(data)
        dest.unlink(missing_ok=True)
        raise

    try:
        src.unlink()
    except Exception:
        pass
    return material_dto(entry, "library")


def projects_using(item_id: str) -> list[dict]:
    used = []
    for p in projects.list_projects():
        tl = p.timeline
        if not tl:
            continue
        for c in tl.clips:
            scope = getattr(c, "asset_scope", None) or "project"
            if scope == "library" and str(c.asset_id) == item_id:
                used.append({"id": p.id, "name": p.name})
                break
    return used


def unsave(item_id: str) -> dict:
    used = projects_using(item_id)
    if used:
        raise LibraryInUseError(used)
    with _lock:
        data = _load()
        item = _find_item(data, item_id)
        if item is None:
            raise LookupError("Recurso no encontrado.")
        data["items"] = [x for x in data["items"] if x.get("id") != item_id]
        _save(data)
    kind = "video" if item.get("resource_type") == "clip" else "audio"
    path = storage.resolve_library_media(kind, item.get("filename") or "")
    if path and path.exists():
        try:
            path.unlink()
        except Exception:
            pass
    return {"deleted": item_id}


def get_item(item_id: str) -> dict | None:
    it = _find_item(_load(), item_id)
    return material_dto(it, "library") if it else None
