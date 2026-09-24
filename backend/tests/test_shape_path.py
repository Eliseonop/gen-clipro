"""Trazado con pluma, punteado y «dibujar trazo» (#14): geometría, raster y export."""
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.clip_keyframes import static_props
from app.clip_kind import ffmpeg_input_args
from app.clip_motion import build_motion_items
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.shapes import (
    dash_pattern, dash_runs, media_exists, normalize_shape, path_points, path_shape,
    rasterize_shape, rasterize_timeline_shapes, shape_draw_at, shape_geometry, trim_polyline,
)
from app.timeline_ops import add_shape, animate_clip


def _shape_clip(shape, **kw):
    return TimelineClip(id=kw.pop("id", "s"), track_id="V1", kind="shape", asset_kind="shape",
                        asset_id="path", filename="", start=kw.pop("start", 0.0),
                        out_point=kw.pop("out", 3.0), source_duration=3.0, shape=shape, **kw)


_DRAW_KF = {"enabled": True, "items": [
    {"id": "a", "t": 0.0, "interpolation": "linear", "props": {"draw": 0.0}},
    {"id": "b", "t": 1.0, "interpolation": "linear", "props": {"draw": 1.0}},
]}


class GeometryTest(unittest.TestCase):
    def test_curva_igual_que_el_editor(self):
        # Mismos números que frontend/src/lib/shapePath.test.mjs.
        pts = [[0, 100], [30, 10], [70, 90], [100, 0]]
        o = path_points(pts, False, True)
        self.assertEqual(len(o), 37)
        self.assertEqual(o[12], (30.0, 10.0))
        self.assertAlmostEqual(o[5][0], 9.866898148148149)
        self.assertAlmostEqual(o[20][1], 69.62962962962963)
        c = path_points(pts, True, True)
        self.assertEqual(len(c), 48)
        self.assertAlmostEqual(c[40][0], 71.48148148148147)
        self.assertEqual(path_points(pts, False, False), [tuple(map(float, p)) for p in pts])

    def test_figura_desde_puntos(self):
        sh = path_shape([[0.1, 0.8], [0.4, 0.2], [0.9, 0.5]])
        self.assertEqual([sh["x"], sh["y"], sh["w"], sh["h"]], [0.5, 0.5, 0.8, 0.6])
        self.assertEqual(sh["points"], [[0, 100], [37.5, 0], [100, 50]])
        self.assertEqual(len(shape_geometry("path", normalize_shape(sh))["strokes"]), 1)
        self.assertEqual(len(shape_geometry("path", normalize_shape({**sh, "closed": True}))["fills"]), 1)
        with self.assertRaises(ValueError):
            path_shape([[0.5, 0.5]])

    def test_normaliza_estilo(self):
        st = normalize_shape({"type": "rect", "dash": "zigzag", "draw": 7})
        self.assertEqual((st["dash"], st["draw"]), ("solid", 1))
        self.assertNotIn("points", st)
        self.assertEqual(dash_pattern("dash", 4), (8, 8))
        self.assertEqual(dash_pattern("dot", 4), (0.0, 8))
        self.assertIsNone(dash_pattern("solid", 4))

    def test_recorte_y_guiones(self):
        L = [(0, 0), (10, 0), (10, 10)]
        self.assertEqual(trim_polyline(L, 0.25), [(0, 0), (5.0, 0.0)])
        self.assertEqual(trim_polyline(L, 0.75), [(0, 0), (10, 0), (10.0, 5.0)])
        self.assertEqual(trim_polyline(L, 0), [])
        runs, dots = dash_runs([(0, 0), (100, 0)], (10, 10))
        self.assertEqual(len(runs), 5)
        self.assertEqual(runs[1], [(20.0, 0.0), (30.0, 0.0)])
        runs, dots = dash_runs([(0, 0), (100, 0)], (0, 25))
        self.assertEqual(runs, [])
        self.assertEqual([d[0] for d in dots], [0, 25, 50, 75, 100])
        # Un guion que dobla una esquina lleva el vértice.
        runs, _ = dash_runs([(0, 0), (15, 0), (15, 15)], (20, 20))
        self.assertEqual(runs[0], [(0.0, 0.0), (15, 0), (15.0, 5.0)])


