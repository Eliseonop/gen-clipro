"""API FastAPI: analiza vídeos, lanza trabajos de recorte y sirve los clips."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, diagnostics, heatmap, jobs, projects, settings, storage, timeline_store, tts
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ClipRequest,
    ComposeClipRequest,
    CreateProjectRequest,
    Job,
    Project,
    ClipTranscribeRequest,
    ExportRequest,
    ReframePrepareRequest,
    SetFolderRequest,
    Timeline,
    TranscribeRequest,
    TTSRequest,
    UpdateMaterialRequest,
)

_MEDIA_KIND = {"clips": "video", "audios": "audio"}


def _video_title(url: str) -> str:
    """Obtiene el título del vídeo (para nombrar archivos). Vacío si falla."""
    try:
        return heatmap._extract_info(url).get("title", "") or ""
    except Exception:
        return ""

diagnostics.configure_logging()
app = FastAPI(title="video-yt", version="0.1.0")


@app.on_event("startup")
def _startup_diagnostics() -> None:
    """Al arrancar, informa de qué motor usará cada parte (GPU/CPU)."""
    try:
        diagnostics.log_report()
    except Exception:  # noqa: BLE001 - un fallo de diagnóstico nunca debe tumbar el arranque
        import logging
        logging.getLogger("videoyt.diag").exception("No se pudo generar el diagnóstico de arranque.")

# El frontend (React/Vite) corre en otro puerto durante el desarrollo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir los clips generados como archivos estáticos.
app.mount("/clips", StaticFiles(directory=str(config.OUTPUT_DIR)), name="clips")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/diagnostics")
def get_diagnostics() -> dict:
    """Estado del hardware/motores (GPU/CPU) para OpenCV y FFmpeg."""
    return diagnostics.probe()


# --- Proyectos -----------------------------------------------------------

@app.get("/api/projects", response_model=list[Project])
def list_projects() -> list[Project]:
    return projects.list_projects()


@app.post("/api/projects", response_model=Project)
def create_project(req: CreateProjectRequest) -> Project:
    return projects.create_project(req.name)


@app.get("/api/projects/{project_id}", response_model=Project)
def get_project(project_id: str) -> Project:
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return proj


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str) -> dict:
    ok = projects.delete_project(project_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return {"deleted": project_id}


@app.post("/api/pick-folder")
def pick_folder() -> dict:
    """Abre un diálogo nativo para elegir carpeta (solo local)."""
    return {"path": storage.pick_folder()}


@app.post("/api/projects/{project_id}/folder", response_model=Project)
def set_folder(project_id: str, req: SetFolderRequest) -> Project:
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    path = (req.path or "").strip()
    if not path:
        raise HTTPException(status_code=400, detail="Ruta vacía.")
    try:
        storage.ensure_dirs(Path(path))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Carpeta no válida: {exc}")
    return projects.set_folder(project_id, str(Path(path)))


@app.patch("/api/projects/{project_id}/materials/{kind}/{ident}")
def update_material(project_id: str, kind: str, ident: str, req: UpdateMaterialRequest) -> dict:
    if kind not in _MEDIA_KIND:
        raise HTTPException(status_code=400, detail="Tipo no válido.")
    item = projects.update_material(project_id, kind, ident, req.model_dump())
    if item is None:
        raise HTTPException(status_code=404, detail="Material no encontrado.")
    return item


@app.delete("/api/projects/{project_id}/materials/{kind}/{ident}")
def delete_material(project_id: str, kind: str, ident: str) -> dict:
    if kind not in _MEDIA_KIND:
        raise HTTPException(status_code=400, detail="Tipo no válido.")
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    removed = projects.remove_material(project_id, kind, ident)
    if removed is None:
        raise HTTPException(status_code=404, detail="Material no encontrado.")
    # Borrar el archivo del disco.
    path = storage.resolve_media(proj, _MEDIA_KIND[kind], removed.get("filename", ""))
    if path and path.exists():
        try:
            path.unlink()
        except Exception:  # noqa: BLE001
            pass
    return {"deleted": ident}


@app.post("/api/projects/{project_id}/materials/clips/{index}/auto-describe")
def auto_describe_clip(project_id: str, index: str) -> dict:
    """Rellena la descripción de un clip con lo que se dice en él (del guion)."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    clip = next((c for c in proj.clips if str(c.index) == str(index)), None)
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip no encontrado.")

    texts: list[str] = []
    for t in proj.transcripts:
        if clip.source_url and t.source_url != clip.source_url:
            continue
        for s in t.segments:
            if s.start < clip.end and s.end > clip.start:   # solapa el rango del clip
                texts.append(s.text)
    desc = " ".join(texts).strip() or None
    item = projects.update_material(project_id, "clips", index, {"description": desc})
    return item or {}


