"""API FastAPI: analiza vídeos, lanza trabajos de recorte y sirve los clips."""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import config, diagnostics, heatmap, jobs, migrations, projects, settings, storage, timeline_store, transcribe_settings, tts
from .ai import agent as ai_agent
from .ai import providers as ai_providers
from .mcp_server import server as mcp_server
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
    ImageFetchRequest,
    ReframePrepareRequest,
    SaveLibraryRequest,
    SetFolderRequest,
    Timeline,
    TranscribeRequest,
    TTSRequest,
    UpdateMaterialRequest,
    YouTubeAudioRequest,
)

_MEDIA_KIND = {"clips": "video", "audios": "audio", "images": "image"}


def _video_title(url: str) -> str:
    """Obtiene el título del vídeo (para nombrar archivos). Vacío si falla."""
    try:
        return heatmap._extract_info(url).get("title", "") or ""
    except Exception:
        return ""

diagnostics.configure_logging()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Arranque/parada: diagnóstico de motores + session-manager del MCP.

    Montar la sub-app del MCP (``/mcp``) no ejecuta su lifespan, así que aquí
    abrimos su session-manager para que el transporte streamable-HTTP funcione.
    """
    try:
        diagnostics.log_report()
    except Exception:  # noqa: BLE001 - un fallo de diagnóstico nunca debe tumbar el arranque
        import logging
        logging.getLogger("videoyt.diag").exception("No se pudo generar el diagnóstico de arranque.")
    async with mcp_server.session_lifespan():
        yield


app = FastAPI(title="video-yt", version="0.1.0", lifespan=_lifespan)

# El frontend (React/Vite) corre en otro puerto durante el desarrollo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir los clips generados como archivos estáticos.
app.mount("/clips", StaticFiles(directory=str(config.OUTPUT_DIR)), name="clips")

# MCP: capa de control para que una IA opere el editor (endpoint POST /mcp).
app.mount("/mcp", mcp_server.asgi_app)


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


@app.post("/api/images/fetch")
def fetch_remote_image(req: ImageFetchRequest):
    """Descarga una imagen de internet para pegarla en el modal (sin guardarla aún)."""
    from . import images as image_mod
    try:
        name, data = image_mod.fetch_image(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    ext = Path(name).suffix.lower()
    media = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
             ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "application/octet-stream")
    safe = name.replace('"', "")
    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )


@app.post("/api/projects/{project_id}/images")
async def upload_images(project_id: str, files: list[UploadFile] = File(...)) -> dict:
    """Importa imágenes al proyecto y las deja como PNG de trabajo."""
    from . import images as image_mod
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not files:
        raise HTTPException(status_code=400, detail="No hay archivos.")
    saved = []
    errors = []
    for f in files:
        try:
            data = await f.read()
            info = image_mod.import_image(proj, f.filename or "imagen.png", data)
            saved.append(info.model_dump())
        except ValueError as exc:
            errors.append({"file": f.filename, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            errors.append({"file": f.filename, "error": str(exc)})
    if not saved and errors:
        raise HTTPException(status_code=400, detail=errors[0]["error"])
    return {"images": saved, "errors": errors}


@app.post("/api/projects/{project_id}/videos")
async def upload_video(project_id: str, file: UploadFile = File(...)) -> dict:
    """Importa un vídeo local al proyecto como material de vídeo."""
    from . import videos as video_mod
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if file is None:
        raise HTTPException(status_code=400, detail="No hay archivo.")
    try:
        data = await file.read()
        info = video_mod.import_video(proj, file.filename or "video.mp4", data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"No se pudo importar el vídeo: {exc}")
    return {"clip": info.model_dump()}


@app.post("/api/projects/{project_id}/audios")
async def upload_audio(project_id: str, file: UploadFile = File(...)) -> dict:
    """Importa un audio local al proyecto como material de audio."""
    from . import videos as video_mod
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if file is None:
        raise HTTPException(status_code=400, detail="No hay archivo.")
    try:
        data = await file.read()
        info = video_mod.import_audio(proj, file.filename or "audio.mp3", data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"No se pudo importar el audio: {exc}")
    return {"audio": info.model_dump()}


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
    for im in proj.images:
        materials.append({
            "kind": "image", "file": im.filename, "label": im.label,
            "description": im.description, "width": im.width, "height": im.height,
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
    timeline = (
        Timeline(**migrations.migrate_timeline(req.timeline))
        if req.timeline
        else proj.timeline
    )
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
    model = transcribe_settings.resolve((body or {}).get("model"))
    language = (body or {}).get("language")
    if not filename:
        raise HTTPException(status_code=400, detail="Falta el archivo de audio.")
    job = jobs.create_job()
    jobs.start_subtitles_job(
        job, project_id, filename, asset_kind, model, language,
        (body or {}).get("asset_scope") or "project",
    )
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


@app.post("/api/sfx")
async def add_sfx(
    file: UploadFile = File(...),
    name: str = Form(""),
    category_id: str = Form(""),
    new_category: str = Form(""),
    uso: str = Form(""),
) -> dict:
    from . import sfx
    payload = await file.read()
    try:
        item = sfx.add_sound(
            file.filename or "sound.mp3",
            payload,
            name=name,
            category_id=category_id,
            new_category=new_category,
            uso=uso,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    out = sfx.search()
    out["added"] = item
    return out


@app.patch("/api/sfx")
def update_sfx(body: dict = Body(...)) -> dict:
    from . import sfx
    try:
        item = sfx.update_sound(
            (body or {}).get("id") or "",
            name=(body or {}).get("name"),
            category_id=(body or {}).get("category_id") or "",
            new_category=(body or {}).get("new_category") or "",
            uso=(body or {}).get("uso"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    out = sfx.search()
    out["added"] = item
    return out


@app.post("/api/sfx/category")
def create_sfx_category(body: dict = Body(...)) -> dict:
    from . import sfx
    try:
        return sfx.create_category((body or {}).get("label") or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
    jobs.start_reframe_prepare_job(
        job, req.url.strip(), req.start, req.end, req.samples, req.track_faces,
    )
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
    from . import gemini_tts, piper_tts
    engines = [
        {"id": "gemini", "label": "Gemini (cinematográfico)",
         "available": gemini_tts.available(), "voices": gemini_tts.VOICES,
         "reason": gemini_tts.unavailable_reason()},
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
    from . import gemini_tts, piper_tts
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=400, detail="Proyecto no válido.")
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="El texto está vacío.")
    if req.engine == "gemini":
        reason = gemini_tts.unavailable_reason()
        if reason:
            raise HTTPException(status_code=400, detail=reason)
    elif req.engine == "piper":
        if not piper_tts.available():
            raise HTTPException(status_code=400, detail="Piper no está instalado. Ejecuta 'python get_piper.py' en backend/.")
    elif req.engine == "kokoro":
        if not tts.available():
            raise HTTPException(status_code=400, detail="Faltan los modelos de Kokoro (ver README).")
    else:
        raise HTTPException(status_code=400, detail="Motor TTS no válido.")
    job = jobs.create_job()
    jobs.start_tts_job(job, req)
    return job


@app.post("/api/youtube-audio", response_model=Job)
def create_youtube_audio(req: YouTubeAudioRequest) -> Job:
    from . import youtube_audio
    if not youtube_audio.is_youtube_url(req.url):
        raise HTTPException(status_code=400, detail="URL de YouTube no válida.")
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    job = jobs.create_job()
    jobs.start_youtube_audio_job(job, req)
    return job


@app.get("/api/library")
def get_library() -> dict:
    from . import library
    return library.list_library()


@app.post("/api/library/save")
def save_library_item(req: SaveLibraryRequest) -> dict:
    from . import library
    if req.resource_type not in ("audio", "clip"):
        raise HTTPException(status_code=400, detail="Tipo no válido.")
    try:
        return library.save_from_project(req.project_id, req.resource_type, req.ident)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Material no encontrado.") from exc


@app.delete("/api/library/{item_id}")
def delete_library_item(item_id: str) -> dict:
    from . import library
    try:
        return library.unsave(item_id)
    except library.LibraryInUseError as exc:
        raise HTTPException(status_code=409, detail={
            "code": "in_use",
            "message": str(exc),
            "projects": exc.projects,
        }) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Recurso no encontrado.") from exc


@app.get("/api/library/media/{kind}/{filename}")
def library_media(kind: str, filename: str) -> FileResponse:
    path = storage.resolve_library_media(kind, filename)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")
    return FileResponse(str(path))


@app.get("/api/settings")
def get_settings() -> dict:
    return settings.public()


@app.put("/api/settings")
def put_settings(data: dict) -> dict:
    settings.save(data)
    return settings.public()


# --- Chat IA (agente que opera el MCP existente) -----------------------

@app.get("/api/ai/config")
def ai_config() -> dict:
    """Estado del proveedor de IA (sin exponer la API key)."""
    cfg = ai_providers.ai_config()
    reason = None
    try:
        reason = ai_providers.get_provider().unavailable_reason()
    except Exception as exc:  # noqa: BLE001
        reason = str(exc)
    return {"provider": cfg["provider"], "model": cfg["model"],
            "available": reason is None, "reason": reason}


@app.post("/api/ai/chat")
async def ai_chat(body: dict = Body(...)) -> StreamingResponse:
    """Turno de chat con la IA. Devuelve eventos SSE (text/tool/reload/done/error).

    El navegador NO habla con el MCP: el backend gestiona proveedor + cliente MCP
    in-process. La API key nunca sale del backend.
    """
    project_id = (body or {}).get("project_id") or ""
    message = (body or {}).get("message") or ""
    conversation_id = (body or {}).get("conversation_id")
    context = (body or {}).get("context") if isinstance((body or {}).get("context"), dict) else None
    stream = ai_agent.sse(project_id, message, context=context, conversation_id=conversation_id)
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/ai/conversations")
def ai_conversations(project_id: str) -> dict:
    """Lista las conversaciones guardadas de un proyecto (sin mensajes)."""
    from .ai import conversations as convo
    return {"conversations": convo.list_conversations(project_id)}


@app.get("/api/ai/conversations/{project_id}/{conversation_id}")
def ai_conversation(project_id: str, conversation_id: str) -> dict:
    """Mensajes de una conversación concreta."""
    from .ai import conversations as convo
    return {"id": conversation_id, "messages": convo.get_messages(project_id, conversation_id)}


@app.delete("/api/ai/conversations/{project_id}/{conversation_id}")
def ai_conversation_delete(project_id: str, conversation_id: str) -> dict:
    from .ai import conversations as convo
    return {"deleted": convo.delete(project_id, conversation_id)}


@app.get("/api/job/{job_id}", response_model=Job)
def job_status(job_id: str) -> Job:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado.")
    return job
