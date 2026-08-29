import unittest

from app.compose_layout import slot_norm, slot_pixels


class SlotLayoutTest(unittest.TestCase):
    def test_top_bottom_half(self):
        self.assertEqual(slot_norm("top"), {"x": 0.0, "y": 0.0, "w": 1.0, "h": 0.5})
        x, y, w, h = slot_pixels("top")
        self.assertEqual((x, y), (0, 0))
        self.assertEqual(w, 720)
        self.assertEqual(h, 640)
        x2, y2, w2, h2 = slot_pixels("bottom")
        self.assertEqual(y2, 640)
        self.assertEqual(h2, 640)
        self.assertEqual(y + h, y2)

    def test_left_right(self):
        x, y, w, h = slot_pixels("left")
        self.assertEqual((x, y, w, h), (0, 0, 360, 1280))
        x2, y2, w2, h2 = slot_pixels("right")
        self.assertEqual((x2, y2, w2, h2), (360, 0, 360, 1280))

    def test_overlay_pip_second(self):
        x, y, w, h = slot_pixels("overlay", 0)
        self.assertEqual((x, y, w, h), (0, 0, 720, 1280))
        x2, y2, w2, h2 = slot_pixels("overlay", 1)
        self.assertGreater(x2, 0)
        self.assertLess(w2, 720)

    def test_custom_and_even_dims(self):
        x, y, w, h = slot_pixels("custom", 0, {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.4})
        self.assertEqual(x % 2, 0)
        self.assertEqual(y % 2, 0)
        self.assertEqual(w % 2, 0)
        self.assertEqual(h % 2, 0)


if __name__ == "__main__":
    unittest.main()
