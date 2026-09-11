"""Renderizado del vídeo final a partir de la timeline del editor.

Compone toda la línea de tiempo (clips de vídeo en sus pistas, con su
reencuadre/keyframes, + pistas de audio mezcladas) en un único MP4 vertical
9:16 usando un solo ``ffmpeg`` con ``-filter_complex``.

Estrategia:
  * Cada clip de vídeo se recorta a su fragmento ``[in, out]``, se le aplica su
    reframe (reutilizando la lógica de ``clipper``), se escala a 720x1280 y se
    coloca en su instante de la timeline (``setpts``). Se apilan por orden de
    pista (las pistas superiores tapan a las inferiores) y, en la misma pista,
    por el orden de la lista (el último queda encima) con ``overlay`` sobre un
    fondo negro, activándose solo durante su ventana temporal.
  * Cada clip de audio (de pista de audio, o de un clip de vídeo cuya pista no
    esté silenciada) se recorta, se retrasa a su instante (``adelay``), se ajusta
    de volumen y se mezcla todo con ``amix``.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Optional

from . import clipper, config, gpu, sfx, storage
from .clip_fx import _scale_expr, audio_fx_chain, fx_windows, overlay_xy_for_fx, video_fx_chain
from .clip_keyframes import keyframes_enabled, volume_filter
from .clip_bg import auto_active, bg_active, bg_capable, chroma_active, chroma_filters, clip_bg
from .clip_mask import build_timeline_masks, has_mask, maskable
from .schemas import Keyframe, Project, Reframe, Timeline, TimelineClip
from .clip_layout import dest_rect_even, is_overlay, source_crop_px
from .diagnostics import timed
from .recipe_layout import contain_scale_filter, dual_slot_wh, join_dual_filters, split_orientation_for
from .reframe_math import frame_at
from .clip_audio import clip_mixes_audio
from .clip_kind import ASSET_DISK_KIND, clip_fits_track, ffmpeg_input_args, ffmpeg_trim_window, is_still_clip
from .clip_speed import audio_speed_filters, clip_source_duration, clip_timeline_duration, video_speed_filters
from .text_ass import ass_filter_path, build_ass
from .shapes import rasterize_timeline_shapes

ProgressCb = Callable[[float, str], None]


def _ffmpeg_export_error(stderr: str | None, returncode: int) -> str:
    code = returncode & 0xFFFFFFFF
    if code == 0xC0000005:
        return "FFmpeg se cerró de forma inesperada al exportar."
    text = (stderr or "").replace("\r", "\n")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip() and not ln.strip().startswith("frame=")]
    # La causa REAL (p. ej. un fallo al configurar el filtergraph) se imprime
    # ANTES del teardown ("Could not open encoder before EOF", "Nothing was
    # written…"). Quedarse solo con las últimas líneas oculta el motivo, así que
    # priorizamos las líneas que sí explican el error.
    _SIGNALS = ("error", "invalid", "failed", "undefined", "no such",
                "cannot", "unable", "not found", "does not")
    _NOISE = ("could not open encoder before eof", "terminating thread",
              "task finished with error code", "nothing was written",
              "conversion failed", "at least one of its streams")
    causes = [
        ln for ln in lines
        if any(s in ln.lower() for s in _SIGNALS)
        and not any(nz in ln.lower() for nz in _NOISE)
    ]
    picked = causes[:4] if causes else lines[-6:]
    tail = "\n".join(picked)[-800:]
    if tail:
        return f"FFmpeg falló al exportar:\n{tail}"
    return f"FFmpeg falló al exportar (código {returncode})."

log = logging.getLogger("videoyt.compose")


def overlay_order(clips, video_track_ids: list[str]) -> list[str]:
    """IDs de clips de vídeo de fondo a frente: pista inferior primero, luego orden en la lista."""
    vlayer = {tid: i for i, tid in enumerate(video_track_ids)}
    index = {c.id: i for i, c in enumerate(clips)}
    vis = [c for c in clips if c.track_id in vlayer]
    vis.sort(key=lambda c: (vlayer.get(c.track_id, 0), index.get(c.id, 0)))
    return [c.id for c in vis]

_MEDIA_KIND = {k: v for k, v in ASSET_DISK_KIND.items() if v != "sfx"}


def _clip_path(project: Project, clip: TimelineClip, shape_files: Optional[dict] = None) -> Optional[Path]:
    if getattr(clip, "kind", None) == "shape":
        return (shape_files or {}).get(clip.id)
    if getattr(clip, "kind", None) == "motion":
        # Motion graphic: WebM con alfa pre-renderizado por Motion Studio.
        from .motion import service as motion_service
        cid = getattr(clip, "composition_id", None) or clip.asset_id
        comp = motion_service.get_composition(project.id, cid)
        return motion_service.asset_path(project.id, comp) if comp else None
    if clip.asset_kind == "sfx":
        return sfx.resolve(clip.filename)
    kind = _MEDIA_KIND.get(clip.asset_kind)
    if kind is None and is_still_clip(clip):
        kind = "image"
    if kind is None:
        return None
    if (getattr(clip, "asset_scope", None) or "project") == "library":
        return storage.resolve_library_media(kind, clip.filename)
    return storage.resolve_media(project, kind, clip.filename)


_ffmpeg_input_args = ffmpeg_input_args


def _even(n: float) -> int:
    n = int(round(n))
    return n - (n % 2) if n >= 2 else 2


def _pose_prop_points(clip: TimelineClip, prop: str, dur: float) -> list[tuple[float, float]]:
    """Muestras (t local, valor) de una propiedad de pose para expresiones FFmpeg."""
    from .clip_keyframes import clip_props_at, keyframes_enabled

    dur = max(0.0, float(dur))
    times = {0.0, dur}
    kf = clip.keyframes if isinstance(clip.keyframes, dict) else None
    if keyframes_enabled(clip) and kf:
        for it in kf.get("items") or []:
            if not isinstance(it, dict):
                continue
            try:
                times.add(max(0.0, min(dur, float(it.get("t", 0)))))
            except (TypeError, ValueError):
                pass
    pts = []
    for t in sorted(times):
        pts.append((t, float(clip_props_at(clip, t).get(prop, 0))))
    return pts or [(0.0, float(clip_props_at(clip, 0).get(prop, 0)))]


def _pose_spread(pts: list[tuple[float, float]]) -> float:
    if not pts:
        return 0.0
    vs = [v for _, v in pts]
    return max(vs) - min(vs)


def pose_transform_animates(clip: TimelineClip) -> bool:
    """True si x/y/scale/rotation/opacity cambian (no el recorte zoom/cx/cy)."""
    if not keyframes_enabled(clip):
        return False
    dur = clip_timeline_duration(clip)
    for prop, eps in (("x", 0.004), ("y", 0.004), ("scale", 0.01),
                      ("rotation", 0.08), ("opacity", 0.015)):
        if _pose_spread(_pose_prop_points(clip, prop, dur)) > eps:
            return True
    return False


def _rotate_chain(pose_rot: list[tuple[float, float]], local: bool = True) -> str:
    """Filtro rotate: expresión si gira, constante si no, vacío si ~0."""
    if not pose_rot:
        return ""
    spread = _pose_spread(pose_rot)
    rot = pose_rot[-1][1]
    if local and spread > 0.08:
        expr = clipper._pw_expr(pose_rot).replace(",", "\\,")
        return f",rotate=a='({expr})*PI/180':ow=rotw(iw):oh=roth(ih):c=0x00000000"
    if abs(rot) > 0.05:
        return f",rotate={rot:.3f}*PI/180:ow=rotw(iw):oh=roth(ih):c=0x00000000"
    return ""


def _alpha_chain(clip: TimelineClip, pose_dur: float) -> str:
    """Opacidad animada o estática < 1 (geq usa T = segundos locales)."""
    pts = _pose_prop_points(clip, "opacity", pose_dur)
    if not pts:
        return ""
    spread = _pose_spread(pts)
    val = pts[0][1]
    if spread < 0.015:
        if val >= 0.995:
            return ""
        return f",format=gbrap,colorchannelmixer=aa={max(0.0, min(1.0, val)):.3f}"
    expr = clipper._pw_expr(pts, tvar="T").replace(",", "\\,")
    return (
        f",format=gbrap,"
        f"geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='255*min(1\\,max(0\\,{expr}))'"
    )


def _fill_pose_filter(clip: TimelineClip, W: int, H: int, start: float,
                      base_cs: str, fx: str = "") -> tuple[str, str]:
    """Aplica scale/rotate/posición/opacidad de pose a un clip fill ya escalado a WxH."""
    pose_dur = clip_timeline_duration(clip)
    pose_scale = _pose_prop_points(clip, "scale", pose_dur)
    pose_x = _pose_prop_points(clip, "x", pose_dur)
    pose_y = _pose_prop_points(clip, "y", pose_dur)
    pose_rot = _pose_prop_points(clip, "rotation", pose_dur)
    sc = clipper._pw_expr(pose_scale)
    tloc = f"(t-{start:.4f})"
    x_n = clipper._pw_expr(pose_x, tvar=tloc)
    y_n = clipper._pw_expr(pose_y, tvar=tloc)
    fx_pre = f",{fx}" if fx else ""
    chain = (
        f"{base_cs},format=gbrap{fx_pre},"
        f"scale=w='max(2\\,trunc({W}*({sc})/2)*2)':"
        f"h='max(2\\,trunc({H}*({sc})/2)*2)':eval=frame"
    )
    chain += _rotate_chain(pose_rot, local=True)
    chain += _alpha_chain(clip, pose_dur)
    xy = f"x='({x_n})*{W}-overlay_w/2':y='({y_n})*{H}-overlay_h/2'"
    return chain, xy


def _overlay_video_filter(path: Path, clip: TimelineClip, W: int, H: int, dur: float,
                          start: float = 0.0, fx: str = "") -> tuple[str, str]:
    """Crop de fuente (tamaño fijo) + scale/rotate del resultado. Devuelve (filtro, overlay=x:y).

    ``start`` es el instante del clip en la timeline. La escala se anima en el
    *chain* del PIP (tiempo LOCAL, ``t``=0 en el primer fotograma), pero la
    POSICIÓN se anima en el ``overlay`` final, cuyo ``t`` es el de la composición
    (global). Por eso las expresiones de posición usan ``t-start`` para volver a
    tiempo local del clip; si no, la animación se ve desfasada y, en clips que
    empiezan tarde (p. ej. seg. 29), queda congelada en el último keyframe.
    """
    from . import detect
    iw, ih = detect.dims(path)
    rf = clip.reframe
    crop_w = float(getattr(rf, "crop_w", None) or 1.0)
    crop_h = float(getattr(rf, "crop_h", None) or 1.0)
    animated = keyframes_enabled(clip)
    pose_dur = clip_timeline_duration(clip)
    pose_scale = _pose_prop_points(clip, "scale", pose_dur)
    pose_x = _pose_prop_points(clip, "x", pose_dur)
    pose_y = _pose_prop_points(clip, "y", pose_dur)
    pose_rot = _pose_prop_points(clip, "rotation", pose_dur)
    if animated:
        # Con pose-keyframes el crop (cx/cy/zoom de la fuente) lo dictan los
        # PROPIOS pose-keyframes, no reframe.keyframes — igual que reframeForDraw
        # en el preview. Si se usara reframe.keyframes, el export recortaría una
        # región distinta de la imagen (p. ej. Doc: pose cx=0.25 vs reframe 0.73).
        pose_cx = _pose_prop_points(clip, "cx", pose_dur)
        pose_cy = _pose_prop_points(clip, "cy", pose_dur)
        pose_zoom = _pose_prop_points(clip, "zoom", pose_dur)
        kfs = [
            Keyframe(t=t, cx=cx, cy=cy, zoom=(z or 1.0), pan_mode="smooth", fit=None)
            for (t, cx), (_, cy), (_, z) in zip(pose_cx, pose_cy, pose_zoom)
        ]
    else:
        kfs = _shifted_keyframes(rf, clip.in_point, dur, 1) if rf else []
    fr0 = frame_at(kfs, 0, (rf.zoom if rf else None) or 1.0, (rf.pan_mode if rf else None) or "smooth")
    _, _, sw, sh = source_crop_px(crop_w, crop_h, fr0["cx"], fr0["cy"], iw, ih)
    if not animated:
        ox, oy, dw, dh, rot = dest_rect_even(clip.transform, sw, sh, W, H)
    else:
        rot = pose_rot[-1][1] if pose_rot else 0.0
        ox = oy = dw = dh = 0

    def xy_at(t: float) -> tuple[float, float]:
        fr = frame_at(kfs, t, (rf.zoom if rf else None) or 1.0, (rf.pan_mode if rf else None) or "smooth")
        sx, sy, _, _ = source_crop_px(crop_w, crop_h, fr["cx"], fr["cy"], iw, ih)
        x = max(0, min(iw - cw, sx))
        y = max(0, min(ih - ch, sy))
        return x, y

    cw = min(_even(sw), iw - (iw % 2))
    ch = min(_even(sh), ih - (ih % 2))

    if not kfs:
        x, y = xy_at(0)
        crop_f = f"crop=w={cw}:h={ch}:x={int(x)}:y={int(y)}"
    else:
        xs, ys = [], []
        for kf in kfs:
            x, y = xy_at(kf.t)
            xs.append((kf.t, x))
            ys.append((kf.t, y))
        mode = (rf.pan_mode if rf else None) or "smooth"
        x_expr = clipper._pw_expr_direct(xs) if mode == "direct" else clipper._pw_expr(xs)
        y_expr = clipper._pw_expr_direct(ys) if mode == "direct" else clipper._pw_expr(ys)
        crop_f = f"crop=w={cw}:h={ch}:x='{x_expr}':y='{y_expr}'"

    if animated:
        # ESCALA: se aplica en el chain del PIP (scale eval=frame), donde 't' es
        # tiempo LOCAL del clip. POSICIÓN: se aplica en el overlay final, donde
        # 't' es tiempo de composición → usamos 't-start' para volver a local.
        sc = clipper._pw_expr(pose_scale)
        ad, ed = fx_windows(pose_dur)
        appear_sc = _scale_expr(clip, pose_dur, ad, ed)
        if appear_sc:
            sc = f"({sc})*({appear_sc})"
        tloc = f"(t-{start:.4f})"
        x_n = clipper._pw_expr(pose_x, tvar=tloc)
        y_n = clipper._pw_expr(pose_y, tvar=tloc)
        # El color/efectos (eq, blur…) va ANTES del scale animado: un filtro que
        # fije el tamaño DESPUÉS de 'scale=eval=frame' congela la animación.
        fx_pre = f",{fx}" if fx else ""
        chain = (
            f"{crop_f},format=gbrap{fx_pre},"
            f"scale=w='max(2\\,trunc({cw}*({sc})/2)*2)':"
            f"h='max(2\\,trunc({ch}*({sc})/2)*2)':eval=frame"
        )
        chain += _rotate_chain(pose_rot, local=True)
        chain += _alpha_chain(clip, pose_dur)
        # El PIP tiene tamaño variable (scale eval=frame) y se coloca DIRECTAMENTE
        # con el overlay final, que sí admite 't' y 'overlay_w/overlay_h'. Nada de
        # 'pad' a un lienzo fijo: 'pad' no admite 't' en x/y (rompía con posición
        # animada → "Could not open encoder before EOF") y, si el PIP escalado
        # supera WxH, falla con "Padded dimensions cannot be smaller than input".
        # El centro del PIP queda en (x_n*W, y_n*H); overlay recorta lo que sobre.
        xy = f"x='({x_n})*{W}-overlay_w/2':y='({y_n})*{H}-overlay_h/2'"
    else:
        chain = f"{crop_f},scale={dw}:{dh}"
        if abs(rot) > 0.05:
            chain += f",format=gbrap,rotate={rot:.3f}*PI/180:ow=rotw(iw):oh=roth(ih):c=0x00000000"
            xy = f"x={ox}-(overlay_w-{dw})/2:y={oy}-(overlay_h-{dh})/2"
        else:
            xy = f"x={ox}:y={oy}"
    return chain, xy


def _clip_duration(clip: TimelineClip) -> float:
    return clip_timeline_duration(clip)


def _has_audio(path: Path) -> bool:
    """True si el archivo tiene al menos un stream de audio (vía ffprobe)."""
    try:
        res = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True,
        )
        return bool((res.stdout or "").strip())
    except Exception:
        return False


def _shifted_keyframes(reframe: Reframe, in_point: float, dur: float, which: int) -> list[Keyframe]:
    """Keyframes del reframe pasados a tiempo LOCAL del fragmento recortado.

    Los keyframes del material son relativos al inicio de la fuente; al recortar
    en ``in_point`` hay que restarlo y quedarnos con los que caen dentro del
    fragmento (clamp a [0, dur]).
    """
    src = reframe.keyframes if which == 1 else (reframe.keyframes2 or reframe.keyframes)
    out: list[Keyframe] = []
    for k in src or []:
        t = k.t - in_point
        if -0.05 <= t <= dur + 0.05:
            out.append(Keyframe(
                t=max(0.0, min(dur, round(t, 3))),
                cx=k.cx, cy=k.cy, zoom=k.zoom, pan_mode=k.pan_mode, fit=k.fit,
            ))
    return out


def _kfs_all_contain(kfs) -> bool:
    """True si la pista es 100% Entero (letterbox). Mix contain/cover → cover."""
    if not kfs:
        return False
    for k in kfs:
        fit = k.fit if hasattr(k, "fit") else None
        if fit != "contain":
            return False
    return True


def _track_cropscale(path: Path, zoom, kfs, pan_mode: str, w: int, h: int) -> str:
    if _kfs_all_contain(kfs):
        return _plain_scale(w, h)
    return clipper._single_reframe_filter(path, zoom, kfs, pan_mode, w, h)


def _reframe_cropscale(path: Path, reframe: Reframe, in_point: float, dur: float,
                       W: int, H: int) -> str:
    """Cadena de filtros (crop+scale) para el reencuadre de un clip, sin el trim.

    Reutiliza ``clipper._single_reframe_filter``. Soporta encuadre simple y doble
    (vstack/hstack). Devuelve una cadena que va justo después de
    ``trim,setpts`` y produce un fotograma de tamaño exacto WxH.
    """
    kfs1 = _shifted_keyframes(reframe, in_point, dur, 1)
    if not reframe.dual_crop:
        return _track_cropscale(path, reframe.zoom, kfs1, reframe.pan_mode, W, H)

    kfs2 = _shifted_keyframes(reframe, in_point, dur, 2)
    orient = split_orientation_for(W / max(1, H), reframe)
    z2 = reframe.zoom2 or reframe.zoom
    w1, h1, w2, h2 = dual_slot_wh(W, H, orient)
    f1 = _track_cropscale(path, reframe.zoom, kfs1, reframe.pan_mode, w1, h1)
    f2 = _track_cropscale(path, z2, kfs2, reframe.pan_mode, w2, h2)
    return join_dual_filters(f1, f2, orient)


def _plain_scale(W: int, H: int) -> str:
    """Escalado a WxH con letterbox (solo Entero / fit=contain)."""
    return contain_scale_filter(W, H)


def _pose_crop_keyframes(clip: TimelineClip) -> list[Keyframe]:
    """cx/cy/zoom de pose (misma fuente que reframeForDraw / cropWindow del preview)."""
    dur = clip_timeline_duration(clip)
    by_t: dict[float, dict[str, float]] = {}
    for prop in ("cx", "cy", "zoom"):
        for t, v in _pose_prop_points(clip, prop, dur):
            by_t.setdefault(t, {})[prop] = v
    out: list[Keyframe] = []
    for t in sorted(by_t):
        p = by_t[t]
        z = p.get("zoom", 1.0)
        if z is None or z <= 0:
            z = 1.0
        z = max(0.1, min(1.0, float(z)))
        out.append(Keyframe(
            t=t,
            cx=float(p.get("cx", 0.5)),
            cy=float(p.get("cy", 0.5)),
            zoom=z,
            pan_mode="smooth",
        ))
    return out


def _fill_base_cropscale(path: Path, clip: TimelineClip, W: int, H: int) -> str:
    """Crop+scale de un clip fill: cover como el preview, no letterbox.

    El editor recorta con pose (cx/cy/zoom) o con reframe.zoom aunque no haya
    keyframes en ``reframe.keyframes``. El letterbox (``_plain_scale``) solo
    aplica si todos los kfs son fit=contain.
    """
    src_dur = clip_source_duration(clip)
    rf = clip.reframe
    dual = bool(rf and rf.dual_crop)
    if keyframes_enabled(clip) and not dual:
        kfs = _pose_crop_keyframes(clip)
        zoom = (rf.zoom if rf else None) or 1.0
        pan = (rf.pan_mode if rf else None) or "smooth"
        return _track_cropscale(path, zoom, kfs, pan, W, H)
    if rf:
        return _reframe_cropscale(path, rf, clip.in_point, src_dur, W, H)
    return clipper._single_reframe_filter(path, 1.0, [], "smooth", W, H)


# Fuentes del sistema (Windows) + fuentes embebidas del proyecto.
_FONT_DIR = Path("C:/Windows/Fonts")
_BUNDLED_FONT_DIR = Path(__file__).resolve().parent / "fonts"
_FONTS = {
    "Arial": "arial.ttf", "Arial Black": "ariblk.ttf", "Impact": "impact.ttf",
    "Georgia": "georgia.ttf", "Verdana": "verdana.ttf", "Times New Roman": "times.ttf",
    "Courier New": "cour.ttf", "Comic Sans MS": "comic.ttf", "Trebuchet MS": "trebuc.ttf",
    "Segoe UI": "segoeui.ttf", "Segoe UI Black": "seguibl.ttf", "Calibri": "calibri.ttf",
    "Bahnschrift": "bahnschrift.ttf", "Tahoma": "tahoma.ttf", "Consolas": "consola.ttf",
}
_FONTS_BOLD = {
    "Arial": "arialbd.ttf", "Georgia": "georgiab.ttf", "Verdana": "verdanab.ttf",
    "Times New Roman": "timesbd.ttf", "Courier New": "courbd.ttf", "Trebuchet MS": "trebucbd.ttf",
    "Segoe UI": "segoeuib.ttf", "Calibri": "calibrib.ttf", "Tahoma": "tahomabd.ttf",
    "Consolas": "consolab.ttf",
}
_BUNDLED_FONTS = {
    "Anton": "Anton-Regular.ttf",
}


def resolve_font_path(name: str, bold: bool = False) -> Path:
    """Ruta al TTF: primero fuentes embebidas (Anton…), luego Windows/Fonts."""
    bundled = _BUNDLED_FONTS.get(name)
    if bundled:
        p = _BUNDLED_FONT_DIR / bundled
        if p.exists():
            return p
    fn = (_FONTS_BOLD.get(name) if bold else None) or _FONTS.get(name, "arial.ttf")
    p = _FONT_DIR / fn
    if not p.exists():
        p = _FONT_DIR / "arial.ttf"
    return p


def _fontfile(name: str, bold: bool) -> str:
    p = resolve_font_path(name, bold)
    # Va entre comillas simples y con ':' escapado → fontfile='C\:/Windows/...'.
    return str(p).replace("\\", "/").replace(":", "\\:")


def ass_overlay_filter(ass_path: Path) -> str:
    """Filtro ass= de ffmpeg, con fontsdir si hay TTF embebidos (Anton…)."""
    spec = f"ass='{ass_filter_path(str(ass_path))}'"
    if _BUNDLED_FONT_DIR.is_dir() and any(_BUNDLED_FONT_DIR.glob("*.ttf")):
        spec += f":fontsdir='{ass_filter_path(str(_BUNDLED_FONT_DIR))}'"
    return spec


def _color(c: str) -> str:
    """Convierte '#rrggbb[@op]' al formato de color de ffmpeg '0xrrggbb[@op]'."""
    c = (c or "").strip()
    if not c:
        return "white"
    base, _, op = c.partition("@")
    if base.startswith("#"):
        base = "0x" + base[1:]
    return f"{base}@{op}" if op else base


def _esc_text(s: str) -> str:
    s = (s or "").replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019").replace("%", "\\%")
    s = s.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    s = s.replace("\n", "\\n")   # salto de l\u00ednea de drawtext (texto multil\u00ednea)
    return s


def _drawtext(clip: TimelineClip, W: int, H: int) -> str:
    st = clip.style or {}
    dur = _clip_duration(clip)
    start = max(0.0, clip.start)
    end = start + dur
    fontsize = max(8, int(round(float(st.get("size", 0.08)) * H)))
    color = st.get("color", "#ffffff")
    align = st.get("align", "center")
    x = float(st.get("x", 0.5))
    y = float(st.get("y", 0.5))
    if align == "left":
        x_expr = f"w*{x:.4f}"
    elif align == "right":
        x_expr = f"w*{x:.4f}-text_w"
    else:
        x_expr = f"w*{x:.4f}-text_w/2"
    y_expr = f"h*{y:.4f}-text_h/2"

    parts = [
        f"fontfile='{_fontfile(st.get('font', 'Arial'), bool(st.get('bold', True)))}'",
        f"text='{_esc_text(clip.text or '')}'",
        f"fontsize={fontsize}",
        f"fontcolor={_color(color)}",
        f"x={x_expr}", f"y={y_expr}",
        f"text_align={ {'left': 'L', 'center': 'C', 'right': 'R'}.get(align, 'C') }",
        f"line_spacing={max(2, int(fontsize * 0.18))}",
    ]
    bw = int(st.get("border_width", 0) or 0)
    if bw > 0:
        parts.append(f"borderw={bw}")
        parts.append(f"bordercolor={_color(st.get('border_color', '#000000'))}")
    if st.get("shadow") or st.get("glow"):
        parts.append("shadowx=2" if st.get("shadow") and not st.get("glow") else "shadowx=0")
        parts.append("shadowy=2" if st.get("shadow") and not st.get("glow") else "shadowy=0")
        parts.append(f"shadowcolor={_color(st.get('shadow_color', 'black@0.6'))}")
    bg = st.get("bg")
    if bg and bg != "none":
        op = float(st.get("bg_opacity", 0.6))
        parts.append("box=1")
        parts.append(f"boxcolor={_color(bg)}@{op:.2f}")
        parts.append("boxborderw=14")
    parts.append(f"enable='between(t,{start:.3f},{end:.3f})'")
    return "drawtext=" + ":".join(parts)


def _text_chain(timeline: Timeline, W: int, H: int, in_label: str) -> tuple[list[str], str]:
    """Encadena los drawtext de los clips de texto sobre el vídeo compuesto."""
    texts = [c for c in timeline.clips if c.kind == "text" and _clip_duration(c) > 0.02 and (c.text or "").strip()]
    if not texts:
        return [], in_label
    steps: list[str] = []
    last = in_label
    for i, c in enumerate(sorted(texts, key=lambda x: x.start)):
        out = f"tx{i}"
        steps.append(f"[{last}]{_drawtext(c, W, H)}[{out}]")
        last = out
    return steps, last


def _mask_input_args(spec: dict, fps: int, total: float) -> list[str]:
    """Args ``-i`` del PNG (o secuencia PNG) de máscara de un clip."""
    if spec.get("animated"):
        return ["-framerate", f"{float(spec.get('fps') or fps):.4f}", "-i", spec["path"]]
    return ["-loop", "1", "-framerate", str(int(fps)), "-t", f"{total:.3f}", "-i", spec["path"]]


def _mask_stream_filter(idx: int, spec: dict, label: str, fps: int,
                        start: float, dur: float, total: float) -> str:
    """Lleva la máscara al reloj de la composición (gbrp, misma cadencia)."""
    chain = f"[{idx}:v]fps={fps},format=gbrp"
    if spec.get("animated"):
        chain += ",setpts=PTS-STARTPTS"
        if start > 0.02:
            chain += f",tpad=start_mode=clone:start_duration={start:.3f}"
        rest = max(0.0, total - start - dur)
        if rest > 0.02:
            chain += f",tpad=stop_mode=clone:stop_duration={rest + 0.1:.3f}"
    return f"{chain}[{label}]"


def _bg_input_args(spec: dict) -> list[str]:
    """Args ``-i`` de la secuencia PNG del matte (Eliminar fondo) de un clip.

    ``-start_number`` es lo que alinea el matte con el recorte del clip: los PNG
    se numeran por fotograma ABSOLUTO de la fuente, así que recortar o mover el
    clip solo cambia el número de arranque — no hay que regenerar nada.
    """
    return [
        "-framerate", f"{float(spec.get('mask_fps') or 15):.4f}",
        "-start_number", str(int(spec.get("start_number") or 1)),
        "-i", spec["path"],
    ]


def _bg_source_chain(clip: TimelineClip, path: Path, spec: Optional[dict],
                     bg_input: Optional[int], n: int, fps: int,
                     in_label: str) -> tuple[list[str], str]:
    """Alfa de FUENTE del clip: chroma key y/o matte de IA.

    Va ANTES del recorte/pose/efectos, en el espacio del material original —
    igual que el preview, que sustituye el elemento fuente por un recorte con
    alfa. Devuelve (pasos del filtergraph, etiqueta de salida). Sin nada activo
    devuelve ([], in_label) y la cadena de siempre no cambia.

    El alfa del croma y el del matte se MULTIPLICAN. Hay que hacerlo a mano
    porque ``chromakey`` y ``alphamerge`` ambos SOBREESCRIBEN el alfa: se extrae
    el del croma con ``alphaextract``, se multiplica con el matte y el producto
    entra una sola vez por ``alphamerge``.

    La velocidad y el ``reverse`` del clip se aplican después, sobre el stream ya
    fusionado, así que el alfa las hereda sin duplicar filtros.
    """
    bg = clip_bg(clip)
    chroma_on = chroma_active(bg)
    matte_on = spec is not None and bg_input is not None and auto_active(bg)
    if not chroma_on and not matte_on:
        return [], in_label

    steps: list[str] = []
    last = in_label
    if not matte_on:
        # Solo croma: cabe en la propia cadena del clip, sin streams extra.
        out = f"bgc{n}"
        steps.append(f"[{last}]" + ",".join(chroma_filters(bg["chroma"])) + f"[{out}]")
        return steps, out

    from . import detect
    iw, ih = detect.dims(path)
    if iw <= 0 or ih <= 0:
        iw, ih = int(spec.get("width") or 0), int(spec.get("height") or 0)
    if iw <= 0 or ih <= 0:
        return [], in_label

    # El matte se sube al tamaño del material: ``alphamerge`` exige que ambos
    # streams midan lo mismo, y así el recorte posterior remuestrea RGB y alfa
    # juntos (un solo remuestreo, sin desalineación de borde).
    steps.append(
        f"[{bg_input}:v]format=gray,scale={iw}:{ih}:flags=bicubic,"
        f"fps={fps},setpts=PTS-STARTPTS[bgm{n}]"
    )
    # ``alphamerge`` y ``blend`` abortan si los dos streams no miden EXACTAMENTE
    # lo mismo. Fijar el material al tamaño sondeado (no-op cuando la sonda
    # acierta, que es lo normal) evita que un desajuste tumbe el export: en el
    # peor caso remuestrea al tamaño que ya asume el resto de compose.py.
    fit = f"scale={iw}:{ih}"
    if chroma_on:
        chain = ",".join(chroma_filters(bg["chroma"]))
        steps.append(f"[{last}]{fit},{chain},format=gbrap,fps={fps}[bgk{n}]")
        steps.append(f"[bgk{n}]split=2[bgk{n}a][bgk{n}b]")
        steps.append(f"[bgk{n}a]alphaextract[bgka{n}]")
        steps.append(f"[bgka{n}][bgm{n}]blend=all_mode=multiply,format=gray[bgmix{n}]")
        steps.append(f"[bgk{n}b][bgmix{n}]alphamerge[bgcut{n}]")
    else:
        steps.append(f"[{last}]{fit},format=gbrap,fps={fps}[bgs{n}]")
        steps.append(f"[bgs{n}][bgm{n}]alphamerge[bgcut{n}]")
    return steps, f"bgcut{n}"


def build_command(project: Project, timeline: Timeline, out_path: Path,
                  ass_path: Optional[Path] = None, shape_files: Optional[dict] = None,
                  mask_files: Optional[dict] = None,
                  bg_files: Optional[dict] = None) -> list[str]:
    """Construye la lista de argumentos de ffmpeg para renderizar la timeline."""
    W = int(timeline.width or config.OUTPUT_WIDTH)
    H = int(timeline.height or config.OUTPUT_HEIGHT)
    W -= W % 2
    H -= H % 2
    fps = int(timeline.fps or 30)
    try:
        from .export_settings import load as load_export
        fps = int(load_export()["fps"] or fps)
    except Exception:  # noqa: BLE001
        pass

    # Orden de capas de vídeo: primero las pistas de vídeo inferiores (fondo),
    # las superiores encima. Índice de capa = posición de la pista de vídeo.
    video_tracks = [t for t in timeline.tracks if t.kind == "video"]
    audio_tracks = [t for t in timeline.tracks if t.kind == "audio"]
    vlayer = {t.id: i for i, t in enumerate(video_tracks)}
    track_by_id = {t.id: t for t in timeline.tracks}

    # Recolectar clips válidos con su archivo y duración.
    vclips: list[tuple[TimelineClip, Path, object]] = []
    aclips: list[tuple[TimelineClip, Path, object]] = []
    for c in timeline.clips:
        track = track_by_id.get(c.track_id)
        if track is None:
            continue
        dur = _clip_duration(c)
        if dur <= 0.02:
            continue
        path = _clip_path(project, c, shape_files)
        if path is None or not path.exists():
            continue
        if track.kind == "video" and clip_fits_track(c.kind, "video"):
            if not track.hidden:
                vclips.append((c, path, track))
            # el audio de un clip de vídeo suena si ni la pista ni el clip están muteados
            if (not is_still_clip(c)) and clip_mixes_audio(c, track) and _has_audio(path):
                aclips.append((c, path, track))
        elif track.kind == "audio":
            if clip_mixes_audio(c, track) and _has_audio(path):
                aclips.append((c, path, track))

    total = 0.0
    for c in timeline.clips:
        track = track_by_id.get(c.track_id)
        if track is None:
            continue
        total = max(total, c.start + _clip_duration(c))
    total = round(total, 3)
    if total <= 0:
        raise RuntimeError("La timeline está vacía: añade al menos un clip.")

    # --- Inputs ---
    inputs: list[str] = []
    idx_of: dict[str, int] = {}
    all_files: list[tuple[object, Path]] = []
    for (c, path, _t) in vclips + aclips:
        if c.id not in idx_of:
            idx_of[c.id] = len(all_files)
            all_files.append((c, path))
    for c, path in all_files:
        inputs += _ffmpeg_input_args(c, path, fps)

    # Máscaras: un input extra (PNG o secuencia PNG) por clip enmascarado. Van
    # DESPUÉS del material para no alterar los índices de `idx_of`.
    mask_idx: dict[str, int] = {}
    for (c, _path, _t) in vclips:
        spec = (mask_files or {}).get(c.id)
        if not spec or c.id in mask_idx or not maskable(c) or not has_mask(c):
            continue
        mask_idx[c.id] = len(all_files) + len(mask_idx)
        inputs += _mask_input_args(spec, fps, total)

    # Eliminar fondo: un input extra (secuencia PNG del matte) por clip con
    # eliminación automática lista. Van DESPUÉS de las máscaras para no mover
    # los índices ya asignados.
    bg_idx: dict[str, int] = {}
    for (c, _path, _t) in vclips:
        spec = (bg_files or {}).get(c.id)
        if not spec or c.id in bg_idx or not bg_capable(c) or not auto_active(clip_bg(c)):
            continue
        bg_idx[c.id] = len(all_files) + len(mask_idx) + len(bg_idx)
        inputs += _bg_input_args(spec)

    filt: list[str] = []

    # --- Vídeo: fondo negro + overlays por capa ---
    filt.append(f"color=c=black:s={W}x{H}:r={fps}:d={total:.3f},format=yuv420p[base]")

    # Orden de la cadena de overlays: por capa de pista (fondo→arriba) y, dentro
    # de cada capa, por INSTANTE de inicio (start), con el orden en la lista como
    # desempate. Es imprescindible que la cadena sea monótona en el tiempo: si se
    # componen clips fuera de orden temporal, FFmpeg congela los `scale=eval=frame`
    # de PIPs posteriores (las imágenes que crecen se quedan estáticas en el
    # export). Ordenar por start también es lo correcto para la composición.
    clip_index = {c.id: i for i, c in enumerate(timeline.clips)}
    vclips_sorted = sorted(
        vclips,
        key=lambda cp: (vlayer.get(cp[0].track_id, 0), max(0.0, cp[0].start),
                        clip_index.get(cp[0].id, 0)),
    )
    last_label = "base"
    n = 0
    for (c, path, _t) in vclips_sorted:
        k = idx_of[c.id]
        dur = _clip_duration(c)
        start = max(0.0, c.start)
        end = start + dur
        overlay_xy = "x=0:y=0"
        src_dur = clip_source_duration(c)
        # Alfa de FUENTE (Eliminar fondo): se resuelve antes porque decide si la
        # cadena tiene que transportar alfa (format=gbrap / overlay format=auto).
        bg_steps, bg_label = _bg_source_chain(
            c, path, (bg_files or {}).get(c.id), bg_idx.get(c.id), n, fps, f"bgin{n}")
        has_bg = bool(bg_steps)
        animated_ov = is_overlay(c) and keyframes_enabled(c)
        fill_pose = (not is_overlay(c)) and pose_transform_animates(c)
        fx = video_fx_chain(
            c, dur, W, H,
            fit_canvas=not is_overlay(c),
            motion=not (animated_ov or fill_pose),
        )
        if is_overlay(c):
            # En overlay animado, 'scale=eval=frame' debe ser la ÚLTIMA operación
            # de tamaño: un filtro de color/efecto (eq, blur…) colocado DESPUÉS
            # congela la animación de escala (el PIP se queda en su tamaño inicial
            # pequeño). Por eso el fx se inyecta ANTES del scale, dentro del
            # cropscale, y NO se vuelve a añadir fuera.
            cropscale, overlay_xy = _overlay_video_filter(
                path, c, W, H, src_dur, start, fx=(fx if animated_ov else ""))
        elif fill_pose:
            base_cs = _fill_base_cropscale(path, c, W, H)
            cropscale, overlay_xy = _fill_pose_filter(
                c, W, H, start, base_cs, fx=(fx if fill_pose else ""))
        else:
            cropscale = _fill_base_cropscale(path, c, W, H)
        # OJO: 'format' (como cualquier filtro que renegocia el enlace) colocado
        # DESPUÉS de 'scale=eval=frame' congela el tamaño dinámico en su valor
        # inicial → el PIP animado se queda pequeño y mal posicionado (marco negro).
        # En overlay animado el alfa ya se establece con el format=gbrap que va
        # ANTES del scale (dentro de cropscale), así que NO se vuelve a añadir.
        if not animated_ov and (is_still_clip(c) or is_overlay(c) or fill_pose or has_bg):
            cropscale = f"{cropscale},format=gbrap"
        fx_part = "" if (animated_ov or fill_pose) else (f",{fx}" if fx else "")
        spd = "" if is_still_clip(c) else video_speed_filters(c)
        spd_part = f",{spd}" if spd else ""
        overlay_xy = overlay_xy_for_fx(overlay_xy, c, start, dur, W, H)
        vlabel = f"v{n}"
        tin, tout = ffmpeg_trim_window(c, fps)
        if has_bg:
            # El alfa se aplica en el espacio del MATERIAL (antes del recorte),
            # igual que el preview, que sustituye el elemento fuente por un
            # recorte con alfa. Velocidad/reverse van después: el alfa las
            # hereda sin duplicar filtros.
            filt.append(f"[{k}:v]trim={tin:.3f}:{tout:.3f},setpts=PTS-STARTPTS[bgin{n}]")
            filt.extend(bg_steps)
            filt.append(
                f"[{bg_label}]{cropscale},fps={fps}{spd_part}{fx_part},"
                f"setpts=PTS-STARTPTS+{start:.3f}/TB[{vlabel}]"
            )
        else:
            filt.append(
                f"[{k}:v]trim={tin:.3f}:{tout:.3f},setpts=PTS-STARTPTS,"
                f"{cropscale},fps={fps}{spd_part}{fx_part},setpts=PTS-STARTPTS+{start:.3f}/TB[{vlabel}]"
            )
        out_label = f"ov{n}"
        ov_fmt = ":format=auto" if (fx or is_still_clip(c) or fill_pose or has_bg) else ""
        mi = mask_idx.get(c.id)
        if mi is None:
            filt.append(
                f"[{last_label}][{vlabel}]overlay={overlay_xy}:eof_action=repeat"
                f"{ov_fmt}:enable='between(t,{start:.3f},{end:.3f})'[{out_label}]"
            )
        else:
            # La máscara se aplica DESPUÉS de componer el clip (recorte, pose,
            # efectos y opacidad ya aplicados), igual que el preview: se mezcla
            # el fondo sin el clip con el fondo CON el clip usando el alfa de la
            # máscara. Vale igual para fill y para PIP con posición animada.
            filt.append(f"[{last_label}]format=gbrp,split=2[mb{n}][mo{n}]")
            filt.append(
                f"[mo{n}][{vlabel}]overlay={overlay_xy}:eof_action=repeat"
                f"{ov_fmt}:enable='between(t,{start:.3f},{end:.3f})',format=gbrp[mt{n}]"
            )
            filt.append(_mask_stream_filter(
                mi, mask_files[c.id], f"mk{n}", fps, start, dur, total))
            filt.append(f"[mb{n}][mt{n}][mk{n}]maskedmerge[{out_label}]")
        last_label = out_label
        n += 1

    # Texto / subtítulos por encima de todo el vídeo compuesto.
    if ass_path is not None:
        out = "txass"
        filt.append(f"[{last_label}]{ass_overlay_filter(ass_path)}[{out}]")
        last_label = out
    else:
        text_steps, last_label = _text_chain(timeline, W, H, last_label)
        filt.extend(text_steps)

    filt.append(f"[{last_label}]format=yuv420p[vout]")

    # --- Audio: cada clip retrasado + volumen, mezclado con amix ---
    alabels: list[str] = []
    m = 0
    for (c, path, track) in aclips:
        k = idx_of[c.id]
        start_ms = int(round(max(0.0, c.start) * 1000))
        alabel = f"a{m}"
        asp = audio_speed_filters(c)
        asp_part = f",{asp}" if asp else ""
        afx = audio_fx_chain(c)
        afx_part = f",{afx}" if afx else ""
        vol_part = volume_filter(c)
        chain = (
            f"[{k}:a]atrim={c.in_point:.3f}:{c.out_point:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
            f"{asp_part}{afx_part},"
            f"aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,{vol_part}"
        )
        if start_ms > 0:
            chain += f",adelay={start_ms}:all=1"
        chain += f"[{alabel}]"
        filt.append(chain)
        alabels.append(alabel)
        m += 1

    # Normalización de loudness del render final (evita clipping con TP=-1.5).
    target = float(timeline.audio_target_db if timeline.audio_target_db is not None else -14.0)
    target = max(-40.0, min(-5.0, target))
    loudnorm = f"loudnorm=I={target:.1f}:TP=-1.5:LRA=11"

    has_audio = len(alabels) > 0
    if has_audio:
        if len(alabels) == 1:
            filt.append(f"[{alabels[0]}]apad=whole_dur={total:.3f},{loudnorm}[aout]")
        else:
            joined = "".join(f"[{a}]" for a in alabels)
            filt.append(
                f"{joined}amix=inputs={len(alabels)}:normalize=0:dropout_transition=0,"
                f"apad=whole_dur={total:.3f},{loudnorm}[aout]"
            )

    cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filt),
           "-map", "[vout]"]
    if has_audio:
        cmd += ["-map", "[aout]", "-c:a", "aac", "-ar", "48000", "-b:a", config.AUDIO_BITRATE]
    else:
        cmd += ["-an"]
    cmd += [
        *gpu.video_encoder_args(),
        "-pix_fmt", "yuv420p", "-r", str(fps), "-movflags", "+faststart",
        "-t", f"{total:.3f}",
        str(out_path),
    ]
    return cmd


# Umbral (caracteres del filtergraph) a partir del cual se usa un archivo de
# script. Conservador: la línea de comandos de Windows corta ~32 KB e incluye
# también los ``-i`` de cada clip. Mismo criterio que clipper._vf_args.
_FILTER_SCRIPT_LIMIT = 6000


def _filter_script_cmd(cmd: list[str], td: Path) -> list[str]:
    """Evita ``[WinError 206]`` (la línea de comandos de Windows tiene un límite
    de ~32 KB): cuando el filtergraph es grande —muchos clips, máscaras u
    overlays— se escribe a un archivo y se pasa con ``-/filter_complex`` en vez
    de inline. La semántica del filtergraph es idéntica, solo cambia cómo se
    entrega a ffmpeg."""
    try:
        i = cmd.index("-filter_complex")
    except ValueError:
        return cmd
    graph = cmd[i + 1]
    if len(graph) < _FILTER_SCRIPT_LIMIT:
        return cmd
    td.mkdir(parents=True, exist_ok=True)
    script = td / "filtergraph.txt"
    script.write_text(graph, encoding="utf-8")
    out = list(cmd)
    # ``-/filter_complex ARCHIVO`` lee el filtro de un archivo (FFmpeg 6.1+). El
    # antiguo ``-filter_complex_script`` se eliminó en FFmpeg 8.0 y provoca
    # "Error splitting the argument list: Option not found".
    out[i:i + 2] = ["-/filter_complex", str(script)]
    return out


def _hms_to_sec(ts: str) -> float | None:
    """``HH:MM:SS.micro`` de ffmpeg -progress → segundos (o None si N/A)."""
    ts = (ts or "").strip()
    if not ts or ts == "N/A":
        return None
    try:
        h, m, s = ts.split(":")
        return int(h) * 3600 + int(m) * 60 + float(s)
    except (ValueError, TypeError):
        return None


def _last_t(cmd: list[str]) -> float:
    """Duración de salida (último ``-t`` del comando) para calcular el progreso."""
    for i in range(len(cmd) - 1, 0, -1):
        if cmd[i - 1] == "-t":
            try:
                return float(cmd[i])
            except ValueError:
                return 0.0
    return 0.0


def _run_ffmpeg_export(cmd: list[str], total: float, on_progress: ProgressCb,
                       err_path: Path) -> tuple[int, str]:
    """Lanza ffmpeg leyendo su progreso real por stdout (``-progress pipe:1``) y
    lo reporta entre 0.15 y 0.98, para que la barra avance en vez de quedarse
    clavada en 15 %. stderr se vuelca a un archivo para el diagnóstico de error."""
    full = list(cmd)
    # Opciones globales tras 'ffmpeg': sin stdin interactivo, progreso a stdout,
    # sin la tabla de stats por stderr (así stderr solo lleva logs/errores).
    full[1:1] = ["-nostdin", "-progress", "pipe:1", "-nostats"]
    with open(err_path, "w", encoding="utf-8", errors="replace") as errf:
        proc = subprocess.Popen(
            full, stdout=subprocess.PIPE, stderr=errf,
            text=True, encoding="utf-8", errors="replace",
        )
        last = 0.15
        try:
            for line in proc.stdout:
                line = line.strip()
                if line.startswith("out_time="):
                    sec = _hms_to_sec(line.split("=", 1)[1])
                    if sec is not None and total > 0:
                        frac = 0.15 + 0.83 * min(1.0, sec / total)
                        if frac >= last + 0.01:
                            last = frac
                            on_progress(round(frac, 3),
                                        f"Renderizando… {int(sec)}s / {int(total)}s")
        finally:
            proc.wait()
    err = ""
    try:
        err = err_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        pass
    return proc.returncode, err


def render(project: Project, timeline: Timeline, out_path: Path,
           on_progress: ProgressCb) -> Path:
    """Renderiza la timeline al archivo ``out_path`` y lo devuelve."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    on_progress(0.05, "Preparando la composición…")
    W = int(timeline.width or config.OUTPUT_WIDTH)
    H = int(timeline.height or config.OUTPUT_HEIGHT)
    W -= W % 2
    H -= H % 2
    texts = [c for c in timeline.clips if c.kind == "text" and (c.text or "").strip()]
    ass_path = None
    if texts:
        ass_path = out_path.with_suffix(".ass")
        ass_path.write_text(build_ass(timeline.clips, W, H, timeline.tracks), encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="vy-shapes-") as td:
        shape_files = rasterize_timeline_shapes(timeline, Path(td), W, H)
        mask_files = build_timeline_masks(
            timeline, Path(td) / "masks", W, H, int(timeline.fps or 30))
        # Eliminar fondo: el matte NO es temporal (vive en la caché de data/), así
        # que exportar dos veces no vuelve a ejecutar el modelo.
        from .bg import service as bg_service
        bg_files = bg_service.build_timeline_bg_masks(timeline, int(timeline.fps or 30))
        cmd = build_command(project, timeline, out_path, ass_path=ass_path,
                            shape_files=shape_files, mask_files=mask_files,
                            bg_files=bg_files)
        cmd = _filter_script_cmd(cmd, Path(td))
        on_progress(0.15, "Renderizando el vídeo final con FFmpeg…")
        log.info("Export: %d clip(s), encoder=%s crf=%s → %s",
                 len(timeline.clips), gpu.selected_encoder(), config.VIDEO_CRF,
                 out_path.name)
        with timed("render FFmpeg (export)", log, clips=len(timeline.clips)):
            returncode, stderr = _run_ffmpeg_export(
                cmd, _last_t(cmd), on_progress, Path(td) / "ffmpeg-export.log")
    if returncode != 0:
        raise RuntimeError(_ffmpeg_export_error(stderr, returncode))
    if not out_path.exists():
        raise RuntimeError("La exportación no generó ningún archivo.")
    on_progress(1.0, "Vídeo final listo.")
    return out_path
