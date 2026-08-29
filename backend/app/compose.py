"""Renderizado del vídeo final a partir de la timeline del editor.

Compone toda la línea de tiempo (clips de vídeo en sus pistas, con su
reencuadre/keyframes, + pistas de audio mezcladas) en un único MP4 vertical
9:16 usando un solo ``ffmpeg`` con ``-filter_complex``.

Estrategia:
  * Cada clip de vídeo se recorta a su fragmento ``[in, out]``, se le aplica su
    reframe (reutilizando la lógica de ``clipper``), se escala a 720x1280 y se
    coloca en su instante de la timeline (``setpts``). Se apilan por orden de
    pista (las pistas superiores tapan a las inferiores) con ``overlay`` sobre un
    fondo negro, activándose solo durante su ventana temporal.
  * Cada clip de audio (de pista de audio, o de un clip de vídeo cuya pista no
    esté silenciada) se recorta, se retrasa a su instante (``adelay``), se ajusta
    de volumen y se mezcla todo con ``amix``.
"""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Callable, Optional

from . import clipper, config, sfx, storage
from .clip_fx import overlay_xy_for_fx, video_fx_chain
from .clip_layout import dest_rect_even, is_overlay, source_crop_px
from .diagnostics import timed
from .reframe_math import frame_at
from .schemas import Keyframe, Project, Reframe, Timeline, TimelineClip

ProgressCb = Callable[[float, str], None]

log = logging.getLogger("videoyt.compose")

_MEDIA_KIND = {"clips": "video", "audios": "audio"}


def _clip_path(project: Project, clip: TimelineClip) -> Optional[Path]:
    if clip.asset_kind == "sfx":
        return sfx.resolve(clip.filename)
    kind = _MEDIA_KIND.get(clip.asset_kind)
    if kind is None:
        return None
    return storage.resolve_media(project, kind, clip.filename)


def _even(n: float) -> int:
    n = int(round(n))
    return n - (n % 2) if n >= 2 else 2


def _overlay_video_filter(path: Path, clip: TimelineClip, W: int, H: int, dur: float) -> tuple[str, str]:
    """Crop de fuente (tamaño fijo) + scale/rotate del resultado. Devuelve (filtro, overlay=x:y)."""
    from . import detect
    iw, ih = detect.dims(path)
    rf = clip.reframe
    crop_w = float(rf.crop_w)
    crop_h = float(rf.crop_h)
    kfs = _shifted_keyframes(rf, clip.in_point, dur, 1) if rf else []
    fr0 = frame_at(kfs, 0, rf.zoom or 1.0, rf.pan_mode or "smooth")
    _, _, sw, sh = source_crop_px(crop_w, crop_h, fr0["cx"], fr0["cy"], iw, ih)
    ox, oy, dw, dh, rot = dest_rect_even(clip.transform, sw, sh, W, H)
    cw = min(_even(sw), iw - (iw % 2))
    ch = min(_even(sh), ih - (ih % 2))

    def xy_at(t: float) -> tuple[float, float]:
        fr = frame_at(kfs, t, rf.zoom or 1.0, rf.pan_mode or "smooth")
        sx, sy, _, _ = source_crop_px(crop_w, crop_h, fr["cx"], fr["cy"], iw, ih)
        x = max(0, min(iw - cw, sx))
        y = max(0, min(ih - ch, sy))
        return x, y

    if not kfs:
        x, y = xy_at(0)
        crop_f = f"crop=w={cw}:h={ch}:x={int(x)}:y={int(y)}"
    else:
        xs, ys = [], []
        for kf in kfs:
            x, y = xy_at(kf.t)
            xs.append((kf.t, x))
            ys.append((kf.t, y))
        mode = rf.pan_mode or "smooth"
        x_expr = clipper._pw_expr_direct(xs) if mode == "direct" else clipper._pw_expr(xs)
        y_expr = clipper._pw_expr_direct(ys) if mode == "direct" else clipper._pw_expr(ys)
        crop_f = f"crop=w={cw}:h={ch}:x='{x_expr}':y='{y_expr}'"

    chain = f"{crop_f},scale={dw}:{dh}"
    if abs(rot) > 0.05:
        chain += f",format=gbrap,rotate={rot:.3f}*PI/180:ow=rotw(iw):oh=roth(ih):c=none@0x00000000"
        xy = f"x={ox}-(overlay_w-{dw})/2:y={oy}-(overlay_h-{dh})/2"
    else:
        xy = f"x={ox}:y={oy}"
    return chain, xy


