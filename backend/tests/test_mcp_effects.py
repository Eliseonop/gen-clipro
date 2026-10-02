"""MCP: efectos de vídeo animados (list_effects / apply_effect) y animaciones de clip."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, timeline_store
from app.mcp_server import registry, server, tools_edit  # noqa: F401
from app.schemas import Timeline, TimelineClip, TimelineTrack


def _timeline():
    return Timeline(
        tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                TimelineTrack(id="T1", kind="text", name="T1")],
        clips=[
            TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips", asset_id="0",
                         filename="a.mp4", start=0.0, in_point=0.0, out_point=4.0, source_duration=4.0),
            TimelineClip(id="t", track_id="T1", kind="text", asset_kind="text", asset_id="",
                         filename="", start=0.0, in_point=0.0, out_point=2.0, text="Hola"),
        ],
    )


class McpEffectsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Demo").id
        projects.save_timeline(self.pid, _timeline().model_dump())

    def tearDown(self):
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _clip(self, cid="v"):
        return next(c for c in projects.get_project(self.pid).timeline.clips if c.id == cid)

    def test_catalogo(self):
        cat = tools_edit.list_effects()
        ids = [e["id"] for e in cat["effects"]]
        self.assertIn("glitch_rgb", ids)
        self.assertIn("paper_cutout", ids)
        self.assertIn("in", cat["animations"])
        papel = tools_edit.list_effects(query="papel")
        self.assertIn("paper_cutout", [e["id"] for e in papel["effects"]])
        retro = tools_edit.list_effects(category="retro")
        self.assertTrue(all(e["category"] == "retro" for e in retro["effects"]))

    def test_anadir_editar_y_quitar_un_efecto(self):
        tools_edit.apply_effect(self.pid, ["v"], "vhs", params={"amount": 3}, start=1, end=2.5)
        vfx = self._clip().vfx
        self.assertEqual(len(vfx), 1)
        self.assertEqual(vfx[0]["effect"], "vhs")
        self.assertEqual(vfx[0]["params"]["amount"], 1.0)       # validado al rango
        self.assertEqual((vfx[0]["from"], vfx[0]["to"]), (1.0, 2.5))
        uid = vfx[0]["uid"]
        tools_edit.apply_effect(self.pid, ["v"], uid=uid, params={"noise": 0.1})
        vfx = self._clip().vfx
        self.assertEqual(vfx[0]["params"]["noise"], 0.1)
        self.assertEqual(vfx[0]["params"]["amount"], 1.0)       # lo demás se conserva
        tools_edit.apply_effect(self.pid, ["v"], "shake")
        self.assertEqual([e["effect"] for e in self._clip().vfx], ["vhs", "shake"])
        tools_edit.apply_effect(self.pid, ["v"], effect="vhs", remove=True)
        self.assertEqual([e["effect"] for e in self._clip().vfx], ["shake"])
        tools_edit.undo(self.pid)
        self.assertEqual([e["effect"] for e in self._clip().vfx], ["vhs", "shake"])
        tools_edit.apply_effect(self.pid, ["v"], stack=[])
        self.assertIsNone(self._clip().vfx)

    def test_errores(self):
        with self.assertRaises(Exception):
            tools_edit.apply_effect(self.pid, ["v"], "no_existe")
        with self.assertRaises(Exception):
            tools_edit.apply_effect(self.pid, ["t"], "vhs")     # un texto no lleva efectos de vídeo
        with self.assertRaises(Exception):
            tools_edit.set_clip_animation(self.pid, ["v"], "in", "fade_out")   # ranura equivocada

    def test_animaciones(self):
        tools_edit.set_clip_animation(self.pid, ["v", "t"], "in", "pop_in", duration=0.8)
        self.assertEqual(self._clip("v").animations, {"in": {"id": "pop_in", "dur": 0.8}})
        self.assertEqual(self._clip("t").animations, {"in": {"id": "pop_in", "dur": 0.8}})
        tools_edit.set_clip_animation(self.pid, ["v"], "combo", "ken_burns_in")
        self.assertEqual(self._clip("v").animations["combo"], {"id": "ken_burns_in"})
        tools_edit.set_clip_animation(self.pid, ["v"], "in", None)
        self.assertEqual(self._clip("v").animations, {"combo": {"id": "ken_burns_in"}})
        self.assertIsNone(self._clip("v").keyframes)            # no toca los keyframes

    def test_registradas(self):
        specs = registry.registered()
        self.assertEqual(specs["list_effects"].access, "read")
        self.assertEqual(specs["apply_effect"].access, "write")
        self.assertEqual(specs["set_clip_animation"].access, "write")


if __name__ == "__main__":
    unittest.main()
