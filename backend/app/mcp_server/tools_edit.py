"""Tools de EDICIÓN (Etapa 4): wrappers semánticos sobre timeline_store.

Cada tool traduce verbos del agente a un op estructural y lo aplica de forma
transaccional vía ``timeline_store.apply_op`` (snapshot → aplicar → validar →
guardar, con undo/redo). Son las primeras tools ``write``/``destructive`` → aquí
la política del registry empieza a distinguir niveles.

Resultado uniforme (sin volcar el timeline crudo)::

    {ok, changed, warnings, can_undo, can_redo, checkpoints, timeline: <detalle>}
"""
from __future__ import annotations

from .. import projects, timeline_store
from ..clip_kind import IMAGE_DEFAULT_DUR, track_kind_for_clip
from ..schemas import Timeline
from . import dto
from .registry import MCPError, tool


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise ValueError(f"Proyecto no encontrado: {project_id}")
    return proj


def _edit_result(res: dict) -> dict:
    tl = Timeline(**res["timeline"]) if res.get("timeline") else None
    return {
        "ok": True,
        "changed": list(res.get("changed") or []),
        "warnings": list(res.get("warnings") or []),
        "can_undo": res.get("can_undo", False),
        "can_redo": res.get("can_redo", False),
        "checkpoints": list(res.get("checkpoints") or []),
        "timeline": dto.timeline_detail(tl),
    }


def _apply(project_id: str, op: str, params: dict) -> dict:
    return _edit_result(timeline_store.apply_op(project_id, op, params))


# --- Material → timeline -------------------------------------------------

