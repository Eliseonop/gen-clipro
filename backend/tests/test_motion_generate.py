"""Fase de PROPUESTA de 'Generar Motion' (app.motion.generate).

Proveedor simulado: JSON válido, JSON inválido → reintento, y fotogramas on/off
(la tool motion_segment_frames se ofrece solo con la casilla marcada).
"""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects
from app.mcp_server import tools_motion
from app.motion import generate
from app.motion import service as motion_service
from app.schemas import Timeline, TimelineClip, TimelineTrack


def _collect(gen):
    async def run():
        out = []
        async for ev in gen:
            out.append(ev)
        return out
    return asyncio.run(run())


def _ctx(duration=5.0):
    return {
        "projectId": "p1",
        "currentTime": 27.12,
        "selection": {"start": 27.12, "end": 27.12 + duration, "duration": duration, "explicit": True},
        "scriptContext": {"previous": "antes", "current": "una singularidad", "next": "después",
                          "keyTerms": ["singularidad"], "source": "captions"},
        "timelineContext": {"activeClip": None, "existingElements": [], "motionInRange": []},
        "availableAssets": [],
        "style": {"format": {"width": 720, "height": 1280, "fps": 30}, "accent": "#ff7a1a"},
    }


class JSONProvider:
    """Emite un texto fijo como si fuera la respuesta del modelo. Registra la
    última llamada (tools/system) para poder inspeccionarla."""

    def __init__(self, texts):
        self.texts = list(texts)   # una respuesta por llamada a run()
        self.calls = []

    def unavailable_reason(self):
        return None

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        self.calls.append({"tools": [t["name"] for t in tools], "system": system,
                           "history": history, "message": user_message})
        text = self.texts[min(len(self.calls) - 1, len(self.texts) - 1)]
        await emit({"type": "text", "delta": text})
        await emit({"type": "final", "text": text})
        return text


class Unavailable:
    def unavailable_reason(self):
        return "Falta la API key."

    async def run(self, **_):
        return ""


VALID = json.dumps({
    "type": "callout", "title": "Singularidad", "concept": "Resalta el término.",
    "duration": 4.0, "background": "transparent", "elements": ["Singularidad"],
})


class ProposeTest(unittest.TestCase):
    def _run(self, provider, **kw):
        with patch("app.motion.generate.get_provider", return_value=provider):
            return _collect(generate.propose_stream("p1", ctx=_ctx(), **kw))

    def test_valid_json_yields_proposal(self):
        ev = self._run(JSONProvider([VALID]))
        types = [e["type"] for e in ev]
        self.assertIn("proposal", types)
        self.assertEqual(types[-1], "done")
        prop = next(e["proposal"] for e in ev if e["type"] == "proposal")
        self.assertEqual(prop["type"], "callout")
        self.assertEqual(prop["title"], "Singularidad")
        self.assertEqual(prop["background"], "transparent")

    def test_invalid_then_valid_retries(self):
        prov = JSONProvider(["esto no es json", VALID])
        ev = self._run(prov)
        self.assertEqual(len(prov.calls), 2)   # hubo reintento
        self.assertTrue(any(e["type"] == "proposal" for e in ev))

    def test_all_invalid_yields_error(self):
        prov = JSONProvider(["nope", "tampoco"])
        ev = self._run(prov)
        self.assertEqual(len(prov.calls), generate.MAX_ATTEMPTS)
        self.assertEqual(ev[-1]["type"], "error")
        self.assertFalse(any(e["type"] == "proposal" for e in ev))

    def test_frames_off_offers_no_tools(self):
        prov = JSONProvider([VALID])
        self._run(prov, frames=False)
        self.assertEqual(prov.calls[0]["tools"], [])

    def test_frames_on_offers_segment_frames_tool(self):
        prov = JSONProvider([VALID])
        self._run(prov, frames=True)
        self.assertIn("motion_segment_frames", prov.calls[0]["tools"])

    def test_no_history(self):
        prov = JSONProvider([VALID])
        self._run(prov)
        self.assertEqual(prov.calls[0]["history"], [])

    def test_unavailable_provider_errors(self):
        ev = self._run(Unavailable())
        self.assertEqual(ev[0]["type"], "error")

    def test_normalize_defaults_duration_and_background(self):
        raw = json.dumps({"title": "X", "concept": "c", "background": "#000000"})
        ev = self._run(JSONProvider([raw]))
        prop = next(e["proposal"] for e in ev if e["type"] == "proposal")
        self.assertEqual(prop["duration"], 5.0)      # cae a la duración del tramo
        self.assertEqual(prop["background"], "opaque")  # #000000 → opaco
        self.assertEqual(prop["type"], "motion")     # tipo por defecto
        self.assertEqual(prop["elements"], [])

    def test_hint_reaches_provider(self):
        prov = JSONProvider([VALID])
        self._run(prov, hint="un diagrama minimalista")
        self.assertIn("diagrama minimalista", prov.calls[0]["message"])


