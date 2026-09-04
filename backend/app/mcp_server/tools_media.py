"""Tools de MEDIA / YouTube (Etapa 5).

Envuelven los servicios existentes: análisis del heatmap (síncrono), generación
de clips (job en segundo plano) y borrado de material. Los jobs se orquestan con
el patrón ``job_id`` → ``wait_for_job`` ya disponible.
"""
from __future__ import annotations

from .. import heatmap, jobs, projects, storage
from ..schemas import ClipRequest, CropMode, Segment
from . import dto
from .registry import tool

_MEDIA_KIND = {"clips": "video", "audios": "audio", "images": "image"}


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def _video_title(url: str) -> str:
    try:
        return heatmap._extract_info(url).get("title", "") or ""
    except Exception:  # noqa: BLE001 - el título es cosmético (nombre de archivo)
        return ""


def _segment(s: dict) -> Segment:
    d = dict(s)
    start = float(d.get("start", 0.0))
    end = float(d.get("end", 0.0))
    d["start"] = start
    d["end"] = end
    d.setdefault("duration", round(end - start, 3))
    d.setdefault("score", 0.0)
    d.setdefault("index", 0)
    return Segment(**d)


def analyze_youtube(url: str, min_score: float = 0.40, max_clips: int = 10,
                    max_duration: int = 60, padding: int = 10) -> dict:
    """Analiza el heatmap de un vídeo de YouTube y devuelve los tramos más vistos (segments). Síncrono."""
    resp = heatmap.analyze(url=url, min_score=min_score, max_clips=max_clips,
                           max_duration=max_duration, padding=padding)
    return dto.analyze_dto(resp)


def create_clips_from_segments(project_id: str, url: str, segments: list,
                               crop_mode: str = "center") -> dict:
    """Job que recorta los segments a clips del proyecto. crop_mode: center|smart_face|split_left|split_right."""
    _project_or_raise(project_id)
    if not segments:
        raise ValueError("No hay segments que recortar.")
    try:
        mode = CropMode(crop_mode)
    except ValueError:
        raise ValueError(f"crop_mode inválido: {crop_mode} (usa {[m.value for m in CropMode]})")
    segs = [_segment(s) for s in segments]
    req = ClipRequest(url=url, project_id=project_id, segments=segs, crop_mode=mode)
    job = jobs.create_job()
    jobs.start_job(job, req, _video_title(url))
    return dto.job_dto(job)


def delete_media(project_id: str, kind: str, ident: str) -> dict:
    """Elimina material Y su archivo (NO deshacible). kind clips|audios|images; ident index/id."""
    if kind not in _MEDIA_KIND:
        raise ValueError(f"kind inválido: {kind} (usa clips|audios|images)")
    proj = _project_or_raise(project_id)
    removed = projects.remove_material(project_id, kind, ident)
    if removed is None:
        raise ValueError(f"Material no encontrado: {kind}/{ident}")
    file_deleted = False
    path = storage.resolve_media(proj, _MEDIA_KIND[kind], removed.get("filename", ""))
    if path and path.exists():
        try:
            path.unlink()
            file_deleted = True
        except Exception:  # noqa: BLE001 - el material ya salió del proyecto; el archivo es secundario
            pass
    return {"ok": True, "deleted": ident, "kind": kind, "file_deleted": file_deleted}


def fetch_image(project_id: str, url: str, label: str | None = None) -> dict:
    """Descarga una imagen desde una URL y la añade al proyecto (devuelve id para add_to_timeline)."""
    from .. import images
    proj = _project_or_raise(project_id)
    if not (url or "").strip():
        raise ValueError("Falta la URL de la imagen.")
    name, data = images.fetch_image(url)
    info = images.import_image(proj, name, data, label=label)
    return {"ok": True, "image": {"id": info.id, "filename": info.filename,
                                  "label": info.label, "width": info.width,
                                  "height": info.height, "url": info.url}}


def register(mcp) -> None:
    tool(mcp, access="read")(analyze_youtube)
    tool(mcp, access="write")(create_clips_from_segments)
    tool(mcp, access="write")(fetch_image)
    tool(mcp, access="destructive")(delete_media)
