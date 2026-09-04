"""Auditoría de las acciones de la IA.

Log append-only en JSONL (``data/mcp_audit.jsonl``). Registra QUÉ tool se llamó,
su nivel de acceso, sobre qué proyecto y un ``meta`` con valores *seguros*
(modelo, clip_id, archivo…) — nunca textos largos (guion, TTS, segmentos).

Además mantiene en memoria las tools/jobs *en curso* para el panel del editor.

La ruta se calcula desde ``config.DATA_DIR`` en cada llamada para que los tests
puedan aislarla (patch de ``config.DATA_DIR`` a un tmpdir).
"""
from __future__ import annotations

import contextvars
import json
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from .. import config

# Origen de la acción (p.ej. "ai_chat"). Se propaga por contextvar para que
# quede registrado sin cambiar la firma de cada tool. Los tools corren en un
# worker thread que copia el contexto, así que el tag se conserva.
_source_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "mcp_audit_source", default=None
)

_lock = threading.Lock()
_live: dict[str, dict] = {}
_jobs_tracked: dict[str, dict] = {}

_JOB_DONE = frozenset({"done", "error", "cancelled"})
_WHISPER_TOOLS = frozenset({
    "transcribe", "generate_subtitles",
    "create_short_from_youtube", "make_short_from_library",
})
# Valores cortos e identificadores. Nada de text/segments/url/keyframes.
_SAFE_META_KEYS = frozenset({
    "model", "language", "clip_id", "source_clip_id", "clip_index",
    "track_id", "filename", "asset_kind", "asset_scope", "engine", "voice",
    "voice2", "job_id", "aspect", "fps", "width", "height", "kind",
    "speed", "opacity", "volume", "muted", "query", "category", "count",
    "crop_mode", "asset_id", "blend", "pause", "name", "position",
    "start", "at_time",
})
_META_STR_MAX = 80


@contextmanager
def source(name: str | None):
    """Marca el origen de las acciones auditadas dentro del bloque."""
    token = _source_var.set(name)
    try:
        yield
    finally:
        _source_var.reset(token)


def _audit_path():
    return config.DATA_DIR / "mcp_audit.jsonl"


def extract_meta(tool: str, params: dict | None) -> dict:
    """Copia identificadores y ajustes seguros. Omite textos largos."""
    meta: dict = {}
    for key, raw in (params or {}).items():
        if key not in _SAFE_META_KEYS or raw is None or raw == "":
            continue
        if isinstance(raw, bool):
            meta[key] = raw
        elif isinstance(raw, int) and not isinstance(raw, bool):
            meta[key] = raw
        elif isinstance(raw, float):
            meta[key] = round(raw, 4)
        elif isinstance(raw, str):
            meta[key] = raw[:_META_STR_MAX]
    if tool in _WHISPER_TOOLS:
        from .. import transcribe_settings
        given = meta.get("model")
        resolved = transcribe_settings.resolve(given if isinstance(given, str) else None)
        if not given:
            meta["model_source"] = "ajustes"
        meta["model"] = resolved
    return meta


def begin(tool: str, access: str, *, project_id: str | None = None, meta: dict | None = None) -> str:
    """Marca una tool en curso (solo memoria). Devuelve un token para ``finish``."""
    token = uuid.uuid4().hex[:12]
    entry = {
        "token": token,
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "tool": tool,
        "access": access,
        "project_id": project_id,
        "status": "run",
        "meta": dict(meta or {}),
    }
    src = _source_var.get()
    if src:
        entry["source"] = src
    with _lock:
        _live[token] = entry
    return token


def finish(
    token: str,
    *,
    status: str = "ok",
    ms: float | None = None,
    error: str | None = None,
    param_keys=None,
    extra_meta: dict | None = None,
) -> dict:
    """Cierra la tool en curso y escribe la entrada persistente."""
    with _lock:
        live = _live.pop(token, None)
    tool = (live or {}).get("tool") or "unknown"
    access = (live or {}).get("access") or "read"
    pid = (live or {}).get("project_id")
    meta = {**((live or {}).get("meta") or {}), **(extra_meta or {})}
    return log(
        tool, access,
        project_id=pid,
        param_keys=param_keys,
        status=status,
        ms=ms,
        error=error,
        meta=meta or None,
    )