class ExtractJSONTest(unittest.TestCase):
    def test_strips_code_fence(self):
        obj = generate._extract_json("```json\n{\"a\": 1}\n```")
        self.assertEqual(obj, {"a": 1})

    def test_prose_around_object(self):
        obj = generate._extract_json("Claro, aquí tienes: {\"a\": 2} ¡listo!")
        self.assertEqual(obj, {"a": 2})

    def test_returns_none_on_garbage(self):
        self.assertIsNone(generate._extract_json("sin json"))


VALID_COMP = {
    "name": "Idea",
    "layers": [{"id": "t1", "type": "text", "content": "Hola", "x": 360, "y": 500,
                "start": 0.0, "end": 2.0}],
}


class CreateProvider:
    """Provider que genera la composición llamando a motion_create_composition."""

    def __init__(self, composition=None):
        self.composition = composition or VALID_COMP
        self.calls = 0

    def unavailable_reason(self):
        return None

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        self.calls += 1
        await emit({"type": "tool_start", "tool": "motion_create_composition", "args": {}})
        res = await call_tool("motion_create_composition", {"composition": dict(self.composition)})
        await emit({"type": "tool_result", "tool": "motion_create_composition",
                    "ok": res["ok"], "result": res})
        return ""


class ForRangeToolTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, config.OUTPUT_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        config.OUTPUT_DIR = self.tmp / "out"
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips",
                                          asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                                          out_point=10.0, source_duration=10.0)])
        projects.save_timeline(self.pid, tl.model_dump())

    def tearDown(self):
        config.DATA_DIR, config.OUTPUT_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_for_range_forces_duration_and_marks_draft(self):
        out = tools_motion.motion_create_composition(
            self.pid, composition={**VALID_COMP, "duration": 99.0},
            for_range={"start": 2.0, "end": 7.0})
        comp = motion_service.get_composition(self.pid, out["composition_id"])
        self.assertEqual(comp.duration, 5.0)
        self.assertEqual((comp.width, comp.height, comp.fps), (720, 1280, 30))
        self.assertTrue(comp.metadata.get("draft"))
        self.assertEqual(comp.metadata.get("source"), "generate_motion")
        self.assertEqual(comp.metadata.get("range"), [2.0, 7.0])

    def _ctx(self):
        return {"selection": {"start": 2.0, "end": 7.0, "duration": 5.0},
                "style": {"format": {"width": 720, "height": 1280, "fps": 30}},
                "scriptContext": {"current": "hola"}}

    def _run_create(self, provider, **kw):
        with patch("app.motion.generate.get_provider", return_value=provider):
            return _collect(generate.create_stream(
                self.pid, ctx=self._ctx(),
                proposal={"type": "callout", "title": "Idea", "concept": "c",
                          "background": "transparent", "elements": []}, **kw))

    def test_create_yields_created_with_forced_duration(self):
        ev = self._run_create(CreateProvider())
        created = next((e for e in ev if e["type"] == "created"), None)
        self.assertIsNotNone(created)
        self.assertEqual(ev[-1]["type"], "done")
        self.assertEqual(created["duration"], 5.0)
        self.assertEqual(len(motion_service.list_compositions(self.pid)), 1)

    def test_regenerate_reuses_same_draft(self):
        ev1 = self._run_create(CreateProvider())
        cid = next(e["composition_id"] for e in ev1 if e["type"] == "created")
        self.assertEqual(len(motion_service.list_compositions(self.pid)), 1)
        # Regenerar sobre el mismo borrador: NO debe crear otra composición.
        ev2 = self._run_create(CreateProvider(), variant_of=cid)
        cid2 = next(e["composition_id"] for e in ev2 if e["type"] == "created")
        self.assertEqual(cid2, cid)
        self.assertEqual(len(motion_service.list_compositions(self.pid)), 1)

    def test_cleanup_removes_old_orphan_drafts(self):
        out = tools_motion.motion_create_composition(
            self.pid, composition=VALID_COMP, for_range={"start": 2.0, "end": 7.0})
        cid = out["composition_id"]
        # Envejece el borrador y límpialo.
        comp = motion_service.get_composition(self.pid, cid)
        comp.metadata["created_at"] = 0.0
        motion_service.save_composition(self.pid, comp, bump=False)
        removed = motion_service.cleanup_generate_drafts(self.pid)
        self.assertIn(cid, removed)
        self.assertIsNone(motion_service.get_composition(self.pid, cid))

    def test_cleanup_keeps_recent_and_in_use(self):
        recent = tools_motion.motion_create_composition(
            self.pid, composition=VALID_COMP, for_range={"start": 2.0, "end": 7.0})["composition_id"]
        removed = motion_service.cleanup_generate_drafts(self.pid)
        self.assertNotIn(recent, removed)   # recién creado → se conserva


