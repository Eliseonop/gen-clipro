"""Karaoke del export con timing REAL por palabra (words[] del clip).

Con words[] válidos, los tiempos de cada Dialogue salen de las marcas reales;
sin ellos (o si no cuadran con el texto) se reparte la duración a partes
iguales, como antes.
"""
import unittest

from app.schemas import TimelineClip
from app.text_ass import caption_dialogues, word_windows


def _text_clip(text, start, out_point, words=None, word_fx="highlight"):
    return TimelineClip(
        id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
        filename="", start=start, in_point=0.0, out_point=out_point,
        source_duration=out_point, text=text,
        words=words or [],
        style={"word_fx": word_fx, "color": "#ffffff", "highlight_color": "#ff3b5c"},
    )


class WordWindowsTest(unittest.TestCase):
    def test_usa_tiempos_reales_relativos_al_clip(self):
        # habla con silencios: no es reparto uniforme
        clip = _text_clip("uno dos tres", start=1.0, out_point=4.0, words=[
            {"text": "uno", "start": 0.0, "end": 0.5},
            {"text": "dos", "start": 2.0, "end": 2.5},
            {"text": "tres", "start": 3.0, "end": 4.0},
        ])
        wins = word_windows(clip)
        self.assertEqual(wins, [(1.0, 3.0), (3.0, 4.0), (4.0, 5.0)])

    def test_fallback_reparto_uniforme_sin_words(self):
        clip = _text_clip("uno dos tres cuatro", start=0.0, out_point=4.0)
        self.assertEqual(word_windows(clip), [(0.0, 1.0), (1.0, 2.0), (2.0, 3.0), (3.0, 4.0)])

    def test_fallback_si_no_cuadra_el_conteo(self):
        # 2 words[] pero 3 palabras de texto → no fiable, reparte
        clip = _text_clip("uno dos tres", start=0.0, out_point=3.0, words=[
            {"text": "uno", "start": 0.0, "end": 0.5},
            {"text": "dos", "start": 1.0, "end": 1.5},
        ])
        self.assertEqual(word_windows(clip), [(0.0, 1.0), (1.0, 2.0), (2.0, 3.0)])


class CaptionDialoguesRealTimingTest(unittest.TestCase):
    def test_dialogues_usan_las_marcas_reales(self):
        clip = _text_clip("uno dos tres", start=1.0, out_point=4.0, words=[
            {"text": "uno", "start": 0.0, "end": 0.5},
            {"text": "dos", "start": 2.0, "end": 2.5},
            {"text": "tres", "start": 3.0, "end": 4.0},
        ])
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 3)
        # word0: [1.0, 3.0), word1: [3.0, 4.0), word2: [4.0, 5.0)
        self.assertIn("0:00:01.00,0:00:03.00", lines[0])
        self.assertIn("0:00:03.00,0:00:04.00", lines[1])
        self.assertIn("0:00:04.00,0:00:05.00", lines[2])


if __name__ == "__main__":
    unittest.main()
