import unittest

from app.recipe_layout import (
    contain_scale_filter,
    dual_slot_wh,
    join_dual_filters,
    split_orientation_for,
)


class ComposeRecipeTest(unittest.TestCase):
    def test_dual_auto_landscape_hstack(self):
        orient = split_orientation_for(1280 / 720, {"split_layout": "auto"})
        w1, h1, w2, h2 = dual_slot_wh(1280, 720, orient)
        f1 = contain_scale_filter(w1, h1)
        f2 = contain_scale_filter(w2, h2)
        s = join_dual_filters(f1, f2, orient)
        self.assertEqual(orient, "horizontal")
        self.assertEqual((w1, h1, w2, h2), (640, 720, 640, 720))
        self.assertIn("hstack=inputs=2", s)
        self.assertNotIn("vstack=inputs=2", s)
        self.assertIn("pad=", s)

    def test_dual_auto_portrait_vstack(self):
        orient = split_orientation_for(720 / 1280, {"split_layout": "auto"})
        w1, h1, w2, h2 = dual_slot_wh(720, 1280, orient)
        s = join_dual_filters("A", "B", orient)
        self.assertEqual(orient, "vertical")
        self.assertEqual((w1, h1, w2, h2), (720, 640, 720, 640))
        self.assertIn("vstack=inputs=2", s)
        self.assertNotIn("hstack=inputs=2", s)
        self.assertEqual(s, "split=2[ca][cb];[ca]A[ta];[cb]B[tb];[ta][tb]vstack=inputs=2")

    def test_contain_letterbox_string(self):
        s = contain_scale_filter(720, 1280)
        self.assertIn("force_original_aspect_ratio=decrease", s)
        self.assertIn("pad=720:1280", s)
        self.assertNotIn("split=2", s)
