"""Historias con stickman: storyboard → composición, IA del storyboard, reparto y MCP."""
import asyncio
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects
from app.mcp_server import tools_motion
from app.motion import stick, stick_ai
from app.motion import service as motion_service
from app.motion import templates as T
from app.motion.generator import generate_html
from app.motion.validator import validate

_JS = (Path(stick.__file__).parent / "stick.js").read_text(encoding="utf-8")


def _collect(gen):
    async def run():
        return [ev async for ev in gen]
    return asyncio.run(run())


class FakeProvider:
    def __init__(self, texts):
        self.texts = list(texts)
        self.calls = []

    def unavailable_reason(self):
        return None

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        self.calls.append({"system": system, "message": user_message, "tools": tools})
        text = self.texts[min(len(self.calls) - 1, len(self.texts) - 1)]
        await emit({"type": "text", "delta": text})
        return text


class VocabularyParityTest(unittest.TestCase):
    """Las claves que ofrece Python (UI/IA) deben existir en el motor JS."""

    def _js_keys(self, block_name):
        m = re.search(r"var " + block_name + r" = \{(.*?)\n  \};", _JS, re.S)
        self.assertIsNotNone(m, block_name)
        return set(re.findall(r"^\s{4}(\w+):", m.group(1), re.M))

    def test_poses_match_engine(self):
        self.assertEqual(set(stick.POSES), self._js_keys("POSES"))

    def test_styles_match_engine(self):
        self.assertEqual(set(stick.STYLES), self._js_keys("STYLES"))

    def test_expressions_fx_envs_handled_in_engine(self):
        for key in stick.EXPRESSIONS:
            if key != "neutral":
                self.assertIn(f"case '{key}'", _JS)
        for key in stick.FX:
            if key not in ("shake", "flash"):
                self.assertIn(f"case '{key}'", _JS)
            else:
                self.assertIn(f"'{key}'", _JS)
        for key in stick.ENVIRONMENTS:
            if key != "none":
                self.assertIn(f"case '{key}'", _JS)

    def test_pose_groups_cover_all_poses(self):
        grouped = [k for _, keys in stick.POSE_GROUPS for k in keys]
        self.assertEqual(sorted(grouped), sorted(stick.POSES))

    def test_engine_is_deterministic(self):
        code = re.sub(r"/\*.*?\*/|//[^\n]*", "", _JS, flags=re.S)
        self.assertNotIn("Math.random", code)
        self.assertNotIn("Date.now", code)


class NormalizeTest(unittest.TestCase):
    def test_empty_input_gives_valid_storyboard(self):
        sb = stick.normalize(None)
        self.assertEqual(len(sb["shots"]), 1)
        self.assertGreater(sb["duration"], 0)

    def test_tolerates_llm_noise(self):
        sb = stick.normalize({
            "style": {"preset": "CHALK"}, "environment": "bus",
            "characters": [{"name": "Rosa María", "gender": "female", "shirt": "polo naranja"},
                           {"name": "Rosa María"}],
            "shots": [{"start": 0, "end": 2, "actors": [
                {"id": "rosa_maría", "pose": "flying", "x": 9, "facing": "left"},
                {"id": "desconocido", "pose": "walk"}], "fx": ["impact", "boom"], "camera": "zoom"}],
        })
        self.assertEqual(sb["style"]["preset"], "chalk")
        self.assertEqual(sb["environment"]["preset"], "bus")
        c0, c1 = sb["characters"]
        self.assertEqual(c0["body"], "woman")
        self.assertEqual(c0["shirt"], "#f97316")
        self.assertNotEqual(c0["id"], c1["id"])
        shot = sb["shots"][0]
        self.assertEqual(shot["camera"], "wide")
        self.assertEqual([f["type"] for f in shot["fx"]], ["impact"])
        self.assertEqual(len(shot["actors"]), 1)
        a = shot["actors"][0]
        self.assertEqual((a["pose"], a["x"], a["facing"]), ("stand", 1.4, -1))

    def test_shots_are_contiguous_and_rescaled(self):
        sb = stick.normalize({"shots": [{"duration": 1}, {"duration": 3}]}, duration=8)
        s1, s2 = sb["shots"]
        self.assertEqual((s1["start"], s1["end"], s2["start"], s2["end"]), (0.0, 2.0, 2.0, 8.0))
        self.assertEqual(sb["duration"], 8.0)

    def test_demo_is_stable_under_normalize(self):
        sb = stick.normalize(stick.DEMO_STORYBOARD)
        self.assertEqual(stick.normalize(sb), sb)


