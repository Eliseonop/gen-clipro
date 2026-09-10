"""Varias API keys por proveedor (fallback) + prueba de claves.

- Primaria en api_keys[provider] (compat); extras en api_keys_extra[provider].
- public() enmascara valores y expone solo el conteo.
- keytest clasifica códigos HTTP a ok True/False/None.
"""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, settings


class MultiKeyStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        self._oldd = config.DATA_DIR
        config.DATA_DIR = self.tmp
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        config.DATA_DIR = self._oldd
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_primary_then_extras(self):
        settings.save({"api_keys": {"groq": "k1"}})
        self.assertEqual(settings.keys_for("groq"), ["k1"])
        settings.add_key("groq", "k2")
        settings.add_key("groq", "k3")
        self.assertEqual(settings.keys_for("groq"), ["k1", "k2", "k3"])
        self.assertEqual(settings.key_count("groq"), 3)

    def test_set_and_remove_with_promotion(self):
        settings.save({"api_keys": {"groq": "k1"}})
        settings.add_key("groq", "k2")
        settings.set_key("groq", 1, "k2b")
        self.assertEqual(settings.keys_for("groq"), ["k1", "k2b"])
        settings.remove_key("groq", 0)   # quita primaria → promociona k2b
        self.assertEqual(settings.keys_for("groq"), ["k2b"])
        # primaria en api_keys sigue siendo un string (compat con consumidores)
        self.assertEqual(settings.load()["api_keys"]["groq"], "k2b")

    def test_add_empty_rejected(self):
        with self.assertRaises(ValueError):
            settings.add_key("groq", "   ")

    def test_public_masks_values_and_counts(self):
        settings.save({"api_keys": {"groq": "secret1"}})
        settings.add_key("groq", "secret2")
        pub = settings.public()
        self.assertEqual(pub["api_keys"], {"groq": True})
        self.assertEqual(pub["api_keys_counts"], {"groq": 2})
        self.assertNotIn("api_keys_extra", pub)
        # el valor no aparece por ningún lado
        self.assertNotIn("secret2", repr(pub))

    def test_gemini_legacy_field_synced(self):
        settings.save({"api_keys": {"gemini": "g1"}})
        settings.add_key("gemini", "g2")
        # el campo legacy gemini_api_key sigue el primario
        self.assertEqual(settings._read_file().get("gemini_api_key"), "g1")
        settings.remove_key("gemini", 0)
        self.assertEqual(settings._read_file().get("gemini_api_key"), "g2")


class KeyTestClassifyTest(unittest.TestCase):
    def test_probe_classifications(self):
        from app import keytest
        cases = {200: True, 201: True, 429: True, 400: True,
                 401: False, 403: False, 404: None, 500: None, -1: None}
        for code, expected in cases.items():
            with patch("app.keytest._http", return_value=code):
                res = keytest.probe("groq", "k")
            self.assertEqual(res["ok"], expected, f"HTTP {code} → {res}")

    def test_probe_empty_key(self):
        from app import keytest
        self.assertFalse(keytest.probe("groq", "")["ok"])

    def test_probe_untestable_provider(self):
        from app import keytest
        self.assertIsNone(keytest.probe("fal", "k")["ok"])


class KeyTestAllTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        self._oldd = config.DATA_DIR
        config.DATA_DIR = self.tmp
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        config.DATA_DIR = self._oldd
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_test_all_shape(self):
        from app import keytest
        settings.save({"api_keys": {"groq": "k1"}})
        settings.add_key("groq", "k2")
        with patch("app.keytest._http", return_value=200):
            out = keytest.test_all()
        entries = out["results"]["groq"]
        self.assertEqual([e["index"] for e in entries], [0, 1])
        self.assertTrue(all(e["ok"] for e in entries))


if __name__ == "__main__":
    unittest.main()
