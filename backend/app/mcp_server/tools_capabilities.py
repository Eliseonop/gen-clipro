"""Tools de DESCUBRIMIENTO (Fase 2): capacidades + entrada-por-proyecto.

``describe_capabilities`` deja que la IA descubra qué puede hacer el editor y con
qué valores, sin leer el código ni cargar todos los schemas. ``list_projects`` /
``resolve_project`` permiten entrar por el PROYECTO (por id o por nombre) sin que
el usuario tenga que conocer el ``project_id`` — ver §L del rediseño.
"""
from __future__ import annotations

from .. import projects
from . import capabilities
from .registry import tool


def describe_capabilities(domain: str | None = None) -> dict:
    """Descubre capacidades: sin domain, dominios+verbos+defaults; con domain, valores válidos y guía."""
    if domain:
        return capabilities.describe(domain)
    return capabilities.overview()


def list_projects() -> dict:
    """Lista los proyectos del editor (id, nombre, formato, duración) para elegir/desambiguar."""
    projs = projects.list_projects()
    return {"count": len(projs), "projects": [capabilities.project_summary(p) for p in projs]}


def _dedup(items):
    seen: set[str] = set()
    out = []
    for p in items:
        if p.id not in seen:
            seen.add(p.id)
            out.append(p)
    return out


def resolve_project(query: str) -> dict:
    """Resuelve un proyecto por id/prefijo o por nombre. Devuelve {project_id} o {candidates:[…]} si es ambiguo."""
    q = (query or "").strip()
    if not q:
        raise ValueError("Falta 'query' (id o nombre del proyecto).")
    ql = q.lower()
    projs = projects.list_projects()

    # 1) id exacto.
    for p in projs:
        if p.id == q:
            return {"project_id": p.id, "name": p.name, "match": "id"}

    # 2) nombre exacto → 3) prefijo de id → 4) nombre contiene.
    groups = (
        ("name", [p for p in projs if (p.name or "").strip().lower() == ql]),
        ("id_prefix", [p for p in projs if p.id.lower().startswith(ql)]),
        ("name", [p for p in projs if ql in (p.name or "").lower()]),
    )
    for label, group in groups:
        uniq = _dedup(group)
        if len(uniq) == 1:
            p = uniq[0]
            return {"project_id": p.id, "name": p.name, "match": label}
        if len(uniq) > 1:
            return {
                "ambiguous": True,
                "candidates": [capabilities.project_summary(p) for p in uniq[:10]],
                "note": "Varios proyectos coinciden; elige un project_id concreto.",
            }
    raise ValueError(f"Ningún proyecto coincide con: {query}")


def register(mcp) -> None:
    tool(mcp, access="read")(describe_capabilities)
    tool(mcp, access="read")(list_projects)
    tool(mcp, access="read")(resolve_project)
