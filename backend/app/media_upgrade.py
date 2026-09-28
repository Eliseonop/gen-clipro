"""Cambiar la versión ligera de un vídeo por la de más calidad en la timeline.

Flujo: se edita rápido con una versión ligera (un tramo guardado desde el Clip
Editor, el vídeo en 480p/720p…), después se baja el vídeo COMPLETO en máxima
calidad y aquí se detectan las otras versiones del mismo vídeo de YouTube y se
cambian todos los clips que las usaban, conservando cortes, encuadre y
animaciones. La operación de timeline (``timeline_ops.replace_media``) va por
``timeline_store`` → se deshace con undo.

Tiempo: cada archivo empieza en un segundo del vídeo ORIGINAL (su offset): un
vídeo completo en 0; un tramo guardado desde YouTube, en su ``start``. Al
cambiar de archivo, lo que va en tiempo de archivo se desplaza la diferencia.

Imagen: el encuadre va normalizado (0-1), así que vale para cualquier
resolución si la PROPORCIÓN coincide. Un recorte 9:16 horneado desde un 16:9
no es la misma imagen → incompatible (no se toca).
"""
from __future__ import annotations

from pathlib import Path

from . import projects, storage
from .schemas import ClipInfo
from .youtube_audio import is_youtube_url, youtube_id_from_url

_ASPECT_TOL = 0.02      # 2 %: 1920x1080 vs 854x480 (redondeos de YouTube)
_RANGE_TOL = 1.0        # s: el tramo puede pasarse un poco del final (redondeos)


def _find_material(project, ident) -> ClipInfo | None:
    key = str(ident)
    for c in project.clips or []:
        if str(c.index) == key or (c.id and str(c.id) == key):
            return c
    return None


def _file_owner(project, filename: str) -> ClipInfo | None:
    """Material dueño del archivo (no un segmento por referencia)."""
    for c in project.clips or []:
        if c.filename == filename and c.in_point is None:
            return c
    return None


def youtube_id(project, clip: ClipInfo) -> str | None:
    if clip.provider == "youtube" and clip.external_id:
        return str(clip.external_id)
    if clip.source_url and is_youtube_url(clip.source_url):
        vid = youtube_id_from_url(clip.source_url)
        if vid:
            return vid
    if clip.in_point is not None:              # segmento: el del vídeo del que sale
        owner = _file_owner(project, clip.filename)
        if owner is not None and owner is not clip:
            return youtube_id(project, owner)
    return None


def file_offset(owner: ClipInfo) -> float:
    """Segundo del vídeo original en el que empieza el archivo del material."""
    return max(0.0, float(owner.start or 0.0))


def file_duration(owner: ClipInfo) -> float:
    return max(0.0, float(owner.end or 0.0) - float(owner.start or 0.0))


def _dims(project, clip: ClipInfo) -> tuple[int, int]:
    path = storage.resolve_media(project, "video", clip.filename)
    if path is None or not Path(path).exists():
        return 0, 0
    try:
        from .detect import dims
        return dims(Path(path))
    except Exception:  # noqa: BLE001 - sin medidas se omite el chequeo de proporción
        return 0, 0


def _short(w: int, h: int) -> int | None:
    return min(w, h) if w and h else None


def _timeline_uses(project) -> dict[str, int]:
    uses: dict[str, int] = {}
    tl = project.timeline
    for c in (tl.clips if tl else []):
        if c.asset_kind == "clips" and (c.asset_scope or "project") == "project":
            uses[c.filename] = uses.get(c.filename, 0) + 1
    return uses


def _full_frame(rf) -> bool:
    """El encuadre guardado del material deja el fotograma ENTERO (sin zoom ni
    recorte). Con la misma proporción que la fuente —lo mira ``_check``— el
    archivo es la imagen completa aunque el reframe no sea «master»."""
    if rf is None or rf.master:
        return True
    if rf.dual_crop or (rf.crop_w or 1.0) < 0.999 or (rf.crop_h or 1.0) < 0.999:
        return False
    zooms = [rf.zoom, *[k.zoom for k in rf.keyframes if k.zoom is not None]]
    return all(z >= 0.999 for z in zooms)


