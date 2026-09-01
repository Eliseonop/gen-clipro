"""Almacén de proyectos persistido en un JSON.

Un proyecto agrupa el material (por ahora, los clips generados). Es un almacén
simple en disco con un lock; si más adelante crece, se migra a SQLite sin tocar
la API. Los clips de cada proyecto viven en ``clips/<project_id>/``.
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import config, migrations
from .schemas import AudioInfo, ClipInfo, ImageInfo, Project, Transcript

_lock = threading.Lock()
_FILE: Path = config.PROJECTS_FILE


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load() -> dict:
    if not _FILE.exists():
        return {"projects": []}
    try:
        return json.loads(_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"projects": []}


def _save(data: dict) -> None:
    _FILE.parent.mkdir(exist_ok=True)
    tmp = _FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(_FILE)   # reemplazo atómico


def _project_from_dict(p: dict) -> Project:
    """Construye un Project migrando su timeline al schema actual (lazy)."""
    raw = dict(p)
    clips = []
    for c in raw.get("clips") or []:
        if isinstance(c, dict):
            cc = dict(c)
            if not cc.get("id") and cc.get("index") is not None:
                cc["id"] = str(cc["index"])
            clips.append(cc)
        else:
            clips.append(c)
    raw["clips"] = clips
    if raw.get("timeline"):
        raw["timeline"] = migrations.migrate_timeline(raw["timeline"])
    return Project(**raw)


def list_projects() -> list[Project]:
    return [_project_from_dict(p) for p in _load()["projects"]]


def get_project(pid: str) -> Project | None:
    for p in _load()["projects"]:
        if p["id"] == pid:
            return _project_from_dict(p)
    return None


def create_project(name: str) -> Project:
    proj = Project(
        id=uuid.uuid4().hex[:8],
        name=(name or "").strip() or "Sin título",
        created_at=_now(),
        clips=[],
    )
    with _lock:
        data = _load()
        data["projects"].insert(0, proj.model_dump())
        _save(data)
    return proj


def set_folder(pid: str, path: str) -> Project | None:
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p["folder"] = path
                _save(data)
                return Project(**p)
    return None


def delete_project(pid: str) -> bool:
    with _lock:
        data = _load()
        before = len(data["projects"])
        data["projects"] = [p for p in data["projects"] if p["id"] != pid]
        _save(data)
        return len(data["projects"]) < before


def add_clips(pid: str, clips: list[ClipInfo]) -> None:
    stamp = _now()
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p.setdefault("clips", [])
                for c in clips:
                    d = c.model_dump()
                    d["created_at"] = stamp
                    # Upsert por índice: regenerar un tramo actualiza su clip en
                    # vez de duplicarlo (mismo index → mismo archivo en disco).
                    existing = next((i for i, e in enumerate(p["clips"]) if e.get("index") == d["index"]), None)
                    if existing is not None:
                        prev = p["clips"][existing]
                        if prev.get("id") and not d.get("id"):
                            d["id"] = prev["id"]
                        elif not d.get("id"):
                            d["id"] = str(d.get("index") or uuid.uuid4().hex[:12])
                        p["clips"][existing] = d
                    else:
                        if not d.get("id"):
                            d["id"] = uuid.uuid4().hex[:12]
                        p["clips"].append(d)
                break
        _save(data)


def add_transcript(pid: str, transcript: Transcript) -> None:
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p.setdefault("transcripts", [])
                p["transcripts"].append(transcript.model_dump())
                break
        _save(data)


def _match(item: dict, ident: str) -> bool:
    return str(item.get("index", item.get("id"))) == str(ident)


def update_material(pid: str, kind: str, ident: str, fields: dict) -> dict | None:
    """Actualiza label/description de un clip o audio. Devuelve el item nuevo."""
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                for item in p.get(kind, []):
                    if _match(item, ident):
                        for k, v in fields.items():
                            if v is not None:
                                item[k] = v
                        _save(data)
                        return item
    return None


def apply_manifest(pid: str, manifest: dict) -> Project | None:
    """Aplica un manifest editado a mano de vuelta al proyecto.

    Los materiales se emparejan por ``file`` (el nombre de archivo, que es la
    identidad estable). Solo se tocan los campos editables; el resto (index, id,
    url, created_at, duration…) se conserva tal cual para no romper los datos.
    """
    clip_fields = ("label", "description", "start", "end", "source_url")
    audio_fields = ("label", "description", "voice")
    by_file: dict[str, dict] = {}
    for m in manifest.get("materials", []) or []:
        f = m.get("file")
        if f:
            by_file[f] = m
    new_name = ((manifest.get("project") or {}).get("name") or "").strip()

    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] != pid:
                continue
            if new_name:
                p["name"] = new_name
            for c in p.get("clips", []):
                m = by_file.get(c.get("filename"))
                if m:
                    for k in clip_fields:
                        if k in m:
                            c[k] = m[k]
            for a in p.get("audios", []):
                m = by_file.get(a.get("filename"))
                if m:
                    for k in audio_fields:
                        if k in m:
                            a[k] = m[k]
            for im in p.get("images", []):
                m = by_file.get(im.get("filename"))
                if m:
                    for k in ("label", "description"):
                        if k in m:
                            im[k] = m[k]
            _save(data)
            return Project(**p)
    return None


def remove_material(pid: str, kind: str, ident: str) -> dict | None:
    """Quita un clip o audio del proyecto. Devuelve el item eliminado (para borrar su archivo)."""
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                items = p.get(kind, [])
                for i, item in enumerate(items):
                    if _match(item, ident):
                        removed = items.pop(i)
                        _save(data)
                        return removed
    return None


def save_timeline(pid: str, timeline: dict) -> Project | None:
    """Guarda la composición del editor de vídeo en el proyecto."""
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p["timeline"] = timeline
                _save(data)
                return Project(**p)
    return None


def retarget_timeline_asset(
    pid: str, asset_kind: str, old_id: str, old_filename: str,
    new_id: str, new_filename: str,
) -> None:
    """Reescribe punteros de la timeline de un proyecto hacia un ítem de biblioteca."""
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] != pid:
                continue
            tl = p.get("timeline")
            if isinstance(tl, dict):
                for c in tl.get("clips") or []:
                    if c.get("asset_kind") != asset_kind:
                        continue
                    if str(c.get("asset_id")) == str(old_id) or c.get("filename") == old_filename:
                        c["asset_scope"] = "library"
                        c["asset_id"] = new_id
                        c["filename"] = new_filename
            _save(data)
            return


def add_audio(pid: str, audio: AudioInfo) -> None:
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p.setdefault("audios", [])
                p["audios"].append(audio.model_dump())
                break
        _save(data)


def add_image(pid: str, image: ImageInfo) -> None:
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p.setdefault("images", [])
                p["images"].append(image.model_dump())
                break
        _save(data)
