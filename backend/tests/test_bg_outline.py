"""Contorno / halo del sujeto recortado (#9): mismos parámetros que el preview
(frontend/src/lib/clipBgOutline.test.mjs) y filtergraph del export."""
import unittest

from app.clip_bg import (OUTLINE_LEVEL, normalize_bg, normalize_outline, outline_ffmpeg_steps,
                         outline_params)


class OutlineParamsTest(unittest.TestCase):
    def test_normaliza(self):
        o = normalize_outline(None)
        self.assertEqual(o, {"enabled": False, "color": "#FFFFFF", "width": 0.3, "soft": 0.0, "opacity": 1.0})
        o = normalize_outline({"enabled": 1, "color": "f00", "width": 7, "soft": -1})
        self.assertEqual((o["enabled"], o["color"], o["width"], o["soft"]), (True, "#FF0000", 1.0, 0.0))

    def test_bg_conserva_el_contorno(self):
        bg = normalize_bg({"chroma": {"enabled": True}, "outline": {"enabled": True, "width": 0.5}})
        self.assertTrue(bg["outline"]["enabled"])
        self.assertEqual(bg["outline"]["width"], 0.5)

    def test_parametros_iguales_que_el_preview(self):
        self.assertEqual(OUTLINE_LEVEL, 17)
        self.assertIsNone(outline_params(normalize_outline({"enabled": False}), 1080))
        self.assertIsNone(outline_params(normalize_outline({"enabled": True, "width": 0}), 1080))
        p = outline_params(normalize_outline({"enabled": True, "width": 0.5, "soft": 0.4}), 1080)
        self.assertAlmostEqual(p["width"], 27.0)
        self.assertAlmostEqual(p["sigma"], 18.0)
        self.assertAlmostEqual(p["gain"], 92.664093, places=5)
        self.assertAlmostEqual(p["halo"], 10.8)

    def test_pasos_ffmpeg(self):
        o = normalize_outline({"enabled": True, "color": "#FF0000", "width": 0.5})
        steps, out = outline_ffmpeg_steps(o, 1080, "bgcut0", 0)
        joined = ";".join(steps)
        self.assertEqual(out, "olo0")
        self.assertIn("gblur=sigma=18.0000:steps=3", joined)
        self.assertIn("lut=y='clip((val-17)*92.6641\\,0\\,255)*1.0000'", joined)
        self.assertIn("lutrgb=r=255:g=0:b=0", joined)
        # El sujeto va ENCIMA del contorno.
        self.assertTrue(steps[-1].startswith("[oll0][ols0]overlay"))
        # Sin contorno no cambia nada.
        self.assertEqual(outline_ffmpeg_steps(normalize_outline(None), 1080, "x", 0), ([], "x"))


if __name__ == "__main__":
    unittest.main()
