"""Tools de MOTION STUDIO: la IA trabaja a nivel de COMPOSICIÓN (spec §17).

La IA no devuelve HTML suelto: produce una ``MotionComposition`` estructurada
(layers + estilos + timing + animaciones) que se valida antes de aceptarse. El
preview es inmediato en el navegador (no requiere render). ``motion_add_to_timeline``
renderiza (HyperFrames/Playwright) e inserta el clip en la timeline.
"""
from __future__ import annotations

import base64
import io

from .. import jobs, projects
from ..motion import service as motion_service
from ..motion import templates as motion_templates
from ..motion.models import MotionComposition
from ..motion.validator import MotionValidationError, validate
from .registry import MCPError, tool

# Verificación por imagen: lado máximo del montage devuelto al agente.
_FRAME_MAX_PX = 1024


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise MCPError("resource_not_found", f"Proyecto no encontrado: {project_id}")
    return proj


def _summary(comp: MotionComposition) -> dict:
    return {
        "ok": True,
        "composition_id": comp.id,
        "name": comp.name,
        "width": comp.width, "height": comp.height,
        "fps": comp.fps, "duration": comp.duration,
        "version": comp.version,
        "layers": [{"id": l.id, "type": l.type,
                    "content": (l.content[:40] if l.type == "text" else l.content)}
                   for l in comp.layers],
        "preview_url": f"/api/projects/{{project_id}}/motion/{comp.id}/preview.html",
    }


def _raise_if_invalid(comp: MotionComposition) -> None:
    errs = validate(comp)
    if errs:
        raise MCPError("invalid_parameter",
                       "Composición inválida: " + "; ".join(errs),
                       retryable=True, hint="Corrige y reintenta.")


def motion_list_templates() -> dict:
    """Lista los templates de motion graphics (subscribe, lower-third, title…) con sus parámetros editables."""
    return {"templates": motion_templates.list_templates()}


def motion_create_composition(project_id: str, composition: dict | None = None,
                              template: str | None = None, params: dict | None = None) -> dict:
    """Crea un motion graphic EDITABLE. Pasa ``composition`` (JSON con layers/estilos/
    animaciones: type=text; entrada/salida fade|slide|scale|zoom|rotate) o un ``template``
    + ``params``. El preview es inmediato; no genera vídeo aún. Devuelve composition_id."""
    _project_or_raise(project_id)
    cid = motion_service.new_id()
    try:
        if template:
            comp = motion_templates.instantiate(template, cid, params or {})
        elif composition:
            raw = dict(composition)
            raw["id"] = cid
            comp = MotionComposition(**raw)
        else:
            raise MCPError("invalid_parameter", "Pasa 'composition' o 'template'.", retryable=True)
    except KeyError as exc:
        raise MCPError("invalid_parameter", f"Template desconocido: {exc}", retryable=True)
    except (ValueError, TypeError) as exc:
        raise MCPError("invalid_parameter", f"Composición mal formada: {exc}", retryable=True)
    _raise_if_invalid(comp)
    motion_service.save_composition(project_id, comp, bump=False)
    return _summary(comp)


def motion_update_composition(project_id: str, composition_id: str, composition: dict) -> dict:
    """Reemplaza una composición existente (misma id). Úsalo cuando el usuario pida
    cambios ('más grande', 'que entre desde la izquierda', 'color blanco'): edita el
    JSON y guárdalo. Cada cambio actualiza el preview."""
    _project_or_raise(project_id)
    if motion_service.get_composition(project_id, composition_id) is None:
        raise MCPError("resource_not_found", f"Composición no encontrada: {composition_id}")
    try:
        raw = dict(composition)
        raw["id"] = composition_id
        comp = MotionComposition(**raw)
    except (ValueError, TypeError) as exc:
        raise MCPError("invalid_parameter", f"Composición mal formada: {exc}", retryable=True)
    _raise_if_invalid(comp)
    saved = motion_service.save_composition(project_id, comp, bump=True)
    return _summary(saved)


def motion_get_composition(project_id: str, composition_id: str) -> dict:
    """Devuelve el JSON completo de una composición (para editarla)."""
    comp = motion_service.get_composition(project_id, composition_id)
    if comp is None:
        raise MCPError("resource_not_found", f"Composición no encontrada: {composition_id}")
    return comp.model_dump()


