"""Extracción de segmentos POR REFERENCIA y seguimiento de caras cacheado.

El Clip Editor marca rangos (Z/X) sobre un vídeo del material y "Crear clip" los
guarda como materiales nuevos que NO tienen archivo propio: apuntan al archivo del
vídeo original (``filename``) con ``in_point``/``out_point`` en segundos de ese
archivo. Crear diez clips de un vídeo cuesta diez escrituras en el JSON del
proyecto, cero renders; la timeline y el export ya saben recortar por
``in_point``/``out_point``.

El seguimiento de caras de un segmento se guarda en el propio material
(``face_track`` + ``reframe``), en tiempo del archivo: el mismo espacio que
``reframe.keyframes`` de un clip de la timeline, así que se aplica sin traducir y
no se vuelve a analizar mientras el rango no cambie.
"""
from __future__ import annotations

import statistics
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from . import projects, storage
from .schemas import ClipInfo, FaceTrack, Keyframe, Reframe, TrackPoint

ProgressCb = Callable[[float, str], None]

MIN_SEGMENT = 0.3          # s: por debajo no merece la pena un clip
_CACHE_EPS = 0.05          # s: tolerancia para reutilizar un análisis cacheado
_DEADZONE = 0.025          # desplazamiento normalizado que NO mueve la cámara


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def find_clip(project, ident: str) -> ClipInfo | None:
    for c in getattr(project, "clips", None) or []:
        if str(c.index) == str(ident) or (c.id and str(c.id) == str(ident)):
            return c
    return None


def file_range(clip: ClipInfo) -> tuple[float, float]:
    """Rango [in, out] del material en segundos de SU archivo."""
    if clip.in_point is not None and clip.out_point is not None:
        return float(clip.in_point), float(clip.out_point)
    # El archivo ES el clip: start/end pueden ser tiempos del vídeo de YouTube
    # (clips renderizados), así que solo cuenta la duración.
    return 0.0, max(0.0, float(clip.end or 0.0) - float(clip.start or 0.0))


def media_path(project, clip: ClipInfo) -> Path:
    path = storage.resolve_media(project, "video", clip.filename)
    if path is None or not path.exists():
        raise ValueError("El archivo del vídeo no existe en el proyecto.")
    return path


def _next_index(project) -> int:
    existing = [int(getattr(c, "index", 0) or 0) for c in (getattr(project, "clips", None) or [])]
    return max([*existing, 99999]) + 1


def _file_duration(path: Path, fallback: float) -> float:
    try:
        from .youtube_audio import probe_duration
        d = float(probe_duration(path))
        return d if d > 0 else fallback
    except Exception:  # noqa: BLE001
        return fallback


def normalize_ranges(raw: list[dict], file_dur: float) -> list[dict]:
    """Valida y acota los rangos pedidos. Lanza ValueError si alguno no vale."""
    out: list[dict] = []
    for i, seg in enumerate(raw or []):
        try:
            a = float(seg.get("start"))
            b = float(seg.get("end"))
        except (TypeError, ValueError):
            raise ValueError(f"Segmento {i + 1}: start/end no válidos.") from None
        if b < a:
            a, b = b, a
        a = max(0.0, a)
        if file_dur > 0:
            b = min(b, file_dur)
        if b - a < MIN_SEGMENT:
            raise ValueError(f"Segmento {i + 1}: demasiado corto (mínimo {MIN_SEGMENT}s).")
        out.append({**seg, "start": round(a, 3), "end": round(b, 3)})
    if not out:
        raise ValueError("No hay segmentos.")
    return out


