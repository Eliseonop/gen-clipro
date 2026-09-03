"""Workflows de alto nivel: crear un short de punta a punta.

Componen los servicios ya existentes (heatmap, clipper, transcripción, timeline y
compose) en un pipeline con progreso por etapas. Se ejecutan como JOB (ver
``jobs._run_short_*``); aquí vive la orquestación pura, guiada por un
``on_progress`` que se puede escalar por etapa.

Pipeline YouTube → short:
  analyze → generar clip vertical (crop_mode) → timeline 9:16 → transcripción →
  subtítulos → export.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import quote

from . import compose, heatmap, projects, storage, timeline_store, transcribe, transcribe_settings
from .schemas import CropMode, Timeline

ProgressCb = Callable[[float, str], None]


def _stage(on_progress: ProgressCb, lo: float, hi: float, message: str) -> ProgressCb:
    """Sub-callback que mapea [0,1] de una etapa a la banda [lo, hi] global."""
    def cb(frac: float, msg: str | None = None) -> None:
        on_progress(lo + (hi - lo) * max(0.0, min(1.0, frac)), msg or message)
    return cb


def _clip_dict(ci, track_id: str) -> dict:
    dur = round((ci.end or 0.0) - (ci.start or 0.0), 3)
    return {
        "track_id": track_id, "kind": "video", "asset_kind": "clips",
        "asset_id": str(ci.index), "filename": ci.filename,
        "name": ci.label or ci.filename, "start": 0.0,
        "in_point": 0.0, "out_point": dur, "source_duration": dur,
    }


def _add_clip_to_timeline(pid: str, ci) -> str:
    """Crea/pilla una pista de vídeo y añade el clip. Devuelve el clip_id."""
    proj = projects.get_project(pid)
    tl = proj.timeline
    track = next((t for t in (tl.tracks if tl else []) if t.kind == "video"), None)
    if track is None:
        tr = timeline_store.apply_op(pid, "add_track", {"kind": "video"})
        track_id = tr["changed"][0]
    else:
        track_id = track.id
    res = timeline_store.apply_op(pid, "add_clip", {"clip": _clip_dict(ci, track_id)})
    return res["changed"][-1]


def _export(pid: str, on_progress: ProgressCb) -> str:
    """Renderiza la timeline actual del proyecto y devuelve la export_url."""
    project = projects.get_project(pid)
    timeline = project.timeline
    if timeline is None or not timeline.clips:
        raise RuntimeError("La timeline quedó vacía; no hay nada que exportar.")
    base = storage.ensure_dirs(storage.project_base(project))
    exports = base / "exports"
    exports.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"short_{stamp}.mp4"
    compose.render(project, timeline, exports / filename, on_progress)
    return f"/api/projects/{pid}/exports/{quote(filename)}"


def _subtitle_clip(pid: str, clip_id: str, clip_filename: str, model: str,
                   language: str | None, on_progress: ProgressCb) -> int:
    """Transcribe el archivo del clip y coloca los subtítulos. Devuelve nº de líneas."""
    project = projects.get_project(pid)
    path = storage.resolve_media(project, "video", clip_filename)
    if path is None or not path.exists():
        raise RuntimeError("No se encuentra el archivo del clip para transcribir.")
    result = transcribe.run_file(str(path), transcribe_settings.resolve(model), language, on_progress)
    segments = result.get("segments", [])
    timeline_store.apply_op(pid, "add_subtitles",
                            {"source_clip_id": clip_id, "segments": segments})
    return len(segments)


def build_short_from_youtube(
    pid: str, url: str, *, crop_mode: str = "smart_face", count: int = 1,
    model: str = "base", language: str | None = None, subtitles: bool = True,
    export: bool = True, min_score: float = 0.40, max_duration: int = 60,
    padding: int = 10, on_progress: ProgressCb,
) -> dict:
    """Pipeline completo YouTube → short. Devuelve un resumen del resultado."""
    try:
        mode = CropMode(crop_mode)
    except ValueError:
        raise ValueError(f"crop_mode inválido: {crop_mode}")

    # 1) Analizar el heatmap y elegir los mejores tramos.
    on_progress(0.02, "Analizando el vídeo…")
    resp = heatmap.analyze(url=url, min_score=min_score, max_clips=max(count, 1),
                           max_duration=max_duration, padding=padding)
    segments = sorted(resp.segments, key=lambda s: s.score, reverse=True)[:max(count, 1)]
    if not segments:
        raise RuntimeError("El vídeo no tiene heatmap o no dio tramos destacados.")

    # 2) Generar los clips verticales (crop_mode) y persistirlos.
    from . import clipper
    project = projects.get_project(pid)
    if project is None:
        raise RuntimeError("Proyecto no encontrado.")
    base = storage.ensure_dirs(storage.project_base(project))
    title = ""
    try:
        title = heatmap._extract_info(url).get("title", "") or ""
    except Exception:  # noqa: BLE001
        pass
    clips = clipper.generate_clips(
        url=url, segments=segments, mode=mode, title=title, project_id=pid,
        video_dir=base / "video",
        on_progress=_stage(on_progress, 0.10, 0.55, "Recortando el clip…"),
    )
    projects.add_clips(pid, clips)
    if not clips:
        raise RuntimeError("No se generó ningún clip.")

    # 3) Montar la timeline 9:16 con el/los clip(s).
    on_progress(0.58, "Montando la timeline 9:16…")
    timeline_store.apply_op(pid, "set_project_format", {"aspect": "9:16"})
    clip_ids = [_add_clip_to_timeline(pid, ci) for ci in clips]

    # 4) Subtítulos (transcribe el primer clip).
    lines = 0
    if subtitles:
        lines = _subtitle_clip(pid, clip_ids[0], clips[0].filename, model, language,
                               _stage(on_progress, 0.62, 0.85, "Transcribiendo…"))

    # 5) Export.
    export_url = None
    if export:
        export_url = _export(pid, _stage(on_progress, 0.88, 0.99, "Exportando…"))

    on_progress(1.0, "Short listo.")
    return {"clips": [c.index for c in clips], "clip_ids": clip_ids,
            "subtitle_lines": lines, "export_url": export_url}


def build_short_from_library(
    pid: str, asset_id: str, *, asset_kind: str = "clips", model: str = "base",
    language: str | None = None, subtitles: bool = True, export: bool = True,
    on_progress: ProgressCb,
) -> dict:
    """Como el anterior pero desde un clip que YA está en el proyecto (sin descargar)."""
    project = projects.get_project(pid)
    if project is None:
        raise RuntimeError("Proyecto no encontrado.")
    if asset_kind != "clips":
        raise ValueError("make_short_from_library solo admite asset_kind='clips' por ahora.")
    ci = next((c for c in project.clips if str(c.index) == str(asset_id)), None)
    if ci is None:
        raise RuntimeError(f"Clip no encontrado en el proyecto: {asset_id}")

    on_progress(0.10, "Montando la timeline 9:16…")
    timeline_store.apply_op(pid, "set_project_format", {"aspect": "9:16"})
    clip_id = _add_clip_to_timeline(pid, ci)

    lines = 0
    if subtitles:
        lines = _subtitle_clip(pid, clip_id, ci.filename, model, language,
                               _stage(on_progress, 0.20, 0.70, "Transcribiendo…"))

    export_url = None
    if export:
        export_url = _export(pid, _stage(on_progress, 0.75, 0.99, "Exportando…"))

    on_progress(1.0, "Short listo.")
    return {"clips": [ci.index], "clip_ids": [clip_id],
            "subtitle_lines": lines, "export_url": export_url}