class MotionAddTest(unittest.TestCase):
    """Inserción del borrador en la timeline (job) con el renderer simulado."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, config.OUTPUT_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        config.OUTPUT_DIR = self.tmp / "out"
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips",
                                          asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                                          out_point=10.0, source_duration=10.0)])
        projects.save_timeline(self.pid, tl.model_dump())
        self.cid = tools_motion.motion_create_composition(
            self.pid, composition=VALID_COMP, for_range={"start": 2.0, "end": 7.0})["composition_id"]

    def tearDown(self):
        config.DATA_DIR, config.OUTPUT_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _fake_render(self, pid, cid, on_progress=None):
        comp = motion_service.get_composition(pid, cid)
        out = motion_service.asset_path(pid, comp)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"webm")
        return out

    def _add(self, **kw):
        from app import jobs
        job = jobs.create_job()
        with patch("app.motion.service.render_composition", side_effect=self._fake_render):
            jobs._run_motion_add(job.id, self.pid, self.cid, kw.pop("track_id", None),
                                 kw.pop("start", 2.0), **kw)
        return jobs.get_job(job.id)

    def _timeline(self):
        return projects.get_project(self.pid).timeline

    def test_insert_creates_motion_track_and_video_clip(self):
        job = self._add()
        self.assertEqual(job.status.value, "done")
        tl = self._timeline()
        motion_tracks = [t for t in tl.tracks if t.name == "Motion"]
        self.assertEqual(len(motion_tracks), 1)
        clip = next(c for c in tl.clips if (c.name or "").startswith("motion_"))
        self.assertEqual(clip.kind, "video")          # ya es un vídeo normal (editable)
        self.assertEqual(clip.asset_kind, "clips")
        self.assertEqual(clip.track_id, motion_tracks[0].id)
        self.assertEqual(clip.out_point, 5.0)         # duración = rango
        self.assertEqual(clip.name, "motion_002_007")
        self.assertEqual(job.motion_add["clip_id"], clip.id)

    def test_registers_alpha_video_material(self):
        job = self._add()
        mats = projects.get_project(self.pid).clips
        self.assertEqual(len(mats), 1)
        self.assertTrue(mats[0].filename.endswith(".webm"))
        clip = next(c for c in self._timeline().clips if (c.name or "").startswith("motion_"))
        self.assertEqual(clip.asset_id, str(mats[0].index))
        self.assertEqual(clip.filename, mats[0].filename)
        self.assertEqual(job.motion_add["material_index"], mats[0].index)

    def test_insert_removes_draft_flag(self):
        self.assertTrue(motion_service.get_composition(self.pid, self.cid).metadata.get("draft"))
        self._add()
        self.assertNotIn("draft", motion_service.get_composition(self.pid, self.cid).metadata)

    def test_add_on_occupied_track_creates_new_track(self):
        self._add(start=2.0)
        self._add(start=3.0)   # solapa el primero en la pista Motion
        motion_tracks = [t for t in self._timeline().tracks if t.name == "Motion"]
        self.assertEqual(len(motion_tracks), 2)

    def test_replace_removes_given_clips(self):
        job = self._add(mode="replace", replace_clip_ids=["v"])
        self.assertEqual(job.status.value, "done")
        ids = {c.id for c in self._timeline().clips}
        self.assertNotIn("v", ids)   # el clip de vídeo fue reemplazado
        self.assertTrue(any((c.name or "").startswith("motion_") for c in self._timeline().clips))


if __name__ == "__main__":
    unittest.main()
