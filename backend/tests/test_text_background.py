"""Fondo completo como CapCut: por línea o bloque, redondeado, Alto / Ancho y
desplazamiento. Lo que BorderStyle 4 no sabe hacer va como forma ASS (\\p1)
detrás del texto; espejo de ``bgRects`` del preview."""
import unittest

from app.schemas import TimelineClip
from app.text_ass import box_drawn, box_rects, build_ass, _rows

W, H = 720, 1280
EM = 0.05 * H


def _text(style=None, text="hola mundo que tal", kf=None):
    return TimelineClip(
        id="t", track_id="T", kind="text", asset_kind="text", asset_id="t", filename="",
        start=0, in_point=0, out_point=2, source_duration=2, text=text,
        style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", "w": 0.4,
               "bg": "#7b2cff", "bg_opacity": 1, **(style or {})},
        keyframes=kf,
    )


def _dialogues(doc):
    return [ln for ln in doc.splitlines() if ln.startswith("Dialogue")]


def _style(doc):
    return next(ln for ln in doc.splitlines() if ln.startswith("Style: st,")).split(",")


class BoxDrawnTest(unittest.TestCase):
    def test_por_linea_sin_extras_sigue_con_borderstyle_4(self):
        st = _text().style
        self.assertFalse(box_drawn(st))
        doc = build_ass([_text()], W, H)
        self.assertEqual(_style(doc)[15], "4")
        self.assertFalse(any(r"\p1" in ln for ln in _dialogues(doc)))

    def test_cualquier_extra_la_dibuja(self):
        for extra in ({"bg_style": "block"}, {"bg_radius": 0.3}, {"bg_pad_x": 0.2},
                      {"bg_pad_y": 0.2}, {"bg_dx": 0.1}, {"bg_dy": -0.1}):
            self.assertTrue(box_drawn({**_text().style, **extra}), extra)
        self.assertFalse(box_drawn({"bg": "none", "bg_style": "block"}))


class BoxRectsTest(unittest.TestCase):
    def test_una_caja_por_linea_centradas_en_cada_fila(self):
        st = _text().style
        rows = _rows(st, W, H, "hola mundo que tal")
        rects = box_rects(st, W, H, rows)
        self.assertGreater(len(rows), 1)
        self.assertEqual(len(rects), len(rows))
        self.assertLess(rects[0][1], rects[-1][1])          # la primera línea arriba
        self.assertTrue(all(x == 0 for x, *_ in rects))    # texto centrado

    def test_bloque_une_las_lineas(self):
        st = {**_text().style, "bg_style": "block"}
        rows = _rows(st, W, H, "hola mundo que tal")
        lines = box_rects({**st, "bg_style": "line"}, W, H, rows)
        (bx, by, bw, bh), = box_rects(st, W, H, rows)
        self.assertAlmostEqual(bw, max(w for _x, _y, w, _h in lines))
        self.assertAlmostEqual(bh, lines[-1][1] + lines[-1][3] / 2 - (lines[0][1] - lines[0][3] / 2))

    def test_margen_contorno_y_desplazamiento(self):
        base = {**_text().style, "border_width": 4}
        rows = [["hola"]]
        (x0, y0, w0, h0), = box_rects(base, W, H, rows)
        (x1, y1, w1, h1), = box_rects({**base, "bg_pad_x": 0.5, "bg_pad_y": 0.25, "bg_dx": 0.2, "bg_dy": 0.4}, W, H, rows)
        self.assertAlmostEqual(w1 - w0, 2 * 0.5 * EM, places=4)
        self.assertAlmostEqual(h1 - h0, 2 * 0.25 * EM, places=4)
        self.assertAlmostEqual(x1 - x0, 0.2 * EM, places=4)
        self.assertAlmostEqual(y1 - y0, -0.4 * EM, places=4)   # Y hacia arriba, como CapCut
        # Sin contorno la caja es 2 × 4 px más estrecha (el contorno la agranda, como libass).
        (_x, _y, w2, _h), = box_rects({**base, "border_width": 0}, W, H, rows)
        self.assertAlmostEqual(w0 - w2, 8, places=4)

    def test_alineada_a_la_izquierda_empieza_en_el_margen(self):
        st = {**_text().style, "align": "left", "border_width": 0}
        (x, _y, w, _h), = box_rects(st, W, H, [["hola"]])
        half = 0.4 * W / 2
        self.assertAlmostEqual(x - w / 2, -half + 0.2 * EM, places=4)


class ExportTest(unittest.TestCase):
    def test_bloque_redondeado_una_forma_detras_del_texto(self):
        doc = build_ass([_text({"bg_style": "block", "bg_radius": 0.5})], W, H)
        self.assertEqual(_style(doc)[15], "1")                 # sin caja de libass
        ds = _dialogues(doc)
        boxes = [ln for ln in ds if r"\p1" in ln]
        self.assertEqual(len(boxes), 1)
        self.assertIn(" b ", boxes[0])                          # esquinas redondeadas
        self.assertIn(r"\c&H00FF2C7B&", boxes[0])
        self.assertLess(ds.index(boxes[0]), ds.index(next(ln for ln in ds if r"\p1" not in ln)))
        self.assertTrue(all(r"\4c&H00FF2C7B" not in ln for ln in ds))

    def test_por_linea_con_margen_una_forma_por_linea(self):
        c = _text({"bg_pad_x": 0.3})
        n_rows = len([r for r in _rows(c.style, W, H, c.text) if r])
        boxes = [ln for ln in _dialogues(build_ass([c], W, H)) if r"\p1" in ln]
        self.assertEqual(len(boxes), n_rows)
        self.assertNotIn(" b ", boxes[0])                       # sin redondeo: rectángulo

    def test_texto_animado_con_fondo_va_dibujado_en_cada_fotograma(self):
        kf = {"enabled": True, "items": [{"id": "a", "t": 0, "props": {"x": 0.3}},
                                         {"id": "b", "t": 2, "props": {"x": 0.7}}]}
        doc = build_ass([_text(kf=kf, text="hola")], W, H, fps=30)
        self.assertEqual(_style(doc)[15], "1")
        boxes = [ln for ln in _dialogues(doc) if r"\p1" in ln]
        self.assertGreater(len(boxes), 30)

    def test_escritura_la_caja_crece_con_el_texto(self):
        doc = build_ass([_text({"block_appear": "typing", "bg_style": "block"}, text="hola mundo")], W, H)
        boxes = [ln for ln in _dialogues(doc) if r"\p1" in ln]
        widths = [float(ln.rsplit(" l ", 2)[1].split()[0]) for ln in boxes]
        self.assertGreater(len(boxes), 3)
        self.assertLess(widths[0], widths[-1])


if __name__ == "__main__":
    unittest.main()