class RasterTest(unittest.TestCase):
    def test_trazo_parcial_y_relleno_que_aparece(self):
        sh = path_shape([[0.1, 0.5], [0.9, 0.5]], stroke="#ff0000", strokeWidth=12)
        full = rasterize_shape(sh, 180, 320)
        half = rasterize_shape(sh, 180, 320, draw=0.5)
        xs_full = np.flatnonzero(full[160, :, 3] > 127)
        xs_half = np.flatnonzero(half[160, :, 3] > 127)
        self.assertAlmostEqual(xs_half.max() - xs_half.min(), (xs_full.max() - xs_full.min()) / 2, delta=4)
        self.assertEqual(int(rasterize_shape(sh, 180, 320, draw=0)[:, :, 3].max()), 0)
        box = {"type": "rect", "fill": "#00ff00", "strokeWidth": 0}
        a = rasterize_shape(box, 180, 320, draw=0.5)[134, 90, 3]   # centro (y = 0,42)
        self.assertAlmostEqual(int(a), 128, delta=2)

    def test_punteado(self):
        sh = path_shape([[0.1, 0.5], [0.9, 0.5]], strokeWidth=12, dash="dash")
        row = rasterize_shape(sh, 720, 1280)[640, :, 3] > 127
        edges = np.flatnonzero(np.diff(row.astype(int)))
        lw = 12 * 1280 / 720
        dash, gap = edges[1] - edges[0], edges[2] - edges[1]
        self.assertAlmostEqual(dash, 3 * lw, delta=3)
        self.assertAlmostEqual(gap, lw, delta=3)
        sol = rasterize_shape({**sh, "dash": "solid"}, 720, 1280)
        self.assertEqual(int(np.diff((sol[640, :, 3] > 127).astype(int)).__abs__().sum()), 2)


class ExportTest(unittest.TestCase):
    def test_secuencia_solo_si_el_trazo_se_anima(self):
        sh = path_shape([[0.1, 0.5], [0.9, 0.5]])
        tl = Timeline(width=90, height=160, fps=10,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[_shape_clip(sh, id="fijo"), _shape_clip(sh, id="anim", keyframes=_DRAW_KF)])
        with tempfile.TemporaryDirectory() as td:
            out = rasterize_timeline_shapes(tl, Path(td), 90, 160)
            self.assertTrue(str(out["fijo"]).endswith("fijo.png"))
            self.assertIn("%05d", str(out["anim"]))
            self.assertTrue(media_exists(out["anim"]))
            frames = sorted(Path(td).glob("anim_*.png"))
            self.assertEqual(len(frames), 32)          # 3 s a 10 fps + 2
            args = ffmpeg_input_args(_shape_clip(sh), out["anim"], 10)
            self.assertEqual(args[:4], ["-framerate", "10", "-start_number", "0"])
        self.assertAlmostEqual(shape_draw_at(_shape_clip(sh, keyframes=_DRAW_KF), 0.25), 0.25)
        self.assertEqual(static_props(_shape_clip({**sh, "draw": 0.3}).model_dump())["draw"], 0.3)

    @unittest.skipUnless(shutil.which("ffmpeg"), "sin ffmpeg")
    def test_export_real_dibuja_el_trazo(self):
        from app.compose import render_frame
        import cv2

        sh = path_shape([[0.1, 0.5], [0.9, 0.5]], stroke="#ff0000", strokeWidth=12)
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[_shape_clip(sh, start=0.5, keyframes=_DRAW_KF)])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        with tempfile.TemporaryDirectory() as td:
            ends = {}
            for at in (1.0, 2.0):
                img = cv2.imread(str(render_frame(proj, tl, Path(td) / f"f{at}.png", at)))
                red = img[640, :, 2].astype(int) - img[640, :, 1].astype(int)
                ends[at] = int(np.flatnonzero(red > 127).max())
        # Mitad del recorrido (72 → 648 px) + medio grosor de extremo redondo.
        self.assertAlmostEqual(ends[1.0], 360 + 10, delta=3)
        self.assertAlmostEqual(ends[2.0], 648 + 10, delta=3)


class OpsTest(unittest.TestCase):
    def _tl(self):
        return Timeline(tracks=[TimelineTrack(id="V1", kind="video", name="V1")])

    def test_add_shape_con_puntos(self):
        r = add_shape(self._tl(), shape={"stroke": "#00ff00", "dash": "dot"},
                      points=[[0.1, 0.8], [0.4, 0.2], [0.9, 0.5]])
        c = r.timeline.clips[0]
        self.assertEqual(c.shape["type"], "path")
        self.assertEqual(c.shape["dash"], "dot")
        self.assertEqual(c.shape["points"], [[0, 100], [37.5, 0], [100, 50]])

    def test_animate_draw_in(self):
        r = add_shape(self._tl(), points=[[0.1, 0.5], [0.9, 0.5]], duration=4)
        cid = r.timeline.clips[0].id
        out = animate_clip(r.timeline, cid, "draw_in", duration=2).timeline
        c = out.clips[0]
        self.assertAlmostEqual(shape_draw_at(c, 0), 0.0)
        self.assertAlmostEqual(shape_draw_at(c, 1.0), 0.5, places=3)
        self.assertAlmostEqual(shape_draw_at(c, 3.0), 1.0)
        self.assertAlmostEqual(static_props(c)["x"], 0.5)
        items = build_motion_items(c, "zoom_in")
        self.assertTrue(all("draw" not in it["props"] for it in items), "zoom no toca el trazo")
        with self.assertRaises(ValueError):
            build_motion_items({"kind": "video", "out_point": 3}, "draw_in")


if __name__ == "__main__":
    unittest.main()
