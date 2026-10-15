"""Generación de imágenes con Foundry (MAI-Image / FLUX.2): config, rutas y
fallback entre modelos/recursos. Sin llamar a la API: todo mockeado."""
import base64
import io
import unittest
import urllib.error
from unittest.mock import patch

from app import foundry_image as fi

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
JPG = b"\xff\xd8\xff\xe0" + b"0" * 32

CFG = {"azure_image": {"resources": [
    {"id": "a", "endpoint": "https://a.services.ai.azure.com/openai/v1",
     "models": ["MAI-Image-2.6", "FLUX.2-pro", "no-existe"]},
    {"id": "b", "endpoint": "https://b.cognitiveservices.azure.com",
     "models": ["FLUX.2-pro"]},
]}}


def _ok(data: bytes) -> dict:
    return {"data": [{"b64_json": base64.b64encode(data).decode()}]}


def _http(code: int, body: str = "") -> urllib.error.HTTPError:
    return urllib.error.HTTPError("u", code, "x", {}, io.BytesIO(body.encode()))


class _Base(unittest.TestCase):
    def setUp(self):
        fi._cool.clear()
        self._p = [
            patch.object(fi.settings, "load", return_value=CFG),
            patch.object(fi.settings, "api_key", side_effect=lambda k: "k-" + k),
        ]
        for p in self._p:
            p.start()

    def tearDown(self):
        for p in self._p:
            p.stop()
        fi._cool.clear()


class ConfigTest(_Base):
    def test_resources_normaliza_host_y_filtra_modelos(self):
        res = fi.resources()
        self.assertEqual(res[0]["endpoint"], "https://a.services.ai.azure.com")
        self.assertEqual(res[0]["models"], ["MAI-Image-2.6", "FLUX.2-pro"])

    def test_sin_config_usa_el_recurso_de_foundry(self):
        with patch.object(fi.settings, "load", return_value={}), \
             patch.object(fi.foundry, "endpoint", return_value="https://z.services.ai.azure.com/openai/v1"):
            res = fi.resources()
        self.assertEqual(res[0]["id"], "z")
        self.assertEqual(res[0]["models"], fi.AZURE_MODELS)

    def test_clave_de_foundry_si_el_host_coincide(self):
        with patch.object(fi.settings, "api_key", return_value=""), \
             patch.object(fi.foundry, "endpoint", return_value="https://a.services.ai.azure.com/openai/v1"), \
             patch.object(fi.foundry, "api_key", return_value="chat-key"):
            self.assertEqual(fi._key_for(fi.resources()[0]), "chat-key")
            self.assertEqual(fi._key_for(fi.resources()[1]), "")

    def test_status_sin_claves(self):
        st = fi.status()
        self.assertTrue(st["available"])
        self.assertNotIn("k-azure_image_a", str(st))

    def test_urls(self):
        self.assertEqual(fi._url("https://h", "MAI-Image-2.6"), "https://h/mai/v1/images/generations")
        self.assertEqual(fi._url("https://h", "FLUX.2-pro"),
                         "https://h/providers/blackforestlabs/v1/flux-2-pro?api-version=preview")
        self.assertIn("flux-2-flex", fi._url("https://h", "FLUX.2-flex"))


class GenerateTest(_Base):
    def test_primer_modelo_ok(self):
        with patch.object(fi, "_post", return_value=_ok(PNG)) as post:
            out = fi.generate("un gato", aspect="16:9")
        self.assertEqual(out["model"], "MAI-Image-2.6")
        self.assertEqual(out["ext"], ".png")
        url, key, body = post.call_args.args
        self.assertEqual(key, "k-azure_image_a")
        self.assertEqual((body["width"], body["height"]), (1344, 768))

    def test_fallback_tras_429_y_enfria(self):
        calls = []

        def fake(url, key, body):
            calls.append((url, body["model"]))
            if body["model"] == "MAI-Image-2.6":
                raise _http(429)
            return _ok(JPG)

        with patch.object(fi, "_post", side_effect=fake):
            out = fi.generate("x")
            self.assertEqual(out["model"], "FLUX.2-pro")
            self.assertEqual(out["ext"], ".jpg")
            self.assertEqual([a["code"] for a in out["attempts"]], ["rate_limit", "ok"])
            # El enfriado manda MAI al final en la siguiente petición.
            calls.clear()
            fi.generate("y")
            self.assertEqual(calls[0][1], "FLUX.2-pro")

    def test_modelo_preferido_y_otro_recurso(self):
        def fake(url, key, body):
            if "//a." in url:
                raise _http(500, "boom")
            return _ok(PNG)

        with patch.object(fi, "_post", side_effect=fake):
            out = fi.generate("x", model="FLUX.2-pro", strict=True)
        self.assertEqual((out["model"], out["resource"]), ("FLUX.2-pro", "b"))

    def test_todo_falla_por_cuota(self):
        with patch.object(fi, "_post", side_effect=_http(429)):
            with self.assertRaises(fi.ImageGenError) as cm:
                fi.generate("x")
        self.assertEqual(cm.exception.code, "rate_limit")
        self.assertEqual(len(cm.exception.attempts), 3)

    def test_filtro_de_contenido(self):
        with patch.object(fi, "_post", side_effect=_http(400, '{"error":"content policy"}')):
            with self.assertRaises(fi.ImageGenError) as cm:
                fi.generate("x")
        self.assertEqual(cm.exception.code, "content_filter")

    def test_sin_claves(self):
        with patch.object(fi.settings, "api_key", return_value=""), \
             patch.object(fi.foundry, "endpoint", return_value=""):
            with self.assertRaises(fi.ImageGenError) as cm:
                fi.generate("x")
        self.assertEqual(cm.exception.code, "not_configured")

    def test_prompt_vacio_y_modelo_desconocido(self):
        with self.assertRaises(fi.ImageGenError):
            fi.generate("  ")
        with self.assertRaises(fi.ImageGenError):
            fi.generate("x", model="dall-e")