def _probe_duration(path) -> float:
    """Duración (s) de un archivo de audio vía ffprobe. Fallback 3.0 si falla."""
    import shutil
    import subprocess
    exe = shutil.which("ffprobe")
    if not exe:
        return 3.0
    try:
        r = subprocess.run(
            [exe, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nk=1:nw=1", str(path)],
            capture_output=True, text=True, timeout=10)
        return round(float((r.stdout or "").strip()), 3) or 3.0
    except Exception:  # noqa: BLE001
        return 3.0


def _resolve_asset(proj, asset_kind: str, asset_id: str) -> dict:
    """Resuelve un asset del proyecto a los campos que necesita un clip."""
    if asset_kind == "clips":
        for c in proj.clips:
            if str(c.index) == str(asset_id) or (c.id and str(c.id) == str(asset_id)):
                dur = round((c.end or 0.0) - (c.start or 0.0), 3)
                # Segmento por referencia: el archivo es el vídeo original y el
                # tramo empieza en in_point (in/out del clip se desplazan).
                is_ref = c.in_point is not None and c.out_point is not None
                offset = float(c.in_point) if is_ref else 0.0
                if is_ref:
                    dur = round(float(c.out_point) - float(c.in_point), 3)
                return {"kind": "video", "filename": c.filename,
                        "source_duration": dur, "name": c.label or c.filename,
                        "offset": offset, "segment": is_ref,
                        "reframe": c.reframe.model_dump() if (c.face_track and c.reframe) else None}
        raise ValueError(f"Clip no encontrado en el proyecto: {asset_id}")
    if asset_kind == "audios":
        for a in proj.audios:
            if str(a.id) == str(asset_id):
                return {"kind": "audio", "filename": a.filename,
                        "source_duration": a.duration or 0.0, "name": a.label or a.filename}
        raise ValueError(f"Audio no encontrado en el proyecto: {asset_id}")
    if asset_kind == "images":
        for im in getattr(proj, "images", []) or []:
            if str(im.id) == str(asset_id):
                return {"kind": "image", "filename": im.filename,
                        "source_duration": IMAGE_DEFAULT_DUR,
                        "name": im.label or im.filename}
        raise ValueError(f"Imagen no encontrada en el proyecto: {asset_id}")
    if asset_kind == "sfx":
        from pathlib import Path

        from .. import sfx as sfx_lib
        path = sfx_lib.resolve(asset_id)
        if path is None:
            raise ValueError(f"SFX no encontrado: {asset_id} (usa un id de search_sfx)")
        return {"kind": "audio", "filename": asset_id,
                "source_duration": _probe_duration(path), "name": Path(asset_id).stem}
    raise MCPError("invalid_parameter",
                   f"asset_kind inválido: {asset_kind} (usa clips|audios|images|sfx)",
                   param="asset_kind", retryable=True)


def add_to_timeline(project_id: str, asset_kind: str, asset_id: str,
                    track_id: str | None = None, start: float = 0.0,
                    in_point: float | None = None, out_point: float | None = None) -> dict:
    """Coloca material en la timeline. asset_kind clips|audios|images|sfx + asset_id (index/id o id de search_sfx)."""
    proj = _project_or_raise(project_id)
    info = _resolve_asset(proj, asset_kind, asset_id)
    src_dur = float(info["source_duration"] or 0.0)
    ip = 0.0 if in_point is None else float(in_point)
    op_end = src_dur if out_point is None else float(out_point)
    if op_end <= ip:
        raise ValueError("out_point debe ser > in_point; pasa out_point si el asset no tiene duración conocida")

    created_track: str | None = None
    track_kind = track_kind_for_clip(info["kind"])
    if track_id is None:
        tl = proj.timeline
        existing = next((t for t in (tl.tracks if tl else []) if t.kind == track_kind), None)
        if existing is None:
            tr = timeline_store.apply_op(project_id, "add_track", {"kind": track_kind})
            track_id = tr["changed"][0]
            created_track = track_id
        else:
            track_id = existing.id

    off = float(info.get("offset") or 0.0)
    clip = {
        "track_id": track_id, "kind": info["kind"], "asset_kind": asset_kind,
        "asset_id": str(asset_id), "filename": info["filename"], "name": info["name"],
        "start": float(start), "in_point": round(ip + off, 3), "out_point": round(op_end + off, 3),
        "source_duration": round(src_dur + off, 3),
    }
    if info["kind"] in ("video", "image"):
        clip["layout"] = "fill"
        clip["frame"] = "full"
    if info.get("segment"):
        clip["ref_segment"] = True
    if info.get("reframe"):
        clip["reframe"] = info["reframe"]
    out = _apply(project_id, "add_clip", {"clip": clip})
    if created_track:
        out["changed"] = [created_track, *out["changed"]]
    return out


# --- Clips ---------------------------------------------------------------

def move_clip(project_id: str, clip_id: str, start: float | None = None,
              track_id: str | None = None) -> dict:
    """Mueve un clip: nueva posición (``start``) y/o de pista (``track_id``)."""
    return _apply(project_id, "move_clip", {"clip_id": clip_id, "start": start, "track_id": track_id})


def split_clip(project_id: str, clip_id: str, at_time: float) -> dict:
    """Parte un clip en el instante absoluto ``at_time`` de la timeline."""
    return _apply(project_id, "split_clip", {"clip_id": clip_id, "at_time": at_time})


def freeze_frame(project_id: str, clip_id: str, at_time: float, duration: float = 3.0) -> dict:
    """Congela el fotograma de un vídeo en at_time (s de timeline): parte el clip e inserta una imagen fija de `duration` s con su misma pose/recorte/efectos; desplaza lo que viene detrás."""
    from ..clip_speed import clip_speed
    from ..freeze import freeze_frame_image

    proj = _project_or_raise(project_id)
    tl = proj.timeline
    clip = next((c for c in (tl.clips if tl else []) if c.id == clip_id), None)
    if clip is None:
        raise ValueError(f"Clip inexistente: {clip_id}")
    rel = max(0.0, float(at_time) - clip.start) * clip_speed(clip)
    src = (clip.out_point - rel) if clip.reverse else (clip.in_point + rel)
    image = freeze_frame_image(proj, clip, min(max(src, clip.in_point), clip.out_point))
    return _apply(project_id, "freeze_frame", {
        "clip_id": clip_id, "at_time": float(at_time), "duration": float(duration),
        "image": {"id": image.id, "filename": image.filename, "label": image.label}})


def detect_beats(project_id: str, clip_id: str, every: int = 1) -> dict:
    """Detecta los beats del audio de un clip (audio/vídeo) y los guarda en el clip (imán al ritmo). every=1|2|4 deja uno de cada N."""
    from .. import compose
    from ..beats import detect_beats as _detect

    proj = _project_or_raise(project_id)
    tl = proj.timeline
    clip = next((c for c in (tl.clips if tl else []) if c.id == clip_id), None)
    if clip is None:
        raise ValueError(f"Clip inexistente: {clip_id}")
    path = compose._clip_path(proj, clip)
    if path is None or not path.exists():
        raise ValueError("No se encuentra el archivo del clip.")
    res = _detect(path)
    out = _apply(project_id, "set_clip_beats",
                 {"clip_id": clip_id, "beats": {**res, "every": every}})
    out["beats"] = {"bpm": res["bpm"], "count": len(res["times"])}
    return out


def set_timeline_markers(project_id: str, markers: list) -> dict:
    """Sustituye los marcadores de la timeline: [{t (s), label?, color?}]. [] los borra."""
    return _apply(project_id, "set_markers", {"markers": markers})


def paste_clip_attributes(project_id: str, source_clip_id: str, target_clip_ids: list,
                          groups: list | None = None) -> dict:
    """Pega atributos de un clip en otros (un solo undo). groups: transform, flip, blend, animation, transitions, crop, effects, mask, chroma, style, speed, audio (None = todos los que apliquen)."""
    return _apply(project_id, "paste_clip_attributes", {
        "source_clip_id": source_clip_id, "target_clip_ids": list(target_clip_ids or []),
        "groups": groups})


def track_object(project_id: str, clip_id: str, box: dict, at_time: float,
                 follower_clip_id: str | None = None, mode: str = "position_scale") -> dict:
    """Sigue un objeto de un clip de vídeo: box = {cx, cy, w, h} en 0–1 del fotograma FUENTE en at_time (s de timeline; míralo con get_frame). Con follower_clip_id ese clip (texto, figura, imagen…) lo acompaña; mode position|position_scale|position_scale_rotation. Devuelve job (wait_for_job)."""
    from .. import jobs
    from ..clip_speed import clip_speed
    from ..object_track import FOLLOW_MODES

    proj = _project_or_raise(project_id)
    tl = proj.timeline
    clip = next((c for c in (tl.clips if tl else []) if c.id == clip_id), None)
    if clip is None:
        raise ValueError(f"Clip inexistente: {clip_id}")
    if clip.kind != "video":
        raise ValueError("solo se siguen objetos de un clip de vídeo")
    try:
        bx = {k: float(box[k]) for k in ("cx", "cy", "w", "h")}
    except (KeyError, TypeError, ValueError):
        raise ValueError("box debe ser {cx, cy, w, h} en 0–1") from None
    if follower_clip_id is not None:
        if mode not in FOLLOW_MODES:
            raise ValueError(f"mode debe ser uno de {list(FOLLOW_MODES)}")
        if not any(c.id == follower_clip_id for c in tl.clips):
            raise ValueError(f"Clip inexistente: {follower_clip_id}")
    rel = max(0.0, float(at_time) - clip.start) * clip_speed(clip)
    src = (clip.out_point - rel) if clip.reverse else (clip.in_point + rel)
    src = min(max(src, clip.in_point), clip.out_point)
    follow = ({"follower_clip_id": follower_clip_id, "anchor_t": float(at_time), "mode": mode}
              if follower_clip_id else None)
    job = jobs.create_job()
    jobs.start_object_track_job(job, project_id, clip.model_dump(), bx, src, follow)
    return dto.job_dto(job)


def sound_design(project_id: str, clip_id: str, apply: bool = True) -> dict:
    """Sonoriza una escena con IA: propone SFX de la biblioteca (viento, pasos, un helicóptero…) según lo que se ve/dice en el clip y, con apply, los coloca en pistas SFX. Devuelve job (wait_for_job); result.missing = lo que no está en la biblioteca."""
    from .. import jobs

    proj = _project_or_raise(project_id)
    tl = proj.timeline
    clip = next((c for c in (tl.clips if tl else []) if c.id == clip_id), None)
    if clip is None:
        raise ValueError(f"Clip inexistente: {clip_id}")
    if clip.kind not in ("video", "image"):
        raise ValueError("sound_design funciona con clips de vídeo o imagen")
    job = jobs.create_job()
    jobs.start_sound_design_job(job, project_id, clip.model_dump(), bool(apply))
    return dto.job_dto(job)


def add_adjustment_layer(project_id: str, start: float = 0.0, duration: float = 5.0,
                         filters: list | None = None, effects: dict | None = None,
                         intensity: float = 1.0) -> dict:
    """Capa de ajuste: filtra TODO lo de debajo (vídeos, imágenes, figuras; no textos) de start a start+duration. filters=[{id, amount}] (ver set_clip_effects), effects = brightness|contrast|saturation|exposure|whites|temperature|hue; intensity 0–1."""
    return _apply(project_id, "add_adjustment_layer", {
        "start": start, "duration": duration, "filters": filters, "effects": effects, "intensity": intensity})


def add_cinema_bars(project_id: str, ratio: str = "2.39", start: float = 0.0,
                    duration: float | None = None, animate: bool = False) -> dict:
    """Barras de cine (letterbox) encima de todo: ratio 2.39|2|1.85|16:9 (o un número) = proporción de lo que queda visible. Sin duration, hasta el final. animate = entran en 1 s."""
    return _apply(project_id, "add_cinema_bars",
                  {"ratio": ratio, "start": start, "duration": duration, "animate": animate})


def apply_recipe(project_id: str, recipe: str, clip_ids: list | None = None,
                 params: dict | None = None) -> dict:
    """Receta en un clic (un truco completo, un solo undo): cinema_grade (etalonaje + barras), text_reflection (texto con reflejo; clip_ids = textos), pass_through_text (el texto se atraviesa), film_strips (≥2 vídeos/imágenes en franjas al ritmo), subject_pop (un vídeo: el sujeto recortado se adelanta; luego genera su recorte IA). params: zoom_time, frames."""
    return _apply(project_id, "apply_recipe",
                  {"recipe": recipe, "clip_ids": list(clip_ids or []), "params": dict(params or {})})


def remove_clip(project_id: str, clip_id: str) -> dict:
    """Elimina un clip de la timeline (deshacible con undo)."""
    return _apply(project_id, "remove_clip", {"clip_id": clip_id})


def update_clip(project_id: str, clip_id: str, patch: dict) -> dict:
    """Actualiza propiedades escalares de un clip en UNA operación. patch: opacity(0–1),
    speed(0.1–10)/keep_pitch/reverse, appear/exit, position(full|top|bottom|free)/start/duration,
    role(caption|free), note (qué representa el fragmento en la historia; "" la borra),
    flip_h/flip_v (voltear en horizontal/vertical: vídeo, imagen, figura o texto),
    blend_mode (normal|darken|multiply|color_burn|lighten|screen|color_dodge|overlay|
    soft_light|hard_light|difference|exclusion), disabled (true = desactivado: sigue en la
    timeline pero no se ve, no suena ni se exporta).
    Para efectos/audio_fx/volumen/keyframes usa sus tools propias."""
    return _apply(project_id, "update_clip", {"clip_id": clip_id, "patch": patch})


def reframe_clip(project_id: str, clip_id: str, mode: str = "center", zoom: float | None = None,
                 pan_from: dict | None = None, pan_to: dict | None = None) -> dict:
    """Encuadre de FUENTE de un clip: mode center (zoom) o manual (zoom + paneo {cx,cy}). No es animación."""
    return _apply(project_id, "reframe_clip",
                  {"clip_id": clip_id, "mode": mode, "zoom": zoom, "pan_from": pan_from, "pan_to": pan_to})


def crop_clip(project_id: str, clip_ids: list[str] | None = None, track_id: str | None = None,
              reset: bool = False, cx: float | None = None, cy: float | None = None,
              w: float | None = None, h: float | None = None) -> dict:
    """Recorte fijo (modal Recortar) de clips visuales libres: ventana cx,cy,w,h (0-1) o reset=true. clip_ids y/o track_id."""
    return _apply(project_id, "crop_clip",
                  {"clip_ids": clip_ids, "track_id": track_id, "reset": reset,
                   "cx": cx, "cy": cy, "w": w, "h": h})


def add_subtitles(project_id: str, source_clip_id: str, segments: list,
                  track_id: str | None = None, transcript_id: str | None = None,
                  style: dict | None = None) -> dict:
    """Crea clips de subtítulos (words[] reales) desde segments, alineados al clip fuente."""
    return _apply(project_id, "add_subtitles",
                  {"source_clip_id": source_clip_id, "segments": segments,
                   "track_id": track_id, "transcript_id": transcript_id, "style": style})


def set_project_format(project_id: str, aspect: str | None = None, resolution: int | None = None,
                       width: int | None = None, height: int | None = None,
                       fps: int | None = None) -> dict:
    """Formato de salida: ``aspect`` (16:9/9:16/1:1/4:3/3:4/4:5), ``resolution`` (480/720/1080/2160), o w/h; y fps."""
    return _apply(project_id, "set_project_format",
                  {"aspect": aspect, "resolution": resolution, "width": width,
                   "height": height, "fps": fps})


# --- Propiedades por-clip (Etapa 4.5) ------------------------------------

def set_clip_effects(project_id: str, clip_id: str, effects: dict | None = None, replace: bool = False,
                     filters: list | None = None) -> dict:
    """Efectos visuales: blur|grayscale|sepia|brightness|contrast|saturation|exposure|whites|temperature|hue (MERGE). filters = pila de filtros de color [{id, amount 0–1}] en orden (sustituye; [] los quita). Solo visuales."""
    return _apply(project_id, "set_clip_effects",
                  {"clip_id": clip_id, "effects": effects, "replace": replace, "filters": filters})


def set_clip_masks(project_id: str, clip_id: str, masks: list | None = None) -> dict:
    """Sustituye las máscaras del clip (tipos linear|film|circle|rectangle|star|heart|text|brush; target clip|adjust)."""
    return _apply(project_id, "set_clip_masks", {"clip_id": clip_id, "masks": masks})


def set_clip_audio_fx(project_id: str, clip_id: str, audio_fx: dict, replace: bool = False,
                      ramp: dict | None = None) -> dict:
    """Efectos de audio (0–1): eq|compressor|reverb|echo|denoise|distortion y filtros underwater|telephone|radio|megaphone|muffled. MERGE; solo vídeo/audio. ramp={start,end,from=0} (s del clip) los anima."""
    return _apply(project_id, "set_clip_audio_fx",
                  {"clip_id": clip_id, "audio_fx": audio_fx, "replace": replace, "ramp": ramp})


def set_clip_volume(project_id: str, clip_id: str, volume: float | None = None,
                    muted: bool | None = None, fade: str | None = None,
                    fade_dur: float = 0.5) -> dict:
    """Volumen del clip (0–2; 1=100%), muted y fade in|out (crea keyframes, no recorta el audio)."""
    return _apply(project_id, "set_clip_volume",
                  {"clip_id": clip_id, "volume": volume, "muted": muted,
                   "fade": fade, "fade_dur": fade_dur})


def set_track_audio(project_id: str, track_id: str, volume: float | None = None,
                    muted: bool | None = None, audio_fx: dict | None = None,
                    fade: str | None = None, fade_dur: float = 0.5) -> dict:
    """Volumen/mute/fx/fade a TODOS los clips de una pista. Úsalo para 'esa línea'/'esa pista'."""
    return _apply(project_id, "set_track_audio",
                  {"track_id": track_id, "volume": volume, "muted": muted,
                   "audio_fx": audio_fx, "fade": fade, "fade_dur": fade_dur})


def set_clip_keyframes(project_id: str, clip_id: str, keyframes: dict | None) -> dict:
    """Keyframes {enabled, items:[{id,t,interpolation,bezier?,props}]} o None (curvas: help://clips). Escape hatch experto: prefiere animate_clip."""
    return _apply(project_id, "set_clip_keyframes", {"clip_id": clip_id, "keyframes": keyframes})


def _follow_audio_envelope(project_id: str, clip_id: str, follow_audio_id: str):
    """Muestrea el RMS del clip de audio/SFX y lo alinea al clip visual."""
    from .. import clip_motion, compose
    from ..clip_speed import clip_timeline_duration

    proj = _project_or_raise(project_id)
    tl = proj.timeline
    if tl is None:
        raise ValueError("el proyecto no tiene timeline")
    visual = next((c for c in tl.clips if c.id == clip_id), None)
    audio = next((c for c in tl.clips if c.id == follow_audio_id), None)
    if visual is None:
        raise ValueError(f"Clip inexistente: {clip_id}")
    if audio is None:
        raise ValueError(f"Clip de audio inexistente: {follow_audio_id}")
    if audio.kind not in ("audio", "video"):
        raise ValueError("follow_audio_id debe ser un clip de audio, SFX o vídeo con sonido")
    path = compose._clip_path(proj, audio)
    if path is None or not path.exists():
        raise ValueError("no se encuentra el archivo de audio para seguir")
    warnings: list[str] = []
    ov = clip_motion.overlap_window(visual, audio)
    if ov is None:
        warnings.append("el audio no se solapa con el clip; se usa desde el inicio del audio")
        src = audio.in_point
        dur = min(clip_timeline_duration(audio), clip_timeline_duration(visual))
        samples = clip_motion.sample_rms_envelope(path, src, dur)
        env = [(t, amp) for t, amp in samples]
    else:
        lo, hi = ov
        src = clip_motion.audio_src_at(audio, lo)
        samples = clip_motion.sample_rms_envelope(path, src, hi - lo)
        v0 = visual.start or 0.0
        env = [(round(lo - v0 + t, 3), amp) for t, amp in samples]
    return env, warnings


def animate_clip(project_id: str, clip_id: str, motion: str, duration: float | None = None,
                 follow_audio_id: str | None = None, intensity: float = 1.0,
                 turns: float = 1.0) -> dict:
    """Anima un clip (el servidor genera los keyframes). motion: zoom_in|zoom_out|spin|spin_in|slide_left|slide_right|slide_up|slide_down|fade_in|fade_out|pop|pulse|draw_in (figuras: el trazo se dibuja; duration = s que tarda). follow_audio_id: sigue el volumen de un clip de audio/SFX."""
    envelope = None
    extra_warn: list[str] = []
    if follow_audio_id:
        envelope, extra_warn = _follow_audio_envelope(project_id, clip_id, follow_audio_id)
    res = _apply(project_id, "animate_clip", {
        "clip_id": clip_id, "motion": motion, "duration": duration,
        "intensity": intensity, "turns": turns, "envelope": envelope,
    })
    if extra_warn:
        res["warnings"] = list(res.get("warnings") or []) + extra_warn
    return res


def duplicate_clip(project_id: str, clip_id: str, start: float | None = None) -> dict:
    """Duplica un clip (por defecto justo detrás del original en su pista)."""
    return _apply(project_id, "duplicate_clip", {"clip_id": clip_id, "start": start})


# --- Figuras / material nuevo --------------------------------------------

def add_shape(project_id: str, shape: dict | None = None, track_id: str | None = None,
              start: float = 0.0, duration: float | None = None, points: list | None = None) -> dict:
    """Añade una figura vectorial (rect/línea/flecha/estrella…) a una pista de vídeo. shape = {type, fill, stroke, strokeWidth, dash: solid|dash|dot, …}. Trazado libre: points = [[x, y], …] en 0–1 del cuadro (shape.closed/smooth opcionales)."""
    return _apply(project_id, "add_shape",
                  {"shape": shape, "track_id": track_id, "start": start, "duration": duration,
                   "points": points})


# --- Pistas --------------------------------------------------------------

def add_track(project_id: str, kind: str, name: str | None = None) -> dict:
    """Añade una pista (kind video|audio|text). name opcional (SFX, Voz…); por defecto A1/A2/V1…"""
    return _apply(project_id, "add_track", {"kind": kind, "name": name})


def rename_track(project_id: str, track_id: str, name: str) -> dict:
    """Renombra una pista. El id no cambia; el nombre es lo que se ve (A1, SFX, Voz…)."""
    return _apply(project_id, "rename_track", {"track_id": track_id, "name": name})


def reorder_track(project_id: str, track_id: str, target_track_id: str, place: str = "above") -> dict:
    """Cambia el orden de capas: pone la pista justo encima (place=above) o debajo
    (below) de target_track_id, como se ve en la timeline. Vídeo y texto comparten
    pila: un texto debajo de un vídeo queda DETRÁS (texto detrás de una persona:
    vídeo completo abajo, texto encima y el vídeo con el fondo eliminado arriba)."""
    return _apply(project_id, "reorder_track", {"track_id": track_id, "target_track_id": target_track_id, "place": place})


def remove_track(project_id: str, track_id: str) -> dict:
    """Elimina una pista y todos sus clips (deshacible con undo)."""
    return _apply(project_id, "remove_track", {"track_id": track_id})


def link_tracks(project_id: str, track_id: str, to_track_id: str) -> dict:
    """Liga una pista a otra (audio↔texto: al cambiar velocidad, la ligada se escala)."""
    return _apply(project_id, "link_tracks", {"track_id": track_id, "to_track_id": to_track_id})


def unlink_track(project_id: str, track_id: str) -> dict:
    """Desliga una pista."""
    return _apply(project_id, "unlink_track", {"track_id": track_id})


# --- Historial -----------------------------------------------------------

def undo(project_id: str) -> dict:
    """Deshace la última operación estructural."""
    return _edit_result(timeline_store.undo(project_id))


def redo(project_id: str) -> dict:
    """Rehace la última operación deshecha."""
    return _edit_result(timeline_store.redo(project_id))


def checkpoint(project_id: str, name: str) -> dict:
    """Marca un punto seguro con nombre al que volver con ``restore_checkpoint``."""
    return _edit_result(timeline_store.checkpoint(project_id, name))


def restore_checkpoint(project_id: str, name: str) -> dict:
    """Vuelve al timeline guardado en un checkpoint (también es deshacible)."""
    return _edit_result(timeline_store.restore_checkpoint(project_id, name))


def register(mcp) -> None:
    tool(mcp, access="write")(add_to_timeline)
    tool(mcp, access="write")(move_clip)
    tool(mcp, access="write")(split_clip)
    tool(mcp, access="destructive")(remove_clip)
    tool(mcp, access="write")(update_clip)
    tool(mcp, access="write")(freeze_frame)
    tool(mcp, access="write")(detect_beats)
    tool(mcp, access="write")(set_timeline_markers)
    tool(mcp, access="write")(paste_clip_attributes)
    tool(mcp, access="write")(track_object)
    tool(mcp, access="write")(sound_design)
    tool(mcp, access="write")(add_adjustment_layer)
    tool(mcp, access="write")(add_cinema_bars)
    tool(mcp, access="write")(apply_recipe)
    tool(mcp, access="write")(reframe_clip)
    tool(mcp, access="write")(crop_clip)
    tool(mcp, access="write")(add_subtitles)
    tool(mcp, access="write")(set_project_format)
    # Etapa 4.5 — propiedades por-clip + figuras.
    tool(mcp, access="write")(set_clip_effects)
    tool(mcp, access="write")(set_clip_masks)
    tool(mcp, access="write")(set_clip_audio_fx)
    tool(mcp, access="write")(set_clip_volume)
    tool(mcp, access="write")(set_track_audio)
    tool(mcp, access="write")(set_clip_keyframes)
    tool(mcp, access="write")(animate_clip)
    tool(mcp, access="write")(duplicate_clip)
    tool(mcp, access="write")(add_shape)
    tool(mcp, access="write")(add_track)
    tool(mcp, access="write")(rename_track)
    tool(mcp, access="write")(reorder_track)
    tool(mcp, access="destructive")(remove_track)
    tool(mcp, access="write")(link_tracks)
    tool(mcp, access="write")(unlink_track)
    tool(mcp, access="write")(undo)
    tool(mcp, access="write")(redo)
    tool(mcp, access="write")(checkpoint)
    tool(mcp, access="write")(restore_checkpoint)
