"""Descarga del vídeo fuente y recorte de cada tramo a formato vertical 9:16.

Estrategia (v1, sencilla y robusta):
  1. Descargar el vídeo fuente una sola vez (hasta 1080p) a un archivo temporal.
  2. Por cada tramo, cortar con FFmpeg aplicando el filtro del modo de recorte.

Más adelante se puede optimizar usando descargas por rango (download_ranges)
para ahorrar ancho de banda.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

from . import config, gpu, ytdlp
from .diagnostics import timed
from .recipe_layout import uses_source_trim
from .reframe_math import frame_at
from .schemas import ClipInfo, CropMode, Reframe, Segment

ProgressCb = Callable[[float, str], None]

log = logging.getLogger("videoyt.clipper")


def _download_source(url: str, dest_dir: Path, on_progress: ProgressCb) -> Path:
    """Descarga el vídeo completo (mejor calidad <=1080p) y devuelve su ruta."""
    outtmpl = str(dest_dir / "source.%(ext)s")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "merge_output_format": "mp4",
        "outtmpl": outtmpl,
    }

    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes") or 0
            frac = (done / total) if total else 0.0
            # La descarga ocupa el primer 40% de la barra global.
            on_progress(0.4 * frac, "Descargando vídeo fuente…")

    opts["progress_hooks"] = [hook]

    ytdlp.call(opts, lambda ydl: ydl.download([url]))

    files = list(dest_dir.glob("source.*"))
    if not files:
        raise RuntimeError("No se pudo descargar el vídeo fuente.")
    return files[0]


def _crop_filter(mode: CropMode) -> str:
    """Devuelve el filtro FFmpeg (-vf o -filter_complex) para cada modo.

    Todos producen una salida final de 720x1280 (9:16).
    """
    W, H = config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT
    top_h = config.TOP_HEIGHT
    bot_h = config.BOTTOM_HEIGHT

    if mode == CropMode.center:
        # Recorte central de proporción 9:16 y escalado a 720x1280.
        return f"crop=ih*{W}/{H}:ih:(iw-ih*{W}/{H})/2:0,scale={W}:{H}"

    # Modos split: arriba contenido centrado (720x960), abajo facecam (720x320).
    top = f"[0:v]crop=ih*{W}/{top_h}:ih:(iw-ih*{W}/{top_h})/2:0,scale={W}:{top_h}[top]"

    # Región del facecam: proporción 720:320 anclada a una esquina inferior.
    fw = f"ih*{W}/{bot_h}*0.5"   # ancho de la región recortada
    fh = "ih*0.5"                # mitad inferior del cuadro
    if mode == CropMode.split_left:
        bot = f"[0:v]crop={fw}:{fh}:0:ih*0.5,scale={W}:{bot_h}[bot]"
    else:  # split_right
        bot = f"[0:v]crop={fw}:{fh}:iw-{fw}:ih*0.5,scale={W}:{bot_h}[bot]"

    return f"{top};{bot};[top][bot]vstack=inputs=2[v]"


def _smart_face_filter(source: Path, seg: Segment) -> str:
    """Filtro de recorte vertical fijo colocado sobre la cara del tramo.

    Igual que el modo centrado, pero la X del recorte se calcula a partir de
    dónde está la cara (detección YuNet). Si no se detecta cara, cae al centro.
    """
    from . import detect  # import perezoso: solo se necesita en este modo

    W, H = config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT
    iw, ih = detect.dims(source)
    cw = round(ih * W / H)                      # ancho del recorte 9:16 en px fuente
    cx = detect.face_center_x(source, seg.start, seg.end)

    if cx is None:
        x = (iw - cw) // 2                      # sin cara → centrado
    else:
        x = int(round(cx - cw / 2))
        x = max(0, min(x, iw - cw))             # que no se salga del fotograma

    return f"crop={cw}:{ih}:{x}:0,scale={W}:{H}"


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(v, hi))


def _pw_expr(points: list[tuple[float, float]]) -> str:
    """Expresión FFmpeg de interpolación lineal por tramos value(t).

    Antes de ``t0`` mantiene ``v0``; entre cada par de puntos interpola en línea
    recta; después del último mantiene ``vn``. Así el recorte se mueve de forma
    suave entre keyframes (paneo "smooth").
    """
    pts = sorted(points, key=lambda p: p[0])
    if len(pts) == 1:
        return f"{pts[0][1]:.2f}"
    expr = f"{pts[-1][1]:.2f}"                      # después del último keyframe
    for i in range(len(pts) - 2, -1, -1):
        t0, v0 = pts[i]
        t1, v1 = pts[i + 1]
        dt = (t1 - t0) or 1e-6
        seg = f"({v0:.3f}+({v1 - v0:.3f})*(t-{t0:.4f})/{dt:.6f})"
        expr = f"if(lt(t,{t1:.4f}),{seg},{expr})"
    return f"if(lt(t,{pts[0][0]:.4f}),{pts[0][1]:.2f},{expr})"


def _pw_expr_direct(points: list[tuple[float, float]]) -> str:
    """Expresión FFmpeg para salto directo sin interpolación value(t)."""
    pts = sorted(points, key=lambda p: p[0])
    if len(pts) == 1:
        return f"{pts[0][1]:.2f}"
    expr = f"{pts[-1][1]:.2f}"
    for i in range(len(pts) - 2, -1, -1):
        t0, v0 = pts[i]
        t1, v1 = pts[i + 1]
        expr = f"if(lt(t,{t1:.3f}),{v0:.2f},{expr})"
    return f"if(lt(t,{pts[0][0]:.3f}),{pts[0][1]:.2f},{expr})"


def _single_reframe_filter(source: Path, zoom: float, keyframes: list, pan_mode: str, target_w: int, target_h: int) -> str:
    from . import detect

    iw, ih = detect.dims(source)
    z_fallback = _clamp(zoom or 1.0, 0.1, 1.0)
    mode_fallback = pan_mode or "smooth"
    kfs = keyframes or []
    # Solo si el zoom cambia de tamaño hay que animar w/h. pan_mode en cada
    # keyframe (el editor lo manda siempre) NO debe muestrear 20 fps: eso
    # infla el -vf hasta WinError 206 en Windows.
    zooms = [float(z) for k in kfs if (z := getattr(k, "zoom", None)) is not None]
    variable = bool(zooms) and (
        any(abs(z - z_fallback) > 1e-3 for z in zooms) or (max(zooms) - min(zooms) > 1e-3)
    )

    def crop_at(t: float) -> tuple[float, float, float, float]:
        fr = frame_at(kfs, t, z_fallback, mode_fallback)
        z = fr["zoom"]
        ch = int(round(ih * z)); ch -= ch % 2
        cw = int(round(ch * target_w / target_h)); cw -= cw % 2
        cw = min(max(2, cw), iw - (iw % 2))
        ch = min(max(2, ch), ih - (ih % 2))
        x = _clamp(fr["cx"] * iw - cw / 2, 0, iw - cw)
        y = _clamp(fr["cy"] * ih - ch / 2, 0, ih - ch)
        return x, y, cw, ch

    if not kfs:
        x, y, cw, ch = crop_at(0)
        return f"crop=w={cw}:h={ch}:x={int(x)}:y={int(y)},scale={target_w}:{target_h}"

    if not variable:
        x0, y0, cw, ch = crop_at(kfs[0].t)
        xs: list[tuple[float, float]] = []
        ys: list[tuple[float, float]] = []
        for kf in kfs:
            x, y, _, _ = crop_at(kf.t)
            xs.append((kf.t, x))
            ys.append((kf.t, y))
        if mode_fallback == "direct":
            x_expr = _pw_expr_direct(xs)
            y_expr = _pw_expr_direct(ys)
        else:
            x_expr = _pw_expr(xs)
            y_expr = _pw_expr(ys)
        return f"crop=w={cw}:h={ch}:x='{x_expr}':y='{y_expr}',scale={target_w}:{target_h}"

    xs, ys, ws, hs = [], [], [], []
    for kf in kfs:
        x, y, cw, ch = crop_at(kf.t)
        xs.append((kf.t, x))
        ys.append((kf.t, y))
        ws.append((kf.t, cw))
        hs.append((kf.t, ch))
    return (
        f"crop=w='{_pw_expr(ws)}':h='{_pw_expr(hs)}':x='{_pw_expr(xs)}':y='{_pw_expr(ys)}'"
        f",scale={target_w}:{target_h}"
    )


def _reframe_filter(source: Path, reframe: Reframe) -> tuple[str, bool]:
    """Filtro de reencuadre (simple o doble encuadre).

    Devuelve (filtro, es_filter_complex).
    """
    W, H = config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT
    if not reframe.dual_crop:
        filt = _single_reframe_filter(source, reframe.zoom, reframe.keyframes, reframe.pan_mode, W, H)
        return filt, False

    orient = reframe.split_orientation or "vertical"
    if orient == "vertical":
        w1, h1 = W, H // 2
        w2, h2 = W, H // 2
        f1 = _single_reframe_filter(source, reframe.zoom, reframe.keyframes, reframe.pan_mode, w1, h1)
        f2 = _single_reframe_filter(source, reframe.zoom2 or reframe.zoom, reframe.keyframes2 or reframe.keyframes, reframe.pan_mode, w2, h2)
        return f"[0:v]{f1}[v1];[0:v]{f2}[v2];[v1][v2]vstack=inputs=2[v]", True
    else:
        w1, h1 = W // 2, H
        w2, h2 = W // 2, H
        f1 = _single_reframe_filter(source, reframe.zoom, reframe.keyframes, reframe.pan_mode, w1, h1)
        f2 = _single_reframe_filter(source, reframe.zoom2 or reframe.zoom, reframe.keyframes2 or reframe.keyframes, reframe.pan_mode, w2, h2)
        return f"[0:v]{f1}[v1];[0:v]{f2}[v2];[v1][v2]hstack=inputs=2[v]", True


# Límite seguro: cmd.exe ~8191; CreateProcess ~32767. Dejamos margen.
_CMD_FILTER_LIMIT = 6000


def _vf_args(filt_str: str, tmp_dir: Path, complex_graph: bool) -> list[str]:
    """-vf / -filter_complex, o un archivo de script si el filtro no cabe en argv."""
    if complex_graph:
        flag, script_flag = "-filter_complex", "-filter_complex_script"
    else:
        flag, script_flag = "-vf", "-filter_script:v"
    if len(filt_str) < _CMD_FILTER_LIMIT:
        return [flag, filt_str]
    tmp_dir.mkdir(parents=True, exist_ok=True)
    path = tmp_dir / ("filter_complex.txt" if complex_graph else "filter_v.txt")
    path.write_text(filt_str, encoding="utf-8")
    return [script_flag, str(path)]


def _run_ffmpeg_cut(base: list[str], filt: list[str], maps_a: list[str], maps_an: list[str],
                    out_path: Path, seg_index: int) -> None:
    encode_a = [
        *gpu.video_encoder_args(),
        "-c:a", "aac",
        "-b:a", config.AUDIO_BITRATE,
        str(out_path),
    ]
    encode_an = [*gpu.video_encoder_args(), "-an", str(out_path)]
    try:
        proc = subprocess.run(base + filt + maps_a + encode_a, capture_output=True, text=True)
    except OSError as exc:
        code = getattr(exc, "winerror", None) or getattr(exc, "errno", None)
        if code == 206:
            raise RuntimeError(
                "El recorte es demasiado largo para Windows (comando FFmpeg). "
                "Guarda un tramo más corto o con menos encuadres."
            ) from exc
        raise
    if proc.returncode == 0:
        return
    proc2 = subprocess.run(base + filt + maps_an + encode_an, capture_output=True, text=True)
    if proc2.returncode != 0:
        err = (proc2.stderr or proc.stderr or "")[-800:]
        raise RuntimeError(f"FFmpeg falló en el clip {seg_index}:\n{err}")


def _cut_clip(source: Path, seg: Segment, mode: CropMode, out_path: Path,
              reframe: Reframe | None = None, tmp_dir: Path | None = None) -> None:
    """Corta un tramo del vídeo fuente aplicando el filtro del modo elegido."""
    base = [
        "ffmpeg", "-y",
        "-ss", str(seg.start),
        "-to", str(seg.end),
        "-i", str(source),
    ]
    script_dir = tmp_dir or out_path.parent
    maps_a: list[str] = []
    maps_an: list[str] = []

    if uses_source_trim(reframe):
        filt: list[str] = []
    elif mode == CropMode.smart_face and reframe and reframe.keyframes:
        filt_str, is_complex = _reframe_filter(source, reframe)
        filt = _vf_args(filt_str, script_dir, is_complex)
        if is_complex:
            maps_a = ["-map", "[v]", "-map", "0:a?"]
            maps_an = ["-map", "[v]"]
    elif mode == CropMode.center:
        filt = _vf_args(_crop_filter(mode), script_dir, False)
    elif mode == CropMode.smart_face:
        filt = _vf_args(_smart_face_filter(source, seg), script_dir, False)
    else:
        filt = _vf_args(_crop_filter(mode), script_dir, True)
        maps_a = ["-map", "[v]", "-map", "0:a?"]
        maps_an = ["-map", "[v]"]

    dur = max(0.0, float(seg.end) - float(seg.start))
    with timed("corte de clip (FFmpeg)", log, idx=seg.index, mode=mode.value, dur=f"{dur:.1f}s"):
        _run_ffmpeg_cut(base, filt, maps_a, maps_an, out_path, seg.index)


def generate_clips(
    url: str,
    segments: list[Segment],
    mode: CropMode,
    title: str,
    project_id: str,
    video_dir: Path,
    on_progress: ProgressCb,
    reframe: Reframe | None = None,
) -> list[ClipInfo]:
    """Genera todos los clips en ``video_dir`` y los devuelve.

    Los archivos se nombran con el título del vídeo como prefijo.
    """
    from urllib.parse import quote

    from . import storage

    clips: list[ClipInfo] = []
    video_dir.mkdir(parents=True, exist_ok=True)
    prefix = storage.safe_name(title)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        source = _download_source(url, tmp_dir, on_progress)

        # El reencuadre por keyframes solo aplica al recortar un único tramo
        # (los keyframes son relativos a ESE clip).
        clip_reframe = reframe if len(segments) == 1 else None

        total = len(segments)
        for i, seg in enumerate(segments):
            filename = f"{prefix}_{seg.index}.mp4"
            out_path = video_dir / filename
            _cut_clip(source, seg, mode, out_path, reframe=clip_reframe, tmp_dir=tmp_dir)

            clips.append(
                ClipInfo(
                    index=seg.index,
                    id=str(seg.index),
                    filename=filename,
                    url=f"/api/media/{project_id}/video/{quote(filename)}",
                    start=seg.start,
                    end=seg.end,
                    source_url=url,
                    label=seg.label,
                    description=seg.description,
                    reframe=clip_reframe,
                    origin="youtube",
                    source="external",
                )
            )
            # El recorte ocupa del 40% al 100% de la barra global.
            on_progress(0.4 + 0.6 * ((i + 1) / total), f"Generando clip {i + 1}/{total}…")

    return clips
