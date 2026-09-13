"""Export en BT.709 (checklist CapCut 1.9): FFmpeg de verdad.

Antes, la conversión final RGB→YUV usaba la matriz BT.601 sin etiquetar: una
imagen salía con el color desplazado (230,120,40 → ~238,123,34 visto como 709,
que es como lo ven navegador y YouTube). Y un vídeo SIN etiqueta de color debe
tratarse como 709 (igual que el preview) para que la conversión nueva no lo desplace.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.compose import _filter_script_cmd, build_command
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack

W, H = 64, 64
ORANGE = (230, 120, 40)


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True, capture_output=True)


def _pixel_709(path: Path) -> tuple[int, int, int]:
    """Píxel central decodificado como BT.709 rango limitado."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-frames:v", "1", "-vf",
         f"crop=2:2:{W // 2}:{H // 2},scale=in_color_matrix=bt709:in_range=tv,format=rgb24",
         "-f", "rawvideo", "-"],
        check=True, capture_output=True).stdout
    return raw[0], raw[1], raw[2]


def _probe_color(path: Path) -> str:
    return subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=color_space", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True).stdout.strip()


class ExportColorTest(unittest.TestCase):
    def setUp(self):
        self.td = Path(tempfile.mkdtemp(prefix="vy-color-"))
        hexc = "0x%02X%02X%02X" % ORANGE
        self.png = self.td / "o.png"
        _ffmpeg("-f", "lavfi", "-i", f"color=c={hexc}:s={W}x{H}:d=1", "-frames:v", "1", str(self.png))
        # Vídeo con matriz 709 pero SIN etiqueta (como sale un clip intermedio).
        tagged = self.td / "t.mp4"
        _ffmpeg("-loop", "1", "-t", "1", "-r", "15", "-i", str(self.png), "-vf",
                "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
                "-c:v", "libx264", "-crf", "1", "-colorspace", "bt709", str(tagged))
        self.untagged = self.td / "u.mp4"
        _ffmpeg("-i", str(tagged), "-c", "copy", "-bsf:v",
                "h264_metadata=colour_primaries=2:transfer_characteristics=2:matrix_coefficients=2",
                str(self.untagged))
        self.assertIn(_probe_color(self.untagged), ("", "unknown"))

    def tearDown(self):
        shutil.rmtree(self.td, ignore_errors=True)

    def _render(self, kind: str, path: Path, **kw) -> Path:
        asset = {"image": "images", "video": "clips"}[kind]
        data = dict(id="c1", track_id="V1", kind=kind, asset_kind=asset, asset_id="1",
                    filename=path.name, start=0.0, in_point=0.0, out_point=1.0,
                    source_duration=1.0, layout="fill")
        data.update(kw)
        clip = TimelineClip(**data)
        tl = Timeline(width=W, height=H, fps=15,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")], clips=[clip])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        out = self.td / f"out_{kind}.mp4"
        with patch("app.compose._clip_path", side_effect=lambda project, c, shape_files=None: path):
            cmd = build_command(proj, tl, out)
        res = subprocess.run(_filter_script_cmd(cmd, self.td), capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stderr[-2000:])
        return out

    def _cerca(self, got, want=ORANGE, delta=4):
        for a, b in zip(got, want):
            self.assertLessEqual(abs(a - b), delta, f"{got} != {want}")

    def test_imagen_conserva_color_y_se_etiqueta_709(self):
        out = self._render("image", self.png)
        self._cerca(_pixel_709(out))
        self.assertEqual(_probe_color(out), "bt709")

    def test_video_sin_etiqueta_se_trata_como_709(self):
        out = self._render("video", self.untagged)
        self._cerca(_pixel_709(out))

    def test_video_sin_etiqueta_con_overlay_rgb(self):
        out = self._render("video", self.untagged, opacity=1.0, layout="overlay")
        self._cerca(_pixel_709(out))


class ExportFpsTest(unittest.TestCase):
    """FPS por proyecto (checklist 1.8): el global de Configuración NO pisa timeline.fps."""

    def test_usa_fps_de_la_timeline(self):
        clip = TimelineClip(id="c1", track_id="V1", kind="image", asset_kind="images", asset_id="1",
                            filename="a.png", start=0.0, in_point=0.0, out_point=1.0,
                            source_duration=1.0, layout="fill")
        tl = Timeline(width=W, height=H, fps=25,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")], clips=[clip])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        fake = Path(__file__)  # existe; no se ejecuta ffmpeg
        with patch("app.compose._clip_path", side_effect=lambda project, c, shape_files=None: fake), \
             patch("app.export_settings.load", return_value={"fps": 60, "quality": "standard"}):
            cmd = build_command(proj, tl, Path("out.mp4"))
        self.assertEqual(cmd[cmd.index("-r") + 1], "25")


if __name__ == "__main__":
    unittest.main()
