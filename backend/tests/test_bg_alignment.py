"""Eliminar fondo: el matte tiene que caer en el FOTOGRAMA correcto del export.

Es la parte de más riesgo de todo el diseño. Los PNG del matte se numeran por
fotograma ABSOLUTO de la fuente y el clip se recorta con ``-start_number``; si esa
cuenta se desalinea, el fondo se recorta "con retraso" y no lo detecta ningún test
de filtergraph. Aquí se comprueba de verdad, con FFmpeg y píxeles:

El matte del fotograma ``i`` es una franja vertical en la columna ``i``. Después
de exportar, la franja visible en el instante ``t`` de la timeline debe estar en
la columna ``round((in_point + t) * mask_fps)``.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from app import clip_bg
from app.bg import service as bg_service
from app.compose import _filter_script_cmd, build_command
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack

MASK_FPS = 10
BARS = 40            # fotogramas de matte (4 s a 10 fps)
W, H = 160, 120      # tamaño de salida (pequeño: el test tiene que ser rápido)


@unittest.skipUnless(shutil.which("ffmpeg"), "requiere ffmpeg en el PATH")
class MatteAlignmentTest(unittest.TestCase):
    def setUp(self):
        self.td = Path(tempfile.mkdtemp(prefix="vy-bgalign-"))
        # Fuente: un VÍDEO blanco de 4 s (no un PNG: hace falta que `trim` tenga
        # de dónde cortar, que es justo lo que este test ejercita).
        self.src = self.td / "white.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", f"color=c=white:s={W}x{H}:r=30:d={BARS / MASK_FPS}",
             "-pix_fmt", "yuv420p", str(self.src)], check=True, capture_output=True)
        # Matte: en el fotograma i, una franja opaca en la columna i (4 px de ancho).
        self.seq = self.td / "mask"
        self.seq.mkdir()
        self.bar_w = 4
        for i in range(BARS):
            m = np.zeros((H, W), np.uint8)
            x = i * self.bar_w
            m[:, x:x + self.bar_w] = 255
            cv2.imwrite(str(bg_service.frame_path(self.seq, i)), m)

    def tearDown(self):
        shutil.rmtree(self.td, ignore_errors=True)

    def _export(self, in_point: float, dur: float, fps: int, speed: float = 1.0,
                reverse: bool = False) -> Path:
        clip = TimelineClip(
            id="c1", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
            filename="white.mp4", start=0.0, in_point=in_point,
            out_point=in_point + dur, source_duration=BARS / MASK_FPS,
            layout="fill", speed=speed, reverse=reverse,
            bg_removal={
                "enabled": True, "mode": "auto",
                "auto": {"enabled": True, "base_key": "k", "status": "ready",
                         "mask_fps": MASK_FPS, "mask_height": H},
                "chroma": {"enabled": False},
            },
        )
        tl = Timeline(width=W, height=H, fps=fps,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[clip])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        start_number = clip_bg.matte_frame_index(in_point, MASK_FPS) + 1
        bg_files = {"c1": {
            "path": bg_service.frame_pattern(self.seq), "start_number": start_number,
            "mask_fps": MASK_FPS, "frames": BARS, "duration": dur,
            "width": W, "height": H,
        }}
        out = self.td / "out.mp4"
        with patch("app.compose._clip_path", return_value=self.src), \
             patch("app.detect.dims", return_value=(W, H)):
            cmd = build_command(proj, tl, out, bg_files=bg_files)
        res = subprocess.run(_filter_script_cmd(cmd, self.td), capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stderr[-2000:])
        return out

    def _bar_column(self, video: Path, t: float) -> int | None:
        """Columna donde está la franja visible en el instante ``t`` del vídeo."""
        png = self.td / "f.png"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.4f}", "-i", str(video),
             "-frames:v", "1", str(png)], check=True, capture_output=True)
        img = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
        row = img[H // 2].astype(int)
        # el fondo del compose es negro; la franja es lo único claro
        cols = np.where(row > 128)[0]
        if not len(cols):
            return None
        return int(round(float(cols.mean())))

    def _expected_column(self, src_t: float) -> int:
        i = clip_bg.matte_frame_index(src_t, MASK_FPS)
        return i * self.bar_w + (self.bar_w - 1) / 2

    def test_clip_sin_recortar(self):
        video = self._export(0.0, 2.0, fps=30)
        for t in (0.0, 0.25, 0.5, 1.0, 1.5, 1.9):
            got = self._bar_column(video, t)
            self.assertIsNotNone(got, f"sin franja en t={t}")
            self.assertLessEqual(
                abs(got - self._expected_column(t)), self.bar_w,
                f"t={t}: franja en {got}, esperada en {self._expected_column(t)}")

    def test_clip_recortado_usa_start_number(self):
        """El caso que rompe si -start_number no cuadra: el clip empieza en 1,2 s."""
        in_point = 1.2
        video = self._export(in_point, 1.5, fps=30)
        for t in (0.0, 0.3, 0.7, 1.2, 1.4):
            got = self._bar_column(video, t)
            self.assertIsNotNone(got, f"sin franja en t={t}")
            want = self._expected_column(in_point + t)
            self.assertLessEqual(
                abs(got - want), self.bar_w,
                f"t={t}: franja en {got}, esperada en {want} (fuente {in_point + t:.2f}s)")

    def test_recorte_no_alineado_a_la_rejilla_del_matte(self):
        """in_point entre dos fotogramas del matte: el más cercano, no el anterior."""
        in_point = 0.55       # a 10 fps cae entre el 5 y el 6
        video = self._export(in_point, 1.0, fps=25)
        for t in (0.0, 0.4, 0.8):
            got = self._bar_column(video, t)
            self.assertIsNotNone(got, f"sin franja en t={t}")
            want = self._expected_column(in_point + t)
            self.assertLessEqual(abs(got - want), self.bar_w * 1.5,
                                 f"t={t}: {got} vs {want}")

    def test_fps_de_salida_distinto_del_matte(self):
        """El matte va a 10 fps y la salida a 60: el filtro fps debe duplicar."""
        video = self._export(0.0, 1.0, fps=60)
        for t in (0.0, 0.2, 0.55, 0.9):
            got = self._bar_column(video, t)
            self.assertIsNotNone(got, f"sin franja en t={t}")
            self.assertLessEqual(abs(got - self._expected_column(t)), self.bar_w,
                                 f"t={t}: {got} vs {self._expected_column(t)}")

    def test_velocidad_2x_arrastra_el_matte(self):
        """El alfa se aplica ANTES de la velocidad: la hereda sin filtros extra.

        A 2x, el instante ``t`` de la timeline muestra la fuente ``in + 2t``.
        """
        video = self._export(0.0, 1.0, fps=30, speed=2.0)
        for t in (0.05, 0.2, 0.4):
            got = self._bar_column(video, t)
            self.assertIsNotNone(got, f"sin franja en t={t}")
            want = self._expected_column(t * 2.0)
            self.assertLessEqual(abs(got - want), self.bar_w * 2,
                                 f"t={t} a 2x: {got} vs {want}")


if __name__ == "__main__":
    unittest.main()
