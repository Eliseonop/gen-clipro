"""Recetas en un clic (#21): los trucos del vídeo «10 CapCut Tricks» montados de una vez
con las piezas del editor (#1–#20). Cada receta es UNA operación de timeline
(deshacible) que usan igual el botón del editor y el MCP.

Recetas: ``cinema_grade`` (truco 10), ``text_reflection`` (7), ``pass_through_text`` (6),
``film_strips`` (3) y ``subject_pop`` (1). Ver docs/RECETAS.md.
"""
from __future__ import annotations

import copy
import uuid
from typing import Any, Optional

RECIPES: tuple[dict, ...] = (
    {"id": "cinema_grade", "label": "Etalonaje de cine", "trick": 10, "needs": None,
     "desc": "Capa de ajuste (naranja y turquesa + desvaído) sobre todo el vídeo y barras de cine que entran."},
    {"id": "text_reflection", "label": "Texto con reflejo", "trick": 7, "needs": "text",
     "desc": "Una copia volteada debajo del texto, que se desvanece, en modo Superponer."},
    {"id": "pass_through_text", "label": "Texto que atraviesas", "trick": 6, "needs": "text",
     "desc": "Al final del clip el texto crece hasta ×60: la cámara lo atraviesa."},
    {"id": "film_strips", "label": "Franjas al ritmo", "trick": 3, "needs": "media2",
     "desc": "Cada clip seleccionado en una franja horizontal (rollo de película), entrando uno tras otro "
             "en los beats de la música (o cada 0,35 s)."},
    {"id": "subject_pop", "label": "Sujeto que se adelanta", "trick": 1, "needs": "video",
     "desc": "El sujeto del clip, recortado con IA, aparece unos fotogramas antes que su plano, con un "
             "destello blanco y sonido de transición."},
)
RECIPE_IDS = tuple(r["id"] for r in RECIPES)
_BY_ID = {r["id"]: r for r in RECIPES}

FILM_MAX = 6
FILM_STEP = 0.35
POP_FRAMES = 6
ZOOM_TO = 60.0


