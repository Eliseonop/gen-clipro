"""Microsoft Foundry: config, transporte y capacidades (sin llamar a la API).

Complementa a los tests de Azure Speech/Vision; no los toca. Todo mockeado."""
import io
import unittest
import urllib.error
from unittest.mock import patch

from app import foundry, foundry_ops


# --- Configuración / disponibilidad ------------------------------------------

class ConfigTest(unittest.TestCase):
    def test_unavailable_sin_credenciales(self):
        with patch.object(foundry, "api_key", return_value=""), \
             patch.object(foundry, "endpoint", return_value=""), \
             patch.object(foundry, "deployment", return_value=""):
            self.assertIsNotNone(foundry.unavailable_reason())
            self.assertFalse(foundry.available())

    def test_unavailable_menciona_lo_que_falta(self):
        with patch.object(foundry, "api_key", return_value="k"), \
             patch.object(foundry, "endpoint", return_value="https://x"), \
             patch.object(foundry, "deployment", return_value=""):
            self.assertIn("deployment", foundry.unavailable_reason().lower())

    def test_available_con_todo(self):
        with patch.object(foundry, "api_key", return_value="k"), \
             patch.object(foundry, "endpoint", return_value="https://x.openai.azure.com"), \
             patch.object(foundry, "deployment", return_value="gpt-x"):
            self.assertIsNone(foundry.unavailable_reason())
            self.assertTrue(foundry.available())

    def test_env_override_y_barra_final(self):
        with patch.dict("os.environ", {"AZURE_FOUNDRY_ENDPOINT": "https://x.openai.azure.com/"}):
            self.assertEqual(foundry.endpoint(), "https://x.openai.azure.com")

    def test_deployment_alias_model(self):
        with patch.dict("os.environ", {"AZURE_FOUNDRY_MODEL": "mi-deploy"}, clear=False):
            # AZURE_FOUNDRY_DEPLOYMENT no está → cae al alias _MODEL
            import os
            os.environ.pop("AZURE_FOUNDRY_DEPLOYMENT", None)
            self.assertEqual(foundry.deployment(), "mi-deploy")

    def test_api_version_por_defecto(self):
        import os
        with patch.dict("os.environ", {}, clear=False):
            os.environ.pop("AZURE_FOUNDRY_API_VERSION", None)
            with patch.object(foundry.settings, "load", return_value={}):
                self.assertEqual(foundry.api_version(), foundry._DEFAULT_API_VERSION)

    def test_config_public_sin_clave(self):
        with patch.object(foundry, "api_key", return_value="secreta"), \
             patch.object(foundry, "endpoint", return_value="https://x"), \
             patch.object(foundry, "deployment", return_value="d"):
            pub = foundry.config_public()
            self.assertNotIn("secreta", str(pub))
            self.assertEqual(pub["deployment"], "d")
            self.assertEqual(pub["model"], "d")

    def test_chat_url_classic(self):
        with patch.object(foundry, "endpoint", return_value="https://r.openai.azure.com"), \
             patch.object(foundry, "deployment", return_value="gpt-x"), \
             patch.object(foundry, "api_version", return_value="2024-10-21"):
            url, kind = foundry._chat_url()
            self.assertEqual(kind, "classic")
            self.assertEqual(
                url,
                "https://r.openai.azure.com/openai/deployments/gpt-x/chat/completions"
                "?api-version=2024-10-21")

    def test_chat_url_foundry_v1(self):
        with patch.object(foundry, "endpoint",
                          return_value="https://edufoundry2.services.ai.azure.com/openai/v1"), \
             patch.object(foundry, "deployment", return_value="gpt-5-mini"):
            url, kind = foundry._chat_url()
            self.assertEqual(kind, "v1")
            self.assertEqual(
                url, "https://edufoundry2.services.ai.azure.com/openai/v1/chat/completions")

    def test_chat_url_v1_normaliza_host(self):
        # El usuario pega solo el host (sin /openai/v1) → se normaliza.
        with patch.object(foundry, "endpoint",
                          return_value="https://edufoundry2.services.ai.azure.com/"), \
             patch.object(foundry, "deployment", return_value="gpt-5-mini"):
            url, kind = foundry._chat_url()
            self.assertEqual(kind, "v1")
            self.assertTrue(url.endswith("/openai/v1/chat/completions"), url)

    def test_is_v1_endpoint(self):
        self.assertTrue(foundry._is_v1_endpoint("https://x.services.ai.azure.com/openai/v1"))
        self.assertTrue(foundry._is_v1_endpoint("https://x.services.ai.azure.com"))
        self.assertFalse(foundry._is_v1_endpoint("https://x.openai.azure.com"))

    def test_is_reasoning_model(self):
        self.assertTrue(foundry._is_reasoning_model("gpt-5-mini"))
        self.assertTrue(foundry._is_reasoning_model("o1-preview"))
        self.assertTrue(foundry._is_reasoning_model("o3-mini"))
        self.assertFalse(foundry._is_reasoning_model("gpt-4o-mini"))