def _check(old: ClipInfo, old_dims, new: ClipInfo, new_dims) -> str | None:
    """Motivo por el que ``old`` NO se puede cambiar por ``new`` (None = se puede)."""
    if not _full_frame(old.reframe):
        return "tiene el encuadre horneado (zoom o recorte guardado)"
    (ow, oh), (nw, nh) = old_dims, new_dims
    if ow and oh and nw and nh:
        ro, rn = ow / oh, nw / nh
        if abs(ro - rn) / rn > _ASPECT_TOL:
            return f"otra proporción ({ow}×{oh} frente a {nw}×{nh})"
    new_off, new_dur = file_offset(new), file_duration(new)
    start = file_offset(old) - new_off
    if start < -0.05:
        return "empieza antes que el vídeo nuevo"
    if new_dur and start + file_duration(old) > new_dur + _RANGE_TOL:
        return "dura más que el vídeo nuevo"
    return None


def find_versions(pid: str, ident) -> dict:
    """Otras versiones del MISMO vídeo que ``ident`` en el proyecto.

    Cada una: {index, label, quality, offset, timeline_uses, lower, compatible,
    reason}. ``lower`` = menos resolución que ``ident`` (candidata a mejorar).
    """
    project = projects.get_project(pid)
    if project is None:
        raise LookupError("Proyecto no encontrado.")
    new = _find_material(project, ident)
    if new is None or new.in_point is not None:
        raise LookupError("Material de vídeo no encontrado (usa el vídeo completo, no un segmento).")
    vid = youtube_id(project, new)
    new_dims = _dims(project, new)
    new_q = _short(*new_dims)
    uses = _timeline_uses(project)
    versions = []
    if vid:
        for c in project.clips or []:
            if c is new or c.in_point is not None or c.filename == new.filename:
                continue
            if youtube_id(project, c) != vid:
                continue
            d = _dims(project, c)
            q = _short(*d)
            reason = _check(c, d, new, new_dims)
            versions.append({
                "index": c.index,
                "id": c.id,
                "label": c.label or Path(c.filename).stem,
                "filename": c.filename,
                "quality": q,
                "offset": round(file_offset(c), 3),
                "duration": round(file_duration(c), 3),
                "timeline_uses": uses.get(c.filename, 0),
                "lower": bool(q and new_q and q < new_q),
                "compatible": reason is None,
                "reason": reason,
            })
    versions.sort(key=lambda v: (-v["timeline_uses"], v["offset"]))
    return {
        "material": {"index": new.index, "id": new.id, "label": new.label, "quality": new_q,
                     "youtube_id": vid},
        "versions": versions,
        "upgradable": [v for v in versions if v["compatible"] and v["lower"]],
    }


