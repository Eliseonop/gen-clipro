"""Tests del shaping de palabras (timing real por palabra de faster-whisper).

No cargan Whisper: prueban solo la función pura que normaliza los objetos
``Word`` que devuelve el modelo a los dicts que persistimos.
"""
import unittest
from types import SimpleNamespace

from app.schemas import TranscriptSegment
from app.transcribe import shape_words


def _w(word, start, end, prob=0.9):
    return SimpleNamespace(word=word, start=start, end=end, probability=prob)


class ShapeWordsTest(unittest.TestCase):
    def test_normaliza_texto_y_redondea(self):
        raw = [_w(" Hola", 10.201, 10.446, 0.98), _w(" mundo", 10.446, 10.802, 0.9123)]
        self.assertEqual(shape_words(raw), [
            {"text": "Hola", "start": 10.2, "end": 10.45, "prob": 0.98},
            {"text": "mundo", "start": 10.45, "end": 10.8, "prob": 0.912},
        ])

    def test_descarta_vacias_y_sin_tiempos(self):
        raw = [_w("  ", 1.0, 1.2), _w("ok", None, 2.0), _w("bien", 3.0, 3.4)]
        self.assertEqual([w["text"] for w in shape_words(raw)], ["bien"])

    def test_none_devuelve_lista_vacia(self):
        self.assertEqual(shape_words(None), [])

    def test_acepta_dicts(self):
        raw = [{"word": " hey", "start": 1.0, "end": 1.3, "probability": 0.5}]
        self.assertEqual(shape_words(raw), [{"text": "hey", "start": 1.0, "end": 1.3, "prob": 0.5}])


class TranscriptWordsSchemaTest(unittest.TestCase):
    def test_words_encajan_en_el_segmento(self):
        seg = TranscriptSegment(
            start=10.2, end=10.8, text="Hola mundo",
            words=shape_words([_w(" Hola", 10.2, 10.45), _w(" mundo", 10.45, 10.8)]),
        )
        self.assertEqual(len(seg.words), 2)
        self.assertEqual(seg.words[0].text, "Hola")

    def test_segmento_sin_words_es_valido_retrocompat(self):
        seg = TranscriptSegment(start=0.0, end=1.0, text="algo")
        self.assertEqual(seg.words, [])


if __name__ == "__main__":
    unittest.main()
