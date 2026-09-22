"""Azure TTS: SSML, rate, disponibilidad y guardado de WAV sin llamar a la API."""
import shutil
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from app import azure_tts, settings


def _riff_wav_bytes(seconds=0.2, rate=24000):
    """Un RIFF/WAV mono 16-bit en memoria (silencio), como el que da Azure."""
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(b"\x00\x00" * int(rate * seconds))
    return buf.getvalue()


class SsmlTest(unittest.TestCase):
    def test_locale_se_deriva_del_id(self):
        self.assertEqual(azure_tts._locale("es-MX-DaliaNeural"), "es-MX")
        self.assertEqual(azure_tts._locale("es-AR-ElenaNeural"), "es-AR")

    def test_rate_relativo(self):
        self.assertEqual(azure_tts._rate_attr(1.0), "+0%")
        self.assertEqual(azure_tts._rate_attr(1.2), "+20%")
        self.assertEqual(azure_tts._rate_attr(0.7), "-30%")

    def test_ssml_escapa_y_pone_breaks(self):
        ssml = azure_tts._build_ssml("Uno. Dos & <x>.", "es-ES-ElviraNeural", 1.0, 0.4)
        self.assertIn('xml:lang="es-ES"', ssml)
        self.assertIn('name="es-ES-ElviraNeural"', ssml)
        self.assertIn("&amp;", ssml)
        self.assertIn("&lt;x&gt;", ssml)
        self.assertIn('<break time="400ms"/>', ssml)

    def test_voz_desconocida_cae_a_la_primera(self):
        ssml = azure_tts._build_ssml("Hola.", "no-existe", 1.0, 0.0)
        self.assertIn(f'name="{azure_tts.VOICES[0]["id"]}"', ssml)


class AvailableTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sin_credenciales_no_disponible(self):
        env = {"AZURE_SPEECH_KEY": "", "SPEECH_KEY": "",
               "AZURE_SPEECH_REGION": "", "SPEECH_REGION": ""}
        with patch.dict("os.environ", env, clear=False):
            self.assertIsNotNone(azure_tts.unavailable_reason())
            self.assertFalse(azure_tts.available())

    def test_falta_region_aunque_haya_clave(self):
        settings.save({"api_keys": {"azure": "k"}})
        env = {"AZURE_SPEECH_KEY": "", "SPEECH_KEY": "",
               "AZURE_SPEECH_REGION": "", "SPEECH_REGION": ""}
        with patch.dict("os.environ", env, clear=False):
            reason = azure_tts.unavailable_reason()
            self.assertIsNotNone(reason)
            self.assertIn("región", reason.lower())

    def test_clave_y_region_en_settings(self):
        settings.save({"api_keys": {"azure": "k"}, "azure_region": "eastus"})
        env = {"AZURE_SPEECH_KEY": "", "SPEECH_KEY": "",
               "AZURE_SPEECH_REGION": "", "SPEECH_REGION": ""}
        with patch.dict("os.environ", env, clear=False):
            self.assertEqual(azure_tts.api_key(), "k")
            self.assertEqual(azure_tts.region(), "eastus")
            self.assertTrue(azure_tts.available())


class RunTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"
        settings.save({"api_keys": {"azure": "k"}, "azure_region": "eastus"})

    def tearDown(self):
        settings._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_run_guarda_el_wav_de_azure(self):
        blob = _riff_wav_bytes(0.2)
        env = {"AZURE_SPEECH_KEY": "", "SPEECH_KEY": "",
               "AZURE_SPEECH_REGION": "", "SPEECH_REGION": ""}
        with patch.dict("os.environ", env, clear=False), \
             patch.object(azure_tts, "_synthesize", return_value=blob) as synth:
            out = self.tmp / "n.wav"
            info = azure_tts.run("Hola.", "es-MX-DaliaNeural", 1.0,
                                 out, lambda f, m: None, pause=0.3)
            self.assertTrue(out.exists())
            self.assertGreater(info["duration"], 0.1)
            self.assertTrue(synth.called)


if __name__ == "__main__":
    unittest.main()
