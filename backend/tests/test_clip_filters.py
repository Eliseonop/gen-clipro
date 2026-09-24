"""Filtros de color con intensidad, apilables (#18)."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.clip_attrs import paste_attributes
from app.clip_filters import (
    FILTER_IDS, FILTERS, clip_filters, compose, filter_matrix, filters_ffmpeg, stack_matrix,
)
from app.schemas import Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import set_clip_effects

ROOT = Path(__file__).resolve().parents[2]
I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]


def apply(m, rgb):
    return [min(1, max(0, m[r][0] * rgb[0] + m[r][1] * rgb[1] + m[r][2] * rgb[2] + m[r][3])) for r in range(3)]


class MatrixTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "sin node")
    def test_mismas_matrices_que_el_editor(self):
        code = ("import('./src/lib/clipFilters.js').then((m) => console.log(JSON.stringify("
                "m.FILTERS.map((f) => ({ id: f.id, group: f.group, matrix: f.matrix })))))")
        out = subprocess.run(["node", "-e", code], cwd=ROOT / "frontend", capture_output=True,
                             text=True, check=True).stdout
        js = json.loads(out)
        self.assertEqual([f["id"] for f in js], list(FILTER_IDS))
        for a, b in zip(js, FILTERS):
            self.assertEqual(a["group"], b["group"])
            np.testing.assert_allclose(a["matrix"], b["matrix"], atol=1e-12, err_msg=b["id"])

    def test_intensidad_y_pila(self):
        self.assertEqual(filter_matrix("noir", 0), I)
        np.testing.assert_allclose(filter_matrix("noir", 1), next(f["matrix"] for f in FILTERS if f["id"] == "noir"), atol=1e-12)
        # A media intensidad = mitad del camino entre el original y el filtro (es lineal).
        c = [0.8, 0.3, 0.2]
        half = apply(filter_matrix("sepia", 0.5), c)
        full = apply(filter_matrix("sepia", 1), c)
        np.testing.assert_allclose(half, [(x + y) / 2 for x, y in zip(c, full)], atol=1e-12)
        # La pila se aplica en orden: primero Noir, luego Cálido.
        stack = [{"id": "noir", "amount": 1}, {"id": "warm", "amount": 1}]
        m = stack_matrix(stack)
        np.testing.assert_allclose(apply(m, c), apply(filter_matrix("warm"), apply(filter_matrix("noir"), c)), atol=1e-12)
        self.assertIsNone(stack_matrix([{"id": "bw", "amount": 0}]))
        self.assertEqual(compose(I, filter_matrix("bw")), filter_matrix("bw"))

    def test_look_antiguo_y_limpieza(self):
        self.assertEqual(clip_filters({"look": "vintage"}), [{"id": "vintage", "amount": 1.0}])
        self.assertEqual(clip_filters({"look": "none"}), [])
        self.assertEqual(clip_filters({"filters": [{"id": "x"}, {"id": "bw", "amount": 3}], "look": "warm"}),
                         [{"id": "bw", "amount": 1.0}], "la pila manda sobre el look")

    def test_ffmpeg(self):
        self.assertEqual(filters_ffmpeg({}), "")
        f = filters_ffmpeg({"filters": [{"id": "faded", "amount": 1}]})
        self.assertTrue(f.startswith("format=gbrap,colorchannelmixer="), "el desplazamiento va en la columna alfa")
        self.assertIn(":ra=", f)
        self.assertNotIn("ra=", filters_ffmpeg({"filters": [{"id": "bw", "amount": 1}]}))


@unittest.skipUnless(shutil.which("ffmpeg"), "sin ffmpeg")
class FfmpegTest(unittest.TestCase):
    def test_export_igual_a_la_matriz(self):
        import cv2
        tmp = Path(tempfile.mkdtemp())
        try:
            cols = [(0.87, 0.64, 0.52), (0.36, 0.62, 0.9), (0.3, 0.55, 0.25), (0.05, 0.05, 0.05), (0.95, 0.95, 0.95)]
            img = np.zeros((10, 10 * len(cols), 3), np.uint8)
            for i, (r, g, b) in enumerate(cols):
                img[:, i * 10:(i + 1) * 10] = (round(b * 255), round(g * 255), round(r * 255))
            cv2.imwrite(str(tmp / "in.png"), img)
            stacks = [[{"id": f, "amount": 1}] for f in FILTER_IDS]
            stacks.append([{"id": "vintage", "amount": 0.5}, {"id": "cool", "amount": 1}, {"id": "noir", "amount": 0.3}])
            for stack in stacks:
                clip = {"filters": stack}
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp / "in.png"),
                                "-vf", f"format=gbrp,{filters_ffmpeg(clip)}", str(tmp / "o.png")], check=True)
                out = cv2.imread(str(tmp / "o.png"))
                m = stack_matrix(clip_filters(clip))
                for i, c in enumerate(cols):
                    exp = np.array(apply(m, [round(v * 255) / 255 for v in c])) * 255
                    got = out[5, i * 10 + 5][::-1].astype(float)
                    self.assertLess(float(np.abs(got - exp).max()), 2.0, (stack, c))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class OpTest(unittest.TestCase):
    def _tl(self):
        return Timeline(tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                        clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips", asset_id="0",
                                            filename="a.mp4", out_point=4, source_duration=4, look="warm")])

    def test_set_clip_effects_filtros(self):
        r = set_clip_effects(self._tl(), "v", filters=[{"id": "teal_orange", "amount": 0.7}, "faded"])
        c = r.timeline.clips[0]
        self.assertEqual(c.filters, [{"id": "teal_orange", "amount": 0.7}, {"id": "faded", "amount": 1.0}])
        self.assertEqual(c.look, "none")
        with self.assertRaises(ValueError):
            set_clip_effects(self._tl(), "v", filters=[{"id": "lomo"}])
        with self.assertRaises(ValueError):
            set_clip_effects(self._tl(), "v")

    def test_pegar_atributos_copia_los_filtros(self):
        src = {**self._tl().clips[0].model_dump(), "id": "a", "filters": [{"id": "noir", "amount": 0.4}]}
        out = paste_attributes(self._tl().clips[0].model_dump(), src, ["effects"])
        self.assertEqual(out["filters"], [{"id": "noir", "amount": 0.4}])


if __name__ == "__main__":
    unittest.main()
