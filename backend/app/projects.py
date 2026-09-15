"""Almacén de proyectos persistido en un JSON.

Un proyecto agrupa el material (por ahora, los clips generados). Es un almacén
simple en disco con un lock; si más adelante crece, se migra a SQLite sin tocar
la API. Los clips de cada proyecto viven en ``clips/<project_id>/``.
"""
from __future__ import annotations

import json
import os
import stat
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import config, migrations
from .schemas import AudioInfo, ClipInfo, ImageInfo, Project, Transcript

_lock = threading.Lock()
_FILE: Path = config.PROJECTS_FILE

# En Windows, os.replace sobre un JSON abierto (antivirus, indexador, IDE)
# lanza WinError 5 / 32. Reintentar y, si no, sobrescribir in-place.
_REPLACE_ATTEMPTS = 12
_REPLACE_DELAY = 0.04


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load() -> dict:
    if not _FILE.exists():
        return {"projects": []}
    try:
        return json.loads(_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"projects": []}


def _is_lock_error(exc: BaseException) -> bool:
    if isinstance(exc, PermissionError):
        return True
    return getattr(exc, "winerror", None) in (5, 32)


def _replace_file(src: Path, dest: Path) -> None:
    """Sustituye dest por src. En Windows dest a menudo no se puede borrar."""
    last: OSError | None = None
    delay = _REPLACE_DELAY
    for _ in range(_REPLACE_ATTEMPTS):
        try:
            if dest.exists():
                dest.chmod(stat.S_IWRITE | stat.S_IREAD)
            os.replace(src, dest)
            return
        except OSError as exc:
            if not _is_lock_error(exc):
                raise
            last = exc
            time.sleep(delay)
            delay = min(0.25, delay * 1.5)
    payload = src.read_bytes()
    try:
        with dest.open("wb") as fh:
            fh.write(payload)
            fh.flush()
            os.fsync(fh.fileno())
    except OSError as exc:
        raise last or exc
    try:
        src.unlink(missing_ok=True)
    except OSError:
        pass


def _save(data: dict) -> None:
    _FILE.parent.mkdir(exist_ok=True)
    tmp = _FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    _replace_file(tmp, _FILE)


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


def rename_project(pid: str, name: str) -> Project | None:
    new_name = (name or "").strip()
    if not new_name:
        raise ValueError("El nombre no puede estar vacío.")
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p["name"] = new_name
                _save(data)
                return _project_from_dict(p)
    return None


# Carpetas que NO se copian al duplicar: los renders son derivados y pesan mucho.
_DUPLICATE_SKIP_DIRS = ("exports",)


def duplicate_project(pid: str) -> Project | None:
    """Copia un proyecto (datos + archivos) con id nuevo y nombre "<nombre> (copia)".

    Los archivos se copian a la carpeta por defecto del nuevo proyecto, así que la
    copia es independiente aunque el original use una carpeta propia. Las URLs
    ``/api/media/<pid>/…`` y ``/api/projects/<pid>/…`` guardadas se reescriben al id nuevo.
    """
    import shutil

    from . import storage

    src = get_project(pid)
    if src is None:
        return None
    new_id = uuid.uuid4().hex[:8]
    dest_base = storage.default_base(new_id)
    ignore = shutil.ignore_patterns(*_DUPLICATE_SKIP_DIRS)
    src_base = storage.project_base(src)
    if src_base.exists():
        shutil.copytree(src_base, dest_base, ignore=ignore, dirs_exist_ok=True)
    # Motion Studio guarda siempre bajo la carpeta por defecto, aunque haya carpeta propia.
    motion = storage.default_base(pid) / "motion"
    if motion.exists() and not (dest_base / "motion").exists():
        shutil.copytree(motion, dest_base / "motion")
    storage.ensure_dirs(dest_base)

    with _lock:
        data = _load()
        raw = next((p for p in data["projects"] if p["id"] == pid), None)
        if raw is None:
            return None
        text = json.dumps(raw, ensure_ascii=False)
        for prefix in ("/api/media/", "/api/projects/"):
            text = text.replace(f"{prefix}{pid}/", f"{prefix}{new_id}/")
        copy = json.loads(text)
        copy.update(id=new_id, name=f"{src.name} (copia)", created_at=_now(), folder=None)
        idx = data["projects"].index(raw)
        data["projects"].insert(idx, copy)
        _save(data)
    return _project_from_dict(copy)


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


def save_motion_composition(pid: str, comp: dict) -> Project | None:
    """Inserta o actualiza (upsert por id) una composición de Motion Studio."""
    cid = comp.get("id")
    if not cid:
        return None
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                comps = p.setdefault("motion_compositions", [])
                idx = next((i for i, c in enumerate(comps) if c.get("id") == cid), None)
                if idx is not None:
                    comps[idx] = comp
                else:
                    comps.append(comp)
                _save(data)
                return _project_from_dict(p)
    return None


def delete_motion_composition(pid: str, cid: str) -> bool:
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                comps = p.get("motion_compositions") or []
                new = [c for c in comps if c.get("id") != cid]
                if len(new) != len(comps):
                    p["motion_compositions"] = new
                    _save(data)
                    return True
    return False


def save_scene_directions(pid: str, doc: dict) -> bool:
    """Guarda la escaleta de Dirección de escena (documento completo ya normalizado)."""
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p["scene_directions"] = doc
                _save(data)
                return True
    return False


def save_visual_blueprint(pid: str, doc: dict) -> bool:
    """Guarda la dirección visual GLOBAL del proyecto (Fase 5; doc ya normalizado)."""
    with _lock:
        data = _load()
        for p in data["projects"]:
            if p["id"] == pid:
                p["visual_blueprint"] = doc
                _save(data)
                return True
    return False


def retarget_timeline_asset(
    pid: str, asset_kind: str, old_id: str, old_filename: str,
    new_id: str, new_filename: str, match_filename: bool = True,
) -> None:
    """Reescribe punteros de la timeline de un proyecto hacia un ítem de biblioteca.

    ``match_filename=False`` empareja solo por id: el archivo lo comparten otros
    materiales (segmentos por referencia) cuyos clips no deben moverse.
    """
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
                    if str(c.get("asset_id")) == str(old_id) or (match_filename and c.get("filename") == old_filename):
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
