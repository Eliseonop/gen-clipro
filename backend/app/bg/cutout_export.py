"""Exportar recorte: hornea el clip ENTERO con el fondo eliminado a un WebM
transparente (VP9 con alfa), conservando TODOS los fotogramas (la animación).

Reutiliza la cadena de alfa de FUENTE del export (``compose._bg_source_chain`` +
``compose._bg_input_args``) y la caché del matte (``service.build_clip_bg_mask``),
así que el recorte es idéntico a lo que la timeline ve y exporta — solo que
materializado a un archivo reutilizable. No aplica recorte/pose/efectos: es la
fuente con su alfa.

Lo usan Paper Animator (assets animados: el resultado sigue siendo un vídeo en el
material) y el botón "Exportar recorte" del editor.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable, Optional

from .. import clip_bg, compose, detect
from ..clip_kind import ffmpeg_input_args, ffmpeg_trim_window
from . import service as bg_service

ProgressCb = Optional[Callable[[float, str], None]]

# Acota el fps de salida (un mp4 raro puede reportar 1000 fps; un still, 0).
_FPS_MIN, _FPS_MAX, _FPS_DEFAULT = 5, 60, 25


def out_fps(path: Path) -> int:
    try:
        fps = float(detect.video_info(Path(path)).get("fps") or _FPS_DEFAULT)
    except Exception:  # noqa: BLE001 - sonda ilegible → default
        fps = _FPS_DEFAULT
    return int(min(_FPS_MAX, max(_FPS_MIN, round(fps or _FPS_DEFAULT))))


def render_clip_cutout(project, clip, out_path: Path, on_progress: ProgressCb = None) -> None:
    """Renderiza ``clip`` con el fondo eliminado a ``out_path`` (WebM VP9 alfa).

    El clip debe llevar eliminación de fondo ACTIVA (matte auto listo y/o chroma).
    El matte se supone ya calculado en la caché (``clip.bg_removal.auto.base_key``).
    """
    path = compose._clip_path(project, clip)
    if path is None or not Path(path).exists():
        raise RuntimeError("No se encuentra el material del clip.")
    path = Path(path)

    bg = clip_bg.clip_bg(clip)
    if not (clip_bg.auto_active(bg) or clip_bg.chroma_active(bg)):
        raise RuntimeError("El clip no tiene eliminación de fondo activa.")

    fps = out_fps(path)
    spec = bg_service.build_clip_bg_mask(clip, fps) if clip_bg.auto_active(bg) else None

    inputs: list[str] = ["-y", "-hide_banner", "-loglevel", "error",
                         *ffmpeg_input_args(clip, path, fps)]
    bg_input: Optional[int] = None
    if spec is not None:
        bg_input = 1                       # 0 = RGB de la fuente, 1 = secuencia del matte
        inputs += compose._bg_input_args(spec)

    tin, tout = ffmpeg_trim_window(clip, fps)
    out_dur = max(0.1, tout - tin)
    steps = [f"[0:v]trim={tin:.3f}:{tout:.3f},setpts=PTS-STARTPTS[bgin0]"]
    bg_steps, bg_label = compose._bg_source_chain(clip, path, spec, bg_input, 0, fps, "bgin0")
    steps.extend(bg_steps)
    # yuva420p: el formato de alfa que espera libvpx-vp9.
    steps.append(f"[{bg_label}]format=yuva420p,fps={fps}[vout]")
    filt = ";".join(steps)

    if on_progress:
        on_progress(0.9, "Codificando el recorte transparente…")
    cmd = [
        "ffmpeg", *inputs,
        "-filter_complex", filt,
        "-map", "[vout]",
        "-an",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
        "-b:v", "0", "-crf", "26",
        # libvpx-vp9 por defecto (cpu-used 0) es lentísimo; ``good`` + cpu-used 4
        # + row-mt lo hacen práctico sin perder apenas calidad. ``auto-alt-ref 0``
        # es obligatorio para conservar el plano alfa.
        "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
        "-auto-alt-ref", "0",
        # El matte con ``-stream_loop -1`` (GIF) es infinito y sin ``-t`` el encode
        # no terminaría: se acota la salida a la duración horneada del clip.
        "-t", f"{out_dur:.3f}",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not Path(out_path).exists():
        raise RuntimeError(
            f"FFmpeg falló al exportar el recorte:\n{(proc.stderr or '')[-800:]}")
    if on_progress:
        on_progress(0.98, "Recorte listo.")