def create_segments(project_id: str, source_ident: str, raw: list[dict]) -> list[ClipInfo]:
    """Crea un material por referencia por cada rango. Sin render: instantáneo."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    src = find_clip(proj, source_ident)
    if src is None:
        raise LookupError("Material de vídeo no encontrado.")
    path = media_path(proj, src)
    ranges = normalize_ranges(raw, _file_duration(path, 0.0))

    parent_id = src.parent_id or src.id or str(src.index)
    base_label = (src.label or Path(src.filename).stem or "Clip").strip()
    index = _next_index(proj)
    created: list[ClipInfo] = []
    for n, seg in enumerate(ranges):
        label = (str(seg.get("label") or "").strip()
                 or f"{base_label} · {_mmss(seg['start'])}–{_mmss(seg['end'])}")
        created.append(ClipInfo(
            index=index + n,
            id=uuid.uuid4().hex[:12],
            filename=src.filename,
            url=src.url,
            start=seg["start"],
            end=seg["end"],
            in_point=seg["start"],
            out_point=seg["end"],
            parent_id=str(parent_id),
            source_url=src.source_url,
            label=label,
            description=(str(seg.get("description") or "").strip() or src.description),
            origin="segment",
            source=src.source,
            provider=src.provider,
            author=src.author,
            license_info=src.license_info,
        ))
    projects.add_clips(project_id, created)
    fresh = projects.get_project(project_id)
    ids = {c.id for c in created}
    return [c for c in (fresh.clips if fresh else []) if c.id in ids]


def _mmss(s: float) -> str:
    s = max(0, int(round(s)))
    return f"{s // 60}:{s % 60:02d}"


def is_shared_file(project, filename: str, exclude_ident: Optional[str] = None) -> bool:
    """¿Otro material del proyecto usa este archivo? (un segmento o su origen)."""
    for c in getattr(project, "clips", None) or []:
        if c.filename != filename:
            continue
        if exclude_ident is not None and (str(c.index) == str(exclude_ident) or str(c.id) == str(exclude_ident)):
            continue
        return True
    return False


# --- Seguimiento de caras ---------------------------------------------------

def seed_keyframes(track: list[dict], start: float, end: float) -> list[Keyframe]:
    """Track denso → pocos keyframes estables (movimiento de cámara suave).

    Agrupa las detecciones en ventanas de ~1 s (como mucho ~12 keyframes) y toma
    la MEDIANA de cada ventana, que ignora falsos positivos sueltos. Una zona
    muerta evita que la cámara tiemble por movimientos mínimos de la cabeza.
    """
    dur = max(0.0, end - start)
    if not track:
        return [Keyframe(t=round(start, 3), cx=0.5, cy=0.5)]
    window = max(1.0, dur / 12.0)
    buckets: dict[int, list[dict]] = {}
    for p in track:
        k = int(max(0.0, p["t"] - start) // window)
        buckets.setdefault(k, []).append(p)
    out: list[Keyframe] = []
    for k in sorted(buckets):
        pts = buckets[k]
        cx = statistics.median(p["cx"] for p in pts)
        cy = statistics.median(p["cy"] for p in pts)
        t = min(end, start + (k + 0.5) * window)
        if out and abs(cx - out[-1].cx) < _DEADZONE and abs(cy - out[-1].cy) < _DEADZONE:
            continue
        out.append(Keyframe(t=round(t, 3), cx=round(cx, 4), cy=round(cy, 4)))
    # Extremos anclados: el clip empieza y acaba encuadrado.
    if out[0].t > start + 0.01:
        out.insert(0, Keyframe(t=round(start, 3), cx=out[0].cx, cy=out[0].cy))
    if out[-1].t < end - 0.01:
        out.append(Keyframe(t=round(end, 3), cx=out[-1].cx, cy=out[-1].cy))
    return out


def cached_track(clip: ClipInfo, start: float, end: float) -> FaceTrack | None:
    ft = clip.face_track
    if ft is None:
        return None
    if abs(ft.start - start) <= _CACHE_EPS and abs(ft.end - end) <= _CACHE_EPS:
        return ft
    return None


def face_track_material(project_id: str, ident: str, on_progress: ProgressCb,
                        start: Optional[float] = None, end: Optional[float] = None,
                        samples: int = 0, force: bool = False) -> tuple[FaceTrack, bool]:
    """Analiza (o reutiliza) las caras del material en [start, end] (tiempo de archivo).

    Si el rango es el del propio material, el resultado se guarda en él
    (``face_track`` + ``reframe`` sembrado) para reutilizarlo. Devuelve
    ``(face_track, from_cache)``.
    """
    proj = projects.get_project(project_id)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    clip = find_clip(proj, ident)
    if clip is None:
        raise LookupError("Material de vídeo no encontrado.")
    own_a, own_b = file_range(clip)
    a = own_a if start is None else max(0.0, float(start))
    b = own_b if end is None else float(end)
    if b - a < MIN_SEGMENT:
        raise ValueError("El rango es demasiado corto para analizar caras.")

    if not force:
        hit = cached_track(clip, a, b)
        if hit is not None:
            on_progress(1.0, "Seguimiento reutilizado (ya estaba analizado).")
            return hit, True

    path = media_path(proj, clip)
    on_progress(0.05, "Cargando detector de caras…")
    from . import detect   # import perezoso (opencv)

    info = detect.face_track(path, samples=samples, on_progress=on_progress,
                             start=a, end=b, progress_base=0.08)
    ft = FaceTrack(
        start=round(a, 3), end=round(b, 3),
        width=info["width"], height=info["height"], fps=info["fps"],
        samples=int(info.get("samples") or 0),
        track=[TrackPoint(**p) for p in info["track"]],
        keyframes=seed_keyframes(info["track"], a, b),
        created_at=_now(),
    )
    own = abs(a - own_a) <= _CACHE_EPS and abs(b - own_b) <= _CACHE_EPS
    if own:
        rf = Reframe(**(clip.reframe.model_dump() if clip.reframe else {}))
        rf.keyframes = ft.keyframes
        rf.pan_mode = "smooth"
        rf.face_track_mode = "smooth"
        projects.update_material(project_id, "clips", str(clip.index), {
            "face_track": ft.model_dump(),
            "reframe": rf.model_dump(),
        })
    return ft, False