def replace_with(pid: str, ident, old_idents: list | None = None) -> dict:
    """Pone ``ident`` en la timeline en lugar de sus otras versiones.

    Sin ``old_idents`` → todas las versiones de MENOS calidad compatibles. Con
    ``old_idents`` → esas (aunque no sean del mismo vídeo de YouTube, p. ej. un
    archivo local): se exige igualmente que sean compatibles. Los segmentos por
    referencia de esas versiones pasan también al archivo nuevo.
    """
    from . import timeline_store

    project = projects.get_project(pid)
    if project is None:
        raise LookupError("Proyecto no encontrado.")
    new = _find_material(project, ident)
    if new is None or new.in_point is not None:
        raise LookupError("Material de vídeo no encontrado (usa el vídeo completo, no un segmento).")
    new_dims = _dims(project, new)

    if old_idents:
        olds = []
        for oid in old_idents:
            c = _find_material(project, oid)
            if c is None:
                raise LookupError(f"Material no encontrado: {oid}")
            owner = c if c.in_point is None else _file_owner(project, c.filename) or c
            if owner.filename == new.filename:
                raise ValueError("No se puede reemplazar un material por sí mismo.")
            reason = _check(owner, _dims(project, owner), new, new_dims)
            if reason:
                raise ValueError(f"«{owner.label or owner.filename}» no se puede cambiar: {reason}.")
            if owner not in olds:
                olds.append(owner)
    else:
        info = find_versions(pid, ident)
        keep = {v["filename"] for v in info["upgradable"]}
        olds = [c for c in project.clips or [] if c.filename in keep and c.in_point is None]
    if not olds:
        return {"ok": True, "replaced": 0, "changed": [], "versions": [], "segments": 0,
                "warnings": ["no hay versiones de menos calidad que cambiar"]}

    new_off = file_offset(new)
    sources = [{"filename": o.filename, "delta": round(file_offset(o) - new_off, 3)} for o in olds]
    target = {"asset_id": str(new.index), "filename": new.filename,
              "duration": file_duration(new), "media_version": new.created_at}

    uses = _timeline_uses(project)
    res = None
    if any(uses.get(s["filename"]) for s in sources):
        res = timeline_store.apply_op(pid, "replace_media", {"sources": sources, "target": target})

    segments = _retarget_segments(pid, project, sources, new)
    return {
        "ok": True,
        "replaced": len(res["changed"]) if res else 0,
        "changed": res["changed"] if res else [],
        "warnings": res["warnings"] if res else [],
        "versions": [{"index": o.index, "label": o.label, "offset": file_offset(o)} for o in olds],
        "segments": segments,
        "can_undo": res["can_undo"] if res else None,
    }


def _retarget_segments(pid: str, project, sources: list[dict], new: ClipInfo) -> int:
    """Los segmentos por referencia de las versiones viejas pasan al archivo nuevo."""
    deltas = {s["filename"]: s["delta"] for s in sources}
    n = 0
    for c in project.clips or []:
        if c.in_point is None or c.filename not in deltas:
            continue
        d = deltas[c.filename]
        fields = {
            "filename": new.filename,
            "url": new.url,
            "parent_id": str(new.id or new.index),
            "in_point": round(float(c.in_point) + d, 3),
            "out_point": round(float(c.out_point or c.end) + d, 3),
            "start": round(float(c.start) + d, 3),
            "end": round(float(c.end) + d, 3),
        }
        if c.face_track is not None:
            ft = c.face_track.model_dump()
            ft["start"] = round(ft["start"] + d, 3)
            ft["end"] = round(ft["end"] + d, 3)
            for key in ("track", "keyframes"):
                for p in ft.get(key) or []:
                    p["t"] = round(p["t"] + d, 3)
            fields["face_track"] = ft
        projects.update_material(pid, "clips", str(c.index), fields)
        n += 1
    return n


def youtube_sources(pid: str, url: str | None = None) -> dict[str, str]:
    """{youtube_id: url} a mejorar: el de ``url``, o los que usa la timeline."""
    if url:
        vid = youtube_id_from_url(url) if is_youtube_url(url) else None
        if not vid:
            raise ValueError("URL de YouTube no válida.")
        return {vid: url.strip()}
    project = projects.get_project(pid)
    if project is None:
        raise LookupError("Proyecto no encontrado.")
    out: dict[str, str] = {}
    for fname in _timeline_uses(project):
        owner = _file_owner(project, fname)
        if owner is None:
            continue
        vid = youtube_id(project, owner)
        if vid and vid not in out:
            src = owner.source_url if owner.source_url and is_youtube_url(owner.source_url) else None
            out[vid] = src or f"https://www.youtube.com/watch?v={vid}"
    return out


def best_full_version(pid: str, vid: str) -> tuple[ClipInfo, int | None] | None:
    """El vídeo COMPLETO de más resolución del proyecto para ``vid`` (bajado con
    «Agregar vídeo completo»), o None."""
    project = projects.get_project(pid)
    if project is None:
        return None
    best = None
    for c in project.clips or []:
        if c.in_point is not None or c.provider != "youtube" or file_offset(c) > 0.05:
            continue
        if youtube_id(project, c) != vid:
            continue
        q = _short(*_dims(project, c))
        if best is None or (q or 0) > (best[1] or 0):
            best = (c, q)
    return best
