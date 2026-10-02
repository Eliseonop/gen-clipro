"""Animaciones de clip (fx_anims) y catálogo de efectos: paridad con el frontend."""
from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

from app import fx_anims, fx_catalog
from app.clip_anim import render_pose
from app.schemas import TimelineClip

ROOT = Path(__file__).resolve().parents[2]

CASES = [
    ({"in": {"id": "pop_in"}}, 4.0),
    ({"in": {"id": "bounce_in", "dur": 1.2}, "out": {"id": "fade_out"}}, 3.0),
    ({"loop": {"id": "pulse"}}, 5.0),
    ({"loop": {"id": "spin_loop", "dur": 1.5}, "in": {"id": "zoom_in"}}, 2.0),
    ({"combo": {"id": "ken_burns_in"}}, 6.0),
    ({"in": {"id": "swing_in", "dur": 2}, "out": {"id": "drop_out", "dur": 2}}, 3.0),   # se reparten
    ({"in": {"id": "elastic_in"}, "out": {"id": "shrink_out"}, "loop": {"id": "sway"}}, 2.5),
]
TIMES = [0.0, 0.05, 0.13, 0.3, 0.49, 0.8, 1.1, 1.7, 2.2, 2.45, 2.9, 3.0, 4.5]


def _py_table():
    rows = []
    for anims, dur in CASES:
        clip = {"animations": anims}
        rows.append([fx_anims.animation_delta(clip, t, dur) for t in TIMES if t <= dur])
    return rows


class CatalogTest(unittest.TestCase):
    def test_catalogo_generado(self):
        cat = fx_catalog.catalog()
        self.assertGreaterEqual(len(cat["effects"]), 40)
        self.assertGreaterEqual(len(cat["anims"]), 40)
        ids = [e["id"] for e in cat["effects"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("paper_cutout", ids)
        paper = fx_catalog.effect("paper_cutout")
        self.assertEqual(paper["engine"], "canvas")
        self.assertTrue(any(a.endswith("paper_overlay_0.webp") for a in paper["assets"]))

    @unittest.skipUnless(shutil.which("node"), "sin node")
    def test_catalogo_al_dia_con_el_frontend(self):
        """`npm run fx:build` debe haberse ejecutado tras tocar frontend/src/fx."""
        code = ("Promise.all([import('./src/fx/registry.js'),import('./src/fx/core/define.js'),import('./src/fx/anims.js')])"
                ".then(([r,d,a])=>console.log(JSON.stringify({effects:r.EFFECTS.map(e=>({...d.effectManifest(e),assets:e.assets||[]})),anims:a.ANIMS})))")
        out = subprocess.run(["node", "-e", code], cwd=ROOT / "frontend",
                             capture_output=True, text=True, check=True).stdout
        js = json.loads(out)
        cat = fx_catalog.catalog()
        self.assertEqual(js["effects"], cat["effects"], "catalog.json desactualizado: npm run fx:build")
        self.assertEqual(js["anims"], cat["anims"], "catalog.json desactualizado: npm run fx:build")

    def test_parametros_se_validan(self):
        fx = fx_catalog.effect("glitch_rgb")
        p = fx_catalog.resolve_params(fx, {"amount": 5, "speed": "x", "extra": 1})
        self.assertEqual(p["amount"], 1.0)                 # recortado al máximo
        self.assertEqual(p["speed"], 1)                    # inválido → por defecto
        self.assertNotIn("extra", p)
        sel = fx_catalog.resolve_params(fx_catalog.effect("mirror"), {"mode": "nope"})
        self.assertEqual(sel["mode"], "lr")


class AnimEvalTest(unittest.TestCase):
    def test_entrada_y_salida(self):
        clip = {"animations": {"in": {"id": "fade_in", "dur": 0.5}, "out": {"id": "fade_out", "dur": 0.5}}}
        self.assertAlmostEqual(fx_anims.animation_delta(clip, 0.0, 4)["opacity"], 0.0)
        self.assertAlmostEqual(fx_anims.animation_delta(clip, 2.0, 4)["opacity"], 1.0)
        self.assertAlmostEqual(fx_anims.animation_delta(clip, 4.0, 4)["opacity"], 0.0)
        self.assertGreater(fx_anims.animation_delta(clip, 0.25, 4)["opacity"], 0.5)   # outQuad

    def test_ranura_equivocada_se_ignora(self):
        clip = {"animations": {"in": {"id": "fade_out"}}}
        self.assertFalse(fx_anims.has_animations(clip))

    def test_muestras_del_export(self):
        clip = {"animations": {"in": {"id": "pop_in", "dur": 0.4}}}
        ts = fx_anims.animation_sample_times(clip, 3.0)
        self.assertEqual(ts[0], 0.0)
        self.assertAlmostEqual(ts[-1], 0.4)
        self.assertEqual(len(ts), 13)   # 30 fps en 0,4 s

    def test_render_pose_no_toca_la_de_edicion(self):
        clip = TimelineClip(id="c", track_id="V1", kind="image", asset_kind="images", asset_id="1", filename="a.png", start=0, in_point=0, out_point=3,
                            layout="overlay", animations={"in": {"id": "zoom_in", "dur": 0.5}})
        from app.clip_anim import clip_pose
        self.assertAlmostEqual(clip_pose(clip, 0.0)["scale"], 1.0)
        self.assertAlmostEqual(render_pose(clip, 0.0)["scale"], 0.6)
        self.assertAlmostEqual(render_pose(clip, 1.0)["scale"], 1.0)

    @unittest.skipUnless(shutil.which("node"), "sin node")
    def test_mismos_deltas_que_el_editor(self):
        cases = json.dumps(CASES)
        times = json.dumps(TIMES)
        code = (
            "import('./src/fx/core/animEval.js').then((m) => {"
            f"const cases = {cases}; const times = {times};"
            "console.log(JSON.stringify(cases.map(([a, d]) => times.filter((t) => t <= d)"
            ".map((t) => m.animationDelta({ animations: a }, t, d)))))})"
        )
        out = subprocess.run(["node", "-e", code], cwd=ROOT / "frontend", capture_output=True,
                             text=True, check=True).stdout
        js = json.loads(out)
        py = _py_table()
        for rj, rp in zip(js, py):
            for dj, dp in zip(rj, rp):
                for k in ("x", "y", "scale", "rotation", "opacity"):
                    self.assertAlmostEqual(dj[k], dp[k], places=9, msg=f"{k}: {dj} vs {dp}")


class ComposeAnimTest(unittest.TestCase):
    def test_overlay_con_animacion_usa_la_rama_animada(self):
        from app import compose
        clip = TimelineClip(id="c", track_id="V1", kind="image", asset_kind="images", asset_id="1", filename="a.png", start=0, in_point=0, out_point=3,
                            layout="overlay", animations={"in": {"id": "zoom_in", "dur": 0.5}})
        self.assertTrue(compose._pose_animated(clip))
        pts = compose._pose_prop_points(clip, "scale", 3.0)
        self.assertAlmostEqual(pts[0][1], 0.6)
        self.assertAlmostEqual(pts[-1][1], 1.0)
        self.assertGreater(len(pts), 10)
        # El recorte NO se anima por la animación (sigue el de reframe).
        self.assertFalse(compose.keyframes_enabled(clip))


if __name__ == "__main__":
    unittest.main()