def track_job(
    job_id: str,
    tool: str,
    access: str,
    *,
    project_id: str | None = None,
    meta: dict | None = None,
    source_name: str | None = None,
) -> None:
    """Sigue un job lanzado por una tool hasta que termina."""
    if not job_id:
        return
    entry = {
        "job_id": job_id,
        "tool": tool,
        "access": access,
        "project_id": project_id,
        "status": "run",
        "meta": dict(meta or {}),
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
    }
    src = source_name or _source_var.get()
    if src:
        entry["source"] = src
    with _lock:
        _jobs_tracked[job_id] = entry


def _job_status(job) -> str:
    st = getattr(job, "status", None)
    return st.value if hasattr(st, "value") else str(st or "")


def _matches_project(entry: dict, project_id: str | None) -> bool:
    if not project_id:
        return True
    return entry.get("project_id") in (None, "", project_id)


def active(project_id: str | None = None) -> list[dict]:
    """Tools y jobs aún en curso (para el loading del editor)."""
    from .. import jobs as jobs_mod

    out: list[dict] = []
    tracked_ids: set[str] = set()
    dead: list[str] = []

    with _lock:
        tracked = dict(_jobs_tracked)
        live = list(_live.values())

    for jid, entry in tracked.items():
        if not _matches_project(entry, project_id):
            continue
        job = jobs_mod.get_job(jid)
        if job is None or _job_status(job) in _JOB_DONE:
            dead.append(jid)
            continue
        tracked_ids.add(jid)
        item = {
            **entry,
            "status": _job_status(job) or "run",
            "progress": getattr(job, "progress", 0) or 0,
            "message": getattr(job, "message", None),
        }
        out.append(item)

    if dead:
        with _lock:
            for jid in dead:
                _jobs_tracked.pop(jid, None)

    for entry in live:
        if not _matches_project(entry, project_id):
            continue
        jid = (entry.get("meta") or {}).get("job_id")
        if jid and jid in tracked_ids:
            continue
        if entry.get("tool") in ("wait_for_job", "get_job") and jid in tracked_ids:
            continue
        out.append({**entry, "progress": None, "message": None})
    return out


def reset_runtime() -> None:
    """Vacía el estado en memoria (tests)."""
    with _lock:
        _live.clear()
        _jobs_tracked.clear()


def log(
    tool: str,
    access: str,
    *,
    project_id: str | None = None,
    param_keys=None,
    status: str = "ok",
    ms: float | None = None,
    error: str | None = None,
    meta: dict | None = None,
) -> dict:
    """Añade una entrada al log de auditoría y la devuelve."""
    entry: dict = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "tool": tool,
        "access": access,
        "project_id": project_id,
        "param_keys": sorted(param_keys or []),
        "status": status,
    }
    if ms is not None:
        entry["ms"] = round(ms, 1)
    if error:
        entry["error"] = str(error)[:300]
    if meta:
        entry["meta"] = meta
    src = _source_var.get()
    if src:
        entry["source"] = src

    path = _audit_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def read_all() -> list[dict]:
    """Lee todas las entradas (para inspección/tests). Vacío si no existe."""
    path = _audit_path()
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def read_recent(limit: int = 80, project_id: str | None = None) -> list[dict]:
    """Últimas entradas, opcionalmente de un proyecto (incluye las sin project_id)."""
    try:
        n = int(limit)
    except (TypeError, ValueError):
        n = 80
    n = max(1, min(n, 200))
    rows = read_all()
    if project_id:
        rows = [e for e in rows if e.get("project_id") in (None, "", project_id)]
    return rows[-n:]
