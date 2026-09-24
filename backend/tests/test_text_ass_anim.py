"""Export de texto ANIMADO (keyframes / pistas anim) = preview.

Antes el .ass solo llevaba la pose del segundo 0: un texto que crecía o se
movía en el preview salía quieto en el vídeo exportado.
"""
import math
import re
import unittest

from app.clip_anim import clip_pose
from app.schemas import TimelineClip
from app.text_ass import animated_dialogues, build_ass, caption_dialogues, text_animates

W, H = 720, 1280


def _text(style=None, keyframes=None, anim=None, start=0.0, dur=1.0, text="hola", words=None):
    return TimelineClip(
        id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t1", filename="",
        start=start, in_point=0.0, out_point=dur, source_duration=dur, text=text,
        style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", **(style or {})},
        keyframes=keyframes, anim=anim, words=words or [],
    )


def _kf(a: dict, b: dict, t_b: float = 0.8, interp: str = "linear") -> dict:
    # t_b < duración: el último fotograma visible de un clip de 1 s es el 29/30.
    base = {"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1}
    return {"enabled": True, "items": [
        {"id": "a", "t": 0.0, "interpolation": "linear", "props": {**base, **a}},
        {"id": "b", "t": t_b, "interpolation": interp, "props": {**base, **b}},
    ]}


_EV = re.compile(r"Dialogue: \d+,(\d+):(\d\d):(\d\d)\.(\d\d),(\d+):(\d\d):(\d\d)\.(\d\d),[^,]*,,-?\d+,-?\d+,\d+,,(.*)")


def _events(lines):
    out = []
    for ln in lines:
        m = _EV.match(ln)
        assert m, ln
        g = m.groups()
        a = ((int(g[0]) * 60 + int(g[1])) * 60 + int(g[2])) * 1000 + int(g[3]) * 10
        b = ((int(g[4]) * 60 + int(g[5])) * 60 + int(g[6])) * 1000 + int(g[7]) * 10
        out.append((a, b, g[8]))
    return out


def _pos(body):
    m = re.search(r"\\pos\(([-\d.]+),([-\d.]+)\)", body)
    return float(m.group(1)), float(m.group(2))


def _fs(body):
    return float(re.search(r"\\fs([\d.]+)", body).group(1))


class TextAnimExportTest(unittest.TestCase):
    def test_movimiento_sale_fotograma_a_fotograma(self):
        clip = _text(keyframes=_kf({"x": 0.2}, {"x": 0.8}))
        self.assertTrue(text_animates(clip))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertEqual(len(ev), 25)          # 24 fotogramas en movimiento + el tramo quieto final
        self.assertAlmostEqual(_pos(ev[0][2])[0], 0.2 * W, delta=1)
        self.assertAlmostEqual(_pos(ev[-1][2])[0], 0.8 * W, delta=1)
        xs = [_pos(b)[0] for _, _, b in ev]
        self.assertEqual(xs, sorted(xs))

    def test_cada_fotograma_cae_en_su_evento_con_su_pose(self):
        # FFmpeg pasa a libass el tiempo del frame truncado a ms.
        clip = _text(start=0.37, dur=1.3, keyframes=_kf({"x": 0.2, "scale": 1}, {"x": 0.8, "scale": 2}, 1.3, "ease-in"))
        for fps in (24, 25, 30, 60):
            ev = _events(animated_dialogues(clip, W, H, fps=fps))
            for k in range(math.ceil(0.37 * fps), math.floor(1.67 * fps)):
                ms = int(k / fps * 1000)
                hits = [b for a, e, b in ev if a <= ms < e]
                self.assertEqual(len(hits), 1, (fps, k))
                expected = clip_pose(clip, k / fps - 0.37)["x"] * W
                self.assertAlmostEqual(_pos(hits[0])[0], expected, delta=0.02, msg=(fps, k))

    def test_escala_animada_cambia_el_tamano_de_fuente(self):
        from app.font_metrics import ass_size_factor
        k = ass_size_factor("Arial", True)          # tamaño ASS = em del preview × factor OS/2
        clip = _text(keyframes=_kf({"scale": 1}, {"scale": 3}))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertAlmostEqual(_fs(ev[0][2]), 0.05 * H * k, delta=0.5)
        self.assertAlmostEqual(_fs(ev[-1][2]), 0.05 * H * 3 * k, delta=1)

    def test_opacidad_animada(self):
        clip = _text(keyframes=_kf({"opacity": 1}, {"opacity": 0}))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertIn("\\1a&H00&", ev[0][2])
        last = re.search(r"\\1a&H([0-9A-F]{2})&", ev[-1][2]).group(1)
        self.assertGreater(int(last, 16), 0xF0)

    def test_giro_en_sentido_del_canvas(self):
        # El canvas gira en sentido horario; \frz, antihorario → signo cambiado.
        clip = _text(keyframes=_kf({"rotation": 0}, {"rotation": 40}))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertIn("\\frz-40", ev[-1][2])
        self.assertIn("\\org(", ev[-1][2])
        static = caption_dialogues(_text(style={"rotation": 30}), W, H)
        self.assertIn("\\frz-30", static[0])

    def test_hold_y_tramos_quietos_se_funden(self):
        clip = _text(dur=3.0, keyframes=_kf({"x": 0.2}, {"x": 0.8}, 1.0))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertLess(len(ev), 40)           # 30 fotogramas de movimiento + 1 quieto
        self.assertEqual(ev[-1][1], 3000)
        self.assertGreaterEqual(ev[-1][1] - ev[-1][0], 1900)

    def test_sin_cambio_de_pose_sigue_la_ruta_estatica(self):
        still = _text(keyframes=_kf({"x": 0.3}, {"x": 0.3}))
        self.assertFalse(text_animates(still))
        self.assertFalse(text_animates(_text()))
        doc = build_ass([still], W, H)
        self.assertEqual(sum(1 for ln in doc.splitlines() if ln.startswith("Dialogue")), 1)
        self.assertIn("\\pos(216,640)", doc)

    def test_pistas_anim_antiguas_tambien_se_exportan(self):
        clip = _text(anim={"y": [{"t": 0, "v": 0.2}, {"t": 0.8, "v": 0.8}]})
        self.assertTrue(text_animates(clip))
        doc = build_ass([clip], W, H)
        ys = [_pos(b)[1] for _, _, b in _events([ln for ln in doc.splitlines() if ln.startswith("Dialogue")])]
        self.assertAlmostEqual(ys[0], 0.2 * H, delta=1)
        self.assertAlmostEqual(ys[-1], 0.8 * H, delta=1)

    def test_aparicion_de_bloque_horneada(self):
        clip = _text(style={"block_appear": "fade"}, keyframes=_kf({"x": 0.2}, {"x": 0.8}))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertFalse(any("\\fad(" in b for _, _, b in ev))
        first = int(re.search(r"\\1a&H([0-9A-F]{2})&", ev[0][2]).group(1), 16)
        later = int(re.search(r"\\1a&H([0-9A-F]{2})&", ev[-1][2]).group(1), 16)
        self.assertEqual(first, 0xFF)          # fotograma 0: aún invisible (como el preview)
        self.assertEqual(later, 0x00)

    def test_karaoke_animado_cambia_de_palabra(self):
        clip = _text(text="hola mundo", style={"word_fx": "highlight", "highlight_color": "#ff3b5c"},
                     keyframes=_kf({"x": 0.2}, {"x": 0.8}))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        red = "\\c&H005C3BFF&"
        early = [b for a, _, b in ev if a < 400]
        late = [b for a, _, b in ev if a >= 600]
        self.assertTrue(all(b.index(red) < b.index("hola") for b in early))
        self.assertTrue(all(b.index(red) > b.index("hola") for b in late))

    def test_typing_animado_revela_el_texto(self):
        clip = _text(text="Hola mundo", style={"block_appear": "typing"}, keyframes=_kf({"x": 0.2}, {"x": 0.8}))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertTrue(ev[0][2].endswith("H"))
        self.assertTrue(ev[-1][2].endswith("Hola mundo"))

    def test_posicion_fuera_de_cuadro_no_se_recorta(self):
        clip = _text(keyframes=_kf({"x": -0.3}, {"x": 1.4}))
        ev = _events(animated_dialogues(clip, W, H, fps=30))
        self.assertLess(_pos(ev[0][2])[0], 0)
        self.assertGreater(_pos(ev[-1][2])[0], W)

    def test_build_ass_usa_los_fps_de_la_timeline(self):
        clip = _text(keyframes=_kf({"x": 0.2}, {"x": 0.8}))
        n30 = build_ass([clip], W, H, fps=30).count("Dialogue:")
        n60 = build_ass([clip], W, H, fps=60).count("Dialogue:")
        self.assertGreater(n60, n30 * 1.8)


if __name__ == "__main__":
    unittest.main()
