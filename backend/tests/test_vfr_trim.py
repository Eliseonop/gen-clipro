"""Clip de un vídeo VFR con hueco (grabación de pantalla): FFmpeg de verdad.

Las grabadoras de pantalla solo escriben fotograma cuando la pantalla cambia.
Un clip cuyo in/out cae entero en un hueco sin fotogramas salía NEGRO en el
export (el ``trim`` quedaba vacío); el preview muestra el último fotograma.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from app.clip_kind import ffmpeg_trim_filter


def _ffmpeg(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["ffmpeg", "-y", "-hide_banner", *args], check=True,
                          capture_output=True, text=True)


def _frames_out(path: Path, chain: str) -> int:
    """Fotogramas que salen de ``chain`` aplicado al vídeo (conteo de framemd5)."""
    r = _ffmpeg("-v", "error", "-i", str(path), "-filter_complex",
                f"[0:v]{chain}[v]", "-map", "[v]", "-f", "framemd5", "-")
    return sum(1 for ln in r.stdout.splitlines() if ln and not ln.startswith("#"))


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg no disponible")
class VfrGapTrimTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.td = Path(tempfile.mkdtemp(prefix="vy-vfr-"))
        cls.src = cls.td / "vfr.mp4"
        # 10 fps durante 6 s, pero sin fotogramas entre 1 s y 5 s.
        _ffmpeg("-v", "error", "-f", "lavfi", "-i", "testsrc=s=64x64:r=10:d=6",
                "-vf", "select='not(between(t,1.05,4.95))'", "-fps_mode", "vfr",
                "-c:v", "libx264", str(cls.src))

    def _clip(self, inp: float, out: float) -> dict:
        return {"kind": "video", "asset_kind": "clips", "in_point": inp,
                "out_point": out, "source_duration": 6.0}

    def test_trim_inside_gap_is_not_empty(self):
        clip = self._clip(2.0, 3.0)
        self.assertEqual(_frames_out(self.src, "trim=2:3"), 0)  # el bug
        n = _frames_out(self.src, f"{ffmpeg_trim_filter(clip, 30)},setpts=PTS-STARTPTS")
        self.assertGreaterEqual(n, 29)

    def test_trim_starting_in_gap_keeps_timing(self):
        # Empieza en el hueco: debe durar out-in, no arrancar en el fotograma de 5 s.
        clip = self._clip(3.0, 5.5)
        n = _frames_out(self.src, f"{ffmpeg_trim_filter(clip, 30)},setpts=PTS-STARTPTS")
        self.assertGreaterEqual(n, 74)

    def test_still_has_no_fps_prefix(self):
        still = {"kind": "image", "asset_kind": "images", "in_point": 0, "out_point": 2}
        self.assertEqual(ffmpeg_trim_filter(still, 30), "trim=0.000:2.000")


if __name__ == "__main__":
    unittest.main()