def _clip_duration(clip: TimelineClip) -> float:
    return max(0.0, round(clip.out_point - clip.in_point, 3))


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


def _reframe_cropscale(path: Path, reframe: Reframe, in_point: float, dur: float,
                       W: int, H: int) -> str:
    """Cadena de filtros (crop+scale) para el reencuadre de un clip, sin el trim.

    Reutiliza ``clipper._single_reframe_filter``. Soporta encuadre simple y doble
    (vstack/hstack). Devuelve una cadena que va justo después de
    ``trim,setpts`` y produce un fotograma de tamaño exacto WxH.
    """
    kfs1 = _shifted_keyframes(reframe, in_point, dur, 1)
    if not reframe.dual_crop:
        return clipper._single_reframe_filter(path, reframe.zoom, kfs1, reframe.pan_mode, W, H)

    kfs2 = _shifted_keyframes(reframe, in_point, dur, 2)
    orient = reframe.split_orientation or "vertical"
    z2 = reframe.zoom2 or reframe.zoom
    if orient == "vertical":
        w1, h1, w2, h2 = W, H // 2, W, H // 2
        stack = "vstack=inputs=2"
    else:
        w1, h1, w2, h2 = W // 2, H, W // 2, H
        stack = "hstack=inputs=2"
    f1 = clipper._single_reframe_filter(path, reframe.zoom, kfs1, reframe.pan_mode, w1, h1)
    f2 = clipper._single_reframe_filter(path, z2, kfs2, reframe.pan_mode, w2, h2)
    # split del stream del clip en dos para recortar dos encuadres y apilarlos.
    return f"split=2[ca][cb];[ca]{f1}[ta];[cb]{f2}[tb];[ta][tb]{stack}"


