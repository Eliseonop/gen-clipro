"""Auditoría de las acciones de la IA.

Log append-only en JSONL (``data/mcp_audit.jsonl``). Registra QUÉ tool se llamó,
su nivel de acceso, sobre qué proyecto y con qué *claves* de parámetros — nunca
los valores (una transcripción o un texto no deben acabar en el log).

La ruta se calcula desde ``config.DATA_DIR`` en cada llamada para que los tests
puedan aislarla (patch de ``config.DATA_DIR`` a un tmpdir).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from .. import config


def _audit_path():
    return config.DATA_DIR / "mcp_audit.jsonl"


def log(
    tool: str,
    access: str,
    *,
    project_id: str | None = None,
    param_keys=None,
    status: str = "ok",
    ms: float | None = None,
    error: str | None = None,
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
