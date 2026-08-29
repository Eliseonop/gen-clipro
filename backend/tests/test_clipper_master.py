import unittest

from app.recipe_layout import uses_source_trim


class SourceTrimTest(unittest.TestCase):
    def test_master_skips_baked_crop(self):
        self.assertTrue(uses_source_trim({"master": True}))

    def test_legacy_bakes_crop(self):
        self.assertFalse(uses_source_trim({"master": False}))
        self.assertFalse(uses_source_trim({}))
        self.assertFalse(uses_source_trim(None))


if __name__ == "__main__":
    unittest.main()
