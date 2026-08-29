import unittest

from app.recipe_layout import (
    contain_dest,
    is_master_reframe,
    split_orientation_for,
    synced_dual_slots,
)


class RecipeLayoutTest(unittest.TestCase):
    def test_auto_portrait_stacks(self):
        self.assertEqual(split_orientation_for(9 / 16, {"split_layout": "auto"}), "vertical")

    def test_auto_landscape_rows(self):
        self.assertEqual(split_orientation_for(16 / 9, {"split_layout": "auto"}), "horizontal")

    def test_explicit_layout_wins(self):
        self.assertEqual(split_orientation_for(9 / 16, {"split_layout": "horizontal"}), "horizontal")

    def test_legacy_split_orientation(self):
        self.assertEqual(split_orientation_for(16 / 9, {"split_orientation": "vertical"}), "vertical")

    def test_synced_slots(self):
        self.assertEqual(synced_dual_slots(9 / 16, {"split_layout": "auto"}), ["top", "bottom"])
        self.assertEqual(synced_dual_slots(16 / 9, {"split_layout": "auto"}), ["left", "right"])

    def test_dual_stack_name(self):
        from app.recipe_layout import dual_stack_name
        self.assertEqual(dual_stack_name("vertical"), "vstack=inputs=2")
        self.assertEqual(dual_stack_name("horizontal"), "hstack=inputs=2")

    def test_master_flag(self):
        self.assertTrue(is_master_reframe({"master": True}))
        self.assertFalse(is_master_reframe({}))
        self.assertFalse(is_master_reframe(None))

    def test_contain_keeps_source_aspect(self):
        box = contain_dest(720, 1280, 1920, 1080)
        self.assertLessEqual(box["dw"], 720 + 1e-6)
        self.assertLessEqual(box["dh"], 1280 + 1e-6)
        self.assertAlmostEqual(box["dw"] / box["dh"], 1920 / 1080)


if __name__ == "__main__":
    unittest.main()