CF_CFG = {**CFG, "cloudflare_ai": {"account_id": "acc1"}}


def _cf_ok(data: bytes) -> dict:
    return {"result": {"image": base64.b64encode(data).decode()}, "success": True}


class CloudflareTest(_Base):
    def setUp(self):
        super().setUp()
        self._cf = patch.object(fi.settings, "load", return_value=CF_CFG)
        self._cf.start()

    def tearDown(self):
        self._cf.stop()
        super().tearDown()

    def test_recurso_al_final_y_url(self):
        res = fi.resources()
        self.assertEqual(res[-1]["id"], "cloudflare")
        self.assertEqual(res[-1]["models"], fi.CF_MODELS)
        self.assertEqual(fi._url(res[-1]["endpoint"], "CF-FLUX.2-klein-9b"),
                         "https://api.cloudflare.com/client/v4/accounts/acc1/ai/run"
                         "/@cf/black-forest-labs/flux-2-klein-9b")
        self.assertEqual(fi._key_for(res[-1]), "k-cloudflare_ai")
        st = fi.status()
        self.assertEqual(st["cloudflare"], {"account_id": "acc1", "has_key": True})

    def test_sin_cuenta_no_hay_cloudflare(self):
        with patch.object(fi.settings, "load", return_value=CFG):
            self.assertNotIn("cloudflare", [r["id"] for r in fi.resources()])

    def test_reserva_cuando_azure_falla(self):
        with patch.object(fi, "_post", side_effect=_http(429)), \
             patch.object(fi, "_post_cf", return_value=_cf_ok(JPG)) as cf:
            out = fi.generate("x", aspect="9:16")
        self.assertEqual((out["model"], out["provider"]), ("CF-FLUX.2-klein-9b", "cloudflare"))
        url, token, fields = cf.call_args.args
        self.assertEqual(token, "k-cloudflare_ai")
        self.assertEqual((fields["width"], fields["height"]), (768, 1344))

    def test_cupo_diario_enfria_una_hora(self):
        def cf(url, token, fields):
            if "klein-9b" in url:
                raise _http(429, '{"errors":[{"message":"used up your daily free allocation"}]}')
            return _cf_ok(PNG)

        with patch.object(fi, "_post", side_effect=_http(429)), \
             patch.object(fi, "_post_cf", side_effect=cf):
            out = fi.generate("x")
        self.assertEqual(out["model"], "CF-FLUX.2-klein-4b")
        self.assertIn("daily_quota", [a["code"] for a in out["attempts"]])
        left = fi._cool[("cloudflare", "CF-FLUX.2-klein-9b")] - fi.time.monotonic()
        self.assertGreater(left, fi.COOLDOWN_S)

    def test_multipart(self):
        class _Resp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b'{"result": {"image": "eA=="}}'

        with patch.object(fi.urllib.request, "urlopen", return_value=_Resp()) as op:
            out = fi._post_cf("https://cf/x", "tok", {"prompt": "gato", "width": 768})
        req = op.call_args.args[0]
        self.assertTrue(req.get_header("Content-type").startswith("multipart/form-data; boundary="))
        self.assertEqual(req.get_header("Authorization"), "Bearer tok")
        self.assertIn(b'name="prompt"\r\n\r\ngato\r\n', req.data)
        self.assertEqual(fi._decode(out), b"x")


if __name__ == "__main__":
    unittest.main()
