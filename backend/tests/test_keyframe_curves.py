"""Curvas de animación por keyframe = preview (frontend/src/lib/clipKeyframesCurves.test.mjs).

Además: el export ya no interpola en línea recta entre keyframes (ignoraba ease/hold)
y las figuras animadas no se desplazan (antes la pose se aplicaba dos veces).
"""
import unittest

from app.clip_keyframes import (
    bezier_y, clip_props_at, ease_t, ffmpeg_envelope, normalize_bezier, normalize_interp,
    pose_sample_times, upsert_keyframe_at,
)
from app.schemas import TimelineClip
from app.shapes import NEUTRAL_POSE, export_pose

U = (0.1, 0.3, 0.5, 0.7, 0.9)
GOLDEN = [
    ("cubic-in", None, [0.001, 0.027, 0.125, 0.343, 0.729]),
    ("cubic-out", None, [0.271, 0.657, 0.875, 0.973, 0.999]),
    ("cubic-in-out", None, [0.004, 0.108, 0.5, 0.892, 0.996]),
    ("back-out", None, [0.403933, 0.907361, 1.087401, 1.075776, 1.012616]),
    ("bezier", [0.1, 0.9, 0.2, 1], [0.585273, 0.888456, 0.966236, 0.991978, 0.999381]),
    ("bezier", [0.9, 0, 0.1, 1], [0.004666, 0.059813, 0.5, 0.940187, 0.995334]),
    ("bezier", [0.5, -0.5, 0.5, 1.5], [-0.070756, 0.020053, 0.5, 0.979947, 1.070756]),
]


def _kf_clip(interp, bezier=None, kind="image", t_b=1.0):
    b = {"id": "b", "t": t_b, "interpolation": interp, "props": {"x": 1.0}}
    if bezier:
        b["bezier"] = bezier
    return {"kind": kind, "keyframes": {"enabled": True, "items": [
        {"id": "a", "t": 0.0, "interpolation": "linear", "props": {"x": 0.0}}, b]}}


class CurvesTest(unittest.TestCase):
    def test_golden_igual_que_el_preview(self):
        for kind, bez, want in GOLDEN:
            for u, w in zip(U, want):
                self.assertAlmostEqual(ease_t(u, kind, bez), w, delta=2e-6, msg=(kind, bez, u))

    def test_bezier_extremos_y_recta(self):
        self.assertEqual(bezier_y((0.9, 0, 0.1, 1), 0), 0.0)
        self.assertEqual(bezier_y((0.9, 0, 0.1, 1), 1), 1.0)
        for u in U:
            self.assertAlmostEqual(bezier_y((0.25, 0.25, 0.75, 0.75), u), u, delta=1e-6)
        self.assertGreater(bezier_y((0, 1, 0, 1), 0.01), 0.3)

    def test_normalizacion(self):
        self.assertEqual(normalize_bezier([-1, 5, 2, -3]), (0.0, 2.0, 1.0, -1.0))
        self.assertIsNone(normalize_bezier([0.1, 0.2]))
        self.assertIsNone(normalize_bezier(["a", 0, 1, 1]))
        self.assertEqual(normalize_interp("cubic-in-out"), "cubic-in-out")
        self.assertEqual(normalize_interp("bezier"), "bezier")
        self.assertEqual(normalize_interp("raro"), "linear")

    def test_interpolacion_usa_la_curva_del_keyframe(self):
        c = _kf_clip("bezier", [0.1, 0.9, 0.2, 1])
        self.assertAlmostEqual(clip_props_at(c, 0.3)["x"], 0.888456, delta=2e-6)

    def test_keyframe_nuevo_hereda_la_bezier(self):
        c = upsert_keyframe_at(_kf_clip("bezier", [0.1, 0.9, 0.2, 1]), 2.0, {"x": 0.5})
        last = c["keyframes"]["items"][-1]
        self.assertEqual(last["interpolation"], "bezier")
        self.assertEqual(last["bezier"], [0.1, 0.9, 0.2, 1])


class ExportSamplingTest(unittest.TestCase):
    def test_tramo_lineal_no_se_muestrea(self):
        self.assertEqual(pose_sample_times(_kf_clip("linear"), 1.0), [0.0, 1.0])

    def test_tramo_con_curva_se_muestrea_por_fotograma(self):
        ts = pose_sample_times(_kf_clip("cubic-in"), 1.0)
        self.assertEqual(len(ts), 31)
        # Lineal a trozos por esos puntos = la curva en cada fotograma a 30 fps.
        c = _kf_clip("cubic-in")
        for k in range(31):
            t = k / 30
            self.assertAlmostEqual(clip_props_at(c, t)["x"], (t ** 3), delta=1e-9)

    def test_hold_salta_al_final(self):
        ts = pose_sample_times(_kf_clip("hold"), 1.0)
        self.assertIn(0.999, [round(t, 6) for t in ts])

    def test_envolvente_de_volumen_con_bezier(self):
        c = {"kind": "audio", "volume": 1, "keyframes": {"enabled": True, "items": [
            {"id": "a", "t": 0, "interpolation": "linear", "props": {"volume": 0}},
            {"id": "b", "t": 1, "interpolation": "bezier", "bezier": [0.1, 0.9, 0.2, 1], "props": {"volume": 1}},
        ]}}
        expr = ffmpeg_envelope(c, "volume", 1.0)
        self.assertIsNotNone(expr)
        self.assertGreater(expr.count("if(lt(t"), 20)   # la curva va en tramos cortos

    def test_envolvente_cubica_con_formula(self):
        c = {"kind": "audio", "volume": 1, "keyframes": {"enabled": True, "items": [
            {"id": "a", "t": 0, "interpolation": "linear", "props": {"volume": 0}},
            {"id": "b", "t": 1, "interpolation": "cubic-out", "props": {"volume": 1}},
        ]}}
        expr = ffmpeg_envelope(c, "volume", 1.0)
        self.assertIn("(1-(1-(", expr)


class ShapeExportPoseTest(unittest.TestCase):
    def _shape(self, keyframes=None, **shape):
        return TimelineClip(id="s", track_id="V1", kind="shape", asset_kind="shape", asset_id="s",
                            filename="", start=0, in_point=0, out_point=1, source_duration=1,
                            shape={"type": "rect", "x": 0.2, "y": 0.3, "rotation": 15, "opacity": 0.5,
                                   "scale": 2, **shape},
                            keyframes=keyframes)

    def test_figura_quieta_hornea_su_pose_con_escala(self):
        self.assertEqual(export_pose(self._shape()),
                         {"x": 0.2, "y": 0.3, "scale": 2.0, "rotation": 15.0, "opacity": 0.5})

    def test_figura_animada_se_rasteriza_neutra(self):
        kf = {"enabled": True, "items": [{"id": "a", "t": 0, "interpolation": "linear", "props": {"x": 0.2}}]}
        self.assertEqual(export_pose(self._shape(keyframes=kf)), NEUTRAL_POSE)


if __name__ == "__main__":
    unittest.main()
