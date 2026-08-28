"""Descarga del vídeo fuente y recorte de cada tramo a formato vertical 9:16.

Estrategia (v1, sencilla y robusta):
  1. Descargar el vídeo fuente una sola vez (hasta 1080p) a un archivo temporal.
  2. Por cada tramo, cortar con FFmpeg aplicando el filtro del modo de recorte.

Más adelante se puede optimizar usando descargas por rango (download_ranges)
para ahorrar ancho de banda.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Callable

from yt_dlp import YoutubeDL

from . import config
from .schemas import ClipInfo, CropMode, Reframe, Segment

ProgressCb = Callable[[float, str], None]


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

    with YoutubeDL(opts) as ydl:
        ydl.download([url])

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

    z = _clamp(zoom or 1.0, 0.1, 1.0)
    ch = int(round(ih * z)); ch -= ch % 2
    cw = int(round(ch * target_w / target_h)); cw -= cw % 2
    cw = min(cw, iw - (iw % 2))
    ch = min(ch, ih - (ih % 2))

    xs: list[tuple[float, float]] = []
    ys: list[tuple[float, float]] = []
    for kf in keyframes:
        x = _clamp(kf.cx * iw - cw / 2, 0, iw - cw)
        y = _clamp(kf.cy * ih - ch / 2, 0, ih - ch)
        xs.append((kf.t, x))
        ys.append((kf.t, y))

    if not xs:
        x_expr = f"{(iw - cw) // 2}"
        y_expr = f"{(ih - ch) // 2}"
    elif pan_mode == "direct":
        x_expr = _pw_expr_direct(xs)
        y_expr = _pw_expr_direct(ys)
    else:
        x_expr = _pw_expr(xs)
        y_expr = _pw_expr(ys)

    return f"crop=w={cw}:h={ch}:x='{x_expr}':y='{y_expr}',scale={target_w}:{target_h}"


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


def _cut_clip(source: Path, seg: Segment, mode: CropMode, out_path: Path,
              reframe: Reframe | None = None) -> None:
    """Corta un tramo del vídeo fuente aplicando el filtro del modo elegido."""
    base = [
        "ffmpeg", "-y",
        "-ss", str(seg.start),
        "-to", str(seg.end),
        "-i", str(source),
    ]

    if mode == CropMode.smart_face and reframe and reframe.keyframes:
        filt_str, is_complex = _reframe_filter(source, reframe)
        if is_complex:
            filt = ["-filter_complex", filt_str, "-map", "[v]", "-map", "0:a?"]
        else:
            filt = ["-vf", filt_str]
    elif mode == CropMode.center:
        # Sin -map: FFmpeg selecciona por defecto el vídeo (ya filtrado) + audio.
        filt = ["-vf", _crop_filter(mode)]
    elif mode == CropMode.smart_face:
        filt = ["-vf", _smart_face_filter(source, seg)]
    else:
        filt = ["-filter_complex", _crop_filter(mode), "-map", "[v]", "-map", "0:a?"]

    encode = [
        "-c:v", "libx264",
        "-crf", str(config.VIDEO_CRF),
        "-preset", config.VIDEO_PRESET,
        "-c:a", "aac",
        "-b:a", config.AUDIO_BITRATE,
        str(out_path),
    ]

    proc = subprocess.run(
        base + filt + encode,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg falló en el clip {seg.index}:\n{proc.stderr[-800:]}")


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
            _cut_clip(source, seg, mode, out_path, reframe=clip_reframe)

            clips.append(
                ClipInfo(
                    index=seg.index,
                    filename=filename,
                    url=f"/api/media/{project_id}/video/{quote(filename)}",
                    start=seg.start,
                    end=seg.end,
                    source_url=url,
                    label=seg.label,
                    description=seg.description,
                    reframe=clip_reframe,
                )
            )
            # El recorte ocupa del 40% al 100% de la barra global.
            on_progress(0.4 + 0.6 * ((i + 1) / total), f"Generando clip {i + 1}/{total}…")

    return clips
