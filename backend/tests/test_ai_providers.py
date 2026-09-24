"""Selección de proveedor de IA (Gemini / OpenAI / OpenRouter)."""
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

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

    def test_free_openai_compatible_providers_registered(self):
        # Groq / Cerebras / Mistral / Hugging Face: OpenAI-compatibles con base_url propio.
        for prov, host in (("groq", "groq.com"), ("cerebras", "cerebras.ai"),
                           ("mistral", "mistral.ai"), ("huggingface", "huggingface.co")):
            self.assertIn(prov, providers.OPENAI_COMPATIBLE)
            spec = providers.OPENAI_COMPATIBLE[prov]
            self.assertIn(host, spec["base_url"])
            self.assertTrue(spec["default_model"])
            self.assertEqual(spec["key"], prov)

    def test_free_provider_needs_key(self):
        for prov in ("groq", "cerebras", "mistral", "huggingface"):
            settings.save({"ai": {"provider": prov}})
            p = providers.get_provider()
            self.assertIsInstance(p, providers.OpenAICompatibleProvider)
            self.assertIn("key", (p.unavailable_reason() or "").lower())

    def test_cloud_provider_ignores_stale_local_base_url(self):
        # Un base_url local guardado (p.ej. de LM Studio) NO debe pisar la URL
        # oficial de un proveedor cloud como OpenRouter (regresión).
        settings.save({"api_keys": {"openrouter": "sk-or-x"},
                       "ai": {"provider": "openrouter", "model": "openrouter/free",
                              "base_url": "http://localhost:1234"}})
        cfg = providers.ai_config()
        self.assertIsNone(cfg["base_url"])
        p = providers.get_provider()
        self.assertEqual(p._base_url, "https://openrouter.ai/api/v1")

    def test_free_provider_available_with_key(self):
        settings.save({"api_keys": {"groq": "gsk_x"}, "ai": {"provider": "groq"}})
        p = providers.get_provider()
        self.assertEqual(p._base_url, "https://api.groq.com/openai/v1")
        self.assertIsNone(p.unavailable_reason())   # key + openai instalado

    def test_lmstudio_local_no_key_needed(self):
        settings.save({"ai": {"provider": "lmstudio", "model": "qwen2.5-7b-instruct",
                              "base_url": "http://localhost:4321/v1"}})
        cfg = providers.ai_config()
        self.assertEqual(cfg["provider"], "lmstudio")
        self.assertEqual(cfg["base_url"], "http://localhost:4321/v1")
        p = providers.get_provider()
        self.assertIsNone(p.unavailable_reason())   # sin key, disponible (openai instalado)
        self.assertEqual(p._base_url, "http://localhost:4321/v1")   # override respetado

    def test_lmstudio_models_url_from_openai_base(self):
        self.assertEqual(
            providers.lmstudio_models_url("http://localhost:1234/v1"),
            "http://localhost:1234/api/v1/models",
        )
        self.assertEqual(
            providers.lmstudio_models_url("http://127.0.0.1:4321/v1/"),
            "http://127.0.0.1:4321/api/v1/models",
        )
        self.assertEqual(
            providers.lmstudio_models_url(None),
            "http://localhost:1234/api/v1/models",
        )

    def test_list_lmstudio_models_ok(self):
        payload = {
            "models": [
                {
                    "type": "embedding",
                    "key": "nomic-embed",
                    "display_name": "Nomic",
                    "loaded_instances": [],
                },
                {
                    "type": "llm",
                    "key": "deepseek-r1",
                    "display_name": "DeepSeek R1",
                    "loaded_instances": [],
                    "capabilities": {"trained_for_tool_use": True},
                },
                {
                    "type": "llm",
                    "key": "google/gemma-4",
                    "display_name": "Gemma 4",
                    "loaded_instances": [{"id": "google/gemma-4"}],
                    "capabilities": {"trained_for_tool_use": True},
                },
            ]
        }

        class FakeResp:
            def read(self):
                return json.dumps(payload).encode()
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        with patch("app.ai.providers.urlopen", return_value=FakeResp()):
            out = providers.list_lmstudio_models()
        self.assertTrue(out["ok"])
        ids = [m["id"] for m in out["models"]]
        self.assertEqual(ids, ["google/gemma-4", "deepseek-r1"])
        self.assertTrue(out["models"][0]["loaded"])
        self.assertTrue(out["models"][0]["tool_use"])
        self.assertNotIn("nomic-embed", ids)

    def test_list_lmstudio_models_off(self):
        with patch("app.ai.providers.urlopen", side_effect=URLError("Connection refused")):
            out = providers.list_lmstudio_models()
        self.assertFalse(out["ok"])
        self.assertEqual(out["models"], [])
        self.assertIn("Enciende LM Studio", out["reason"])

    def test_list_lmstudio_models_needs_token(self):
        err = HTTPError("http://localhost:1234/api/v1/models", 401, "Unauthorized", {}, io.BytesIO(b""))
        with patch("app.ai.providers.urlopen", side_effect=err):
            out = providers.list_lmstudio_models()
        self.assertFalse(out["ok"])
        self.assertIn("token", out["reason"].lower())


