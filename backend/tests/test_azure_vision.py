"""Azure Vision: normalización de OCR e Image Analysis (sin llamar a la API)."""
import unittest
from unittest.mock import patch

from app import azure_vision


_ANALYZE = {
    "metadata": {"width": 800, "height": 600},
    "captionResult": {"text": "an astronaut floating in space", "confidence": 0.88},
    "tagsResult": {"values": [
        {"name": "astronaut", "confidence": 0.99},
        {"name": "space", "confidence": 0.95},
    ]},
    "objectsResult": {"values": [
        {"boundingBox": {"x": 10, "y": 20, "w": 100, "h": 200},
         "tags": [{"name": "person", "confidence": 0.8}]},
    ]},
    "peopleResult": {"values": [
        {"boundingBox": {"x": 1, "y": 2, "w": 3, "h": 4}, "confidence": 0.9},
        {"boundingBox": {"x": 0, "y": 0, "w": 1, "h": 1}, "confidence": 0.05},  # ruido, se descarta
    ]},
    "readResult": {"blocks": [{"lines": [
        {"text": "NASA", "boundingPolygon": [], "words": [
            {"text": "NASA", "confidence": 0.97, "boundingPolygon": []},
        ]},
    ]}]},
}


class AnalysisTest(unittest.TestCase):
    def test_estructura_normalizada(self):
        out = azure_vision.normalize_analysis(_ANALYZE)
        self.assertEqual(out["caption"], "an astronaut floating in space")
        self.assertEqual(out["caption_confidence"], 0.88)
        self.assertEqual([t["name"] for t in out["tags"]], ["astronaut", "space"])
        self.assertEqual(out["objects"][0]["name"], "person")
        self.assertEqual(out["objects"][0]["box"], {"x": 10, "y": 20, "w": 100, "h": 200})
        self.assertEqual(out["width"], 800)
        self.assertEqual(out["ocr_text"], "NASA")

    def test_personas_filtra_ruido(self):
        out = azure_vision.normalize_analysis(_ANALYZE)
        self.assertEqual(len(out["people"]), 1)   # la de 0.05 se descarta

    def test_payload_vacio(self):
        out = azure_vision.normalize_analysis({})
        self.assertIsNone(out["caption"])
        self.assertEqual(out["tags"], [])
        self.assertEqual(out["ocr_text"], "")


class OcrTest(unittest.TestCase):
    def test_ocr_lineas_y_palabras(self):
        out = azure_vision.normalize_ocr(_ANALYZE["readResult"])
        self.assertEqual(out["text"], "NASA")
        self.assertEqual(len(out["lines"]), 1)
        self.assertEqual(out["words"][0]["text"], "NASA")
        self.assertEqual(out["words"][0]["confidence"], 0.97)

    def test_ocr_vacio(self):
        out = azure_vision.normalize_ocr(None)
        self.assertEqual(out["text"], "")
        self.assertEqual(out["lines"], [])


class CredentialsTest(unittest.TestCase):
    def test_unavailable_sin_credenciales(self):
        with patch.object(azure_vision, "api_key", return_value=""), \
             patch.object(azure_vision, "endpoint", return_value=""):
            self.assertIsNotNone(azure_vision.unavailable_reason())
            self.assertFalse(azure_vision.available())

    def test_endpoint_sin_barra_final(self):
        with patch.dict("os.environ", {"AZURE_VISION_ENDPOINT": "https://x.azure.com/"}):
            self.assertEqual(azure_vision.endpoint(), "https://x.azure.com")


if __name__ == "__main__":
    unittest.main()
