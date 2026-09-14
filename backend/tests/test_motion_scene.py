"""Generar Escena: direcciones creativas, brief, presets, plan, ensamblado e IA por beats.

Proveedor simulado (sin red): respuestas en cola por llamada.
"""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects
from app.motion import directions, scene, scene_ai
from app.motion import service as motion_service
from app.motion.generator import generate_html
from app.motion.validator import validate
from app.schemas import Timeline, TimelineTrack

W, H = 720, 1280


def _collect(gen):
    async def run():
        return [ev async for ev in gen]
    return asyncio.run(run())


class QueueProvider:
    def __init__(self, texts):
        self.texts = list(texts)
        self.calls = []

    def unavailable_reason(self):
        return None

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        self.calls.append({"system": system, "message": user_message})
        text = self.texts.pop(0) if self.texts else ""
        await emit({"type": "text", "delta": text})
        return text


def _ctx(images=()):
    return {
        "selection": {"start": 10.0, "end": 16.0, "duration": 6.0},
        "scriptContext": {"previous": "", "current": "El Sol pierde energía y hay que salvarlo.",
                          "next": "", "keyTerms": ["Sol"]},
        "availableAssets": [{"kind": "image", "id": i, "label": f"img {i}", "match": True} for i in images],
        "style": {"format": {"width": W, "height": H, "fps": 30}, "avoidY": [0.78, 0.9]},
    }


GOOD_BLOCK = """<html>
<div class="sc-scene"><div class="b1-t sc-display">El Sol</div><svg class="b1-s" width="200" height="200"><path class="sc-stroke" d="M10 10 L190 190"/></svg></div>
</html>
<css>
.b1-t{position:absolute;left:10%;top:30%;font-size:calc(var(--u)*10);}
</css>
<js>
var t = root.querySelector('.b1-t');
var p = root.querySelector('path');
tl.fromTo(t, {autoAlpha: 0, y: 20}, {autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out'}, 0);
tl.fromTo(p, {strokeDashoffset: 260}, {strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut'}, 0.3);
</js>"""

STORYBOARD = json.dumps({
    "title": "Científico", "characters": [{"id": "cien", "name": "Científico", "body": "man"}],
    "shots": [{"duration": 1.5, "actors": [{"id": "cien", "pose": "think", "x": 0.5}]}],
})


class DirectionsTest(unittest.TestCase):
    def test_catalog_is_complete_and_engine_valid(self):
        self.assertGreaterEqual(len(directions.DIRECTIONS), 16)
        for d in directions.DIRECTIONS.values():
            eng = d["engine"]
            self.assertIn(eng["backdrop"], directions.BACKDROPS, d["key"])
            self.assertIn(eng["image_treatment"], directions.IMAGE_TREATMENTS, d["key"])
            self.assertIn(eng["transition"], directions.TRANSITIONS, d["key"])
            for k in ("bg", "surface", "ink", "secondary", "accent"):
                self.assertRegex(d["palette"][k], r"^#[0-9a-fA-F]{6}$")
            for role in ("display", "body"):
                self.assertIn(d["typography"][role], directions.F)

    def test_lock_contains_identity_palette_and_hard_negatives(self):
        d = directions.resolve("sketchbook", {"accent": "#e11d48", "notes": "más tachones"})
        lock = directions.compile_lock(d)
        self.assertIn("CREATIVE DIRECTION LOCK: SKETCHBOOK", lock)
        self.assertIn("#e11d48", lock)                 # override del usuario
        self.assertIn("neon", lock)
        self.assertIn("glassmorphism", lock)
        self.assertIn("TEST DE DIRECCIÓN DE ARTE", lock)
        self.assertIn("más tachones", lock)

    def test_invalid_override_ignored_and_default_direction(self):
        d = directions.resolve("no-existe", {"accent": "rojo"})
        self.assertEqual(d["key"], directions.DEFAULT_DIRECTION)
        self.assertRegex(d["palette"]["accent"], r"^#")

    def test_kit_css_defines_vars_and_classes(self):
        css = directions.kit_css(directions.get("blueprint"), W, H)
        for token in ("--sc-accent", "--u:7.200px", ".sc-backdrop", ".sc-stroke", ".sc-highlight"):
            self.assertIn(token, css)


class BriefAndPresetsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = scene._PRESETS_FILE
        scene._PRESETS_FILE = self.tmp / "scene_presets.json"

    def tearDown(self):
        scene._PRESETS_FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_brief_normalizes_and_forces_unavailable_video_off(self):
        b = scene.normalize_brief({"direction": "newspaper", "resources": {"video": "required", "stick": "off"},
                                   "must_include": "Sol\nTierra", "intent": "rara"}, duration=6)
        self.assertEqual(b["direction"], "newspaper")
        self.assertEqual(b["resources"]["video"], "off")
        self.assertEqual(b["resources"]["stick"], "off")
        self.assertEqual(b["must_include"], ["Sol", "Tierra"])
        self.assertEqual(b["intent"], "explicativa")
        self.assertEqual(b["duration"], 6.0)

    def test_presets_crud_and_builtin_protection(self):
        n0 = len(scene.list_presets())
        p = scene.save_preset("Mío", {"direction": "ink_wash", "idea": "no se guarda", "pace": "calmo"})
        self.assertNotIn("idea", p["brief"])
        self.assertEqual(p["brief"]["direction"], "ink_wash")
        self.assertEqual(len(scene.list_presets()), n0 + 1)
        p2 = scene.save_preset("Mío v2", {"direction": "swiss"}, p["id"])
        self.assertEqual(p2["id"], p["id"])
        self.assertEqual(len(scene.list_presets()), n0 + 1)
        with self.assertRaises(ValueError):
            scene.delete_preset("builtin_documental")
        self.assertTrue(scene.delete_preset(p["id"]))
        self.assertEqual(len(scene.list_presets()), n0)


class PlanTest(unittest.TestCase):
    def test_contiguous_beats_sum_duration(self):
        b = scene.normalize_brief({}, duration=6)
        plan = scene.normalize_plan({"beats": [
            {"kind": "stickman", "duration": 2}, {"kind": "diagram", "duration": 5}, {"kind": "quote"}]}, b)
        beats = plan["beats"]
        self.assertEqual([x["kind"] for x in beats], ["stick", "graphic", "text"])
        self.assertEqual(beats[0]["start"], 0.0)
        self.assertEqual(beats[-1]["end"], 6.0)
        for a, c in zip(beats, beats[1:]):
            self.assertEqual(a["end"], c["start"])
            self.assertGreaterEqual(a["end"] - a["start"], scene.MIN_BEAT - 1e-6)

    def test_off_resources_converted_and_required_warned(self):
        b = scene.normalize_brief({"resources": {"stick": "off", "image": "required"}}, duration=4)
        plan = scene.normalize_plan({"beats": [{"kind": "stick", "duration": 2}, {"kind": "image", "duration": 2,
                                                                                  "asset_id": "nope"}]},
                                    b, image_ids=set())
        kinds = [x["kind"] for x in plan["beats"]]
        self.assertNotIn("stick", kinds)
        self.assertNotIn("image", kinds)          # sin imágenes no hay beat de imagen
        self.assertTrue(any("obligatorio" in w for w in plan["warnings"]))

    def test_image_asset_fallback_to_existing(self):
        b = scene.normalize_brief({}, duration=3)
        plan = scene.normalize_plan({"beats": [{"kind": "image", "asset_id": "zzz", "duration": 3}]},
                                    b, image_ids={"img1"})
        self.assertEqual(plan["beats"][0]["asset_id"], "img1")

    def test_too_many_beats_trimmed(self):
        b = scene.normalize_brief({}, duration=2)
        plan = scene.normalize_plan({"beats": [{"kind": "text", "duration": 0.2}] * 8}, b)
        self.assertLessEqual(len(plan["beats"]), 2)

    def test_empty_plan_gets_text_beat(self):
        b = scene.normalize_brief({"idea": "La escala"}, duration=3)
        plan = scene.normalize_plan({}, b)
        self.assertEqual(len(plan["beats"]), 1)
        self.assertEqual(plan["beats"][0]["content"], "La escala")


def _scene_for(direction, background="opaque"):
    brief = scene.normalize_brief({"direction": direction, "background": background}, duration=8)
    d = scene.resolved_direction(brief)
    beats = scene.normalize_plan({"beats": [
        {"kind": "stick", "duration": 2}, {"kind": "graphic", "duration": 2, "content": "Energía: 3,8e26 W"},
        {"kind": "image", "duration": 2, "asset_id": "img1", "content": "NASA: la Tierra"},
        {"kind": "text", "duration": 2, "content": "La escala"}]}, brief, image_ids={"img1"})["beats"]
    beats[0]["stick"] = scene.prepare_stick(json.loads(STORYBOARD), beats[0], d, brief)
    beats[1]["block"] = scene_ai.parse_block(GOOD_BLOCK)
    return {"brief": brief, "plan": {"title": "Sol"}, "beats": beats}