class CompositionTest(unittest.TestCase):
    def test_build_is_valid_single_html_layer(self):
        comp = stick.build_composition("c1", stick.DEMO_STORYBOARD, width=720, height=1280)
        self.assertEqual(validate(comp), [])
        self.assertEqual([l.type for l in comp.layers], ["html"])
        self.assertEqual(comp.layers[0].js, stick.STICK_JS)
        self.assertTrue(stick.is_stick(comp))
        self.assertAlmostEqual(comp.duration, comp.metadata["stick"]["duration"])

    def test_template_in_gallery_and_html_includes_engine(self):
        keys = {t["key"]: t for t in T.list_templates()}
        self.assertEqual(keys["stick_scene"]["category"], "story")
        comp = T.instantiate("stick_scene", "c2", {"theme": "dark", "width": 1080, "height": 1920})
        self.assertEqual(comp.metadata["stick"]["style"]["preset"], "chalk")
        html = generate_html(comp)
        self.assertIn("window.StickScene", html)
        self.assertLess(html.index("window.StickScene"), html.index("buildHtmlLayer"))

    def test_prompts_carry_cast_and_continuity(self):
        p = stick.prompts(stick.DEMO_STORYBOARD)
        self.assertIn("Rosa", p["video"])
        self.assertIn("orange", p["video"])
        self.assertIn("CONTINUITY LOCK", p["image"])
        self.assertIn("gore", p["negative"])


class StoryboardAITest(unittest.TestCase):
    STORY = json.dumps({"title": "Bus", "characters": [{"id": "leo", "name": "Leo", "shirt": "#dc2626"}],
                        "shots": [{"duration": 2, "actors": [{"id": "leo", "pose": "hold_rail"}]},
                                  {"duration": 2, "actors": [{"id": "leo", "pose": "fall"}]}]})

    def _run(self, provider, **kw):
        with patch("app.motion.stick_ai.get_provider", return_value=provider):
            return _collect(stick_ai.storyboard_stream(**kw))

    def test_valid_json_yields_normalized_storyboard(self):
        ev = self._run(FakeProvider([self.STORY]), script="Leo se cae en el bus", duration=6, style="paper")
        sb = next(e["storyboard"] for e in ev if e["type"] == "storyboard")
        self.assertEqual(sb["duration"], 6.0)
        self.assertEqual(sb["style"]["preset"], "paper")
        self.assertEqual(sb["script"], "Leo se cae en el bus")

    def test_retries_then_errors(self):
        prov = FakeProvider(["no es json", "tampoco"])
        ev = self._run(prov, script="x")
        self.assertEqual(len(prov.calls), 2)
        self.assertEqual(ev[-1]["type"], "error")

    def test_existing_cast_is_enforced(self):
        prov = FakeProvider([self.STORY])
        cast = [{"id": "leo", "name": "Leo", "shirt": "#2563eb", "pants": "#334155", "hair": "curly"}]
        ev = self._run(prov, script="Leo otra vez", cast=cast)
        sb = next(e["storyboard"] for e in ev if e["type"] == "storyboard")
        self.assertEqual(sb["characters"][0]["shirt"], "#2563eb")
        self.assertEqual(sb["characters"][0]["hair"], "curly")
        self.assertIn("REPARTO YA EXISTENTE", prov.calls[0]["message"])

    def test_empty_script_errors_without_calling_model(self):
        prov = FakeProvider([self.STORY])
        ev = self._run(prov, script="  ")
        self.assertEqual(ev[0]["type"], "error")
        self.assertEqual(prov.calls, [])


class ProjectStickTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, config.OUTPUT_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        config.OUTPUT_DIR = self.tmp / "out"
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id

    def tearDown(self):
        config.DATA_DIR, config.OUTPUT_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_mcp_create_update_and_cast(self):
        out = tools_motion.motion_create_stick_scene(self.pid, stick.DEMO_STORYBOARD)
        cid = out["composition_id"]
        self.assertEqual(out["storyboard"]["characters"], ["Leo", "Rosa"])
        cast = tools_motion.motion_stick_library(self.pid)["project_cast"]
        self.assertEqual({c["id"] for c in cast}, {"leo", "rosa"})

        sb = json.loads(json.dumps(stick.DEMO_STORYBOARD))
        sb["title"] = "Otra"
        out2 = tools_motion.motion_create_stick_scene(self.pid, sb, composition_id=cid)
        self.assertEqual(out2["composition_id"], cid)
        self.assertEqual(len(motion_service.list_compositions(self.pid)), 1)

    def test_for_range_rescales_shots(self):
        out = tools_motion.motion_create_stick_scene(self.pid, stick.DEMO_STORYBOARD,
                                                     for_range={"start": 10, "end": 14})
        comp = motion_service.get_composition(self.pid, out["composition_id"])
        self.assertEqual(comp.duration, 4.0)
        self.assertEqual(comp.metadata["stick"]["shots"][-1]["end"], 4.0)
        self.assertTrue(comp.metadata["draft"])


if __name__ == "__main__":
    unittest.main()
