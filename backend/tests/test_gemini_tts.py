"""Gemini TTS: prompt de estilo, WAV y disponibilidad sin llamar a la API."""
import shutil
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from app import gemini_tts, settings


def _silent_pcm(seconds=0.1, rate=24000):
    return b"\x00\x00" * int(rate * seconds)


class NarrationPromptTest(unittest.TestCase):
    def test_documental_incluye_estilo_cinematografico(self):
        p = gemini_tts.narration_prompt("Hola universo.", style="documentary")
        self.assertIn("documentales", p.lower())
        self.assertIn("Hola universo.", p)
        self.assertIn("cinematográfico", p)

    def test_cercano_no_es_documental(self):
        p = gemini_tts.narration_prompt("Oye, mira esto.", style="close")
        self.assertIn("amigo", p.lower())
        self.assertNotIn("cinematográfico", p)


class AvailableTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sin_clave_no_disponible(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}, clear=False):
            self.assertIsNotNone(gemini_tts.unavailable_reason())
            self.assertFalse(gemini_tts.available())

    def test_clave_en_settings(self):
        settings.save({"gemini_api_key": "abc"})
        with patch.dict("os.environ", {"GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}, clear=False), \
             patch("google.genai", create=True):
            self.assertEqual(gemini_tts.api_key(), "abc")


class WriteWavTest(unittest.TestCase):
    def test_pcm_se_guarda_como_wav(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            out = tmp / "n.wav"
            pcm = _silent_pcm(0.2)
            info = gemini_tts._write_wav(out, pcm, mime="audio/L16")
            self.assertTrue(out.exists())
            self.assertGreater(info["duration"], 0.1)
            with wave.open(str(out), "rb") as wf:
                self.assertEqual(wf.getnchannels(), 1)
                self.assertEqual(wf.getframerate(), 24000)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_run_escribe_wav_con_cliente_falso(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            out = tmp / "out.wav"
            pcm = _silent_pcm(0.15)
            with patch.object(gemini_tts, "unavailable_reason", return_value=None), \
                 patch.object(gemini_tts, "api_key", return_value="k"), \
                 patch.object(gemini_tts, "_generate_pcm", return_value=(pcm, "audio/L16")):
                info = gemini_tts.run("Hola.", "Kore", 1.0, out, lambda *_: None, style="documentary")
            self.assertTrue(out.exists())
            self.assertGreater(info["duration"], 0)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class PublicSettingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_public_no_expone_la_clave(self):
        settings.save({"gemini_api_key": "secreto-largo"})
        pub = settings.public()
        self.assertTrue(pub.get("gemini_api_key_set"))
        self.assertNotIn("secreto-largo", str(pub.get("gemini_api_key") or ""))


class VoicesListTest(unittest.TestCase):
    def test_cada_voz_indica_hombre_o_mujer(self):
        self.assertGreaterEqual(len(gemini_tts.VOICES), 1)
        for v in gemini_tts.VOICES:
            self.assertIn(v["gender"], ("male", "female"), v["id"])
            word = "mujer" if v["gender"] == "female" else "hombre"
            self.assertIn(word, v["label"], v["id"])

    def test_kore_es_mujer_y_charon_hombre(self):
        by_id = {v["id"]: v for v in gemini_tts.VOICES}
        self.assertEqual(by_id["Kore"]["gender"], "female")
        self.assertEqual(by_id["Charon"]["gender"], "male")


if __name__ == "__main__":
    unittest.main()
