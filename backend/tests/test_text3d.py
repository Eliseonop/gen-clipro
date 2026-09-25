"""Texto 3D (#4): proyección = preview (frontend/src/lib/text3d.test.mjs) y export
con capa propia + filtro ``perspective``."""
import unittest
from pathlib import Path

from app import compose
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.text3d import MAX_ANGLE, angles, focal_of, plane_project, region_corners, warp_region
from app.text_ass import build_ass, text_is_3d, text_warp_spec

W, H = 360, 640


def _text(style=None, keyframes=None, text="MAURITIUS"):
    return TimelineClip(
        id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t1", filename="",
        start=0.0, in_point=0, out_point=2.0, source_duration=2.0, text=text,
        style={"font": "Arial", "size": 0.06, "color": "#ffffff", "word_fx": "none", "x": 0.5, "y": 0.5,
               **(style or {})},
        keyframes=keyframes,
    )


def _kf_rot(a, b):
    base = {"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1}
    return {"enabled": True, "items": [
        {"id": "a", "t": 0, "interpolation": "linear", "props": {**base, "rot_x": a}},
        {"id": "b", "t": 1, "interpolation": "linear", "props": {**base, "rot_x": b}},
    ]}


class ProjectionTest(unittest.TestCase):
    def test_focal(self):
        self.assertAlmostEqual(focal_of(1280, 0.5), 1280)
        self.assertAlmostEqual(focal_of(1280, 0), 5120)
        self.assertAlmostEqual(focal_of(1280, 1), 731.428571, places=4)
        self.assertAlmostEqual(focal_of(1280, None), 1280)

    def test_angles(self):
        self.assertIsNone(angles({}))
        self.assertIsNone(angles({"rot_x": 0.01, "rot_y": -0.02}))
        self.assertEqual(angles({"rot_x": 30}), (30.0, 0.0))
        self.assertEqual(angles({"rot_x": 200, "rot_y": -90}), (MAX_ANGLE, -MAX_ANGLE))

    def test_golden_igual_que_el_preview(self):
        f = focal_of(1280, 0.5)
        cases = [
            ((360, 640, 60, 0, 200, 600), (204.216027, 620.527003, 1.027063)),
            ((360, 640, -30, 45, 100, 900), (62.891339, 882.588206, 0.928184)),
            ((360, 640, 75, -75, 700, 100), (1057.171667, 475.359693, 0.848895)),
        ]
        for (cx, cy, rx, ry, X, Y), want in cases:
            got = plane_project(cx, cy, rx, ry, f, X, Y)
            for g, w in zip(got, want):
                self.assertAlmostEqual(g, w, places=5)

    def test_region_contiene_el_texto_proyectado(self):
        pose = {"cx": 180, "cy": 320, "rx": 60, "ry": 0, "f": 640, "hx": 120, "hy": 30}
        x0, y0, x1, y1 = warp_region([pose], W, H)
        self.assertLessEqual(x0, 60)
        self.assertGreaterEqual(x1, 300)
        corners = region_corners(pose, (x0, y0, x1, y1))
        # Arriba (lejos) más estrecho que abajo (cerca).
        top = corners[1][0] - corners[0][0]
        bottom = corners[3][0] - corners[2][0]
        self.assertLess(top, bottom)


class Text3dExportTest(unittest.TestCase):
    def test_texto_plano_no_es_3d(self):
        self.assertFalse(text_is_3d(_text()))
        self.assertIsNone(text_warp_spec(_text(), _text().style, W, H))

    def test_texto_girado_es_3d_y_estatico(self):
        clip = _text({"rot_x": 60})
        self.assertTrue(text_is_3d(clip))
        spec = text_warp_spec(clip, clip.style, W, H)
        self.assertEqual(len(spec["corners"]), 1)

    def test_texto_animado_da_esquinas_por_fotograma(self):
        clip = _text(keyframes=_kf_rot(0, 70))
        self.assertTrue(text_is_3d(clip, 30))
        spec = text_warp_spec(clip, clip.style, W, H, 30)
        self.assertEqual(len(spec["corners"]), 60)
        self.assertEqual(spec["frames"][:3], [0, 1, 2])
        self.assertNotEqual(spec["corners"][0], spec["corners"][-1])

    def _cmd(self, clip, frame_at=0.5):
        tl = Timeline(fps=30, width=W, height=H, tracks=[TimelineTrack(id="T1", kind="text", name="T1")],
                      clips=[clip])
        ass_path, layers, _tracks = compose._prepare_texts(tl, Path("x.mp4"), W, H)
        self.assertIn(clip.id, layers)          # el 3D va en capa propia
        cmd = compose.build_command(Project(id="p", name="p", created_at="n", timeline=tl), tl,
                                    Path("x.mp4"), ass_path=ass_path, text_layers=layers, frame_at=frame_at)
        return cmd[cmd.index("-filter_complex") + 1]

    def test_filtro_perspective_en_el_export(self):
        fc = self._cmd(_text({"rot_x": 60}))
        self.assertIn("perspective=", fc)
        self.assertIn("sense=destination", fc)
        self.assertNotIn("eval=frame", fc)
        # Regresión: sin textos "normales" el export caía a drawtext y repetía el
        # texto de la capa, plano y encima.
        self.assertNotIn("drawtext", fc)

    def test_filtro_perspective_animado(self):
        fc = self._cmd(_text(keyframes=_kf_rot(0, 70)))
        self.assertIn("eval=frame", fc)
        self.assertIn("if(lt(in\\,", fc)

    def test_giros_en_el_ass_no_se_duplican(self):
        # El giro 3D lo hace la capa, no libass (sin \\frx/\\fry en el .ass).
        doc = build_ass([_text({"rot_x": 60})], W, H)
        self.assertNotIn("\\frx", doc)
        self.assertNotIn("\\fry", doc)


if __name__ == "__main__":
    unittest.main()
