import unittest

from app.clip_layout import dest_rect, dest_rect_even, is_overlay, source_crop_px


class OverlayIndependenceTest(unittest.TestCase):
    def test_scale_1_is_source_pixels(self):
        sx, sy, sw, sh = source_crop_px(500 / 1920, 300 / 1080, 0.4, 0.3, 1920, 1080)
        self.assertAlmostEqual(sw, 500, delta=1.5)
        self.assertAlmostEqual(sh, 300, delta=1.5)
        dx, dy, dw, dh, rot = dest_rect({"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0}, sw, sh, 720, 1280)
        self.assertAlmostEqual(dw, 500, delta=1.5)
        self.assertAlmostEqual(dh, 300, delta=1.5)
        self.assertEqual(rot, 0)

    def test_scale_does_not_change_crop_pixels(self):
        crop = source_crop_px(500 / 1920, 300 / 1080, 0.4, 0.3, 1920, 1080)
        d1 = dest_rect({"x": 0.5, "y": 0.5, "scale": 1}, crop[2], crop[3], 720, 1280)
        d2 = dest_rect({"x": 0.2, "y": 0.8, "scale": 2}, crop[2], crop[3], 720, 1280)
        self.assertAlmostEqual(d2[2], 1000, delta=2)
        self.assertAlmostEqual(d2[3], 600, delta=2)
        self.assertAlmostEqual(d1[2], 500, delta=1.5)
        # el crop de fuente no se recalcula: mismos sw/sh
        self.assertEqual(crop[2], source_crop_px(500 / 1920, 300 / 1080, 0.4, 0.3, 1920, 1080)[2])

    def test_overlay_flag(self):
        self.assertTrue(is_overlay({"layout": "overlay"}))
        self.assertFalse(is_overlay({"layout": "fill"}))
        self.assertFalse(is_overlay({}))

    def test_even_dest_for_ffmpeg(self):
        x, y, w, h, _ = dest_rect_even({"x": 0.5, "y": 0.5, "scale": 1.5}, 500, 300, 720, 1280)
        self.assertEqual(w % 2, 0)
        self.assertEqual(h % 2, 0)
        self.assertAlmostEqual(w, 750, delta=2)


if __name__ == "__main__":
    unittest.main()