@app.post("/api/projects/{project_id}/clips/{index}/transcribe", response_model=Job)
def transcribe_clip(project_id: str, index: str, req: ClipTranscribeRequest) -> Job:
    """Transcribe SOLO el clip (su propio archivo), guion relativo al fragmento."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not any(str(c.index) == str(index) for c in proj.clips):
        raise HTTPException(status_code=404, detail="Clip no encontrado.")
    job = jobs.create_job()
    jobs.start_clip_transcribe_job(job, project_id, index, req.model, req.language)
    return job


@app.get("/api/projects/{project_id}/manifest")
def manifest(project_id: str) -> dict:
    """JSON con la descripción de todo el material (listo para pasar a una IA)."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    materials = []
    for c in proj.clips:
        materials.append({
            "kind": "clip", "file": c.filename, "label": c.label,
            "description": c.description, "start": c.start, "end": c.end,
            "source_url": c.source_url,
        })
    for a in proj.audios:
        materials.append({
            "kind": "audio", "file": a.filename, "label": a.label,
            "description": a.description or a.text, "voice": a.voice, "duration": a.duration,
        })
    return {"project": {"id": proj.id, "name": proj.name}, "materials": materials}


@app.put("/api/projects/{project_id}/manifest")
def save_manifest(project_id: str, body: dict = Body(...)) -> dict:
    """Guarda un manifest editado a mano de vuelta al proyecto.

    Además escribe ``manifest.json`` en la carpeta del proyecto en disco.
    """
    proj = projects.apply_manifest(project_id, body)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    data = manifest(project_id)
    base = storage.ensure_dirs(storage.project_base(proj))
    (base / "manifest.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {**data, "saved_to": str(base / "manifest.json")}


# --- Editor de vídeo (timeline) ----------------------------------------

@app.get("/api/projects/{project_id}/timeline")
def get_timeline(project_id: str) -> dict:
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return proj.timeline.model_dump() if proj.timeline else {}


@app.put("/api/projects/{project_id}/timeline")
def put_timeline(project_id: str, timeline: Timeline) -> dict:
    proj = projects.save_timeline(project_id, timeline.model_dump())
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return proj.timeline.model_dump() if proj.timeline else {}


# --- Editor estructural (timeline_ops vía adaptador con undo/checkpoints) ---

@app.post("/api/projects/{project_id}/timeline/op")
def timeline_op(project_id: str, body: dict = Body(...)) -> dict:
    """Aplica una operación estructural (add_clip, split_clip, reframe_clip,
    add_subtitles, set_project_format…) de forma transaccional: snapshot →
    aplicar → validar → guardar. Devuelve el timeline nuevo + changed/warnings."""
    op = (body or {}).get("op") or ""
    params = (body or {}).get("params") or {}
    try:
        return timeline_store.apply_op(project_id, op, params)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/timeline/undo")
def timeline_undo(project_id: str) -> dict:
    try:
        return timeline_store.undo(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/timeline/redo")
def timeline_redo(project_id: str) -> dict:
    try:
        return timeline_store.redo(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/timeline/checkpoint")
def timeline_checkpoint(project_id: str, body: dict = Body(...)) -> dict:
    name = (body or {}).get("name") or ""
    if not name:
        raise HTTPException(status_code=400, detail="Falta el nombre del checkpoint.")
    try:
        return timeline_store.checkpoint(project_id, name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/timeline/restore")
def timeline_restore(project_id: str, body: dict = Body(...)) -> dict:
    name = (body or {}).get("name") or ""
    try:
        return timeline_store.restore_checkpoint(project_id, name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/export", response_model=Job)
def export_timeline(project_id: str, req: ExportRequest) -> Job:
    """Lanza el render del vídeo final componiendo toda la timeline."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    timeline = req.timeline or proj.timeline
    if timeline is None or not timeline.clips:
        raise HTTPException(status_code=400, detail="La timeline está vacía.")
    job = jobs.create_job()
    jobs.start_export_job(job, project_id, timeline.model_dump())
    return job


@app.post("/api/projects/{project_id}/subtitles", response_model=Job)
def generate_subtitles(project_id: str, body: dict = Body(...)) -> Job:
    """Transcribe un audio de la timeline para generar subtítulos (pista de texto)."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    filename = (body or {}).get("filename") or ""
    asset_kind = (body or {}).get("asset_kind") or "audios"
    model = (body or {}).get("model") or "base"
    language = (body or {}).get("language")
    if not filename:
        raise HTTPException(status_code=400, detail="Falta el archivo de audio.")
    job = jobs.create_job()
    jobs.start_subtitles_job(job, project_id, filename, asset_kind, model, language)
    return job


@app.get("/api/projects/{project_id}/exports/{filename}")
def get_export(project_id: str, filename: str) -> FileResponse:
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    base = storage.project_base(proj).resolve()
    target = (base / "exports" / filename).resolve()
    if base not in target.parents or not target.exists():
        raise HTTPException(status_code=404, detail="Exportación no encontrada.")
    return FileResponse(str(target), media_type="video/mp4")


# --- Sound Effects (biblioteca de SFX) ---------------------------------

@app.get("/api/sfx")
def list_sfx(q: str = "", category: str = "") -> dict:
    from . import sfx
    return sfx.search(q=q, category=category)


@app.post("/api/sfx/folder")
def set_sfx_folder(body: dict = Body(...)) -> dict:
    from . import sfx
    path = (body or {}).get("path") or ""
    base = sfx.set_folder(path)
    if base is None:
        raise HTTPException(status_code=400, detail="Carpeta de SFX no válida.")
    return sfx.search()


@app.get("/api/sfx/file/{relpath:path}")
def sfx_file(relpath: str) -> FileResponse:
    from . import sfx
    path = sfx.resolve(relpath)
    if path is None:
        raise HTTPException(status_code=404, detail="Efecto de sonido no encontrado.")
    return FileResponse(str(path))


@app.get("/api/media/{project_id}/{kind}/{filename}")
def media(project_id: str, kind: str, filename: str) -> FileResponse:
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    path = storage.resolve_media(proj, kind, filename)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")
    return FileResponse(str(path))


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """Analiza un vídeo de YouTube y devuelve los tramos más vistos."""
    try:
        return heatmap.analyze(
            url=req.url,
            min_score=req.min_score,
            max_clips=req.max_clips,
            max_duration=req.max_duration,
            padding=req.padding,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"No se pudo analizar el vídeo: {exc}")


@app.post("/api/clip", response_model=Job)
def clip(req: ClipRequest) -> Job:
    """Lanza un trabajo en segundo plano para generar los clips seleccionados."""
    if not req.segments:
        raise HTTPException(status_code=400, detail="No hay tramos seleccionados.")
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=400, detail="Proyecto no válido.")

    job = jobs.create_job()
    jobs.start_job(job, req, _video_title(req.url))
    return job


@app.post("/api/clip/compose", response_model=Job)
def compose_clip(req: ComposeClipRequest) -> Job:
    """Lanza un trabajo para componer 1–8 capas en un clip 9:16 de la biblioteca."""
    if not req.layers or len(req.layers) > 8:
        raise HTTPException(status_code=400, detail="La composición admite entre 1 y 8 capas.")
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=400, detail="Proyecto no válido.")
    job = jobs.create_job()
    jobs.start_compose_job(job, req)
    return job


@app.post("/api/reframe/prepare", response_model=Job)
def reframe_prepare(req: ReframePrepareRequest) -> Job:
    """Prepara el editor de reencuadre: descarga un proxy del tramo y detecta caras."""
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="Falta la URL del vídeo.")
    if req.end - req.start < 0.5:
        raise HTTPException(status_code=400, detail="El tramo es demasiado corto.")
    job = jobs.create_job()
    jobs.start_reframe_prepare_job(job, req.url.strip(), req.start, req.end, req.samples)
    return job


@app.get("/api/reframe/proxy/{key}")
def reframe_proxy(key: str) -> FileResponse:
    """Sirve el proxy cacheado del tramo (para editar sobre fotogramas reales)."""
    from . import reframe
    path = reframe.proxy_path(key)
    if path is None:
        raise HTTPException(status_code=404, detail="Previsualización no encontrada.")
    return FileResponse(str(path), media_type="video/mp4")


@app.post("/api/transcribe", response_model=Job)
def transcribe(req: TranscribeRequest) -> Job:
    """Lanza un trabajo en segundo plano para transcribir el vídeo (guion)."""
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=400, detail="Proyecto no válido.")
    job = jobs.create_job()
    jobs.start_transcribe_job(job, req, _video_title(req.url))
    return job


@app.get("/api/voices")
def voices() -> dict:
    from . import piper_tts
    engines = [
        {"id": "kokoro", "label": "Kokoro (neutro)",
         "available": tts.available(), "voices": tts.VOICES},
        {"id": "piper", "label": "Piper (mexicano)",
         "available": piper_tts.available(), "voices": piper_tts.list_voices()},
    ]
    # Compatibilidad: 'voices'/'available' apuntan a Kokoro por defecto.
    return {"engines": engines, "voices": tts.VOICES, "available": tts.available()}


@app.post("/api/tts", response_model=Job)
def create_tts(req: TTSRequest) -> Job:
    """Lanza un trabajo en segundo plano para generar el audio del narrador."""
    from . import piper_tts
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=400, detail="Proyecto no válido.")
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="El texto está vacío.")
    if req.engine == "piper":
        if not piper_tts.available():
            raise HTTPException(status_code=400, detail="Piper no está instalado. Ejecuta 'python get_piper.py' en backend/.")
    elif not tts.available():
        raise HTTPException(status_code=400, detail="Faltan los modelos de Kokoro (ver README).")
    job = jobs.create_job()
    jobs.start_tts_job(job, req)
    return job


@app.get("/api/settings")
def get_settings() -> dict:
    return settings.load()


@app.put("/api/settings")
def put_settings(data: dict) -> dict:
    return settings.save(data)


@app.get("/api/job/{job_id}", response_model=Job)
def job_status(job_id: str) -> Job:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado.")
    return job
