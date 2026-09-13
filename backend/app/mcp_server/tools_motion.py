"""Tools de MOTION STUDIO: la IA trabaja a nivel de COMPOSICIÓN (spec §17).

La IA no devuelve HTML suelto: produce una ``MotionComposition`` estructurada
(layers + estilos + timing + animaciones) que se valida antes de aceptarse. El
preview es inmediato en el navegador (no requiere render). ``motion_add_to_timeline``
renderiza (HyperFrames/Playwright) e inserta el clip en la timeline.
"""
from __future__ import annotations

import base64
import io

from .. import frame_grab, jobs, projects, storage
from ..motion import segment_context
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


def _project_format(proj) -> dict:
    tl = getattr(proj, "timeline", None)
    return {"width": int(getattr(tl, "width", 720) or 720),
            "height": int(getattr(tl, "height", 1280) or 1280),
            "fps": int(getattr(tl, "fps", 30) or 30)}


def _apply_for_range(proj, comp: MotionComposition, for_range: dict) -> MotionComposition:
    """Fuerza duración = fin − inicio y el formato del proyecto, y marca la
    composición como BORRADOR de 'Generar Motion' (metadata). Devuelve una copia."""
    import time
    try:
        s = float(for_range["start"]); e = float(for_range["end"])
    except (KeyError, TypeError, ValueError) as exc:
        raise MCPError("invalid_parameter", f"for_range inválido: {exc}", retryable=True)
    fmt = _project_format(proj)
    meta = dict(comp.metadata or {})
    meta.update({"source": "generate_motion", "range": [round(s, 3), round(e, 3)],
                 "draft": True, "title": comp.name})
    meta.setdefault("created_at", time.time())
    return comp.model_copy(update={
        "duration": round(max(0.1, e - s), 3),
        "width": fmt["width"], "height": fmt["height"], "fps": fmt["fps"],
        "metadata": meta,
    })


def motion_list_templates() -> dict:
    """Lista los templates de motion graphics (subscribe, lower-third, title…) con sus parámetros editables."""
    return {"templates": motion_templates.list_templates()}


def motion_create_composition(project_id: str, composition: dict | None = None,
                              template: str | None = None, params: dict | None = None,
                              for_range: dict | None = None) -> dict:
    """Crea un motion graphic EDITABLE. Pasa ``composition`` (JSON con layers/estilos/
    animaciones: type=text; entrada/salida fade|slide|scale|zoom|rotate) o un ``template``
    + ``params``. El preview es inmediato; no genera vídeo aún. Devuelve composition_id.

    ``for_range={start, end}`` (segundos de la timeline): fuerza la duración exacta
    del tramo y el formato del proyecto, y marca la composición como BORRADOR de
    'Generar Motion' (se inserta luego con motion_add_to_timeline)."""
    proj = _project_or_raise(project_id)
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
    if for_range:
        comp = _apply_for_range(proj, comp, for_range)
    _raise_if_invalid(comp)
    motion_service.save_composition(project_id, comp, bump=False)
    return _summary(comp)


def motion_update_composition(project_id: str, composition_id: str, composition: dict,
                              for_range: dict | None = None) -> dict:
    """Reemplaza una composición existente (misma id). Úsalo cuando el usuario pida
    cambios ('más grande', 'que entre desde la izquierda', 'color blanco'): edita el
    JSON y guárdalo. Cada cambio actualiza el preview. ``for_range`` (como en
    motion_create_composition) reafirma duración/formato del tramo y el borrador."""
    proj = _project_or_raise(project_id)
    prev = motion_service.get_composition(project_id, composition_id)
    if prev is None:
        raise MCPError("resource_not_found", f"Composición no encontrada: {composition_id}")
    try:
        raw = dict(composition)
        raw["id"] = composition_id
        comp = MotionComposition(**raw)
    except (ValueError, TypeError) as exc:
        raise MCPError("invalid_parameter", f"Composición mal formada: {exc}", retryable=True)
    if for_range:
        # Conserva metadata previa del borrador (p.ej. created_at) al reafirmar.
        comp = comp.model_copy(update={"metadata": {**(prev.metadata or {}), **(comp.metadata or {})}})
        comp = _apply_for_range(proj, comp, for_range)
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
                           track_id: str | None = None, start: float = 0.0,
                           end: float | None = None, mode: str = "add",
                           replace_clip_ids: list[str] | None = None) -> dict:
    """Renderiza el motion graphic (con alfa) y lo inserta en la timeline como clip
    'motion' editable. Sin ``track_id`` usa (o crea) una pista 'Motion' arriba del
    todo. ``mode='replace'`` borra antes ``replace_clip_ids``. Devuelve un job con
    progreso; al terminar, ``motion_add`` trae el clip insertado."""
    _project_or_raise(project_id)
    if motion_service.get_composition(project_id, composition_id) is None:
        raise MCPError("resource_not_found", f"Composición no encontrada: {composition_id}")
    if mode not in ("add", "replace"):
        raise MCPError("invalid_parameter", "mode debe ser 'add' o 'replace'.", retryable=True)
    job = jobs.create_job()
    jobs.start_motion_add_job(job, project_id, composition_id, track_id, float(start or 0.0),
                              end=end, mode=mode, replace_clip_ids=replace_clip_ids)
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


