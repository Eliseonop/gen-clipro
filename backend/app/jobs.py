"""Gestor de trabajos en memoria.

Cada petición de clips crea un Job con un id. El procesado corre en segundo
plano y el frontend consulta el progreso por polling. Es un almacén simple en
memoria; si más adelante quieres persistencia o varios workers, se sustituye
por Redis/Celery sin tocar la API.
"""
from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone

from . import clipper, projects
from .schemas import (
    AudioInfo,
    ClipRequest,
    ComposeClipRequest,
    Job,
    JobStatus,
    TranscribeRequest,
    Transcript,
    TranscriptSegment,
    TTSRequest,
    YouTubeAudioRequest,
)

_jobs: dict[str, Job] = {}
_lock = threading.Lock()
log = logging.getLogger("videoyt.jobs")


class JobCancelled(Exception):
    """Se lanza dentro del bucle de un job cuando se pidió cancelarlo."""


def create_job() -> Job:
    job = Job(id=uuid.uuid4().hex[:12])
    with _lock:
        _jobs[job.id] = job
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def all_jobs() -> list[Job]:
    """Todos los jobs conocidos (en memoria, este proceso)."""
    return list(_jobs.values())


def request_cancel(job_id: str) -> bool:
    """Pide cancelar un job (cooperativo). Devuelve False si no existe o ya terminó.

    Marca ``cancel_requested``; el bucle del job aborta en el siguiente
    ``on_progress`` (best-effort: no interrumpe un FFmpeg ya en marcha hasta el
    siguiente tick de progreso).
    """
    job = _jobs.get(job_id)
    if job is None or job.status in (JobStatus.done, JobStatus.error):
        return False
    job.cancel_requested = True
    return True


def _run(job_id: str, req: ClipRequest, title: str) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from . import storage

        project = projects.get_project(req.project_id)
        base = storage.ensure_dirs(storage.project_base(project))

        clips = clipper.generate_clips(
            url=req.url,
            segments=req.segments,
            mode=req.crop_mode,
            title=title,
            project_id=req.project_id,
            video_dir=base / "video",
            on_progress=on_progress,
            reframe=req.reframe,
            volume=req.volume,
            muted=req.muted,
            audio_keyframes=req.audio_keyframes,
            out_w=req.width,
            out_h=req.height,
        )
        projects.add_clips(req.project_id, clips)   # persistir en el proyecto
        job.clips = clips
        job.progress = 1.0
        job.message = f"{len(clips)} clip(s) generados."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001 - queremos reportar cualquier fallo
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error durante el procesado."


def start_job(job: Job, req: ClipRequest, title: str) -> None:
    thread = threading.Thread(target=_run, args=(job.id, req, title), daemon=True)
    thread.start()


def _run_compose(job_id: str, req: ComposeClipRequest) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from . import compose_clip, storage

        project = projects.get_project(req.project_id)
        base = storage.ensure_dirs(storage.project_base(project))
        index = req.index if req.index is not None else (100000 + int(datetime.now(timezone.utc).timestamp()) % 900000)
        clip = compose_clip.generate_composition(
            project_id=req.project_id,
            layers=req.layers,
            label=req.label,
            description=req.description,
            index=index,
            video_dir=base / "video",
            on_progress=on_progress,
        )
        projects.add_clips(req.project_id, [clip])
        job.clips = [clip]
        job.progress = 1.0
        job.message = "Clip compuesto generado."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error al componer el clip."


def start_compose_job(job: Job, req: ComposeClipRequest) -> None:
    thread = threading.Thread(target=_run_compose, args=(job.id, req), daemon=True)
    thread.start()


def _mmss(s: float) -> str:
    s = int(s)
    return f"{s // 60}:{s % 60:02d}"


