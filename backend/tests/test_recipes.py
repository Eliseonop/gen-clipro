"""Recetas en un clic (#21)."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.clip_keyframes import clip_props_at
from app.recipes import RECIPE_IDS, RECIPES
from app.schemas import Timeline, TimelineClip, TimelineTrack
from app.shapes import shape_draw_at
from app.timeline_ops import apply_recipe, validate_timeline


def _tl():
    tracks = [TimelineTrack(id="V1", kind="video", name="V1"), TimelineTrack(id="A1", kind="audio", name="A1"),
              TimelineTrack(id="T1", kind="text", name="T1")]
    clips = [
        TimelineClip(id="v1", track_id="V1", kind="video", asset_kind="clips", asset_id="0", filename="a.mp4",
                     start=0, out_point=3, source_duration=10),
        TimelineClip(id="v2", track_id="V1", kind="video", asset_kind="clips", asset_id="1", filename="b.mp4",
                     start=3, in_point=2, out_point=6, source_duration=10),
        TimelineClip(id="im", track_id="V1", kind="image", asset_kind="images", asset_id="2", filename="c.png",
                     start=7, out_point=3, source_duration=3),
        TimelineClip(id="t", track_id="T1", kind="text", asset_kind="text", asset_id="t", filename="", text="MONTAÑAS",
                     start=1, out_point=4, source_duration=4, style={"x": 0.5, "y": 0.4, "size": 0.08, "scale": 1}),
        TimelineClip(id="mus", track_id="A1", kind="audio", asset_kind="audios", asset_id="m", filename="m.mp3",
                     out_point=10, source_duration=10, beats={"times": [0.5, 1.0, 1.5, 2.0, 2.5], "bpm": 120, "every": 1}),
    ]
    return Timeline(width=720, height=1280, fps=25, tracks=tracks, clips=clips)


def _by(tl, cid):
    return next(c for c in tl.clips if c.id == cid)


class RecipesTest(unittest.TestCase):
    def test_catalogo(self):
        self.assertEqual(len(RECIPES), 5)
        self.assertEqual({r["trick"] for r in RECIPES}, {1, 3, 6, 7, 10})
        with self.assertRaises(ValueError):
            apply_recipe(_tl(), "nada")

    def test_etalonaje_de_cine(self):
        r = apply_recipe(_tl(), "cinema_grade")
        adj = next(c for c in r.timeline.clips if c.kind == "adjustment")
        bars = next(c for c in r.timeline.clips if c.name == "Barras de cine")
        self.assertEqual((adj.start, adj.out_point), (0.0, 10.0))
        self.assertEqual([f["id"] for f in adj.filters], ["teal_orange", "faded"])
        self.assertAlmostEqual(bars.shape["bar"], 0.3418, "vertical: barras 16:9")
        self.assertAlmostEqual(shape_draw_at(bars, 0), 0.0)
        self.assertEqual(validate_timeline(r.timeline), [])

    def test_texto_con_reflejo(self):
        r = apply_recipe(_tl(), "text_reflection", ["t"])
        tl = r.timeline
        refl = next(c for c in tl.clips if c.dup_of == "t")
        self.assertTrue(refl.flip_v)
        self.assertEqual(refl.blend_mode, "overlay")
        self.assertGreater(refl.style["y"], 0.4)
        self.assertEqual(refl.masks[0]["type"], "linear")
        self.assertNotEqual(refl.track_id, "T1", "en su propia pista de texto")
        self.assertEqual(_by(tl, "t").flip_v, False, "el original no cambia")
        with self.assertRaises(ValueError):
            apply_recipe(_tl(), "text_reflection", ["v1"])

    def test_texto_que_atraviesas(self):
        tl = apply_recipe(_tl(), "pass_through_text", ["t"]).timeline
        t = _by(tl, "t")
        self.assertAlmostEqual(clip_props_at(t, 0.0)["scale"], 1.0)
        self.assertAlmostEqual(clip_props_at(t, 2.9)["scale"], 1.0, msg="quieto hasta el último segundo")
        self.assertAlmostEqual(clip_props_at(t, 4.0)["scale"], 60.0)
        self.assertAlmostEqual(clip_props_at(t, 4.0)["opacity"], 0.0)
        self.assertLess(clip_props_at(t, 3.5)["scale"], 10, "cubic-in: casi todo el crecimiento al final")

    def test_franjas_al_ritmo(self):
        r = apply_recipe(_tl(), "film_strips", ["v1", "v2", "im"])
        tl = r.timeline
        clips = [_by(tl, i) for i in ("v1", "v2", "im")]
        self.assertEqual([c.start for c in clips], [0.5, 1.0, 1.5], "entran en los beats de la música")
        self.assertEqual(len({c.track_id for c in clips}), 3)
        self.assertEqual([c.masks[0]["type"] for c in clips], ["film"] * 3)
        self.assertEqual([round(c.masks[0]["y"], 3) for c in clips], [0.167, 0.5, 0.833])
        self.assertAlmostEqual(clips[0].masks[0]["h"], 0.3333)
        self.assertEqual(r.warnings, [])
        no_beats = _tl()
        no_beats.clips = [c for c in no_beats.clips if c.id != "mus"]
        r2 = apply_recipe(no_beats, "film_strips", ["v1", "v2"])
        self.assertEqual([_by(r2.timeline, i).start for i in ("v1", "v2")], [0.0, 0.35])
        self.assertTrue(r2.warnings)
        with self.assertRaises(ValueError):
            apply_recipe(_tl(), "film_strips", ["v1"])

    def test_sujeto_que_se_adelanta(self):
        lib = [{"id": "02/Whoosh.mp3", "name": "Whoosh", "category": "Impact", "uso": "", "url": "/u"},
               {"id": "07/Camera Shutter.mp3", "name": "Camera Shutter", "category": "UI", "uso": "", "url": "/u2"}]
        with patch("app.sfx.search", return_value={"items": lib}), patch("app.sfx.resolve", return_value=None):
            r = apply_recipe(_tl(), "subject_pop", ["v2"])
        tl = r.timeline
        sub = next(c for c in tl.clips if c.dup_of == "v2")
        self.assertAlmostEqual(sub.start, 3 - 6 / 25)
        self.assertEqual(sub.in_point, 2.0, "empieza en el mismo fotograma que su plano")
        self.assertTrue(sub.bg_removal["auto"]["enabled"])
        flash = next(c for c in tl.clips if c.name == "Destello")
        self.assertEqual((flash.start, flash.shape["bar"], flash.shape["fill"]), (3.0, 0.5, "#ffffff"))
        self.assertAlmostEqual(clip_props_at(flash, 0.25)["opacity"], 0.0)
        self.assertEqual(sorted(c.name for c in tl.clips if c.asset_kind == "sfx"), ["Camera Shutter", "Whoosh"])
        self.assertTrue(any("recorte IA" in w for w in r.warnings))
        self.assertEqual(validate_timeline(tl), [])
        with self.assertRaises(ValueError):
            apply_recipe(_tl(), "subject_pop", ["v1"])    # empieza en 0: no hay plano anterior


class StoreTest(unittest.TestCase):
    def test_un_solo_deshacer(self):
        from app import config, projects, timeline_store
        tmp = Path(tempfile.mkdtemp())
        old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = tmp, tmp / "projects.json", tmp / "history"
        try:
            pid = projects.create_project("r").id
            projects.save_timeline(pid, _tl().model_dump())
            before = len(projects.get_project(pid).timeline.clips)
            res = timeline_store.apply_op(pid, "apply_recipe", {"recipe": "cinema_grade"})
            self.assertEqual(len(projects.get_project(pid).timeline.clips), before + 2)
            self.assertTrue(res["changed"])
            timeline_store.undo(pid)
            self.assertEqual(len(projects.get_project(pid).timeline.clips), before)
        finally:
            config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = old
            shutil.rmtree(tmp, ignore_errors=True)

    def test_ids_en_el_mcp(self):
        from app.mcp_server.help_content import TOOL_DOMAINS
        self.assertEqual(TOOL_DOMAINS["apply_recipe"], "clips")
        self.assertEqual(set(RECIPE_IDS), {"cinema_grade", "text_reflection", "pass_through_text",
                                            "film_strips", "subject_pop"})


if __name__ == "__main__":
    unittest.main()