def _plain_scale(W: int, H: int) -> str:
    """Escalado a WxH con letterbox (para clips sin reframe)."""
    return (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1")


# Fuentes del sistema (Windows) disponibles para el texto.
_FONT_DIR = Path("C:/Windows/Fonts")
_FONTS = {
    "Arial": "arial.ttf", "Arial Black": "ariblk.ttf", "Impact": "impact.ttf",
    "Georgia": "georgia.ttf", "Verdana": "verdana.ttf", "Times New Roman": "times.ttf",
    "Courier New": "cour.ttf", "Comic Sans MS": "comic.ttf", "Trebuchet MS": "trebuc.ttf",
}
_FONTS_BOLD = {"Arial": "arialbd.ttf", "Georgia": "georgiab.ttf", "Verdana": "verdanab.ttf",
               "Times New Roman": "timesbd.ttf", "Courier New": "courbd.ttf", "Trebuchet MS": "trebucbd.ttf"}


def _fontfile(name: str, bold: bool) -> str:
    fn = (_FONTS_BOLD.get(name) if bold else None) or _FONTS.get(name, "arial.ttf")
    p = _FONT_DIR / fn
    if not p.exists():
        p = _FONT_DIR / "arial.ttf"
    # Va entre comillas simples y con ':' escapado → fontfile='C\:/Windows/...'.
    return str(p).replace("\\", "/").replace(":", "\\:")


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
    if st.get("shadow"):
        parts.append("shadowx=2")
        parts.append("shadowy=2")
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


def build_command(project: Project, timeline: Timeline, out_path: Path) -> list[str]:
    """Construye la lista de argumentos de ffmpeg para renderizar la timeline."""
    W = int(timeline.width or config.OUTPUT_WIDTH)
    H = int(timeline.height or config.OUTPUT_HEIGHT)
    W -= W % 2
    H -= H % 2
    fps = int(timeline.fps or 30)

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
        path = _clip_path(project, c)
        if path is None or not path.exists():
            continue
        if track.kind == "video" and c.kind == "video":
            if not track.hidden:
                vclips.append((c, path, track))
            # el audio de un clip de vídeo suena si su pista no está muteada
            if not track.muted and _has_audio(path):
                aclips.append((c, path, track))
        elif track.kind == "audio":
            if not track.muted and _has_audio(path):
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
    all_files: list[Path] = []
    for (c, path, _t) in vclips + aclips:
        if c.id not in idx_of:
            idx_of[c.id] = len(all_files)
            all_files.append(path)
    for path in all_files:
        inputs += ["-i", str(path)]

    filt: list[str] = []

    # --- Vídeo: fondo negro + overlays por capa ---
    filt.append(f"color=c=black:s={W}x{H}:r={fps}:d={total:.3f},format=yuv420p[base]")

    # ordenar por capa de pista (fondo→arriba) y luego por inicio.
    vclips_sorted = sorted(vclips, key=lambda cp: (vlayer.get(cp[0].track_id, 0), cp[0].start))
    last_label = "base"
    n = 0
    for (c, path, _t) in vclips_sorted:
        k = idx_of[c.id]
        dur = _clip_duration(c)
        start = max(0.0, c.start)
        end = start + dur
        overlay_xy = "x=0:y=0"
        if is_overlay(c) and c.reframe and c.reframe.crop_w and c.reframe.crop_h:
            cropscale, overlay_xy = _overlay_video_filter(path, c, W, H, dur)
        elif c.reframe and (c.reframe.keyframes or c.reframe.dual_crop):
            cropscale = _reframe_cropscale(path, c.reframe, c.in_point, dur, W, H)
        else:
            cropscale = _plain_scale(W, H)
        fx = video_fx_chain(c, dur, W, H)
        fx_part = f",{fx}" if fx else ""
        overlay_xy = overlay_xy_for_fx(overlay_xy, c, start, dur, W, H)
        vlabel = f"v{n}"
        filt.append(
            f"[{k}:v]trim={c.in_point:.3f}:{c.out_point:.3f},setpts=PTS-STARTPTS,"
            f"{cropscale},fps={fps}{fx_part},setpts=PTS-STARTPTS+{start:.3f}/TB[{vlabel}]"
        )
        out_label = f"ov{n}"
        ov_fmt = ":format=auto" if fx else ""
        filt.append(
            f"[{last_label}][{vlabel}]overlay={overlay_xy}:eof_action=pass"
            f"{ov_fmt}:enable='between(t,{start:.3f},{end:.3f})'[{out_label}]"
        )
        last_label = out_label
        n += 1

    # Texto / subtítulos por encima de todo el vídeo compuesto.
    text_steps, last_label = _text_chain(timeline, W, H, last_label)
    filt.extend(text_steps)

    filt.append(f"[{last_label}]format=yuv420p[vout]")

    # --- Audio: cada clip retrasado + volumen, mezclado con amix ---
    alabels: list[str] = []
    m = 0
    for (c, path, track) in aclips:
        k = idx_of[c.id]
        start_ms = int(round(max(0.0, c.start) * 1000))
        vol = max(0.0, c.volume if c.volume is not None else 1.0)
        alabel = f"a{m}"
        chain = (f"[{k}:a]atrim={c.in_point:.3f}:{c.out_point:.3f},asetpts=PTS-STARTPTS,"
                 f"aresample=async=1,volume={vol:.3f}")
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
        cmd += ["-map", "[aout]", "-c:a", "aac", "-b:a", config.AUDIO_BITRATE]
    else:
        cmd += ["-an"]
    cmd += [
        "-c:v", "libx264", "-crf", str(config.VIDEO_CRF), "-preset", config.VIDEO_PRESET,
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-t", f"{total:.3f}",
        str(out_path),
    ]
    return cmd


def render(project: Project, timeline: Timeline, out_path: Path,
           on_progress: ProgressCb) -> Path:
    """Renderiza la timeline al archivo ``out_path`` y lo devuelve."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    on_progress(0.05, "Preparando la composición…")
    cmd = build_command(project, timeline, out_path)
    on_progress(0.15, "Renderizando el vídeo final con FFmpeg…")
    log.info("Export: %d clip(s), encoder=%s preset=%s crf=%s → %s",
             len(timeline.clips), "libx264", config.VIDEO_PRESET, config.VIDEO_CRF,
             out_path.name)
    with timed("render FFmpeg (export)", log, clips=len(timeline.clips)):
        proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg falló al exportar:\n{proc.stderr[-1200:]}")
    if not out_path.exists():
        raise RuntimeError("La exportación no generó ningún archivo.")
    on_progress(1.0, "Vídeo final listo.")
    return out_path