def _material_video_file(proj, mat):
    scope = getattr(mat, "asset_scope", None) or "project"
    return (storage.resolve_library_media("video", mat.filename) if scope == "library"
            else storage.resolve_media(proj, "video", mat.filename))


def motion_segment_frames(project_id: str, start: float | None = None, end: float | None = None,
                          n: int = 3) -> dict:
    """Devuelve un montage (imagen) de N fotogramas repartidos por un tramo de la timeline para VER qué se muestra.

    Sale de la FUENTE del vídeo superior en cada instante: NO incluye textos ni
    overlays. Sin tiempos usa el rango marcado en el editor (teclas I/O). Útil
    antes de proponer un motion, para saber qué hay en pantalla."""
    proj = _project_or_raise(project_id)
    if start is None and end is None:
        focus = segment_context.get_focus(project_id)
        if not focus:
            raise MCPError("invalid_parameter",
                           "Indica start/end (s) o marca un rango en el editor (teclas I/O).",
                           retryable=True)
        start, end = focus["start"], focus["end"]
    s, e = segment_context.resolve_range(start, end, None)
    if not frame_grab.ffmpeg_available():
        raise MCPError("internal_error", "ffmpeg no está disponible para extraer fotogramas.")

    n = max(1, min(int(n or 3), 6))
    pts = [round(s + (e - s) * (i + 0.5) / n, 3) for i in range(n)]
    frames: list[bytes] = []
    covered: list[float] = []
    for t in pts:
        hit = segment_context.top_video_source_at(proj, t)
        if hit is None:
            continue
        mat, src_t = hit
        path = _material_video_file(proj, mat)
        if path is None or not path.exists():
            continue
        try:
            frames.append(frame_grab.extract_frame(path, src_t))
            covered.append(t)
        except ValueError:
            continue

    if not frames:
        return {"times": pts, "frames": 0,
                "note": "No hay vídeo (con archivo disponible) en pantalla en este tramo; "
                        "propón a partir del guion y los elementos del contexto."}
    data = frame_grab.montage_jpeg(frames)
    return {
        "times": covered, "frames": len(frames), "mime": "image/jpeg",
        # El agente detecta image_b64 y adjunta la imagen al modelo multimodal.
        "image_b64": base64.b64encode(data).decode("ascii"),
        "note": f"montage de {len(frames)} fotograma(s) de la FUENTE (sin overlays) en "
                f"t={[round(t, 2) for t in covered]}s de la timeline (imagen adjunta).",
    }


def motion_segment_context(project_id: str, start: float | None = None, end: float | None = None,
                           playhead: float | None = None, clip_id: str | None = None) -> dict:
    """Contexto compacto de UN tramo (guion, clips, assets, estilo) para diseñar un motion; sin tiempos usa el rango marcado en el editor."""
    proj = _project_or_raise(project_id)
    if start is None and end is None and playhead is None:
        focus = segment_context.get_focus(project_id)
        if not focus:
            raise MCPError("invalid_parameter",
                           "Indica start/end (s) o marca un rango en el editor (teclas I/O).",
                           retryable=True)
        start, end, playhead = focus["start"], focus["end"], focus["playhead"]
        clip_id = clip_id or focus["clip_id"]
    return segment_context.build_segment_context(proj, start, end, playhead, clip_id)


def register(mcp) -> None:
    tool(mcp, access="read")(motion_segment_context)
    tool(mcp, access="read")(motion_segment_frames)
    tool(mcp, access="read")(motion_list_templates)
    tool(mcp, access="read")(motion_get_composition)
    tool(mcp, access="read")(motion_get_frame)
    tool(mcp, access="write")(motion_create_composition)
    tool(mcp, access="write")(motion_update_composition)
    tool(mcp, access="write")(motion_add_to_timeline)
