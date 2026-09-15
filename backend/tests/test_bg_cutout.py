"""Exportar recorte: render del clip con el fondo eliminado a WebM transparente.

Lo que se fija:
  * Un GIF animado produce un WebM con MÁS de un fotograma (conserva la
    animación; es el arreglo de "el resultado es una imagen estática").
  * El chroma key solo (sin matte) también hornea el recorte.
  * FFmpeg de verdad compone la cadena reutilizada de ``compose._bg_source_chain``.

Usa un proveedor de matte FALSO (determinista): no descarga pesos ni ejecuta ONNX.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app import clip_bg
from app.bg import cutout_export
from app.bg import providers as bg_providers
from app.bg import service as bg_service
from app.schemas import TimelineClip


class FakeProvider(bg_providers.BackgroundRemovalProvider):
    """Matte determinista: mitad izquierda sujeto (opaco), derecha fondo."""

    id = "u2net"
    label = "falso"
    model_version = "fake-1"

    def available(self):
        return True

    def unavailable_reason(self):
        return ""

    def ensure_ready(self, on_progress=None):
        pass

    def matte(self, frame):
        h, w = frame.shape[:2]
        m = np.zeros((h, w), np.uint8)
        m[:, : w // 2] = 255
        return m


def _frame_count(path: Path) -> int:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
         "-show_entries", "stream=nb_read_frames", "-of", "default=nk=1:nw=1", str(path)],
        capture_output=True, text=True)
    return int((out.stdout or "0").strip() or 0)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                     "requiere ffmpeg y ffprobe en el PATH")
class CutoutRenderTest(unittest.TestCase):
    def setUp(self):
        self.td = Path(tempfile.mkdtemp(prefix="vy-cutout-"))
        self.prov = FakeProvider()
        self._patches = [
            patch.object(bg_service, "CACHE_ROOT", self.td / "bgcache"),
            patch.object(bg_service, "MATTE_ROOT", self.td / "bgcache" / "matte"),
            patch.object(bg_service, "MASK_ROOT", self.td / "bgcache" / "mask"),
            patch.object(bg_service, "EMBED_ROOT", self.td / "bgcache" / "embed"),
            patch.object(bg_providers, "PROVIDERS", {"u2net": self.prov}),
            patch.object(bg_providers, "_device_setting", return_value="cpu"),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()
        shutil.rmtree(self.td, ignore_errors=True)

    def _gif(self, seconds=1.0, name="a.gif") -> Path:
        out = self.td / name
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size=96x64:rate=10",
             str(out)], check=True, capture_output=True)
        return out

    def _video(self, seconds=1.0, name="v.mp4") -> Path:
        out = self.td / name
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size=96x64:rate=10",
             "-pix_fmt", "yuv420p", str(out)], check=True, capture_output=True)
        return out

    def _auto(self, **kw):
        return clip_bg.normalize_auto({"provider": "u2net", "mask_fps": 10,
                                       "mask_height": 64, **kw})

    def test_recorte_de_gif_conserva_la_animacion(self):
        """El bug: un GIF salía como imagen estática. El recorte debe animar."""
        gif = self._gif(1.0)
        auto = self._auto()
        meta = bg_service.build_matte(gif, auto, 0.0, 0.0, still=True)
        clip = TimelineClip(
            id="c1", track_id="V1", kind="image", asset_kind="images", asset_id="1",
            filename="a.gif", in_point=0.0, out_point=float(meta["source_duration"]),
            source_duration=float(meta["source_duration"]),
            bg_removal={"enabled": True, "mode": "auto",
                        "auto": {**auto, "enabled": True, "base_key": meta["base_key"],
                                 "status": "ready"},
                        "chroma": {"enabled": False}})
        out = self.td / "cut.webm"
        with patch("app.compose._clip_path", return_value=gif):
            cutout_export.render_clip_cutout(None, clip, out)
        self.assertTrue(out.exists() and out.stat().st_size > 0)
        self.assertGreater(_frame_count(out), 1, "el recorte del GIF salió estático")

    def test_recorte_solo_chroma_en_video(self):
        vid = self._video(1.0)
        clip = TimelineClip(
            id="c2", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
            filename="v.mp4", in_point=0.0, out_point=1.0, source_duration=1.0,
            bg_removal={"enabled": True, "mode": "chroma",
                        "auto": {"enabled": False, "base_key": "", "status": "idle"},
                        "chroma": {"enabled": True, "color": "#00FF00"}})
        out = self.td / "cut2.webm"
        with patch("app.compose._clip_path", return_value=vid):
            cutout_export.render_clip_cutout(None, clip, out)
        self.assertTrue(out.exists() and out.stat().st_size > 0)
        self.assertGreater(_frame_count(out), 1)

    def test_sin_fondo_activo_falla(self):
        vid = self._video(0.5)
        clip = TimelineClip(
            id="c3", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
            filename="v.mp4", in_point=0.0, out_point=0.5, source_duration=0.5)
        with patch("app.compose._clip_path", return_value=vid):
            with self.assertRaises(RuntimeError):
                cutout_export.render_clip_cutout(None, clip, self.td / "no.webm")


if __name__ == "__main__":
    unittest.main()
