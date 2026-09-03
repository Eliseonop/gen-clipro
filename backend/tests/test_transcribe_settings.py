import shutil
import tempfile
import unittest
from pathlib import Path

from app import settings, transcribe_settings


class TranscribeSettingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_defaults(self):
        cfg = transcribe_settings.load()
        self.assertEqual(cfg["model"], "base")
        self.assertEqual(transcribe_settings.resolve(None), "base")
        self.assertEqual(transcribe_settings.resolve(""), "base")

    def test_save_and_public(self):
        settings.save({"transcribe": {"model": "small"}})
        cfg = transcribe_settings.load()
        self.assertEqual(cfg["model"], "small")
        pub = settings.public()
        self.assertEqual(pub["transcribe"]["model"], "small")
        ids = [m["id"] for m in pub["transcribe"]["models"]]
        self.assertEqual(ids, list(transcribe_settings.MODELS))
        self.assertEqual(transcribe_settings.resolve(None), "small")
        self.assertEqual(transcribe_settings.resolve("tiny"), "tiny")

    def test_invalid_falls_back(self):
        self.assertEqual(transcribe_settings.normalize({"model": "ultra"})["model"], "base")
        self.assertEqual(transcribe_settings.normalize({})["model"], "base")


if __name__ == "__main__":
    unittest.main()
