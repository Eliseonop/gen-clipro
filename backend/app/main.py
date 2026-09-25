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
    CreateSegmentsRequest,
    FaceTrackRequest,
    TrackObjectRequest,
    SoundDesignRequest,
    RecipeRequest,
    GroupNameRequest,
    MoveProjectRequest,
    RenameProjectRequest,
    Job,
    Project,
    ProjectGroup,
    ClipTranscribeRequest,
    ExportRequest,
    ImageFetchRequest,
    ExploreItem,
    ExploreSearchRequest,
    ReframePrepareRequest,
    SaveLibraryRequest,
    RevealMediaRequest,
    SetFolderRequest,
    SpeechTranscribeRequest,
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
    return projects.create_project(req.name, req.group_id)


# Carpetas del inicio: solo organizan la lista de proyectos (campo group_id).

@app.get("/api/project-groups", response_model=list[ProjectGroup])
def list_project_groups() -> list[ProjectGroup]:
    return projects.list_groups()


@app.post("/api/project-groups", response_model=ProjectGroup)
def create_project_group(req: GroupNameRequest) -> ProjectGroup:
    try:
        return projects.create_group(req.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.patch("/api/project-groups/{group_id}", response_model=ProjectGroup)
def rename_project_group(group_id: str, req: GroupNameRequest) -> ProjectGroup:
    try:
        group = projects.rename_group(group_id, req.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if group is None:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    return group


@app.delete("/api/project-groups/{group_id}")
def delete_project_group(group_id: str) -> dict:
    if not projects.delete_group(group_id):
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    return {"deleted": group_id}


@app.post("/api/projects/{project_id}/group", response_model=Project)
def move_project_to_group(project_id: str, req: MoveProjectRequest) -> Project:
    try:
        proj = projects.move_project(project_id, req.group_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return proj


@app.get("/api/projects/{project_id}", response_model=Project)
def get_project(project_id: str) -> Project:
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return proj


@app.patch("/api/projects/{project_id}", response_model=Project)
def rename_project(project_id: str, req: RenameProjectRequest) -> Project:
    try:
        proj = projects.rename_project(project_id, req.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return proj


@app.post("/api/projects/{project_id}/duplicate", response_model=Project)
def duplicate_project(project_id: str) -> Project:
    try:
        proj = projects.duplicate_project(project_id)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"No se pudieron copiar los archivos: {exc}")
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
    # Un segmento por referencia comparte el archivo con su vídeo de origen (y
    # con los demás segmentos): el archivo solo se borra si ya nadie lo usa.
    if kind == "clips":
        from . import segments
        after = projects.get_project(project_id)
        if segments.is_shared_file(after, removed.get("filename", "")):
            return {"deleted": ident, "file_kept": True}
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
            # keep_gif: los GIF animados se conservan como .gif (no se aplanan a PNG);
            # import_image solo lo aplica si el archivo es realmente un GIF.
            info = image_mod.import_image(proj, f.filename or "imagen.png", data, keep_gif=True)
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


@app.post("/api/projects/{project_id}/clips/{ident}/segments")
def create_segments(project_id: str, ident: str, req: CreateSegmentsRequest) -> dict:
    """Crea clips POR REFERENCIA (sin render) desde rangos de un vídeo del material."""
    from . import segments
    try:
        created = segments.create_segments(project_id, ident, req.segments)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {"clips": [c.model_dump() for c in created]}


@app.post("/api/projects/{project_id}/clips/{ident}/face-track", response_model=Job)
def face_track_clip(project_id: str, ident: str, req: FaceTrackRequest) -> Job:
    """Seguimiento de caras de un material (o de un rango de su archivo), cacheado en él."""
    from . import segments
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if segments.find_clip(proj, ident) is None:
        raise HTTPException(status_code=404, detail="Material de vídeo no encontrado.")
    job = jobs.create_job()
    jobs.start_face_track_job(job, project_id, ident, req.start, req.end, req.samples, req.force)
    return job


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


@app.get("/api/explore/search")
def explore_search(
    q: str = "",
    page: int = 1,
    media: str = "all",
    provider: str = "all",
) -> dict:
    """Busca fotos, vídeos y GIFs en Pexels y GIPHY (pestaña Explorar)."""
    from .media_search import media_search
    try:
        req = ExploreSearchRequest(query=q, page=page, media=media, provider=provider)
    except Exception:
        raise HTTPException(status_code=400, detail="Parámetros de búsqueda no válidos.") from None
    return media_search.search(req.query, req.page, req.media, req.provider)


@app.post("/api/explore/keywords")
def explore_keywords(body: dict = Body(default=None)) -> dict:
    """Palabras clave de stock a partir del guion / descripciones de audio."""
    from .explore_keywords import gather_theme_text, suggest_keywords

    payload = body if isinstance(body, dict) else {}
    text = str(payload.get("text") or "").strip()
    pid = str(payload.get("project_id") or "").strip()
    if not text and pid:
        proj = projects.get_project(pid)
        if proj is None:
            raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
        text = gather_theme_text(proj)
    return suggest_keywords(text)


@app.post("/api/projects/{project_id}/explore/import")
def explore_import(project_id: str, item: ExploreItem) -> dict:
    """Descarga un resultado de Explorar y lo registra como material del proyecto."""
    from .asset_import import asset_import
    try:
        return asset_import.import_item(project_id, item)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


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
    engine = (body or {}).get("engine") or "whisper"
    if not filename:
        raise HTTPException(status_code=400, detail="Falta el archivo de audio.")
    if engine == "azure":
        from . import azure_stt
        reason = azure_stt.unavailable_reason()
        if reason:
            raise HTTPException(status_code=400, detail=reason)
    job = jobs.create_job()
    jobs.start_subtitles_job(
        job, project_id, filename, asset_kind, model, language,
        (body or {}).get("asset_scope") or "project", engine=engine,
    )
    return job


# --- Eliminar fondo (matte de IA + chroma key) --------------------------
#
# El chroma key NO pasa por aquí: es un filtro puro, se resuelve en el preview y
# en el export a partir de las propiedades del clip. Estos endpoints son solo
# para el matte de IA, que sí necesita un job y caché en disco.

@app.get("/api/bg/providers")
def bg_providers() -> dict:
    """Modelos de segmentación disponibles y device efectivo."""
    from .bg import providers as bg_prov

    return {"providers": bg_prov.catalog(), **gpu_onnx_summary()}


def gpu_onnx_summary() -> dict:
    from . import gpu
    return gpu.onnx_summary()


@app.post("/api/projects/{project_id}/bg-removal", response_model=Job)
def bg_removal(project_id: str, body: dict = Body(...)) -> Job:
    """Lanza el cálculo del matte de un clip. Devuelve un Job con progreso."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not (body or {}).get("filename"):
        raise HTTPException(status_code=400, detail="Falta el material del clip.")
    job = jobs.create_job()
    jobs.start_bg_removal_job(job, project_id, body or {})
    return job


@app.post("/api/projects/{project_id}/bg-analyze", response_model=Job)
def bg_analyze(project_id: str, body: dict = Body(...)) -> Job:
    """Eliminación personalizada: analiza los fotogramas del clip en segundo plano
    (encode de SAM a la caché) mientras el usuario marca. Devuelve un Job."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not (body or {}).get("filename"):
        raise HTTPException(status_code=400, detail="Falta el material del clip.")
    job = jobs.create_job()
    jobs.start_bg_analyze_job(job, project_id, body or {})
    return job


@app.post("/api/projects/{project_id}/bg-cutout", response_model=Job)
def bg_cutout(project_id: str, body: dict = Body(...)) -> Job:
    """Hornea el clip con el fondo eliminado a un WebM transparente (conserva la
    animación) y lo añade al material como vídeo. Devuelve un Job con progreso."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not (body or {}).get("filename"):
        raise HTTPException(status_code=400, detail="Falta el material del clip.")
    job = jobs.create_job()
    jobs.start_bg_cutout_job(job, project_id, body or {})
    return job


@app.post("/api/projects/{project_id}/bg-segment")
def bg_segment(project_id: str, body: dict = Body(...)) -> Response:
    """Selección INTERACTIVA de UN fotograma (Eliminación personalizada).

    Endpoint LIGERO (no lanza el job de todos los frames): encode cacheado +
    decode, vía el proveedor SAM. Devuelve un PNG RGBA con ``alfa = máscara``
    para pintar la selección (relleno cian) sobre el reproductor. El editor manda
    solo los trazos INTELIGENTES: el pincel/borrador normal lo compone él al
    instante. "Aplicar" lanza el job que SIGUE la selección por todo el clip.
    """
    import cv2
    import numpy as np

    from . import clip_bg, compose
    from .bg import service as bg_service
    from .schemas import TimelineClip

    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not (body or {}).get("filename"):
        raise HTTPException(status_code=400, detail="Falta el material del clip.")
    clip = TimelineClip(**{
        "id": str(body.get("clip_id") or "tmp"), "track_id": "V1",
        "kind": str(body.get("kind") or "video"),
        "asset_kind": str(body.get("asset_kind") or "clips"),
        "asset_id": str(body.get("asset_id") or "0"),
        "filename": str(body.get("filename") or ""),
        "asset_scope": str(body.get("asset_scope") or "project"),
    })
    if not clip_bg.bg_capable(clip):
        raise HTTPException(status_code=400, detail="El clip no admite eliminar fondo.")
    path = compose._clip_path(proj, clip)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="No se encuentra el material del clip.")

    auto = clip_bg.normalize_auto(body.get("auto"))
    # Sin ``points``: la selección del fotograma MARCADO en ``src_time`` (trazos
    # inteligentes + pincel manual de auto.edits), la misma de la que arranca el
    # seguimiento al aplicar. Con ``points``: solo esos puntos (API anterior).
    points: list[tuple[float, float, int]] | None = None
    if body.get("points") is not None:
        points = []
        for p in (body.get("points") or []):
            try:
                x, y = float(p["x"]), float(p["y"])
            except (KeyError, TypeError, ValueError):
                continue
            points.append((x, y, 0 if p.get("op") == "erase" else 1))
    try:
        mask = bg_service.segment_frame(path, auto, float(body.get("src_time") or 0.0), points)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - modelo/entorno
        raise HTTPException(status_code=500, detail=f"No se pudo segmentar: {exc}")

    h, w = mask.shape[:2]
    rgba = np.empty((h, w, 4), np.uint8)
    rgba[:, :, 0] = 255
    rgba[:, :, 1] = 255
    rgba[:, :, 2] = 255
    rgba[:, :, 3] = mask
    ok, buf = cv2.imencode(".png", rgba)
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo codificar la máscara.")
    return Response(content=buf.tobytes(), media_type="image/png",
                    headers={"Cache-Control": "no-store"})


@app.get("/api/bg/status/{base_key}")
def bg_status(base_key: str) -> dict:
    """Metadatos del matte en caché: rango disponible, cadencia y tamaño."""
    from .bg import service as bg_service

    meta = bg_service.read_meta(base_key)
    if not meta:
        raise HTTPException(status_code=404, detail="Matte no encontrado.")
    return meta


@app.get("/api/bg/matte/{base_key}/{index}.png")
def bg_matte_frame(base_key: str, index: int) -> Response:
    """Un fotograma del matte CRUDO, con ``alfa = matte``.

    El preview lo recorta con ``destination-in`` (sin recorrer píxeles) y aplica
    umbral/pluma/pincel en JS. Es inmutable para una ``base_key`` dada, así que
    se cachea de forma agresiva: mover un slider no vuelve a pedir red.
    """
    from .bg import service as bg_service

    png = bg_service.matte_png(base_key, index)
    if png is None:
        raise HTTPException(status_code=404, detail="Fotograma de matte no encontrado.")
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/bg/cache")
def bg_cache_stats() -> dict:
    from .bg import service as bg_service
    return bg_service.cache_stats()


@app.delete("/api/bg/cache")
def bg_cache_clear(base_key: str | None = None) -> dict:
    from .bg import service as bg_service

    bg_service.clear_cache(base_key)
    return {"ok": True, "cleared": base_key or "all"}


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


@app.post("/api/projects/{project_id}/freeze-frame")
def freeze_frame(project_id: str, body: dict) -> dict:
    """Congelar fotograma (#11): guarda como imagen del proyecto el fotograma
    ``time`` (s del ARCHIVO) del clip de vídeo ``clip`` (el clip entero, tal cual
    está en la timeline, para resolver su material aunque aún no se haya guardado)."""
    from .freeze import freeze_frame_image
    from .schemas import TimelineClip
    proj = _project_or_404(project_id)
    try:
        clip = TimelineClip.model_validate(body.get("clip") or {})
        info = freeze_frame_image(proj, clip, float(body.get("time") or 0.0))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"image": info.model_dump()}


@app.post("/api/projects/{project_id}/beats")
def detect_clip_beats(project_id: str, body: dict) -> dict:
    """Beats automáticos (#12) del audio del clip ``clip`` (el clip entero, tal
    cual está en la timeline): ``{times: [s del ARCHIVO], bpm}``."""
    from . import compose
    from .beats import detect_beats
    from .schemas import TimelineClip
    proj = _project_or_404(project_id)
    try:
        clip = TimelineClip.model_validate(body.get("clip") or {})
        if clip.kind not in ("audio", "video"):
            raise ValueError("Los beats solo se detectan en clips de audio o vídeo.")
        path = compose._clip_path(proj, clip)
        if path is None or not path.exists():
            raise ValueError("No se encuentra el archivo del clip.")
        return detect_beats(path)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/track-object", response_model=Job)
def track_object_endpoint(project_id: str, req: TrackObjectRequest) -> Job:
    """Seguimiento de objetos (#15): job cuyo ``result`` es el recorrido del objeto."""
    if projects.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if (req.clip or {}).get("kind") != "video":
        raise HTTPException(status_code=400, detail="Solo se siguen objetos de un clip de vídeo.")
    job = jobs.create_job()
    jobs.start_object_track_job(job, project_id, req.clip, req.box, float(req.at))
    return job


@app.get("/api/recipes")
def list_recipes() -> dict:
    """Recetas en un clic (#21): id, nombre, truco y qué necesitan seleccionado."""
    from .recipes import RECIPES
    return {"recipes": list(RECIPES)}


@app.post("/api/projects/{project_id}/recipes/{recipe}")
def apply_recipe_endpoint(project_id: str, recipe: str, req: RecipeRequest) -> dict:
    """Aplica una receta sobre la timeline guardada (el editor guarda antes y recarga
    después). Devuelve ``changed`` (pistas y clips nuevos o tocados) y ``warnings``."""
    from . import timeline_store
    if projects.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    try:
        res = timeline_store.apply_op(project_id, "apply_recipe",
                                      {"recipe": recipe, "clip_ids": req.clip_ids, "params": req.params})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {"changed": res.get("changed", []), "warnings": res.get("warnings", [])}


@app.post("/api/projects/{project_id}/sound-design", response_model=Job)
def sound_design_endpoint(project_id: str, req: SoundDesignRequest) -> Job:
    """Sonorizar con IA (#17): job cuyo ``result`` son los sonidos propuestos."""
    if projects.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if (req.clip or {}).get("kind") not in ("video", "image"):
        raise HTTPException(status_code=400, detail="Sonorizar funciona con clips de vídeo o imagen.")
    job = jobs.create_job()
    jobs.start_sound_design_job(job, project_id, req.clip)
    return job


# --- Motion Studio (motion graphics editables) --------------------------

def _project_or_404(project_id: str) -> Project:
    proj = projects.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return proj


@app.get("/api/projects/{project_id}/motion")
def motion_list(project_id: str) -> dict:
    from .motion import service as motion_service
    _project_or_404(project_id)
    return {"compositions": [c.model_dump() for c in motion_service.list_compositions(project_id)]}


@app.get("/api/projects/{project_id}/motion/templates")
def motion_templates(project_id: str) -> dict:
    from .motion import templates as motion_templates
    return {"templates": motion_templates.list_templates()}


@app.get("/api/projects/{project_id}/motion/templates/{key}/preview.html")
def motion_template_preview(project_id: str, key: str, theme: str | None = None,
                            accent: str | None = None, w: int | None = None,
                            h: int | None = None) -> Response:
    """HTML autocontenido de una PLANTILLA instanciada con parámetros por defecto
    (para la galería de plantillas: iframe con el motor real, sin guardar nada)."""
    from .motion import templates as motion_templates
    from .motion.generator import generate_html
    params: dict = {"theme": theme, "accent": accent}
    if w:
        params["width"] = int(w)
    if h:
        params["height"] = int(h)
    try:
        comp = motion_templates.instantiate(key, "preview", params)
    except KeyError:
        raise HTTPException(status_code=404, detail="Plantilla desconocida.")
    return Response(content=generate_html(comp), media_type="text/html; charset=utf-8")


@app.post("/api/projects/{project_id}/motion/templates/user")
def motion_template_user_save(project_id: str, body: dict = Body(default={})) -> dict:
    """Guarda una composición validada como plantilla reutilizable (§16). Sus imágenes
    se copian a la Biblioteca para que la plantilla funcione en cualquier proyecto."""
    from .motion import service as motion_service
    from .motion.templates import user as user_templates
    _project_or_404(project_id)
    body = body or {}
    comp = motion_service.get_composition(project_id, str(body.get("composition_id") or ""))
    if comp is None:
        raise HTTPException(status_code=404, detail="Composición no encontrada.")
    try:
        return user_templates.save(project_id, comp, name=str(body.get("name") or ""),
                                   best_for=str(body.get("best_for") or ""),
                                   tags=body.get("tags") if isinstance(body.get("tags"), list) else None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/api/projects/{project_id}/motion/templates/user/{key}")
def motion_template_user_delete(project_id: str, key: str) -> dict:
    from .motion.templates import user as user_templates
    if not user_templates.delete(key):
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")
    return {"ok": True}


# Historias con stickman: storyboard (IA) → composición editable. Antes de /motion/{comp_id}.
@app.get("/api/projects/{project_id}/motion/stick/library")
def motion_stick_library(project_id: str) -> dict:
    from .motion import stick
    return stick.library()


@app.get("/api/projects/{project_id}/motion/stick/cast")
def motion_stick_cast(project_id: str) -> dict:
    from .motion import stick
    _project_or_404(project_id)
    return {"characters": stick.project_cast(project_id)}


@app.post("/api/projects/{project_id}/motion/stick/storyboard")
async def motion_stick_storyboard(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """Guion → storyboard (SSE: start/status/storyboard/error/done). No guarda nada."""
    from .motion import stick, stick_ai
    _project_or_404(project_id)
    body = body or {}
    try:
        duration = float(body["duration"]) if body.get("duration") else None
    except (TypeError, ValueError):
        duration = None
    cast = stick.project_cast(project_id) if body.get("use_cast", True) else []
    stream = stick_ai.storyboard_sse(script=str(body.get("script") or ""), duration=duration,
                                     style=body.get("style"), environment=body.get("environment"),
                                     cast=cast)
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/motion/stick/compile")
def motion_stick_compile(project_id: str, body: dict = Body(default={})) -> dict:
    """Crea (o actualiza si viene ``composition_id``) la composición de una historia."""
    from .motion import service as motion_service
    from .motion import stick
    from .motion.validator import MotionValidationError
    proj = _project_or_404(project_id)
    body = body or {}
    tl = proj.timeline
    fmt = {"width": int(body.get("width") or getattr(tl, "width", 1080) or 1080),
           "height": int(body.get("height") or getattr(tl, "height", 1920) or 1920),
           "fps": int(getattr(tl, "fps", 30) or 30)}
    cid = body.get("composition_id")
    prev = motion_service.get_composition(project_id, cid) if cid else None
    try:
        comp = stick.build_composition(prev.id if prev else motion_service.new_id(),
                                       body.get("storyboard"), name=body.get("name"),
                                       metadata=(prev.metadata if prev else None), **fmt)
        saved = motion_service.save_composition(project_id, comp, bump=prev is not None)
    except MotionValidationError as exc:
        raise HTTPException(status_code=400, detail={"errors": exc.errors})
    return saved.model_dump()


@app.post("/api/projects/{project_id}/motion/stick/prompts")
def motion_stick_prompts(project_id: str, body: dict = Body(default={})) -> dict:
    from .motion import stick
    return stick.prompts((body or {}).get("storyboard"))


# "Generar Motion": contexto COMPACTO de un tramo. Van antes de /motion/{comp_id}
# para que "segment-context" y "focus" no se interpreten como id de composición.
@app.get("/api/projects/{project_id}/motion/segment-context")
def motion_segment_context(project_id: str, start: float | None = None, end: float | None = None,
                           playhead: float | None = None, clip_id: str | None = None) -> dict:
    from .motion import segment_context
    proj = _project_or_404(project_id)
    return segment_context.build_segment_context(proj, start, end, playhead, clip_id)


@app.post("/api/projects/{project_id}/motion/focus")
def motion_focus(project_id: str, body: dict = Body(...)) -> dict:
    """Guarda el tramo marcado en el editor para que un cliente MCP lo use sin tiempos."""
    from .motion import segment_context
    _project_or_404(project_id)
    try:
        return segment_context.set_focus(project_id, start=float(body["start"]),
                                         end=body.get("end"), playhead=body.get("playhead"),
                                         clip_id=body.get("clip_id"))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Foco inválido: {exc}")


# "Generar Escena" (docs/GENERAR_ESCENA.md): brief → preguntas → plan por beats → escena.
@app.get("/api/projects/{project_id}/motion/scene/directions")
def motion_scene_directions(project_id: str) -> dict:
    from .motion import directions, scene
    return {"directions": directions.list_directions(), "default": directions.DEFAULT_DIRECTION,
            "options": scene.options()}


@app.get("/api/projects/{project_id}/motion/scene/presets")
def motion_scene_presets(project_id: str) -> dict:
    from .motion import scene
    return {"presets": scene.list_presets()}


@app.post("/api/projects/{project_id}/motion/scene/presets")
def motion_scene_preset_save(project_id: str, body: dict = Body(default={})) -> dict:
    from .motion import scene
    body = body or {}
    try:
        return scene.save_preset(str(body.get("name") or ""), body.get("brief"), body.get("id"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/api/projects/{project_id}/motion/scene/presets/{preset_id}")
def motion_scene_preset_delete(project_id: str, preset_id: str) -> dict:
    from .motion import scene
    try:
        ok = scene.delete_preset(preset_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not ok:
        raise HTTPException(status_code=404, detail="Preset no encontrado.")
    return {"ok": True}


def _scene_request(project_id: str, body: dict):
    """(proyecto, contexto del tramo, brief normalizado con la duración del tramo, rango).

    Con ``direction_id`` (Dirección de escena) el rango es el del tramo y la IA recibe el
    PAQUETE compacto del tramo (guion exacto, subtítulos, dirección, materiales) y, si la
    estructura es "script", los beats fijados por las frases."""
    from . import scene_direction
    from .motion import scene, segment_context
    proj = _project_or_404(project_id)
    seg = doc = None
    if body.get("direction_id"):
        try:
            seg, doc = scene_direction.get_segment(proj, str(body["direction_id"]))
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        body = {**body, "start": seg["start"], "end": seg["end"]}
    ctx = segment_context.build_segment_context(
        proj, body.get("start"), body.get("end"), body.get("playhead"), body.get("clip_id"))
    sel = ctx.get("selection") or {}
    if sel.get("start") is None or sel.get("end") is None:
        raise HTTPException(status_code=400, detail="Falta el rango del tramo.")
    rng = {"start": float(sel["start"]), "end": float(sel["end"])}
    brief = scene.normalize_brief(body.get("brief"), duration=rng["end"] - rng["start"])
    if seg is not None:
        pack = scene_direction.build_pack(proj, seg, doc)
        ctx["directionPack"] = scene_direction.pack_text(pack)
        ctx["skeleton"] = scene_direction.skeleton_beats(pack, pace=scene.PACES[brief["pace"]])
        known = {str(a.get("id")) for a in ctx.get("availableAssets") or []}
        for m in pack["materials"] + pack["candidates"]:
            if m["kind"] == "images" and m["id"] not in known:
                ctx.setdefault("availableAssets", []).append({"kind": "image", "id": m["id"], "label": m["title"]})
    return proj, ctx, brief, rng


def _sse(stream) -> StreamingResponse:
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/motion/scene/questions")
async def motion_scene_questions(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """La IA pregunta lo que falta para diseñar la escena (SSE: questions/error/done)."""
    from .motion import scene_ai
    _, ctx, brief, _ = _scene_request(project_id, body or {})
    return _sse(scene_ai.to_sse(scene_ai.questions_stream(ctx=ctx, brief=brief)))


@app.post("/api/projects/{project_id}/motion/scene/plan")
async def motion_scene_plan(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """Plan por beats (SSE: plan/error/done). No guarda nada."""
    from .motion import scene, scene_ai
    body = body or {}
    _, ctx, brief, _ = _scene_request(project_id, body)
    answers = scene.normalize_answers(body.get("answers"))
    return _sse(scene_ai.to_sse(scene_ai.plan_stream(ctx=ctx, brief=brief, answers=answers)))


@app.post("/api/projects/{project_id}/motion/scene/build")
async def motion_scene_build(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """Construye la escena beat a beat y guarda el BORRADOR (SSE: beat_start/beat_done/
    created/error/done). ``variant_of`` = regenerar sobre el mismo borrador;
    ``only_beats`` = regenerar solo esos beats conservando el resto."""
    from .mcp_server.tools_motion import _project_format
    from .motion import scene, scene_ai
    from .motion import service as motion_service
    body = body or {}
    proj, ctx, brief, rng = _scene_request(project_id, body)
    raw_plan = body.get("plan") if isinstance(body.get("plan"), dict) else {}
    plan = scene.normalize_beats_edit(raw_plan.get("beats"), brief, image_ids=scene_ai.image_ids(ctx))
    plan.update({k: str(raw_plan.get(k) or "")[:800] for k in ("title", "logline", "rationale")})
    motion_service.cleanup_generate_drafts(project_id)
    variant_of = body.get("variant_of")
    only = body.get("only_beats") if isinstance(body.get("only_beats"), list) else None
    previous = None
    if variant_of and only is not None:
        prev = motion_service.get_composition(project_id, variant_of)
        previous = (prev.metadata or {}).get("scene") if prev else None
    stream = scene_ai.build_stream(project_id, ctx=ctx, brief=brief, answers=scene.normalize_answers(body.get("answers")),
                                   plan=plan, fmt=_project_format(proj), for_range=rng,
                                   variant_of=variant_of, only_beats=only, previous=previous)
    if body.get("direction_id"):
        stream = _link_direction(project_id, str(body["direction_id"]), stream)
    return _sse(scene_ai.to_sse(stream))


async def _link_direction(project_id: str, direction_id: str, stream):
    """Al crearse el borrador, lo enlaza al tramo de la escaleta (estado 'generated')."""
    from . import scene_direction
    async for ev in stream:
        if ev.get("type") == "created" and ev.get("composition_id"):
            try:
                scene_direction.update_segment(project_id, direction_id,
                                               {"composition_id": ev["composition_id"], "status": "generated"})
            except LookupError:
                pass
        yield ev


# Dirección de escena: escaleta de tramos del guion (ver app/scene_direction.py).
@app.get("/api/projects/{project_id}/scene-direction")
def scene_direction_get(project_id: str) -> dict:
    from . import scene_direction
    proj = _project_or_404(project_id)
    from .clip_speed import clip_timeline_duration
    units, source = scene_direction.script_units(proj)
    tl = proj.timeline
    duration = max((float(c.start or 0) + clip_timeline_duration(c) for c in tl.clips), default=0.0) if tl else 0.0
    return {**scene_direction.load(proj), "script_source": source, "units": units,
            "modes": [{"key": k, **v} for k, v in scene_direction.MODES.items()],
            "materials": scene_direction.material_catalog(proj),
            "duration": round(duration, 3)}


@app.put("/api/projects/{project_id}/scene-direction")
def scene_direction_put(project_id: str, body: dict = Body(default={})) -> dict:
    from . import scene_direction
    _project_or_404(project_id)
    return scene_direction.save(project_id, body)


@app.get("/api/projects/{project_id}/scene-direction/blueprint")
def scene_direction_blueprint_get(project_id: str) -> dict:
    """Dirección visual GLOBAL del proyecto (Fase 5) + catálogo de direcciones creativas."""
    from . import scene_direction
    from .motion import directions
    proj = _project_or_404(project_id)
    return {"blueprint": scene_direction.load_blueprint(proj),
            "directions": directions.list_directions(),
            "default_direction": directions.DEFAULT_DIRECTION,
            "vocabulary_suggestions": list(scene_direction.VOCABULARY)}


@app.put("/api/projects/{project_id}/scene-direction/blueprint")
def scene_direction_blueprint_put(project_id: str, body: dict = Body(default={})) -> dict:
    """Guarda la dirección visual global. Acepta el blueprint directo o {blueprint:{…}}."""
    from . import scene_direction
    _project_or_404(project_id)
    body = body or {}
    raw = body.get("blueprint", body) if isinstance(body, dict) else {}
    try:
        return {"blueprint": scene_direction.save_blueprint(project_id, raw)}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/projects/{project_id}/scene-direction/blueprint/generate")
async def scene_direction_blueprint_generate(project_id: str, body: dict = Body(default={})) -> dict:
    """La IA propone la dirección visual GLOBAL (Fase 5). apply=true (por defecto) la guarda."""
    from . import scene_direction
    from .motion import directions, scene_ai
    proj = _project_or_404(project_id)
    units, _ = scene_direction.script_units(proj)
    script = " ".join(u["text"] for u in units)[:6000]
    materials = scene_direction.material_catalog(proj)
    if not script.strip() and not materials:
        raise HTTPException(status_code=400, detail="No hay guion ni material: transcribe o añade material.")
    dopts = [{"key": d["key"], "label": d["label"], "summary": d["summary"]} for d in directions.list_directions()]
    events = [ev async for ev in scene_ai.blueprint_stream(
        project_name=proj.name, script=script, materials=materials,
        directions_list=dopts, vocabulary=list(scene_direction.VOCABULARY))]
    err = next((e for e in reversed(events) if e.get("type") == "error"), None)
    if err:
        raise HTTPException(status_code=502, detail=err.get("message") or "Error de IA.")
    bp = next((e for e in reversed(events) if e.get("type") == "blueprint"), None)
    if not bp:
        raise HTTPException(status_code=502, detail="La IA no devolvió un blueprint válido.")
    raw = {**bp["blueprint"], "source": "ai"}
    if (body or {}).get("apply", True):
        return {"blueprint": scene_direction.save_blueprint(project_id, raw), "applied": True}
    return {"blueprint": scene_direction.normalize_blueprint(raw), "applied": False}


@app.post("/api/projects/{project_id}/scene-direction/plan-all")
async def scene_direction_plan_all(project_id: str, body: dict = Body(default={})) -> dict:
    """La IA rellena el plan editorial de TODA la escaleta en una pasada (Fase 5). apply=true guarda."""
    from . import scene_direction
    from .motion import scene_ai
    proj = _project_or_404(project_id)
    doc = scene_direction.load(proj)
    if not doc["segments"]:
        raise HTTPException(status_code=400, detail="No hay escaleta: crea los tramos primero.")
    bp_text = "\n".join(scene_direction._blueprint_lines(scene_direction.load_blueprint(proj)))
    materials = scene_direction.material_catalog(proj)
    events = [ev async for ev in scene_ai.plan_all_stream(
        blueprint_text=bp_text, escaleta=doc["segments"], materials=materials)]
    err = next((e for e in reversed(events) if e.get("type") == "error"), None)
    if err:
        raise HTTPException(status_code=502, detail=err.get("message") or "Error de IA.")
    ev = next((e for e in reversed(events) if e.get("type") == "plan_all"), None)
    if not ev:
        raise HTTPException(status_code=502, detail="La IA no devolvió un plan válido.")
    if not (body or {}).get("apply", True):
        return {"segments": ev["segments"], "applied": False}
    res = scene_direction.apply_plan_all(project_id, ev["segments"])
    return {"segments": res["segments"], "changed": res["changed"], "applied": True}


@app.post("/api/projects/{project_id}/scene-direction/auto-split")
def scene_direction_auto_split(project_id: str, body: dict = Body(default={})) -> dict:
    """Propone tramos por frases conservando los ya dirigidos. NO guarda: el editor decide."""
    from . import scene_direction
    proj = _project_or_404(project_id)
    keep = (body or {}).get("segments")
    if isinstance(keep, list):
        keep = scene_direction.normalize_doc({"segments": keep})["segments"]
    else:
        keep = scene_direction.load(proj)["segments"]
    return {"segments": scene_direction.auto_segments(proj, keep=keep)}


@app.post("/api/projects/{project_id}/scene-direction/pack")
def scene_direction_pack(project_id: str, body: dict = Body(default={})) -> dict:
    """Paquete de contexto de UN tramo (sin guardar): lo que recibirá la IA, tal cual."""
    from . import scene_direction
    from .motion import scene
    proj = _project_or_404(project_id)
    body = body or {}
    seg = scene_direction.normalize_segment(body.get("segment"))
    if seg is None:
        raise HTTPException(status_code=400, detail="Tramo inválido.")
    if isinstance(body.get("segments"), list):
        doc = scene_direction.normalize_doc({"segments": body["segments"]})
    else:
        doc = scene_direction.load(proj)
    pack = scene_direction.build_pack(proj, seg, doc)
    text = scene_direction.pack_text(pack)
    pace = scene.PACES.get(str(body.get("pace") or "medio"), scene.PACES["medio"])
    return {"pack": pack, "text": text, "tokens": scene_direction.estimate_tokens(text),
            "skeleton": scene_direction.skeleton_beats(pack, pace=pace),
            "brief_defaults": scene_direction.brief_defaults(pack)}


@app.patch("/api/projects/{project_id}/scene-direction/{segment_id}")
def scene_direction_patch(project_id: str, segment_id: str, body: dict = Body(default={})) -> dict:
    """Actualiza campos de UN tramo (p.ej. estado tras insertar su escena en la timeline)."""
    from . import scene_direction
    _project_or_404(project_id)
    allowed = {"status", "composition_id", "placed_clip_id", "mode", "instruction", "strict", "materials",
               "reference_id", "start", "end", "text", "composition_intent", "complexity", "no_visual",
               "components"}
    try:
        return scene_direction.update_segment(project_id, segment_id,
                                              {k: v for k, v in (body or {}).items() if k in allowed})
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/projects/{project_id}/scene-direction/{segment_id}/place-material")
def scene_direction_place(project_id: str, segment_id: str, body: dict = Body(default={})) -> dict:
    from . import scene_direction
    _project_or_404(project_id)
    try:
        return scene_direction.place_material(project_id, segment_id, (body or {}).get("material"))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/scene-direction/{segment_id}/reuse-scene")
def scene_direction_reuse(project_id: str, segment_id: str) -> dict:
    from . import scene_direction
    _project_or_404(project_id)
    try:
        return scene_direction.reuse_scene(project_id, segment_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/motion/generate/propose")
async def motion_generate_propose(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """Fase de PROPUESTA de 'Generar Motion': la IA propone una idea (JSON) para un
    tramo. Devuelve eventos SSE (start/text/tool_*/proposal/error/done). No toca la
    timeline. El contexto se reconstruye desde la timeline guardada (fuente de verdad)."""
    from .motion import generate, segment_context
    proj = _project_or_404(project_id)
    body = body or {}
    ctx = segment_context.build_segment_context(
        proj, body.get("start"), body.get("end"), body.get("playhead"), body.get("clip_id"))
    stream = generate.sse(project_id, ctx=ctx, hint=(body.get("hint") or ""),
                          frames=bool(body.get("frames")))
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/motion/generate/create")
async def motion_generate_create(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """Fase de GENERACIÓN de 'Generar Motion': la IA crea el BORRADOR de composición
    (con preview) para el tramo, a partir de la idea aprobada. Eventos SSE
    (start/text/tool_*/created/error/done). ``variant_of`` regenera el mismo borrador."""
    from .motion import generate, segment_context
    from .motion import service as motion_service
    proj = _project_or_404(project_id)
    body = body or {}
    proposal = body.get("proposal")
    if not isinstance(proposal, dict):
        raise HTTPException(status_code=400, detail="Falta 'proposal'.")
    # Limpieza oportunista de borradores huérfanos anteriores.
    motion_service.cleanup_generate_drafts(project_id)
    ctx = segment_context.build_segment_context(
        proj, body.get("start"), body.get("end"), body.get("playhead"), body.get("clip_id"))
    stream = generate.create_sse(project_id, ctx=ctx, proposal=proposal,
                                 variant_of=body.get("variant_of"))
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/motion/resource/suggest")
async def motion_resource_suggest(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """«Generar recurso» (§3): la IA analiza el tramo y propone RECURSOS VISUALES
    eligiendo plantillas de la biblioteca. Eventos SSE: start / seed (heurísticas
    instantáneas) / suggestions / done. No toca la timeline."""
    from .motion import resource_ai, segment_context
    proj = _project_or_404(project_id)
    body = body or {}
    ctx = segment_context.build_segment_context(
        proj, body.get("start"), body.get("end"), body.get("playhead"), body.get("clip_id"))
    stream = resource_ai.sse(project_id, ctx=ctx, hint=(body.get("hint") or ""))
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/motion/resource/build")
def motion_resource_build(project_id: str, body: dict = Body(default={})) -> dict:
    """Instancia una plantilla como BORRADOR del tramo (§16: reutilizar antes que
    generar). Sin IA ni render: es inmediato y determinista. Para una sugerencia
    sin plantilla, el cliente usa /motion/generate/create."""
    from .motion import resource_ai
    from .motion import service as motion_service
    _project_or_404(project_id)
    body = body or {}
    template = str(body.get("template") or "").strip()
    if not template:
        raise HTTPException(status_code=400, detail="Falta 'template'.")
    if body.get("start") is None or body.get("end") is None:
        raise HTTPException(status_code=400, detail="Falta el rango del tramo (start/end).")
    motion_service.cleanup_generate_drafts(project_id)
    try:
        return resource_ai.build_from_template(
            project_id, template=template, params=body.get("params") or {},
            for_range={"start": float(body["start"]), "end": float(body["end"])})
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Template desconocido: {exc}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/projects/{project_id}/clip-notes/suggest")
async def clip_notes_suggest(project_id: str, body: dict = Body(default={})) -> StreamingResponse:
    """Propone la nota de contexto de uno o varios clips (§8). Eventos SSE:
    note (por clip) / error / done. NO guarda nada: el usuario corrige y la nota
    se persiste al guardar la timeline."""
    from . import clip_notes
    proj = _project_or_404(project_id)
    body = body or {}
    ids = body.get("clip_ids") or ([body["clip_id"]] if body.get("clip_id") else [])
    ids = [str(x) for x in ids if x][:12]
    if not ids:
        raise HTTPException(status_code=400, detail="Falta 'clip_id' o 'clip_ids'.")
    return StreamingResponse(clip_notes.sse_many(proj, ids), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/motion")
def motion_create(project_id: str, body: dict = Body(default={})) -> dict:
    """Crea una composición: desde template (``template``+``params``) o desde un
    ``composition`` JSON (p.ej. el que genera la IA). Devuelve la composición."""
    from .motion import service as motion_service
    from .motion import templates as motion_templates
    from .motion.models import MotionComposition
    from .motion.validator import MotionValidationError

    _project_or_404(project_id)
    body = body or {}
    cid = motion_service.new_id()
    try:
        if body.get("template"):
            comp = motion_templates.instantiate(body["template"], cid, body.get("params") or {})
        elif body.get("composition"):
            raw = dict(body["composition"])
            raw["id"] = cid
            comp = MotionComposition(**raw)
        else:
            comp = MotionComposition(id=cid, name=body.get("name") or "Motion Graphic",
                                     width=int(body.get("width") or 1080),
                                     height=int(body.get("height") or 1920),
                                     fps=int(body.get("fps") or 30),
                                     duration=float(body.get("duration") or 4.0))
        saved = motion_service.save_composition(project_id, comp, bump=False)
    except MotionValidationError as exc:
        raise HTTPException(status_code=400, detail={"errors": exc.errors})
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return saved.model_dump()


@app.get("/api/projects/{project_id}/motion/{comp_id}")
def motion_get(project_id: str, comp_id: str) -> dict:
    from .motion import service as motion_service
    comp = motion_service.get_composition(project_id, comp_id)
    if comp is None:
        raise HTTPException(status_code=404, detail="Composición no encontrada.")
    return comp.model_dump()


@app.put("/api/projects/{project_id}/motion/{comp_id}")
def motion_update(project_id: str, comp_id: str, body: dict = Body(...)) -> dict:
    from .motion import service as motion_service
    from .motion.models import MotionComposition
    from .motion.validator import MotionValidationError

    _project_or_404(project_id)
    raw = dict(body or {})
    raw["id"] = comp_id
    try:
        comp = MotionComposition(**raw)
        saved = motion_service.save_composition(project_id, comp, bump=True)
    except MotionValidationError as exc:
        raise HTTPException(status_code=400, detail={"errors": exc.errors})
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return saved.model_dump()


@app.delete("/api/projects/{project_id}/motion/{comp_id}")
def motion_delete(project_id: str, comp_id: str) -> dict:
    from .motion import service as motion_service
    ok = motion_service.delete_composition(project_id, comp_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Composición no encontrada.")
    return {"ok": True}


@app.get("/api/projects/{project_id}/motion/{comp_id}/preview.html")
def motion_preview(project_id: str, comp_id: str) -> Response:
    """HTML autocontenido de la composición (el frontend lo carga en un iframe)."""
    from .motion import service as motion_service
    html = motion_service.preview_html(project_id, comp_id)
    if html is None:
        raise HTTPException(status_code=404, detail="Composición no encontrada.")
    return Response(content=html, media_type="text/html; charset=utf-8")


@app.get("/api/projects/{project_id}/motion/{comp_id}/asset")
def motion_asset(project_id: str, comp_id: str) -> FileResponse:
    """WebM (con alfa) renderizado de la versión ACTUAL de la composición, para que el
    preview principal muestre el clip motion. 404 si aún no se ha renderizado."""
    from .motion import service as motion_service
    comp = motion_service.get_composition(project_id, comp_id)
    if comp is None:
        raise HTTPException(status_code=404, detail="Composición no encontrada.")
    path = motion_service.asset_path(project_id, comp)
    if not path.exists():
        raise HTTPException(status_code=404, detail="El motion graphic aún no está renderizado.")
    return FileResponse(path, media_type="video/webm")


@app.post("/api/projects/{project_id}/motion/{comp_id}/render", response_model=Job)
def motion_render(project_id: str, comp_id: str) -> Job:
    from .motion import service as motion_service
    _project_or_404(project_id)
    if motion_service.get_composition(project_id, comp_id) is None:
        raise HTTPException(status_code=404, detail="Composición no encontrada.")
    job = jobs.create_job()
    jobs.start_motion_render_job(job, project_id, comp_id)
    return job


@app.post("/api/projects/{project_id}/motion/{comp_id}/add-to-timeline", response_model=Job)
def motion_add_to_timeline(project_id: str, comp_id: str, body: dict = Body(default={})) -> Job:
    from .motion import service as motion_service
    _project_or_404(project_id)
    if motion_service.get_composition(project_id, comp_id) is None:
        raise HTTPException(status_code=404, detail="Composición no encontrada.")
    body = body or {}
    mode = body.get("mode") or "add"
    if mode not in ("add", "replace"):
        raise HTTPException(status_code=400, detail="mode debe ser 'add' o 'replace'.")
    job = jobs.create_job()
    jobs.start_motion_add_job(job, project_id, comp_id,
                              body.get("track_id"), float(body.get("start") or 0.0),
                              end=body.get("end"), mode=mode,
                              replace_clip_ids=body.get("replace_clip_ids"))
    return job


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


# --- Biblioteca de material reutilizable (colecciones externas) -------

@app.get("/api/collections")
def list_collections() -> dict:
    from . import collections
    return collections.list_collections()


@app.post("/api/collections/root")
def set_collections_root(body: dict = Body(...)) -> dict:
    from . import collections
    path = (body or {}).get("path") or ""
    base = collections.set_root(path)
    if base is None:
        raise HTTPException(status_code=400, detail="Carpeta de material no válida.")
    return collections.list_collections()


@app.get("/api/collections/search")
def search_collections(q: str = "", kind: str = "", collection: str = "") -> dict:
    from . import collections
    return collections.search(q=q, kind=kind, collection=collection)


@app.patch("/api/collections/{cid}")
def update_collection(cid: str, body: dict = Body(...)) -> dict:
    from . import collections
    data = body or {}
    try:
        collections.set_prefs(
            cid,
            enabled=data.get("enabled"),
            favorite=data.get("favorite"),
            label=data.get("label"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return collections.list_collections()


@app.get("/api/collections/file/{ref:path}")
def collection_file(ref: str) -> FileResponse:
    from . import collections
    path = collections.resolve(ref)
    if path is None:
        raise HTTPException(status_code=404, detail="Material no encontrado.")
    return FileResponse(str(path))


@app.get("/api/sticks")
def list_sticks() -> dict:
    """Personajes (colecciones con stick.json) para el menú "Agregar Stick"."""
    from . import stick_library
    return stick_library.list_sticks()


@app.get("/api/sticks/{cid}")
def stick_detail(cid: str) -> dict:
    """Recursos de un stick agrupados por expresión (vídeo/imagen)."""
    from . import stick_library
    try:
        return stick_library.stick_detail(cid)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/letters")
def list_letters() -> dict:
    """Letras recortadas de ``assets/alfnum`` para el texto de Paper Animator."""
    from . import letters
    return letters.library()


@app.get("/api/letters/file/{filename}")
def letter_file(filename: str) -> FileResponse:
    from . import letters
    path = letters.resolve(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Letra no encontrada.")
    return FileResponse(str(path), media_type="image/png")


@app.post("/api/media/reveal")
def reveal_media(req: RevealMediaRequest) -> dict:
    """Abre el explorador de archivos resaltando el material en disco (solo local)."""
    kind_map = {
        "clips": "video", "video": "video",
        "images": "image", "image": "image",
        "audios": "audio", "audio": "audio",
    }
    kind = kind_map.get((req.kind or "").lower())
    if not kind or not req.filename:
        raise HTTPException(status_code=400, detail="Material inválido.")
    if (req.scope or "").lower() == "library":
        path = storage.resolve_library_media(kind, req.filename)
    else:
        proj = projects.get_project(req.project_id or "")
        if proj is None:
            raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
        path = storage.resolve_media(proj, kind, req.filename)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="El archivo no está guardado en disco.")
    if not storage.reveal_path(path):
        raise HTTPException(status_code=500, detail="No se pudo abrir el explorador.")
    return {"ok": True, "path": str(path)}


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
    from . import azure_tts, gemini_tts, piper_tts
    engines = [
        {"id": "gemini", "label": "Gemini (cinematográfico)",
         "available": gemini_tts.available(), "voices": gemini_tts.VOICES,
         "styles": gemini_tts.STYLES,
         "reason": gemini_tts.unavailable_reason()},
        {"id": "azure", "label": "Azure (voces neuronales)",
         "available": azure_tts.available(), "voices": azure_tts.VOICES,
         "reason": azure_tts.unavailable_reason(), "needs_key": True,
         "region": azure_tts.region()},
        {"id": "kokoro", "label": "Kokoro (neutro)",
         "available": tts.available(), "voices": tts.VOICES},
        {"id": "piper", "label": "Piper (español)",
         "available": piper_tts.available(), "voices": piper_tts.list_voices()},
    ]
    # Compatibilidad: 'voices'/'available' apuntan a Kokoro por defecto.
    return {"engines": engines, "voices": tts.VOICES, "available": tts.available()}


@app.post("/api/tts", response_model=Job)
def create_tts(req: TTSRequest) -> Job:
    """Lanza un trabajo en segundo plano para generar el audio del narrador."""
    from . import azure_tts, gemini_tts, piper_tts
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=400, detail="Proyecto no válido.")
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="El texto está vacío.")
    if req.engine == "gemini":
        reason = gemini_tts.unavailable_reason()
        if reason:
            raise HTTPException(status_code=400, detail=reason)
    elif req.engine == "azure":
        reason = azure_tts.unavailable_reason()
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
    if req.resource_type not in ("audio", "clip", "image"):
        raise HTTPException(status_code=400, detail="Tipo no válido.")
    try:
        return library.save_from_project(req.project_id, req.resource_type, req.ident)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Material no encontrado.") from exc


@app.patch("/api/library/{item_id}")
def update_library_item(item_id: str, req: UpdateMaterialRequest) -> dict:
    """Título/descripción de un material guardado (mismo contrato que los del proyecto)."""
    from . import library
    try:
        return library.update_item(item_id, req.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Recurso no encontrado.") from exc


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


@app.post("/api/settings/api-keys/test")
def test_api_keys() -> dict:
    """Prueba TODAS las claves registradas (primaria + extra). No expone valores."""
    from . import keytest
    return keytest.test_all()


@app.post("/api/settings/api-keys/{provider}")
def add_api_key(provider: str, body: dict = Body(...)) -> dict:
    """Añade otra clave al proveedor (extra si ya hay primaria). Devuelve settings públicos."""
    value = (body or {}).get("value") or ""
    try:
        settings.add_key(provider, value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return settings.public()


@app.put("/api/settings/api-keys/{provider}/{index}")
def set_api_key(provider: str, index: int, body: dict = Body(...)) -> dict:
    value = (body or {}).get("value") or ""
    try:
        settings.set_key(provider, index, value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return settings.public()


@app.delete("/api/settings/api-keys/{provider}/{index}")
def delete_api_key(provider: str, index: int) -> dict:
    settings.remove_key(provider, index)
    return settings.public()


# --- Azure AI (Speech STT + Vision) ------------------------------------
#
# Toda credencial vive SOLO en el backend (settings.json o variables de entorno);
# el frontend nunca habla con Azure directamente. Speech reutiliza el mismo
# recurso que el TTS; Vision usa su propio recurso (clave + endpoint).

@app.get("/api/ai/status")
def ai_status() -> dict:
    """Disponibilidad de los servicios Azure (sin exponer claves).

    Speech y Vision son servicios independientes; Foundry es la capa GENERATIVA
    que los complementa (no los reemplaza)."""
    from . import azure_stt, azure_vision, foundry
    return {
        "speech": {
            "available": azure_stt.available(),
            "reason": azure_stt.unavailable_reason(),
            "region": azure_stt.region(),
        },
        "vision": {
            "available": azure_vision.available(),
            "reason": azure_vision.unavailable_reason(),
            "endpoint": azure_vision.endpoint(),
        },
        "foundry": foundry.config_public(),
    }


@app.post("/api/ai/speech/transcribe", response_model=Job)
def ai_speech_transcribe(req: SpeechTranscribeRequest) -> Job:
    """Transcribe un audio del proyecto (Whisper o Azure). Si el audio está en la
    timeline, además crea la pista de subtítulos; siempre deja el ``transcript``."""
    if projects.get_project(req.project_id) is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not req.filename.strip():
        raise HTTPException(status_code=400, detail="Falta el archivo de audio.")
    if req.engine == "azure":
        from . import azure_stt
        reason = azure_stt.unavailable_reason()
        if reason:
            raise HTTPException(status_code=400, detail=reason)
    model = transcribe_settings.resolve(req.model)
    job = jobs.create_job()
    jobs.start_subtitles_job(
        job, req.project_id, req.filename, req.asset_kind, model, req.language,
        req.asset_scope, req.source_clip_id, engine=req.engine,
    )
    return job


def _find_project_image(project, filename: str):
    return next((im for im in project.images if im.filename == filename), None)


def _read_vision_input(file: UploadFile | None, project_id: str | None, filename: str | None):
    """Devuelve (image_bytes, image_info|None). Acepta un archivo subido o una
    imagen del proyecto por nombre. No filtra la clave: solo resuelve la entrada."""
    if file is not None:
        data = file.file.read()
        if not data:
            raise HTTPException(status_code=400, detail="La imagen subida está vacía.")
        return data, None
    if not project_id or not filename:
        raise HTTPException(status_code=400, detail="Falta la imagen (sube un archivo o indica project_id + filename).")
    project = projects.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    info = _find_project_image(project, filename)
    path = storage.resolve_media(project, "image", filename)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="No se encuentra la imagen.")
    return path.read_bytes(), info


@app.post("/api/ai/vision/analyze")
def ai_vision_analyze(
    file: UploadFile | None = File(default=None),
    project_id: str | None = Form(default=None),
    filename: str | None = Form(default=None),
    language: str = Form(default="en"),
    force: bool = Form(default=False),
) -> dict:
    """Análisis de imagen (caption, tags, objects, people, OCR) normalizado.

    Para una imagen del proyecto, reutiliza el análisis previo salvo ``force``
    (evita pagar dos veces a Azure por la misma imagen)."""
    from . import azure_vision
    reason = azure_vision.unavailable_reason()
    if reason:
        raise HTTPException(status_code=400, detail=reason)
    image_bytes, info = _read_vision_input(file, project_id, filename)
    if info is not None and info.analysis and not force:
        return {"analysis": info.analysis, "cached": True}
    try:
        analysis = azure_vision.analyze_image(image_bytes, language=language)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    # Persistir en el material (base para búsqueda semántica futura).
    if info is not None and project_id:
        projects.update_material(project_id, "images", info.id, {"analysis": analysis})
    return {"analysis": analysis, "cached": False}


@app.post("/api/ai/vision/ocr")
def ai_vision_ocr(
    file: UploadFile | None = File(default=None),
    project_id: str | None = Form(default=None),
    filename: str | None = Form(default=None),
    language: str = Form(default="en"),
) -> dict:
    """OCR de una imagen (texto, líneas, palabras, confianza) normalizado."""
    from . import azure_vision
    reason = azure_vision.unavailable_reason()
    if reason:
        raise HTTPException(status_code=400, detail=reason)
    image_bytes, _info = _read_vision_input(file, project_id, filename)
    try:
        ocr = azure_vision.ocr_image(image_bytes, language=language)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ocr": ocr}


# --- Microsoft Foundry (capa de IA GENERATIVA) -------------------------
#
# Complementa Speech y Vision (no los reemplaza). Toda credencial vive SOLO en el
# backend (settings.json o variables de entorno); el frontend nunca habla con
# Foundry. Dos endpoints: ``/chat`` (asistente contextual libre) y ``/generate``
# (operaciones estructuradas: mejorar guion, hooks, títulos, descripción,
# sugerir recursos, prompts visuales, analizar escena).

def _foundry_error_status(code: str) -> int:
    """Mapea el ``code`` del error de Foundry a un status HTTP."""
    return {
        "not_configured": 400, "bad_request": 400, "auth": 502,
        "model_unavailable": 502, "rate_limit": 429, "timeout": 504,
        "network": 502, "upstream": 502,
    }.get(code, 502)


@app.post("/api/ai/foundry/chat")
def ai_foundry_chat(body: dict = Body(...)) -> dict:
    """Asistente contextual (Foundry). Entrada: {message, project_id?, context?}.
    Salida normalizada: {text, model, usage}. Nunca expone credenciales."""
    from . import foundry, foundry_ops
    message = str((body or {}).get("message") or "").strip()
    project_id = (body or {}).get("project_id") or None
    context = (body or {}).get("context") if isinstance((body or {}).get("context"), dict) else None
    language = str((body or {}).get("language") or "es")
    try:
        return foundry_ops.assistant(message, language=language,
                                     project_id=project_id, context=context)
    except foundry.FoundryError as exc:
        raise HTTPException(status_code=_foundry_error_status(exc.code), detail=str(exc)) from exc


@app.post("/api/ai/foundry/generate")
def ai_foundry_generate(body: dict = Body(...)) -> dict:
    """Operaciones generativas estructuradas (Foundry). Entrada:
    {op, text?, message?, mode?, language?, n?, project_id?, context?}.
    Devuelve el resultado normalizado de la operación (nunca modifica el proyecto)."""
    from . import foundry, foundry_ops
    op = str((body or {}).get("op") or "").strip()
    context = (body or {}).get("context") if isinstance((body or {}).get("context"), dict) else None
    try:
        return foundry_ops.run(
            op,
            text=(body or {}).get("text"),
            message=(body or {}).get("message"),
            mode=str((body or {}).get("mode") or "improve"),
            language=str((body or {}).get("language") or "es"),
            n=(body or {}).get("n"),
            project_id=(body or {}).get("project_id") or None,
            context=context,
        )
    except foundry.FoundryError as exc:
        raise HTTPException(status_code=_foundry_error_status(exc.code), detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/ai/analyze-materials", response_model=Job)
def ai_analyze_materials(project_id: str, body: dict = Body(default={})) -> Job:
    """Analiza clips e imágenes con la visión de Foundry y guarda descripción IA +
    metadata semántica (+ descripción/título solo si estaban vacíos o eran genéricos).
    Entrada: {only_missing=true, rename_generic=true, items?:[{kind,id}]}. Devuelve un job;
    el resumen queda en ``job.result``."""
    from . import foundry
    if projects.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    reason = foundry.unavailable_reason()
    if reason:
        raise HTTPException(status_code=400, detail=reason)
    body = body or {}
    refs = body.get("items") if isinstance(body.get("items"), list) else None
    job = jobs.create_job()
    jobs.start_material_analysis_job(job, project_id, {
        "only_missing": bool(body.get("only_missing", True)),
        "rename_generic": bool(body.get("rename_generic", True)),
        "refs": refs,
    })
    return job


# --- Chat IA (agente que opera el MCP existente) -----------------------

@app.get("/api/ai/config")
def ai_config() -> dict:
    """Estado del proveedor de IA + proveedores disponibles (sin exponer keys)."""
    from . import gemini_tts
    cfg = ai_providers.ai_config()
    reason = None
    try:
        reason = ai_providers.get_provider().unavailable_reason()
    except Exception as exc:  # noqa: BLE001
        reason = str(exc)
    labels = {"openai": "OpenAI", "openrouter": "OpenRouter (modelos gratis)",
              "groq": "Groq (gratis)", "cerebras": "Cerebras (gratis)",
              "mistral": "Mistral (gratis)", "huggingface": "Hugging Face (gratis, limitado)",
              "lmstudio": "LM Studio (local)"}
    from . import foundry
    providers = [{"id": "gemini", "label": "Google Gemini",
                  "has_key": bool(gemini_tts.api_key()), "local": False,
                  "default_model": ai_providers.DEFAULT_MODEL},
                 # Endpoint + clave + deployment salen del bloque Microsoft Foundry.
                 {"id": ai_providers.FOUNDRY, "label": "Microsoft Foundry (Azure)",
                  "has_key": foundry.available(), "local": False,
                  "default_model": foundry.deployment()}]
    for pid, spec in ai_providers.OPENAI_COMPATIBLE.items():
        local = spec["key"] is None
        providers.append({"id": pid, "label": labels.get(pid, pid),
                          # Los locales no necesitan key.
                          "has_key": True if local else ai_providers._has_key(spec["key"]),
                          "local": local, "default_model": spec["default_model"]})
    return {"provider": cfg["provider"], "model": cfg["model"], "base_url": cfg.get("base_url"),
            "available": reason is None, "reason": reason, "providers": providers}


@app.get("/api/ai/lmstudio/models")
def ai_lmstudio_models(base_url: str | None = None) -> dict:
    """Modelos LLM de LM Studio via GET /api/v1/models. Si está apagado, ok=false."""
    return ai_providers.list_lmstudio_models(base_url)


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


@app.get("/api/mcp/audit")
def mcp_audit(project_id: str | None = None, limit: int = 80) -> dict:
    """Últimas llamadas a tools del MCP (chat interno o IA externa). Sin valores de params."""
    from .mcp_server import audit
    return {
        "entries": audit.read_recent(limit=limit, project_id=project_id),
        "active": audit.active(project_id),
    }


@app.get("/api/job/{job_id}", response_model=Job)
def job_status(job_id: str) -> Job:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado.")
    return job


@app.delete("/api/job/{job_id}")
def job_cancel(job_id: str) -> dict:
    """Pide cancelar un trabajo (cooperativo, como la tool ``cancel_job`` del MCP).

    El bucle del job aborta en el siguiente tick de progreso, así que lo ya
    calculado queda en su caché y una reanudación posterior lo aprovecha.
    """
    if jobs.get_job(job_id) is None:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado.")
    return {"ok": jobs.request_cancel(job_id)}