def _run_transcribe(job_id: str, req: TranscribeRequest, title: str) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from . import storage, transcribe, transcribe_settings   # import perezoso (faster-whisper)

        model = transcribe_settings.resolve(req.model)
        result = transcribe.run(req.url, model, req.language, on_progress)
        segments = [TranscriptSegment(**s) for s in result["segments"]]

        # Guardar el guion en disco, con el título del vídeo como prefijo.
        project = projects.get_project(req.project_id)
        base = storage.ensure_dirs(storage.project_base(project))
        prefix = storage.safe_name(title)
        fpath = base / "video" / f"{prefix}.guion.txt"
        header = f"{title}\n{req.url}\n\n"
        body = "\n".join(f"[{_mmss(s.start)}] {s.text}" for s in segments)
        fpath.write_text(header + body, encoding="utf-8")

        tr = Transcript(
            id=uuid.uuid4().hex[:8],
            source_url=req.url,
            title=title,
            model=model,
            language=result["language"],
            duration=result["duration"],
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            file=str(fpath),
            segments=segments,
        )
        projects.add_transcript(req.project_id, tr)
        job.transcript = tr
        job.progress = 1.0
        job.message = f"Guion listo ({len(tr.segments)} líneas)."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error durante la transcripción."


def start_transcribe_job(job: Job, req: TranscribeRequest, title: str) -> None:
    thread = threading.Thread(target=_run_transcribe, args=(job.id, req, title), daemon=True)
    thread.start()


def _run_clip_transcribe(job_id: str, pid: str, index: str, model: str, language) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from . import storage, transcribe, transcribe_settings

        project = projects.get_project(pid)
        clip = next((c for c in project.clips if str(c.index) == str(index)), None)
        if clip is None:
            raise RuntimeError("Clip no encontrado.")
        path = storage.resolve_media(project, "video", clip.filename)
        if path is None or not path.exists():
            raise RuntimeError("No se encuentra el archivo del clip.")

        model = transcribe_settings.resolve(model)
        result = transcribe.run_file(str(path), model, language, on_progress)
        segs = [TranscriptSegment(**s) for s in result["segments"]]
        tr = Transcript(
            id=uuid.uuid4().hex[:8],
            source_url=clip.source_url,
            title=clip.label or clip.filename,
            model=model,
            language=result["language"],
            duration=result["duration"],
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            segments=segs,
        )
        projects.update_material(pid, "clips", str(index), {"transcript": tr.model_dump()})
        job.transcript = tr
        job.progress = 1.0
        job.message = f"Guion del clip ({len(segs)} líneas)."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error transcribiendo el clip."


def start_clip_transcribe_job(job: Job, pid: str, index: str, model: str, language) -> None:
    thread = threading.Thread(target=_run_clip_transcribe, args=(job.id, pid, index, model, language), daemon=True)
    thread.start()


def _run_tts(job_id: str, req: TTSRequest) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from urllib.parse import quote

        from . import gemini_tts, piper_tts, storage, tts

        project = projects.get_project(req.project_id)
        base = storage.ensure_dirs(storage.project_base(project))

        aid = uuid.uuid4().hex[:8]
        stem = storage.safe_name(req.name or req.text[:40] or "audio")
        filename = f"{stem}_{aid}.wav"
        out_path = base / "audio" / filename

        if req.engine == "piper":
            engine = piper_tts
        elif req.engine == "gemini":
            engine = gemini_tts
        else:
            engine = tts
        info = engine.run(
            req.text, req.voice, req.speed, out_path, on_progress,
            voice2=req.voice2, blend=req.blend, pause=req.pause,
            style=req.style,
        )

        audio = AudioInfo(
            id=aid,
            filename=filename,
            url=f"/api/media/{req.project_id}/audio/{quote(filename)}",
            engine=req.engine,
            voice=req.voice,
            voice2=req.voice2 if req.engine == "kokoro" else None,
            blend=req.blend if (req.engine == "kokoro" and req.voice2) else None,
            speed=req.speed,
            pause=req.pause,
            text=req.text,
            duration=info["duration"],
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            origin="tts",
            source="generated",
        )
        projects.add_audio(req.project_id, audio)
        job.audio = audio
        job.progress = 1.0
        job.message = f"Audio generado ({info['duration']}s)."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error generando el audio."


def start_tts_job(job: Job, req: TTSRequest) -> None:
    thread = threading.Thread(target=_run_tts, args=(job.id, req), daemon=True)
    thread.start()


