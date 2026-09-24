"""Capa de ajuste (#19): matriz, op, grafo del export y render real."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app.clip_filters import adjustment_matrix
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import add_adjustment_layer, set_clip_effects

ROOT = Path(__file__).resolve().parents[2]
ADJ = {"filters": [{"id": "teal_orange", "amount": 0.8}, {"id": "faded", "amount": 0.5}],
       "effects": {"saturation": -0.3, "exposure": 0.2, "contrast": 0.1}, "opacity": 0.9}


def _tl(extra=()):
    return Timeline(width=720, height=1280, fps=25,
                    tracks=[TimelineTrack(id="V1", kind="video", name="V1"), *extra],
                    clips=[TimelineClip(id="im", track_id="V1", kind="image", asset_kind="images", asset_id="1",
                                        filename="a.png", out_point=4, source_duration=4, layout="fill")])


class MatrixTest(unittest.TestCase):
    def test_sin_efecto_es_none(self):
        self.assertIsNone(adjustment_matrix({}))
        self.assertIsNone(adjustment_matrix({**ADJ, "opacity": 0}))

    @unittest.skipUnless(shutil.which("node"), "sin node")
    def test_igual_que_el_editor(self):
        code = ("Promise.all([import('./src/lib/clipFilters.js'), import('./src/lib/clipAdjust.js')])"
                ".then(([f, a]) => { const c = " + json.dumps(ADJ) + ";"
                " console.log(JSON.stringify(f.adjustmentMatrix(c, a.colorMatrix(c.effects)))) })")
        js = json.loads(subprocess.run(["node", "-e", code], cwd=ROOT / "frontend", capture_output=True,
                                       text=True, check=True).stdout)
        np.testing.assert_allclose(js, adjustment_matrix(ADJ), atol=1e-12)


class OpTest(unittest.TestCase):
    def test_va_arriba_y_crea_pista_si_esta_ocupada(self):
        r = add_adjustment_layer(_tl(), start=1, duration=2, filters=[{"id": "noir", "amount": 0.5}])
        tl = r.timeline
        self.assertEqual([t.kind for t in tl.tracks], ["video", "video"], "V1 estaba ocupada: pista nueva encima")
        adj = next(c for c in tl.clips if c.kind == "adjustment")
        self.assertEqual((adj.start, adj.out_point, adj.track_id), (1.0, 2.0, tl.tracks[-1].id))
        self.assertEqual(adj.filters, [{"id": "noir", "amount": 0.5}])
        # Otra más tarde cabe en la misma pista de arriba.
        r2 = add_adjustment_layer(tl, start=5, duration=1)
        self.assertEqual(len(r2.timeline.tracks), 2)
        # Se edita con set_clip_effects como un vídeo.
        r3 = set_clip_effects(tl, adj.id, effects={"hue": 30})
        self.assertEqual(next(c for c in r3.timeline.clips if c.id == adj.id).effects, {"hue": 30})
        with self.assertRaises(ValueError):
            add_adjustment_layer(_tl(), duration=0)
        with self.assertRaises(ValueError):
            add_adjustment_layer(_tl(), intensity=2)


class ExportTest(unittest.TestCase):
    def test_grafo_una_sola_vez_y_con_su_tramo(self):
        from app.compose import build_command

        tl = add_adjustment_layer(_tl(), start=1, duration=2, **{"filters": ADJ["filters"]}).timeline
        with patch("app.compose._clip_path", return_value=Path(__file__)):
            cmd = build_command(Project(id="p", name="p", created_at="2026-01-01T00:00:00"), tl,
                                Path(tempfile.gettempdir()) / "x.mp4")
        graph = cmd[cmd.index("-filter_complex") + 1]
        steps = [s for s in graph.split(";") if "colorchannelmixer" in s and "enable=" in s]
        self.assertEqual(len(steps), 1, "la capa se aplica una vez (no tiene archivo)")
        self.assertIn("enable='between(t,1.000,3.000)'", steps[0])

    @unittest.skipUnless(shutil.which("ffmpeg"), "sin ffmpeg")
    def test_render_real(self):
        import cv2

        from app.compose import render_frame

        tmp = Path(tempfile.mkdtemp())
        try:
            cols = [(0.87, 0.64, 0.52), (0.36, 0.62, 0.9), (0.3, 0.55, 0.25), (0.1, 0.1, 0.1)]
            img = np.zeros((1280, 720, 3), np.uint8)
            for i, (r, g, b) in enumerate(cols):
                img[i * 320:(i + 1) * 320] = (round(b * 255), round(g * 255), round(r * 255))
            png = tmp / "a.png"
            cv2.imwrite(str(png), img)
            proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
            tl = add_adjustment_layer(_tl(), start=1, duration=2, filters=ADJ["filters"],
                                      effects=ADJ["effects"], intensity=ADJ["opacity"]).timeline
            m = adjustment_matrix(next(c for c in tl.clips if c.kind == "adjustment"))
            with patch("app.compose._clip_path", return_value=png):
                plain = cv2.imread(str(render_frame(proj, _tl(), tmp / "p.png", 1.5)))
                inside = cv2.imread(str(render_frame(proj, tl, tmp / "i.png", 1.5)))
                outside = cv2.imread(str(render_frame(proj, tl, tmp / "o.png", 3.5)))
            for i in range(len(cols)):
                y = i * 320 + 160
                p = plain[y, 360][::-1].astype(float) / 255
                exp = np.array([min(1, max(0, m[r][0] * p[0] + m[r][1] * p[1] + m[r][2] * p[2] + m[r][3]))
                                for r in range(3)]) * 255
                self.assertLess(float(np.abs(inside[y, 360][::-1] - exp).max()), 3.0, i)
                self.assertEqual(outside[y, 360].tolist(), plain[y, 360].tolist(), "fuera de su tramo no toca nada")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