class _Status400(Exception):
    status_code = 400


class FoundryProviderTest(unittest.TestCase):
    """Microsoft Foundry como proveedor del Chat IA / Generar escena (API v1 OpenAI-compatible)."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, settings._FILE)
        config.DATA_DIR = self.tmp
        settings._FILE = self.tmp / "settings.json"
        self.env = patch.dict("os.environ", {}, clear=False)
        self.env.start()
        import os
        for k in ("AZURE_FOUNDRY_KEY", "AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_ENDPOINT", "AZURE_OPENAI_ENDPOINT",
                  "AZURE_FOUNDRY_DEPLOYMENT", "AZURE_FOUNDRY_MODEL", "AZURE_OPENAI_DEPLOYMENT"):
            os.environ.pop(k, None)

    def tearDown(self):
        self.env.stop()
        config.DATA_DIR, settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _configure(self, endpoint="https://edu.services.ai.azure.com", deployment="gpt-5-mini"):
        settings.save({"api_keys": {"azure_foundry": "az-key"}, "azure_foundry_endpoint": endpoint,
                       "azure_foundry_deployment": deployment, "ai": {"provider": "foundry"}})

    def test_get_provider_uses_foundry_config(self):
        self._configure()
        p = providers.get_provider()
        self.assertIsInstance(p, providers.FoundryProvider)
        self.assertIsNone(p.unavailable_reason())
        self.assertEqual(providers.ai_config()["model"], "gpt-5-mini")   # modelo = deployment
        self.assertEqual(p._base_url, "https://edu.services.ai.azure.com/openai/v1")
        self.assertEqual(p._keys(), ["az-key"])

    def test_classic_endpoint_goes_through_v1(self):
        self._configure(endpoint="https://edu.openai.azure.com/")
        self.assertEqual(providers.get_provider()._base_url, "https://edu.openai.azure.com/openai/v1")

    def test_unconfigured_reports_reason(self):
        settings.save({"ai": {"provider": "foundry"}})
        self.assertIn("Foundry", providers.get_provider().unavailable_reason())

    def test_reasoning_models_skip_temperature(self):
        self._configure()
        self.assertEqual(providers.FoundryProvider()._sampling_kwargs(), {"reasoning_effort": "low"})
        self._configure(deployment="gpt-4o")
        self.assertEqual(providers.FoundryProvider()._sampling_kwargs(), {"temperature": 0.3})

    def test_drop_rejected_param(self):
        sampling = {"temperature": 0.3}
        self.assertFalse(providers._drop_rejected_param(Exception("temperature"), sampling))
        self.assertTrue(providers._drop_rejected_param(
            _Status400("Unsupported parameter: 'temperature' is not supported with this model."), sampling))
        self.assertEqual(sampling, {})
        self.assertFalse(providers._drop_rejected_param(_Status400("otra cosa"), sampling))

    def test_run_retries_without_rejected_param(self):
        """Un deployment con nombre propio (no se detecta como razonamiento) que rechaza
        ``temperature``: el loop lo quita y reintenta en vez de fallar."""
        import asyncio
        from types import SimpleNamespace

        self._configure(deployment="mi-modelo")
        calls = []

        async def create(**kw):
            calls.append(kw)
            if "temperature" in kw:
                raise _Status400("Unsupported value: 'temperature' does not support 0.3")

            async def stream():
                delta = SimpleNamespace(content="hola", tool_calls=None)
                yield SimpleNamespace(choices=[SimpleNamespace(delta=delta)])
            return stream()

        class FakeClient:
            def __init__(self, **kw):
                self.kw = kw
                self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

        events = []

        async def emit(ev):
            events.append(ev)

        with patch("openai.AsyncOpenAI", FakeClient):
            out = asyncio.run(providers.get_provider().run(
                system="s", history=[], user_message="u", tools=[], call_tool=None, emit=emit, max_iters=2))
        self.assertEqual(out, "hola")
        self.assertEqual(len(calls), 2)
        self.assertNotIn("temperature", calls[1])
        self.assertEqual(calls[1]["model"], "mi-modelo")
        self.assertFalse([e for e in events if e["type"] == "error"])

    def test_config_endpoint_lists_foundry(self):
        from fastapi.testclient import TestClient
        from app.main import app

        self._configure()
        res = TestClient(app).get("/api/ai/config")
        foundry_row = next(p for p in res.json()["providers"] if p["id"] == "foundry")
        self.assertTrue(foundry_row["has_key"])
        self.assertEqual(foundry_row["default_model"], "gpt-5-mini")


class LmStudioModelsApiTest(unittest.TestCase):
    def test_endpoint_lista_o_indica_apagado(self):
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        payload = {"ok": True, "models": [
            {"id": "qwen2.5-7b-instruct", "label": "Qwen2.5 7B", "loaded": True, "tool_use": True},
        ], "reason": None}
        with patch("app.ai.providers.list_lmstudio_models", return_value=payload):
            client = TestClient(app)
            res = client.get("/api/ai/lmstudio/models")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["models"][0]["id"], "qwen2.5-7b-instruct")


if __name__ == "__main__":
    unittest.main()