def _run_youtube_audio(job_id: str, req: YouTubeAudioRequest) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running
    out_path = None

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from urllib.parse import quote

        from . import storage, youtube_audio

        project = projects.get_project(req.project_id)
        if project is None:
            raise RuntimeError("Proyecto no encontrado.")
        base = storage.ensure_dirs(storage.project_base(project))
        aid = uuid.uuid4().hex[:8]
        stem = storage.safe_name(req.name or "youtube")
        filename = f"{stem}_{aid}.m4a"
        out_path = base / "audio" / filename
        result = youtube_audio.extract_audio(req.url, out_path, on_progress)
        stem2 = storage.safe_name(req.name or result.get("title") or "youtube")
        filename2 = f"{stem2}_{aid}.m4a"
        dest2 = base / "audio" / filename2
        if dest2 != out_path:
            try:
                out_path.replace(dest2)
                out_path = dest2
                filename = filename2
            except Exception:
                pass
        audio = AudioInfo(
            id=aid,
            filename=filename,
            url=f"/api/media/{req.project_id}/audio/{quote(filename)}",
            origin="youtube",
            source="external",
            youtube_url=req.url,
            youtube_id=result.get("video_id") or youtube_audio.youtube_id_from_url(req.url),
            label=req.name or result.get("title") or None,
            duration=result.get("duration"),
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )
        projects.add_audio(req.project_id, audio)
        job.audio = audio
        job.progress = 1.0
        job.message = f"Audio extraído ({audio.duration or 0}s)."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        if out_path is not None:
            try:
                if out_path.exists():
                    out_path.unlink()
            except Exception:
                pass
        from . import ytdlp
        job.status = JobStatus.error
        job.error = ytdlp.friendly_error(exc)
        job.message = "Error extrayendo el audio."


def start_youtube_audio_job(job: Job, req: YouTubeAudioRequest) -> None:
    thread = threading.Thread(target=_run_youtube_audio, args=(job.id, req), daemon=True)
    thread.start()


def _run_reframe_prepare(job_id: str, url: str, start: float, end: float, samples: int,
                         track_faces: bool = True) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running
    job.progress = 0.01
    job.message = "Iniciando preparación del clip…"

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        on_progress(0.02, "Cargando FFmpeg y detector de caras…")
        from . import reframe   # import perezoso (yt-dlp + opencv)

        prep = reframe.prepare(url, start, end, samples, on_progress, track_faces=track_faces)
        job.reframe_prep = prep
        job.progress = 1.0
        n = len(prep.track or [])
        if track_faces:
            job.message = (
                f"Listo · {n} detecciones de cara."
                if n
                else "Listo · no se detectaron caras (puedes encuadrar a mano)."
            )
        else:
            job.message = "Previsualización lista."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error preparando el editor de reencuadre."


def start_reframe_prepare_job(job: Job, url: str, start: float, end: float, samples: int,
                              track_faces: bool = True) -> None:
    thread = threading.Thread(
        target=_run_reframe_prepare, args=(job.id, url, start, end, samples, track_faces), daemon=True
    )
    thread.start()


def _run_export(job_id: str, pid: str, timeline_dict: dict) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from datetime import datetime
        from urllib.parse import quote

        from . import compose, migrations, storage
        from .schemas import Timeline

        project = projects.get_project(pid)
        if project is None:
            raise RuntimeError("Proyecto no encontrado.")

        raw_tl = migrations.migrate_timeline(timeline_dict) if timeline_dict else None
        timeline = Timeline(**raw_tl) if raw_tl else project.timeline
        if timeline is None or not timeline.clips:
            raise RuntimeError("No hay nada en la timeline para exportar.")

        # Persistir la timeline usada, para no perder la edición.
        # Si Windows tiene el JSON bloqueado, el render sigue igual.
        try:
            projects.save_timeline(pid, timeline.model_dump())
        except OSError as exc:
            log.warning("No se pudo guardar la timeline antes de exportar: %s", exc)

        base = storage.ensure_dirs(storage.project_base(project))
        exports = base / "exports"
        exports.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"final_{stamp}.mp4"
        out_path = exports / filename

        compose.render(project, timeline, out_path, on_progress)

        job.export_url = f"/api/projects/{pid}/exports/{quote(filename)}"
        job.progress = 1.0
        job.message = "Vídeo final exportado."
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error exportando el vídeo final."


def start_export_job(job: Job, pid: str, timeline_dict: dict) -> None:
    thread = threading.Thread(target=_run_export, args=(job.id, pid, timeline_dict), daemon=True)
    thread.start()


# --- Workflows de alto nivel (shorts) -----------------------------------

