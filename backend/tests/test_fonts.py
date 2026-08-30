import unittest
from pathlib import Path

from app.compose import resolve_font_path, ass_overlay_filter


class BundledFontsTest(unittest.TestCase):
    def test_anton_uses_bundled_ttf(self):
        p = resolve_font_path("Anton", bold=True)
        self.assertEqual(p.name, "Anton-Regular.ttf")
        self.assertTrue(p.exists())
        self.assertIn("Anton-Regular.ttf", str(p))

    def test_arial_still_system_font(self):
        p = resolve_font_path("Arial", bold=False)
        self.assertEqual(p.name.lower(), "arial.ttf")

    def test_ass_filter_includes_fontsdir(self):
        spec = ass_overlay_filter(Path("C:/tmp/subs.ass"))
        self.assertIn("ass=", spec)
        self.assertIn("fontsdir=", spec)


if __name__ == "__main__":
    unittest.main()