# --- Normalización de respuesta ----------------------------------------------

class NormalizeTest(unittest.TestCase):
    def test_respuesta_completa(self):
        payload = {
            "model": "gpt-x",
            "choices": [{"message": {"content": " hola "}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
        out = foundry.normalize_response(payload)
        self.assertEqual(out["text"], "hola")
        self.assertEqual(out["model"], "gpt-x")
        self.assertEqual(out["finish_reason"], "stop")
        self.assertEqual(out["usage"]["total_tokens"], 15)

    def test_payload_vacio_no_rompe(self):
        with patch.object(foundry, "deployment", return_value="d"):
            out = foundry.normalize_response({})
            self.assertEqual(out["text"], "")
            self.assertEqual(out["model"], "d")


# --- Errores / transporte -----------------------------------------------------

class ErrorMapTest(unittest.TestCase):
    def _raise(self, code):
        exc = urllib.error.HTTPError("http://x", code, "err", {}, io.BytesIO(b"detail"))
        try:
            foundry._raise_http(exc)
        except foundry.FoundryError as e:
            return e.code
        return None

    def test_map_auth(self):
        self.assertEqual(self._raise(401), "auth")
        self.assertEqual(self._raise(403), "auth")

    def test_map_model_unavailable(self):
        self.assertEqual(self._raise(404), "model_unavailable")

    def test_map_rate_limit(self):
        self.assertEqual(self._raise(429), "rate_limit")

    def test_map_bad_request(self):
        self.assertEqual(self._raise(400), "bad_request")

    def test_map_upstream(self):
        self.assertEqual(self._raise(500), "upstream")

    def test_chat_no_configurado(self):
        with patch.object(foundry, "unavailable_reason", return_value="falta clave"):
            with self.assertRaises(foundry.FoundryError) as cm:
                foundry.chat([{"role": "user", "content": "hi"}])
            self.assertEqual(cm.exception.code, "not_configured")

    def test_json_mode_reintenta_sin_response_format(self):
        ok = {"choices": [{"message": {"content": "{\"x\":1}"}}], "usage": {}}
        calls = {"n": 0}

        def fake_post(url, kind, body, *, timeout):
            calls["n"] += 1
            if calls["n"] == 1:
                self.assertIn("response_format", body)
                raise foundry._BadRequest("response_format is not supported")
            self.assertNotIn("response_format", body)  # el reintento lo quita
            return ok

        with patch.object(foundry, "unavailable_reason", return_value=None), \
             patch.object(foundry, "deployment", return_value="gpt-4o-mini"), \
             patch.object(foundry, "endpoint", return_value="https://r.openai.azure.com"), \
             patch.object(foundry, "_post", side_effect=fake_post):
            out = foundry.chat([{"role": "user", "content": "hi"}], json_mode=True)
            self.assertEqual(out["text"], '{"x":1}')
            self.assertEqual(calls["n"], 2)

    def test_reasoning_model_omite_temperature_y_usa_max_completion(self):
        captured = {}

        def fake_post(url, kind, body, *, timeout):
            captured.update(body)
            return {"choices": [{"message": {"content": "ok"}}], "usage": {}}

        with patch.object(foundry, "unavailable_reason", return_value=None), \
             patch.object(foundry, "deployment", return_value="gpt-5-mini"), \
             patch.object(foundry, "endpoint",
                          return_value="https://x.services.ai.azure.com/openai/v1"), \
             patch.object(foundry, "_post", side_effect=fake_post):
            foundry.chat([{"role": "user", "content": "hi"}], temperature=0.6, max_tokens=500)
            self.assertNotIn("temperature", captured)
            self.assertIn("max_completion_tokens", captured)
            self.assertNotIn("max_tokens", captured)
            self.assertEqual(captured.get("model"), "gpt-5-mini")   # v1 → model en el cuerpo

    def test_modelo_normal_usa_temperature_y_max_tokens(self):
        captured = {}

        def fake_post(url, kind, body, *, timeout):
            captured.update(body)
            return {"choices": [{"message": {"content": "ok"}}], "usage": {}}

        with patch.object(foundry, "unavailable_reason", return_value=None), \
             patch.object(foundry, "deployment", return_value="gpt-4o-mini"), \
             patch.object(foundry, "endpoint", return_value="https://r.openai.azure.com"), \
             patch.object(foundry, "_post", side_effect=fake_post):
            foundry.chat([{"role": "user", "content": "hi"}], temperature=0.3, max_tokens=200)
            self.assertEqual(captured.get("temperature"), 0.3)
            self.assertIn("max_tokens", captured)
            self.assertNotIn("model", captured)   # clásico → deployment en la URL

    def test_auto_ajuste_400_max_tokens_a_completion(self):
        body = {"max_tokens": 500}
        changed = foundry._adjust_body_for_400(
            body, "Unsupported parameter: 'max_tokens' is not supported. Use 'max_completion_tokens' instead.")
        self.assertTrue(changed)
        self.assertIn("max_completion_tokens", body)
        self.assertNotIn("max_tokens", body)

    def test_auto_ajuste_400_temperature(self):
        body = {"temperature": 0.5}
        self.assertTrue(foundry._adjust_body_for_400(body, "Unsupported value: 'temperature'"))
        self.assertNotIn("temperature", body)


# --- Extracción / validación de JSON -----------------------------------------

class JsonHelpersTest(unittest.TestCase):
    def test_extract_json_plano(self):
        self.assertEqual(foundry_ops._extract_json('{"a": 1}'), {"a": 1})

    def test_extract_json_en_fence(self):
        txt = "aquí tienes:\n```json\n{\"hooks\": [\"a\"]}\n```\ngracias"
        self.assertEqual(foundry_ops._extract_json(txt), {"hooks": ["a"]})

    def test_extract_json_invalido(self):
        self.assertIsNone(foundry_ops._extract_json("no soy json"))

    def test_normalize_suggestion_clampa(self):
        s = foundry_ops._normalize_suggestion(
            {"type": "raro", "duration": 999, "title": "T", "prompt": "P"})
        self.assertEqual(s["type"], "image")   # tipo inválido → image
        self.assertLessEqual(s["duration"], 60.0)
        self.assertEqual(s["title"], "T")


# --- Operaciones (con foundry mockeado) --------------------------------------

class OpsTest(unittest.TestCase):
    def _fake_complete(self, text):
        return lambda *a, **k: {"text": text, "model": "gpt-x", "usage": {}}

    def test_improve_script_vacio_lanza(self):
        with self.assertRaises(foundry.FoundryError):
            foundry_ops.improve_script("", context=None)

    def test_improve_script_ok(self):
        with patch.object(foundry, "complete", self._fake_complete("mejor")):
            out = foundry_ops.improve_script("texto", mode="shorten")
            self.assertEqual(out["result"], "mejor")
            self.assertEqual(out["mode"], "shorten")

    def test_generate_hooks_desde_json(self):
        with patch.object(foundry, "complete", self._fake_complete('{"hooks": ["a", "b", "c"]}')):
            out = foundry_ops.generate_hooks(n=3, context={"topic": "x"})
            self.assertEqual(out["hooks"], ["a", "b", "c"])

    def test_generate_hooks_recupera_de_texto(self):
        with patch.object(foundry, "complete", self._fake_complete("- uno\n- dos")):
            out = foundry_ops.generate_hooks(n=5, context={"topic": "x"})
            self.assertEqual(out["hooks"], ["uno", "dos"])

    def test_suggest_resources_valida(self):
        js = ('{"suggestions": [{"type": "diagram", "title": "T", "description": "D", '
              '"duration": 3, "prompt": "P", "reason": "R"}]}')
        with patch.object(foundry, "complete", self._fake_complete(js)):
            out = foundry_ops.suggest_resources(context={"script": "s"})
            self.assertEqual(len(out["suggestions"]), 1)
            self.assertEqual(out["suggestions"][0]["type"], "diagram")

    def test_visual_prompt_json(self):
        js = '{"image_prompt": "IMG", "video_prompt": "VID", "aspect": "9:16"}'
        with patch.object(foundry, "complete", self._fake_complete(js)):
            out = foundry_ops.visual_prompt(context={"scene": "x"})
            self.assertEqual(out["image_prompt"], "IMG")
            self.assertEqual(out["aspect"], "9:16")

    def test_analyze_scene_json(self):
        js = ('{"summary": "S", "concept": "C", "intent": "I", '
              '"resources": ["r1"], "edits": [], "improvements": ["m1"]}')
        with patch.object(foundry, "complete", self._fake_complete(js)):
            out = foundry_ops.analyze_scene(context={"scene": "x"})
            self.assertEqual(out["summary"], "S")
            self.assertEqual(out["resources"], ["r1"])

    def test_assistant_vacio_lanza(self):
        with self.assertRaises(foundry.FoundryError):
            foundry_ops.assistant("   ")

    def test_run_op_desconocida(self):
        with self.assertRaises(foundry.FoundryError):
            foundry_ops.run("no_existe")


# --- Speech / Vision siguen intactos (no se rompen) --------------------------

class CoexistenceTest(unittest.TestCase):
    def test_speech_vision_importan(self):
        from app import azure_stt, azure_tts, azure_vision  # noqa: F401
        self.assertTrue(hasattr(azure_vision, "analyze_image"))
        self.assertTrue(hasattr(azure_tts, "run"))


if __name__ == "__main__":
    unittest.main()