def _run_short(job_id: str, builder, kwargs: dict, done_msg: str) -> None:
    """Runner común para los workflows de short: corre ``builder`` con progreso."""
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from . import shorts

        fn = getattr(shorts, builder)
        result = fn(on_progress=on_progress, **kwargs)
        job.export_url = result.get("export_url")
        job.progress = 1.0
        job.message = done_msg
        job.status = JobStatus.done
    except JobCancelled:
        job.status = JobStatus.error
        job.message = "Cancelado."
        job.error = "cancelado"
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error creando el short."


def start_short_youtube_job(job: Job, pid: str, params: dict) -> None:
    kwargs = {"pid": pid, **params}
    thread = threading.Thread(
        target=_run_short,
        args=(job.id, "build_short_from_youtube", kwargs, "Short de YouTube listo."),
        daemon=True,
    )
    thread.start()


def start_short_library_job(job: Job, pid: str, params: dict) -> None:
    kwargs = {"pid": pid, **params}
    thread = threading.Thread(
        target=_run_short,
        args=(job.id, "build_short_from_library", kwargs, "Short de biblioteca listo."),
        daemon=True,
    )
    thread.start()


def _find_timeline_clip_by_filename(pid: str, filename: str) -> str | None:
    """Id del clip de la timeline (audio/vídeo) cuyo archivo coincide con ``filename``."""
    proj = projects.get_project(pid)
    tl = getattr(proj, "timeline", None)
    if tl is None:
        return None
    for c in (tl.clips or []):
        if c.filename == filename and c.kind in ("audio", "video"):
            return c.id
    return None


def _run_subtitles(job_id: str, pid: str, filename: str, asset_kind: str, model: str, language,
                   asset_scope: str = "project", source_clip_id: str | None = None) -> None:
    job = _jobs[job_id]
    job.status = JobStatus.running

    def on_progress(frac: float, message: str) -> None:
        if job.cancel_requested:
            raise JobCancelled("cancelado")
        job.progress = round(frac, 3)
        job.message = message

    try:
        from . import sfx, storage, timeline_store, transcribe, transcribe_settings

        project = projects.get_project(pid)
        if project is None:
            raise RuntimeError("Proyecto no encontrado.")
        if asset_kind == "sfx":
            path = sfx.resolve(filename)
        elif (asset_scope or "project") == "library":
            path = storage.resolve_library_media("audio" if asset_kind == "audios" else "video", filename)
        else:
            path = storage.resolve_media(project, "audio" if asset_kind == "audios" else "video", filename)
        if path is None or not path.exists():
            raise RuntimeError("No se encuentra el archivo de audio.")

        model = transcribe_settings.resolve(model)
        result = transcribe.run_file(str(path), model, language, on_progress)
        segs = [TranscriptSegment(**s) for s in result["segments"]]
        tr = Transcript(
            id=uuid.uuid4().hex[:8],
            title=filename,
            model=model,
            language=result["language"],
            duration=result["duration"],
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            segments=segs,
        )
        job.transcript = tr

        # Escribir la pista de subtítulos en la timeline (lo que el usuario espera):
        # sin esto el job quedaba "done" con la transcripción SOLO en el job y nada
        # aparecía en la timeline. Alineamos al clip fuente (por id o por filename).
        src_id = source_clip_id or _find_timeline_clip_by_filename(pid, filename)
        if src_id:
            res = timeline_store.apply_op(pid, "add_subtitles", {
                "source_clip_id": src_id,
                "segments": [s.model_dump() for s in segs],
                "transcript_id": tr.id,
            })
            n_clips = len(res.get("changed") or [])
            job.message = f"Subtítulos añadidos a la timeline ({len(segs)} líneas, {n_clips} clips)."
        else:
            job.message = (f"Transcripción lista ({len(segs)} líneas), pero el audio no está en la "
                           f"timeline: no se creó la pista. Añade el audio a una pista y reintenta.")

        job.progress = 1.0
        job.status = JobStatus.done
    except Exception as exc:  # noqa: BLE001
        job.status = JobStatus.error
        job.error = str(exc)
        job.message = "Error generando subtítulos."


def start_subtitles_job(job: Job, pid: str, filename: str, asset_kind: str, model: str, language,
                        asset_scope: str = "project", source_clip_id: str | None = None) -> None:
    thread = threading.Thread(
        target=_run_subtitles,
        args=(job.id, pid, filename, asset_kind, model, language, asset_scope, source_clip_id),
        daemon=True,
    )
    thread.start()
