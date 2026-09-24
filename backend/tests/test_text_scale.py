"""Escala de texto uniforme y extrema (#5): la caja de ajuste crece con la escala
(como el preview y CapCut), así que un título no se reparte en más líneas al
agrandarlo; y libass aguanta tamaños enormes ("texto que atraviesas").

Las líneas las reparte ``text_ass._rows`` (como ``wrapWordRows`` del preview) y
cada una va en su evento; libass no vuelve a partirlas (márgenes ``_NO_WRAP``)."""
import unittest

from app.schemas import TimelineClip
from app.text_ass import _NO_WRAP, _rows, animated_dialogues, build_ass, caption_dialogues

W, H = 720, 1280


def _text(style=None, keyframes=None, text="GRAND CANYON NATIONAL PARK"):
    return TimelineClip(
        id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t1", filename="",
        start=0.0, in_point=0, out_point=1.0, source_duration=1.0, text=text,
        style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", "w": 0.8, **(style or {})},
        keyframes=keyframes,
    )


class TextScaleTest(unittest.TestCase):
    def test_libass_no_reparte_lineas(self):
        line = caption_dialogues(_text(text="HOLA"), W, H)[0]
        self.assertIn(f",,{_NO_WRAP},,", line)

    def test_las_lineas_no_cambian_con_la_escala(self):
        base = _rows({"w": 0.8, "size": 0.05, "font": "Arial"}, W, H, "GRAND CANYON NATIONAL PARK")
        self.assertGreater(len(base), 1)
        for s in (0.5, 2, 7.5, 60):
            self.assertEqual(_rows({"w": 0.8, "size": 0.05, "font": "Arial", "scale": s}, W, H,
                                   "GRAND CANYON NATIONAL PARK"), base, s)

    def test_una_linea_un_evento(self):
        lines = caption_dialogues(_text({"scale": 3}, text="GRAND CANYON"), W, H)
        self.assertEqual(len(lines), 1)

    def test_escala_extrema_de_texto(self):
        from app.font_metrics import ass_size_factor
        doc = build_ass([_text({"scale": 60}, text="HOLIDAY")], W, H)
        size = int(round(0.05 * H * 60 * ass_size_factor("Arial", True)))
        self.assertIn(f",{size},", doc)                           # tamaño de letra ×60 en el estilo

    def test_animado_mismas_lineas_en_cada_fotograma(self):
        base = {"x": 0.5, "y": 0.5, "rotation": 0, "opacity": 1}
        kf = {"enabled": True, "items": [
            {"id": "a", "t": 0, "interpolation": "linear", "props": {**base, "scale": 1}},
            {"id": "b", "t": 0.8, "interpolation": "cubic-in", "props": {**base, "scale": 40}},
        ]}
        lines = animated_dialogues(_text(keyframes=kf), W, H, fps=30)
        n_rows = len(_rows({"w": 0.8, "size": 0.05, "font": "Arial"}, W, H, "GRAND CANYON NATIONAL PARK"))
        starts = {}
        for ln in lines:
            starts.setdefault(ln.split(",")[1], 0)
            starts[ln.split(",")[1]] += 1
        self.assertTrue(all(v == n_rows for v in starts.values()))


if __name__ == "__main__":
    unittest.main()
