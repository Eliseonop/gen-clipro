import json
import shutil
import tempfile
import unittest
from pathlib import Path

from app import settings


class ApiKeysSettingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_guarda_y_public_no_expone_el_secreto(self):
        settings.save({"api_keys": {"gemini": "secreto-largo", "openai": "sk-abc"}})
        stored = settings.load()
        self.assertEqual(stored["api_keys"]["gemini"], "secreto-largo")
        pub = settings.public()
        dump = json.dumps(pub)
        self.assertNotIn("secreto-largo", dump)
        self.assertNotIn("sk-abc", dump)
        self.assertEqual(pub["api_keys"], {"gemini": True, "openai": True})
        self.assertTrue(pub["gemini_api_key_set"])

    def test_vacio_borra_la_clave(self):
        settings.save({"api_keys": {"gemini": "abc", "openai": "sk-1"}})
        settings.save({"api_keys": {"openai": ""}})
        keys = settings.load()["api_keys"]
        self.assertEqual(keys, {"gemini": "abc"})

    def test_mascara_no_pisa_la_clave(self):
        settings.save({"api_keys": {"gemini": "real"}})
        settings.save({"api_keys": {"gemini": True}})
        settings.save({"api_keys": {"gemini": "********"}})
        self.assertEqual(settings.load()["api_keys"]["gemini"], "real")

    def test_gemini_legacy_sigue_funcionando(self):
        settings.save({"gemini_api_key": "legacy-key"})
        self.assertEqual(settings.load()["api_keys"]["gemini"], "legacy-key")
        pub = settings.public()
        self.assertTrue(pub["gemini_api_key_set"])
        self.assertTrue(pub["api_keys"]["gemini"])
        self.assertNotIn("legacy-key", json.dumps(pub))


if __name__ == "__main__":
    unittest.main()