class BuildCompositionTest(unittest.TestCase):
    def test_every_direction_builds_valid_composition(self):
        for key in directions.DIRECTIONS:
            comp = scene.build_composition("mg_x", _scene_for(key), width=W, height=H, fps=30, project_id="p1")
            self.assertEqual(validate(comp), [], key)
            ids = [l.id for l in comp.layers]
            self.assertEqual(ids[0], "scene_bg")
            self.assertIn("beat_b1", ids)
            self.assertTrue(scene.is_scene(comp))

    def test_layers_follow_beats_and_transitions_cover_cuts(self):
        comp = scene.build_composition("mg_x", _scene_for("sketchbook"), width=W, height=H, fps=30, project_id="p1")
        beat_layers = [l for l in comp.layers if l.beat]
        self.assertEqual([(l.start, l.end) for l in beat_layers], [(0.0, 2.0), (2.0, 4.0), (4.0, 6.0), (6.0, 8.0)])
        self.assertIn("ctx.beat.stick", beat_layers[0].js)
        self.assertIn("asset:image/img1", beat_layers[2].html)
        self.assertIn("El Sol", beat_layers[1].html)
        self.assertIn("La escala", beat_layers[3].html)   # fallback tipográfico (sin bloque)
        trs = [l for l in comp.layers if l.id.startswith("tr_")]
        self.assertEqual(len(trs), 3)
        self.assertAlmostEqual(trs[0].start, 2.0 - scene.TRANSITION_HALF)
        stick_style = comp.metadata["scene"]["beats"][0]["stick"]["style"]
        self.assertEqual(stick_style["preset"], "transparent")
        self.assertEqual(stick_style["palette"]["halo"], directions.get("sketchbook")["palette"]["bg"])

    def test_transparent_scene_has_no_backdrop_and_no_transitions_when_disabled(self):
        sc = _scene_for("swiss", background="transparent")
        sc["brief"]["transitions"] = False
        comp = scene.build_composition("mg_x", sc, width=W, height=H, fps=30, project_id="p1")
        self.assertFalse(any(l.id in ("scene_bg",) or l.id.startswith("tr_") for l in comp.layers))

    def test_generator_injects_kit_fonts_and_escapes_script(self):
        sc = _scene_for("newspaper")
        sc["beats"][1]["block"]["js"] += "\n// </script> no debe cerrar"
        comp = scene.build_composition("mg_x", sc, width=W, height=H, fps=30, project_id="p1")
        html = generate_html(comp)
        self.assertIn(".sc-backdrop", html)
        self.assertIn('id="sc-rough"', html)
        self.assertIn("Libre+Baskerville", html)
        self.assertIn("window.__ASSETS", html)
        # El "</script>" del js va escapado: no añade cierres de etiqueta.
        self.assertEqual(html.count("</script>"), html.count("<script>"))

    def test_non_scene_composition_has_no_kit(self):
        from app.motion.models import MotionComposition
        html = generate_html(MotionComposition(id="x"))
        self.assertNotIn(".sc-backdrop", html)


class BlockParsingTest(unittest.TestCase):
    beat = {"id": "b1", "kind": "graphic", "start": 0.0, "end": 2.0}

    def test_parse_and_accept_good_block(self):
        blk = scene_ai.parse_block("```\n" + GOOD_BLOCK + "\n```")
        self.assertIn("sc-display", blk["html"])
        self.assertEqual(scene_ai.check_block(blk, self.beat, W, H), [])

    def test_rejects_from_random_urls_and_script(self):
        blk = {"html": '<div><img src="https://x.com/a.png"><script>1</script></div>', "css": "",
               "js": "tl.from(root, {autoAlpha:0}); Math.random();"}
        errs = " ".join(scene_ai.check_block(blk, self.beat, W, H))
        self.assertIn("fromTo", errs)
        self.assertIn("Math.random", errs)
        self.assertIn("URLs", errs)
        self.assertIn("<script>", errs)

    def test_syntax_error_detected_with_node(self):
        if not shutil.which("node"):
            self.skipTest("node no disponible")
        errs = scene_ai.check_block({"html": "<div></div>", "css": "", "js": "tl.fromTo(root, {a:1}, {a:2"},
                                    self.beat, W, H)
        self.assertTrue(any("sintaxis" in e for e in errs))

    def test_bare_u_arithmetic_is_wrapped_in_calc(self):
        blk = scene_ai.parse_block("<html><div style=\"top:2*var(--u)\"></div></html>"
                                   "<css>.a{top:3*var(--u);left:var(--u)*4;font-size:calc(var(--u) * 1.8);"
                                   "margin:calc(100% - 2*var(--u))}</css><js></js>")
        self.assertNotRegex(blk["css"], r"(?<!calc\()\b\d\*var")
        self.assertIn("top:calc(3 * var(--u))", blk["css"])
        self.assertIn("left:calc(4 * var(--u))", blk["css"])
        self.assertIn("calc(100% - calc(2 * var(--u)))", blk["css"])
        self.assertIn("top:calc(2 * var(--u))", blk["html"])

    def test_missing_tags(self):
        self.assertIsNone(scene_ai.parse_block("hola"))


class AIStreamsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, config.OUTPUT_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        config.OUTPUT_DIR = self.tmp / "out"
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        projects.save_timeline(self.pid, Timeline(width=W, height=H, fps=30,
                                                  tracks=[TimelineTrack(id="V1", kind="video", name="V1")]).model_dump())

    def tearDown(self):
        config.DATA_DIR, config.OUTPUT_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _with(self, texts, gen_factory):
        prov = QueueProvider(texts)
        with patch("app.motion.scene_ai.get_provider", return_value=prov):
            return _collect(gen_factory()), prov

    def test_questions_normalized_and_lock_not_needed(self):
        brief = scene.normalize_brief({}, duration=6)
        evs, prov = self._with([json.dumps({"questions": [
            {"question": "¿Quién es el protagonista?", "options": ["Un científico", "La Tierra"]}]})],
            lambda: scene_ai.questions_stream(ctx=_ctx(), brief=brief))
        qs = next(e for e in evs if e["type"] == "questions")["questions"]
        self.assertEqual(qs[0]["id"], "q1")
        self.assertEqual(qs[0]["options"], ["Un científico", "La Tierra"])

    def test_plan_retries_invalid_json_and_uses_lock(self):
        brief = scene.normalize_brief({"direction": "blueprint"}, duration=6)
        plan_json = json.dumps({"title": "Sol", "beats": [{"kind": "graphic", "duration": 3},
                                                           {"kind": "text", "duration": 3}]})
        evs, prov = self._with(["no json", plan_json],
                               lambda: scene_ai.plan_stream(ctx=_ctx(), brief=brief, answers=[]))
        plan = next(e for e in evs if e["type"] == "plan")["plan"]
        self.assertEqual(len(plan["beats"]), 2)
        self.assertEqual(len(prov.calls), 2)
        self.assertIn("CREATIVE DIRECTION LOCK: BLUEPRINT", prov.calls[0]["system"])

    def test_build_stream_creates_draft_with_fallback(self):
        brief = scene.normalize_brief({"direction": "sketchbook"}, duration=6)
        plan = scene.normalize_plan({"title": "Sol", "beats": [
            {"kind": "stick", "duration": 2}, {"kind": "graphic", "duration": 2},
            {"kind": "text", "duration": 2, "content": "La escala"}]}, brief)
        responses = [STORYBOARD, GOOD_BLOCK, "basura", "tl.from(x)"]   # beat 3 falla 2 veces → fallback
        evs, prov = self._with(responses, lambda: scene_ai.build_stream(
            self.pid, ctx=_ctx(), brief=brief, answers=[], plan=plan,
            fmt={"width": W, "height": H, "fps": 30}, for_range={"start": 10.0, "end": 16.0}))
        created = next(e for e in evs if e["type"] == "created")
        self.assertEqual(created["fallbacks"], ["b3"])
        self.assertEqual([e["beat_id"] for e in evs if e["type"] == "beat_done"], ["b1", "b2", "b3"])
        comp = motion_service.get_composition(self.pid, created["composition_id"])
        self.assertTrue(comp.metadata["draft"])
        self.assertEqual(comp.duration, 6.0)
        self.assertEqual(validate(comp), [])
        self.assertIn("stick", comp.metadata["scene"]["beats"][0])

        # Regenerar solo b2 sobre el mismo borrador conserva el stick de b1 (sin llamar a la IA).
        prev_scene = comp.metadata["scene"]
        evs2, prov2 = self._with([GOOD_BLOCK.replace("El Sol", "Otro")], lambda: scene_ai.build_stream(
            self.pid, ctx=_ctx(), brief=brief, answers=[], plan=plan, fmt={"width": W, "height": H, "fps": 30},
            for_range={"start": 10.0, "end": 16.0}, variant_of=comp.id, only_beats=["b2"], previous=prev_scene))
        self.assertEqual(len(prov2.calls), 1)
        comp2 = motion_service.get_composition(self.pid, comp.id)
        self.assertEqual(comp2.id, comp.id)
        self.assertIn("Otro", comp2.metadata["scene"]["beats"][1]["block"]["html"])
        self.assertEqual(comp2.metadata["scene"]["beats"][0]["stick"], prev_scene["beats"][0]["stick"])


if __name__ == "__main__":
    unittest.main()