def _uid(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def _end(tl) -> float:
    from .timeline_ops import _clip_tl_dur
    return max((c.start + _clip_tl_dur(c) for c in tl.clips), default=0.0)


def _need(tl, clip_ids: list, kinds: tuple, n_min: int = 1, n_max: int = 99) -> list:
    ids = set(clip_ids or [])
    ok = [c for c in tl.clips if c.id in ids and c.kind in kinds]
    if len(ok) < n_min:
        what = ("al menos 2 clips de vídeo o imagen" if n_min > 1
                else {"text": "un texto", "video": "un vídeo"}.get(kinds[0], "un clip"))
        raise ValueError(f"esta receta necesita {what} seleccionado")
    return ok[:n_max]


def _insert_track(tl, after_track_id: Optional[str], kind: str, name: str):
    from .schemas import TimelineTrack
    t = TimelineTrack(id=_uid("K"), kind=kind, name=name)
    idx = next((i for i, x in enumerate(tl.tracks) if x.id == after_track_id), None)
    if idx is None:
        idx = max((i for i, x in enumerate(tl.tracks) if x.kind == kind), default=len(tl.tracks) - 1)
    tl.tracks.insert(idx + 1, t)
    return t


# --- Recetas -------------------------------------------------------------------------

def _cinema_grade(tl, clip_ids, params) -> tuple[Any, list, list]:
    from .timeline_ops import add_adjustment_layer, add_cinema_bars
    end = _end(tl) or 5.0
    r = add_adjustment_layer(tl, 0.0, end, filters=[{"id": "teal_orange", "amount": 0.7},
                                                    {"id": "faded", "amount": 0.25}])
    wide = tl.width / tl.height >= 1
    r2 = add_cinema_bars(r.timeline, "2.39" if wide else "16:9", animate=True)
    return r2.timeline, [*r.changed, *r2.changed], []


def _text_reflection(tl, clip_ids, params) -> tuple[Any, list, list]:
    from .clip_mask import normalize_mask
    from .schemas import TimelineClip
    from .text_ass import _font_px, _line_height, _rows

    changed: list = []
    for c in _need(tl, clip_ids, ("text",)):
        st = dict(c.style or {})
        rows = _rows(st, tl.width, tl.height, c.text or "")
        block = len(rows) * _font_px(st, tl.height) * _line_height(st) / tl.height
        y = float(st.get("y", 0.5))
        data = copy.deepcopy(c.model_dump())
        data.update(id=_uid("c"), dup_of=c.id, flip_v=not c.flip_v, blend_mode="overlay",
                    name=f"{c.name or 'Texto'} (reflejo)")
        data["style"] = {**st, "y": round(y + block, 4), "opacity": 0.6 * float(st.get("opacity", 1) or 1)}
        # Solo se ve la parte cercana al texto: una máscara lineal que se funde hacia abajo.
        data["masks"] = [normalize_mask({"type": "linear", "x": 0.5, "y": round(y + block, 4),
                                         "feather": 0.12, "id": _uid("m")})]
        kf = data.get("keyframes")
        if isinstance(kf, dict) and kf.get("items"):
            for it in kf["items"]:
                if isinstance(it.get("props"), dict) and "y" in it["props"]:
                    it["props"]["y"] = round(float(it["props"]["y"]) + block, 4)
                if isinstance(it.get("props"), dict) and "my" in it["props"]:
                    it["props"]["my"] = round(float(it["props"]["my"]) + block, 4)
        track = _insert_track(tl, None, "text", "Reflejo")
        data["track_id"] = track.id
        tl.clips.append(TimelineClip.model_validate(data))
        changed += [track.id, data["id"]]
    return tl, changed, []


def _pass_through_text(tl, clip_ids, params) -> tuple[Any, list, list]:
    from .clip_keyframes import clip_props_at, upsert_keyframe_at
    from .schemas import TimelineClip
    from .timeline_ops import _clip_tl_dur

    changed: list = []
    for c in _need(tl, clip_ids, ("text",)):
        dur = _clip_tl_dur(c)
        z = min(float(params.get("zoom_time", 1.0) or 1.0), dur * 0.8)
        data = c.model_dump()
        base = clip_props_at(data, max(0.0, dur - z))
        data = upsert_keyframe_at(data, 0.0, {})
        data = upsert_keyframe_at(data, round(dur - z, 4), {})
        # Mismo tramo y misma curva: crece despacio y al final «atraviesa», apagándose.
        data = upsert_keyframe_at(data, round(dur, 4), {"scale": base["scale"] * ZOOM_TO, "opacity": 0.0}, "cubic-in")
        i = next(j for j, x in enumerate(tl.clips) if x.id == c.id)
        tl.clips[i] = TimelineClip.model_validate(data)
        changed.append(c.id)
    return tl, changed, []


def _beat_times(tl) -> list[float]:
    from .clip_speed import clip_speed
    out = []
    for c in tl.clips:
        b = c.beats if isinstance(c.beats, dict) else None
        if not b or c.disabled:
            continue
        every = max(1, int(b.get("every") or 1))
        sp = clip_speed(c)
        for k, t in enumerate(b.get("times") or []):
            if k % every or not (c.in_point <= t <= c.out_point):
                continue
            rel = (c.out_point - t) if c.reverse else (t - c.in_point)
            out.append(round(c.start + rel / sp, 4))
    return sorted(out)


def _film_strips(tl, clip_ids, params) -> tuple[Any, list, list]:
    from .clip_mask import normalize_mask

    clips = sorted(_need(tl, clip_ids, ("video", "image"), 2, FILM_MAX), key=lambda c: (c.start, c.id))
    n = len(clips)
    s0 = min(c.start for c in clips)
    beats = [t for t in _beat_times(tl) if t >= s0 - 1e-3]
    starts = beats[:n] if len(beats) >= n else [round(s0 + i * FILM_STEP, 4) for i in range(n)]
    warnings = [] if len(beats) >= n else ["sin beats suficientes: entran cada 0,35 s (detecta los beats de la música para que entren a ritmo)"]
    changed: list = []
    prev_track = None
    for i, c in enumerate(clips):
        track = _insert_track(tl, prev_track, "video", f"Franja {i + 1}")
        prev_track = track.id
        c.track_id = track.id
        c.start = starts[i]
        c.layout = "overlay"
        c.frame = "free"
        c.transform = {**(c.transform or {}), "x": 0.5, "y": 0.5}
        c.masks = [normalize_mask({"type": "film", "x": 0.5, "y": round((i + 0.5) / n, 4), "w": 1.0,
                                   "h": round(1 / n, 4), "id": _uid("m")})]
        c.appear = "slide_left" if i % 2 == 0 else "slide_right"
        changed += [track.id, c.id]
    return tl, changed, warnings


def _subject_pop(tl, clip_ids, params) -> tuple[Any, list, list]:
    from . import sfx as sfx_lib
    from .clip_keyframes import upsert_keyframe_at
    from .clip_speed import clip_speed
    from .schemas import TimelineClip
    from .shapes import normalize_shape
    from .sound_design import match_sounds, probe_duration
    from .timeline_ops import _top_free_video_track, add_sound_design

    v = _need(tl, clip_ids, ("video",))[0]
    fps = max(1, int(tl.fps or 30))
    lead = max(1, int(params.get("frames", POP_FRAMES) or POP_FRAMES)) / fps
    start = max(0.0, v.start - lead)
    lead = v.start - start
    if lead <= 0:
        raise ValueError("el clip empieza en 0: no hay plano anterior sobre el que adelantar el sujeto")
    dur = lead + 0.3
    sp = clip_speed(v)
    data = copy.deepcopy(v.model_dump())
    track = _insert_track(tl, v.track_id, "video", "Sujeto")
    from .clip_bg import provider_mask_height, recommended_provider

    prov = recommended_provider(v)          # vídeo → RVM: el sujeto es una persona
    data.update(id=_uid("c"), dup_of=v.id, track_id=track.id, start=round(start, 4),
                out_point=round(min(v.out_point, v.in_point + dur * sp), 4), name=f"{v.name or 'Vídeo'} (sujeto)",
                bg_removal={"enabled": True, "mode": "auto",
                            "auto": {"enabled": True, "status": "idle", "provider": prov,
                                     "mask_height": provider_mask_height(prov)}})
    if v.reverse:
        data["in_point"] = round(max(v.in_point, v.out_point - dur * sp), 4)
        data["out_point"] = v.out_point
    dup = TimelineClip.model_validate(data)
    tl.clips.append(dup)
    changed = [track.id, dup.id]

    # Destello blanco en el corte: «barras» que cubren todo el cuadro, de 1 a 0.
    created: list = []
    ftrack = _top_free_video_track(tl, v.start, 0.25, created)
    flash = TimelineClip(id=_uid("c"), track_id=ftrack.id, kind="shape", asset_kind="shape", asset_id="letterbox",
                         filename="", name="Destello", start=round(v.start, 4), in_point=0.0, out_point=0.25,
                         source_duration=0.25, layout="fill", frame="full",
                         shape=normalize_shape({"type": "letterbox", "bar": 0.5, "fill": "#ffffff"})).model_dump()
    flash = upsert_keyframe_at(flash, 0.0, {"opacity": 0.9})
    flash = upsert_keyframe_at(flash, 0.25, {"opacity": 0.0}, "ease-out")
    tl.clips.append(TimelineClip.model_validate(flash))
    changed += [*created, flash["id"]]

    warnings = [f"genera el recorte IA del clip «{dup.name}» (Eliminar fondo) para que se vea solo el sujeto"]
    lib = sfx_lib.search("", limit=100000).get("items") or []
    wanted = [{"what": "Subida", "kind": "spot", "keywords": ["riser", "whoosh", "swoosh", "rise"],
               "start": 0.0, "duration": 0.8, "volume": 0.7},
              {"what": "Obturador", "kind": "spot", "keywords": ["shutter", "camera", "click", "snap"],
               "start": 0.0, "duration": 0.5, "volume": 0.8}]
    matched, missing = match_sounds(wanted, lib)
    if matched:
        for m in matched:
            path = sfx_lib.resolve(m["sfx"]["id"])
            m["sfx"]["duration"] = probe_duration(path) if path else 0.0
        r = add_sound_design(tl, dup.id, matched)
        tl = r.timeline
        changed += r.changed
    if missing:
        warnings.append("no hay en tu biblioteca: " + ", ".join(m["what"].lower() for m in missing))
    return tl, changed, warnings


_APPLY = {
    "cinema_grade": _cinema_grade,
    "text_reflection": _text_reflection,
    "pass_through_text": _pass_through_text,
    "film_strips": _film_strips,
    "subject_pop": _subject_pop,
}


def apply(tl, recipe: str, clip_ids: Optional[list] = None, params: Optional[dict] = None):
    """Aplica la receta sobre una COPIA de ``tl``: (timeline, cambiados, avisos)."""
    if recipe not in _BY_ID:
        raise ValueError(f"receta desconocida: {recipe} (usa {list(RECIPE_IDS)})")
    return _APPLY[recipe](tl, list(clip_ids or []), dict(params or {}))
