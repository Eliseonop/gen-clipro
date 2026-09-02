import shutil
import tempfile
import unittest
from pathlib import Path

from app import export_settings, settings


class ExportSettingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_defaults(self):
        cfg = export_settings.load()
        self.assertEqual(cfg["fps"], 30)
        self.assertEqual(cfg["quality"], "standard")
        crf, preset = export_settings.encoder_quality()
        self.assertEqual(crf, 23)
        self.assertEqual(preset, "fast")

    def test_save_and_public(self):
        settings.save({"export": {"fps": 60, "quality": "high"}})
        cfg = export_settings.load()
        self.assertEqual(cfg["fps"], 60)
        self.assertEqual(cfg["quality"], "high")
        pub = settings.public()
        self.assertEqual(pub["export"]["fps"], 60)
        self.assertEqual(pub["export"]["quality"], "high")
        crf, preset = export_settings.encoder_quality()
        self.assertEqual((crf, preset), (18, "medium"))

    def test_invalid_falls_back(self):
        self.assertEqual(export_settings.normalize({"fps": 12, "quality": "ultra"})["fps"], 30)
        self.assertEqual(export_settings.normalize({"fps": 24})["quality"], "standard")


if __name__ == "__main__":
    unittest.main()
