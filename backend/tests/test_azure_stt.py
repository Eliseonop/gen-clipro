"""Azure Speech-to-Text: normalización de la respuesta (sin llamar a la API)."""
import unittest

from app import azure_stt


# Ejemplo con la forma real de "Fast Transcription" (recortado).
_SAMPLE = {
    "durationMilliseconds": 2400,
    "combinedPhrases": [{"text": "Hola mundo. Adiós."}],
    "phrases": [
        {
            "offsetMilliseconds": 0,
            "durationMilliseconds": 1200,
            "text": "Hola mundo.",
            "locale": "es-ES",
            "confidence": 0.95,
            "words": [
                {"text": "Hola", "offsetMilliseconds": 0, "durationMilliseconds": 400},
                {"text": "mundo", "offsetMilliseconds": 400, "durationMilliseconds": 500},
            ],
        },
        {
            "offsetMilliseconds": 1500,
            "durationMilliseconds": 900,
            "text": "Adiós.",
            "locale": "es-ES",
            "confidence": 0.9,
            "words": [],
        },
    ],
}


class NormalizeTest(unittest.TestCase):
    def test_shape_igual_que_whisper(self):
        out = azure_stt.normalize(_SAMPLE)
        self.assertEqual(set(out), {"language", "duration", "segments"})
        self.assertEqual(out["language"], "es")
        self.assertEqual(out["duration"], 2.4)
        self.assertEqual(len(out["segments"]), 2)

    def test_segmento_y_palabras(self):
        seg = azure_stt.normalize(_SAMPLE)["segments"][0]
        self.assertEqual(seg["start"], 0.0)
        self.assertEqual(seg["end"], 1.2)
        self.assertEqual(seg["text"], "Hola mundo.")
        self.assertEqual(len(seg["words"]), 2)
        w = seg["words"][1]
        self.assertEqual(w["text"], "mundo")
        self.assertEqual(w["start"], 0.4)
        self.assertEqual(w["end"], 0.9)
        self.assertEqual(w["prob"], 0.95)   # confianza de la frase

    def test_payload_vacio(self):
        out = azure_stt.normalize({})
        self.assertEqual(out["segments"], [])
        self.assertIsNone(out["language"])

    def test_locales_para_idioma(self):
        self.assertEqual(azure_stt._locales_for("es-MX"), ["es-MX"])
        self.assertEqual(azure_stt._locales_for("es"), ["es-ES"])
        self.assertGreater(len(azure_stt._locales_for(None)), 1)

    def test_unavailable_sin_credenciales(self):
        # Sin clave/región debe dar una razón (no lanzar).
        from unittest.mock import patch
        with patch.object(azure_stt, "api_key", return_value=""):
            self.assertIsNotNone(azure_stt.unavailable_reason())
            self.assertFalse(azure_stt.available())


if __name__ == "__main__":
    unittest.main()
