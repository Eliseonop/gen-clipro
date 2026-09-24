"""Barras de cine (#20): grosor, figura letterbox, op y export animado."""
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.shapes import cinema_bar, normalize_shape, rasterize_shape, shape_draw_at, shape_geometry
from app.timeline_ops import add_cinema_bars


def _tl(w=720, h=1280, dur=6.0):
    return Timeline(width=w, height=h, fps=25, tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                    clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips", asset_id="0",
                                        filename="a.mp4", out_point=dur, source_duration=dur)])


class BarTest(unittest.TestCase):
    def test_grosor_por_proporcion(self):
        # Mismos números que frontend/src/lib/cinemaBars.test.mjs.
        self.assertEqual(cinema_bar(16 / 9, 2.39), 0.1281)
        self.assertEqual(cinema_bar(16 / 9, 16 / 9), 0.0)
        self.assertEqual(cinema_bar(9 / 16, 16 / 9), 0.3418)
        self.assertEqual(cinema_bar(9 / 16, 2.39), 0.3823)
        self.assertEqual(cinema_bar(9 / 16, 100), 0.45, "con tope")

    def test_figura(self):
        st = normalize_shape({"type": "letterbox", "bar": 0.9})
        self.assertEqual((st["bar"], st["w"], st["h"], st["x"]), (0.5, 1, 1, 0.5))
        geo = shape_geometry("letterbox", normalize_shape({"type": "letterbox", "bar": 0.2}))
        self.assertEqual(len(geo["fills"]), 2)
        self.assertEqual(geo["fills"][0][2], (101, 20.0))
        img = rasterize_shape({"type": "letterbox", "bar": 0.1}, 360, 640)
        col = img[:, 180, 3] > 127
        self.assertAlmostEqual(int(col[:320].sum()), 64, delta=1)
        self.assertAlmostEqual(int(col[320:].sum()), 64, delta=1)
        self.assertEqual(int(img[320, 180, 3]), 0, "el centro queda a la vista")
        half = rasterize_shape({"type": "letterbox", "bar": 0.1}, 360, 640, draw=0.5)
        self.assertAlmostEqual(int((half[:, 180, 3] > 127)[:320].sum()), 32, delta=1, msg="a medio entrar")


class OpTest(unittest.TestCase):
    def test_hasta_el_final_encima_de_todo(self):
        r = add_cinema_bars(_tl(1280, 720), "2.39")
        tl = r.timeline
        bars = next(c for c in tl.clips if c.shape and c.shape.get("type") == "letterbox")
        self.assertEqual(bars.shape["bar"], 0.1281)
        self.assertEqual((bars.start, bars.out_point), (0.0, 6.0))
        self.assertEqual(bars.track_id, tl.tracks[-1].id)
        self.assertEqual(len(tl.tracks), 2, "V1 estaba ocupada: pista nueva encima")
        self.assertIsNone(bars.keyframes)

    def test_animadas(self):
        tl = add_cinema_bars(_tl(), "16:9", animate=True).timeline
        bars = next(c for c in tl.clips if c.name == "Barras de cine")
        self.assertAlmostEqual(shape_draw_at(bars, 0), 0.0)
        self.assertAlmostEqual(shape_draw_at(bars, 0.5), 0.5, places=3)
        self.assertAlmostEqual(shape_draw_at(bars, 3), 1.0)

    def test_errores(self):
        with self.assertRaises(ValueError):
            add_cinema_bars(_tl(1280, 720), "16:9")        # ya es 16:9: no hay barras
        with self.assertRaises(ValueError):
            add_cinema_bars(_tl(), "panorámico")
        self.assertEqual(add_cinema_bars(_tl(), 2.0).timeline.clips[-1].shape["bar"], cinema_bar(9 / 16, 2.0))


@unittest.skipUnless(shutil.which("ffmpeg"), "sin ffmpeg")
class ExportTest(unittest.TestCase):
    def test_entran_en_el_export(self):
        from unittest.mock import patch

        import cv2

        from app.compose import render_frame

        tmp = Path(tempfile.mkdtemp())
        white = tmp / "w.png"
        cv2.imwrite(str(white), np.full((640, 360, 3), 255, np.uint8))
        tl = Timeline(width=360, height=640, fps=25, tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[TimelineClip(id="im", track_id="V1", kind="image", asset_kind="images", asset_id="1",
                                          filename="w.png", out_point=3, source_duration=3, layout="fill")])
        tl = add_cinema_bars(tl, "16:9", animate=True).timeline
        bar = next(c for c in tl.clips if c.name == "Barras de cine").shape["bar"]
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        try:
            heights = {}
            for at in (0.52, 2.0):      # 0,52 s = fotograma 13 exacto a 25 fps
                with patch("app.compose._clip_path",
                           side_effect=lambda _p, c, files=None: white if c.kind == "image" else (files or {}).get(c.id)):
                    img = cv2.imread(str(render_frame(proj, tl, tmp / f"f{at}.png", at)))
                heights[at] = int((img[:320, 180].mean(axis=1) < 128).sum())
            self.assertAlmostEqual(heights[2.0], bar * 640, delta=2)
            anim = next(c for c in tl.clips if c.name == "Barras de cine")
            self.assertAlmostEqual(heights[0.52], bar * 640 * shape_draw_at(anim, 0.52), delta=2)
            self.assertLess(heights[0.52], heights[2.0] * 0.6, "a mitad de la entrada")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
