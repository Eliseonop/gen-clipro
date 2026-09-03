"""Selección de proveedor de IA (Gemini / OpenAI / OpenRouter)."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, settings
from app.ai import providers


class ProviderSelectionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        self._old_file = settings._FILE
        config.DATA_DIR = self.tmp
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        config.DATA_DIR = self._old_data
        settings._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_auto_prefers_openrouter_when_key_present(self):
        settings.save({"api_keys": {"openrouter": "sk-or-xxx"}})
        self.assertEqual(providers.ai_config()["provider"], "openrouter")
        self.assertIn("free", providers.ai_config()["model"])

    def test_explicit_provider_and_model(self):
        settings.save({"api_keys": {"openai": "sk-yyy"}, "ai": {"provider": "openai", "model": "gpt-4o-mini"}})
        cfg = providers.ai_config()
        self.assertEqual((cfg["provider"], cfg["model"]), ("openai", "gpt-4o-mini"))

    def test_get_provider_openrouter(self):
        settings.save({"api_keys": {"openrouter": "sk-or-xxx"}, "ai": {"provider": "openrouter"}})
        p = providers.get_provider()
        self.assertIsInstance(p, providers.OpenAICompatibleProvider)
        self.assertIsNone(p.unavailable_reason())   # tiene key + openai instalado

    def test_openai_without_key_unavailable(self):
        settings.save({"ai": {"provider": "openai"}})
        p = providers.get_provider()
        self.assertIsNotNone(p.unavailable_reason())

    def test_lmstudio_local_no_key_needed(self):
        settings.save({"ai": {"provider": "lmstudio", "model": "qwen2.5-7b-instruct",
                              "base_url": "http://localhost:4321/v1"}})
        cfg = providers.ai_config()
        self.assertEqual(cfg["provider"], "lmstudio")
        self.assertEqual(cfg["base_url"], "http://localhost:4321/v1")
        p = providers.get_provider()
        self.assertIsNone(p.unavailable_reason())   # sin key, disponible (openai instalado)
        self.assertEqual(p._base_url, "http://localhost:4321/v1")   # override respetado


if __name__ == "__main__":
    unittest.main()
