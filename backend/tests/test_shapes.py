import math
import tempfile
import unittest
from pathlib import Path

from app.clip_kind import clip_fits_track, has_generated_duration, is_still_clip, is_visual_clip
from app.schemas import TimelineClip
from app.shapes import default_shape, normalize_shape, rasterize_shape, shape_geometry, write_shape_png


class ShapeKindTest(unittest.TestCase):
    def test_shape_vive_en_pista_de_video(self):
        self.assertTrue(clip_fits_track("shape", "video"))
        self.assertFalse(clip_fits_track("shape", "audio"))
        self.assertFalse(clip_fits_track("shape", "text"))

    def test_shape_es_still_generado_no_reframe(self):
        clip = {"kind": "shape"}
        self.assertTrue(is_still_clip(clip))
        self.assertTrue(has_generated_duration(clip))
        self.assertFalse(is_visual_clip(clip))


class ShapeGeometryTest(unittest.TestCase):
    def test_arrow_has_polygon(self):
        geo = shape_geometry("arrow", default_shape("arrow"))
        self.assertGreaterEqual(len(geo["fills"][0]), 7)

    def test_curved_arrow_single_sharp_tip(self):
        geo = shape_geometry("arrow_curve", default_shape("arrow_curve"))
        self.assertEqual(len(geo["fills"]), 1)
        self.assertEqual(geo["strokes"], [])
        ring = geo["fills"][0]
        tip = max(ring, key=lambda p: p[0])
        same = [p for p in ring if abs(p[0] - tip[0]) < 0.2 and abs(p[1] - tip[1]) < 0.2]
        self.assertEqual(len(same), 1)
        self.assertGreater(tip[0], 80)
        i = next(n for n, p in enumerate(ring) if abs(p[0] - tip[0]) < 0.2 and abs(p[1] - tip[1]) < 0.2)
        wing_a = ring[(i - 1) % len(ring)]
        wing_b = ring[(i + 1) % len(ring)]
        span = math.hypot(wing_a[0] - wing_b[0], wing_a[1] - wing_b[1])
        self.assertGreater(span, 22)
        near = [p for p in ring if math.hypot(p[0] - tip[0], p[1] - tip[1]) < 10]
        self.assertEqual(len(near), 1)
        def line_dist(p, a, b):
            vx, vy = b[0] - a[0], b[1] - a[1]
            length = math.hypot(vx, vy) or 1
            return abs((p[0] - a[0]) * vy - (p[1] - a[1]) * vx) / length
        base_a = ring[(i - 2) % len(ring)]
        base_b = ring[(i + 2) % len(ring)]
        self.assertLess(line_dist(base_a, wing_a, wing_b), 1.2)
        self.assertLess(line_dist(base_b, wing_a, wing_b), 1.2)
        neck_w = math.hypot(base_a[0] - base_b[0], base_a[1] - base_b[1])
        tail_w = math.hypot(ring[0][0] - ring[-1][0], ring[0][1] - ring[-1][1])
        self.assertLess(abs(neck_w - tail_w), 1.6)
        self.assertLess(abs(neck_w - 10), 1.2)

    def test_line_is_stroke(self):
        geo = shape_geometry("line", default_shape("line"))
        self.assertEqual(geo["fills"], [])
        self.assertEqual(len(geo["strokes"]), 1)

    def test_normalize_clamps(self):
        st = normalize_shape({"type": "rect", "x": 9, "opacity": 4, "w": 0.01})
        self.assertEqual(st["x"], 1)
        self.assertEqual(st["opacity"], 1)
        self.assertEqual(st["w"], 0.04)


class ShapeRasterTest(unittest.TestCase):
    def test_png_has_alpha_and_pixels(self):
        img = rasterize_shape(default_shape("arrow"), 180, 320)
        self.assertEqual(img.shape[0], 320)
        self.assertEqual(img.shape[1], 180)
        self.assertEqual(img.shape[2], 4)
        self.assertGreater(int(img[:, :, 3].max()), 200)
        self.assertGreater(int(img[:, :, 2].max()), 80)  # rojo en BGR → canal R

    def test_write_png(self):
        with tempfile.TemporaryDirectory() as td:
            path = write_shape_png(default_shape("circle"), 64, 64, Path(td) / "s.png")
            self.assertTrue(path.exists())
            self.assertGreater(path.stat().st_size, 40)

    def test_schema_acepta_shape(self):
        c = TimelineClip(
            id="c1", track_id="V2", kind="shape", asset_kind="shape",
            asset_id="arrow", filename="", start=0, in_point=0, out_point=5,
            source_duration=5, shape=default_shape("arrow"),
        )
        self.assertEqual(c.kind, "shape")
        self.assertEqual(c.shape["type"], "arrow")


if __name__ == "__main__":
    unittest.main()
