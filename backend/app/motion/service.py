"""MotionCompositionService: CRUD de composiciones + render cacheado.

Fuente de verdad: ``Project.motion_compositions`` (persistido por projects.py).
El render se cachea por ``(id, version)``: solo se re-renderiza al cambiar la
composición. El asset resultante (WebM con alfa) vive en
``clips/<project_id>/motion/`` y compose.py lo compone como overlay.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from .. import config, projects
from .generator import generate_html
from .models import MotionComposition
from .renderer.adapter import get_renderer
from .validator import MotionValidationError, validate


def _motion_dir(project_id: str) -> Path:
    d = config.OUTPUT_DIR / project_id / "motion"
    d.mkdir(parents=True, exist_ok=True)
    return d


def new_id() -> str:
    return "mg_" + uuid.uuid4().hex[:8]


def list_compositions(project_id: str) -> list[MotionComposition]:
    proj = projects.get_project(project_id)
    if not proj:
        return []
    return [MotionComposition(**c) for c in (proj.motion_compositions or [])]


def get_composition(project_id: str, comp_id: str) -> MotionComposition | None:
    proj = projects.get_project(project_id)
    if not proj:
        return None
    for c in proj.motion_compositions or []:
        if c.get("id") == comp_id:
            return MotionComposition(**c)
    return None


def save_composition(project_id: str, comp: MotionComposition, *, bump: bool = True) -> MotionComposition:
    """Valida y persiste. ``bump`` incrementa version (invalida el render cacheado)."""
    errors = validate(comp)
    if errors:
        raise MotionValidationError(errors)
    prev = get_composition(project_id, comp.id)
    if bump and prev is not None:
        comp = comp.model_copy(update={"version": (prev.version or 1) + 1})
    if projects.save_motion_composition(project_id, comp.model_dump()) is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return comp


def delete_composition(project_id: str, comp_id: str) -> bool:
    return projects.delete_motion_composition(project_id, comp_id)


def preview_html(project_id: str, comp_id: str) -> str | None:
    comp = get_composition(project_id, comp_id)
    return generate_html(comp) if comp else None


def asset_path(project_id: str, comp: MotionComposition) -> Path:
    return _motion_dir(project_id) / f"{comp.id}_v{comp.version}.webm"


def preview_frames(project_id: str, comp_id: str, times: list[float]) -> tuple[MotionComposition, list[bytes]]:
    """Captura PNG (con alfa) de la composición en ``times`` sin render completo.

    Reutiliza el motor de render (HyperFrames) → paridad con el vídeo final.
    Devuelve (composición, lista de PNG en bytes). Pensado para verificación visual.
    """
    comp = get_composition(project_id, comp_id)
    if comp is None:
        raise ValueError(f"Composición no encontrada: {comp_id}")
    errors = validate(comp)
    if errors:
        raise MotionValidationError(errors)
    frames = get_renderer().capture_frames_at(comp, times)
    return comp, frames


def render_composition(project_id: str, comp_id: str, on_progress=None) -> Path:
    """Renderiza (o reutiliza el caché) el WebM con alfa de la composición."""
    on_progress = on_progress or (lambda p, m: None)
    comp = get_composition(project_id, comp_id)
    if comp is None:
        raise ValueError(f"Composición no encontrada: {comp_id}")
    errors = validate(comp)
    if errors:
        raise MotionValidationError(errors)
    out = asset_path(project_id, comp)
    if out.exists():
        on_progress(1.0, "Motion graphic (caché) listo.")
        return out
    # Limpia versiones antiguas del mismo comp.
    for old in out.parent.glob(f"{comp.id}_v*.webm"):
        if old != out:
            try:
                old.unlink()
            except OSError:
                pass
    renderer = get_renderer()
    return renderer.render(comp, out, on_progress).path