def motion_add_to_timeline(project_id: str, composition_id: str,
                           track_id: str | None = None, start: float = 0.0) -> dict:
    """Renderiza el motion graphic (con alfa) y lo inserta en la timeline como clip
    'motion' editable (pista de vídeo). Devuelve un job con progreso."""
    _project_or_raise(project_id)
    if motion_service.get_composition(project_id, composition_id) is None:
        raise MCPError("resource_not_found", f"Composición no encontrada: {composition_id}")
    job = jobs.create_job()
    jobs.start_motion_add_job(job, project_id, composition_id, track_id, float(start or 0.0))
    return job.model_dump()


def _default_times(duration: float, n: int = 4) -> list[float]:
    """Instantes repartidos por la composición para verla de un vistazo."""
    d = max(0.1, float(duration or 0))
    n = max(1, min(int(n or 4), 8))
    if n == 1:
        return [d / 2]
    return [round(min(d, max(0.0, d * i / (n - 1) - (0.05 if i == n - 1 else 0))), 3)
            for i in range(n)]


def _montage(comp: MotionComposition, frames: list[bytes]) -> bytes:
    """Compone los PNG (aplanados sobre el fondo) en una rejilla y escala a _FRAME_MAX_PX."""
    from PIL import Image  # dependencia ya usada por el proyecto

    bg = comp.background if (comp.background and comp.background != "transparent") else "#12151c"
    tiles = []
    for raw in frames:
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        flat = Image.new("RGBA", im.size, bg)
        flat.alpha_composite(im)
        tiles.append(flat.convert("RGB"))
    if not tiles:
        raise MCPError("internal_error", "No se capturó ningún fotograma.")

    cols = 1 if len(tiles) == 1 else (2 if len(tiles) <= 4 else 3)
    rows = (len(tiles) + cols - 1) // cols
    tw, th = tiles[0].size
    gap = max(4, tw // 120)
    sheet = Image.new("RGB", (cols * tw + (cols - 1) * gap, rows * th + (rows - 1) * gap), bg)
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet.paste(t, (c * (tw + gap), r * (th + gap)))

    w, h = sheet.size
    scale = min(1.0, _FRAME_MAX_PX / max(w, h))
    if scale < 1.0:
        sheet = sheet.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    sheet.save(buf, format="JPEG", quality=82)
    return buf.getvalue()


def motion_get_frame(project_id: str, composition_id: str,
                     at_time: float | None = None, times: list[float] | None = None,
                     n: int | None = None) -> dict:
    """Devuelve una IMAGEN de la composición para que la VEAS y verifiques sin render completo.

    Pasa ``at_time`` (un instante), ``times`` (varios → montage) o ``n`` (nº de
    instantes repartidos por la duración; por defecto 4). Rápido (1 frame ≈ 1-2 s)."""
    _project_or_raise(project_id)
    comp = motion_service.get_composition(project_id, composition_id)
    if comp is None:
        raise MCPError("resource_not_found", f"Composición no encontrada: {composition_id}")

    if times:
        pts = [float(t) for t in times]
    elif at_time is not None:
        pts = [float(at_time)]
    else:
        pts = _default_times(comp.duration, n or 4)

    try:
        _comp, frames = motion_service.preview_frames(project_id, composition_id, pts)
    except MotionValidationError as exc:
        raise MCPError("invalid_parameter", f"Composición inválida: {exc}", retryable=True)
    except RuntimeError as exc:  # motor no disponible (Playwright/Chromium)
        raise MCPError("internal_error", str(exc), hint=motion_service.get_renderer().available()[1])

    data = _montage(comp, frames)
    return {
        "composition_id": comp.id,
        "times": [round(t, 3) for t in pts],
        "width": comp.width, "height": comp.height, "duration": comp.duration,
        "mime": "image/jpeg",
        # El agente detecta image_b64 y adjunta la imagen al modelo multimodal.
        "image_b64": base64.b64encode(data).decode("ascii"),
        "note": f"montage de {len(frames)} fotograma(s) en t={[round(t,2) for t in pts]}s (imagen adjunta para que la veas)",
    }


def register(mcp) -> None:
    tool(mcp, access="read")(motion_list_templates)
    tool(mcp, access="read")(motion_get_composition)
    tool(mcp, access="read")(motion_get_frame)
    tool(mcp, access="write")(motion_create_composition)
    tool(mcp, access="write")(motion_update_composition)
    tool(mcp, access="write")(motion_add_to_timeline)
