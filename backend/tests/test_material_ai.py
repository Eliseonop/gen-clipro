"""Analizar material con visión de Foundry (``material_ai``). Sin red: Foundry y los
fotogramas van mockeados."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app import config, foundry, material_ai, projects
from app.schemas import AudioInfo, ClipInfo, ImageInfo


def _clip(**kw):
    base = dict(index=0, filename="a.mp4", url="/x", start=0.0, end=10.0)
    return ClipInfo(**{**base, **kw})


class PureTest(unittest.TestCase):
    def test_generic_labels(self):
        dups = {"interstellar trailer español latino"}
        for label in ("", None, "image", "Images", "imagen 2", "video_01", "GIF", "123"):
            self.assertTrue(material_ai.is_generic_label(label, "x.png", set()), label)
        self.assertTrue(material_ai.is_generic_label("practica_2026-09-18", "practica_2026-09-18.mp4", set()))
        self.assertTrue(material_ai.is_generic_label("INTERSTELLAR Trailer Español Latino", "a.mp4", dups))
        for label in ("Lucy despierta", "Red neuronal", "poster lucy"):
            self.assertFalse(material_ai.is_generic_label(label, "a.mp4", dups), label)

    def test_duplicate_labels_per_kind(self):
        proj = SimpleNamespace(
            clips=[_clip(index=0, label="Tráiler"), _clip(index=1, label="tráiler "), _clip(index=2, label="Otro")],
            images=[SimpleNamespace(label="Otro")])
        self.assertEqual(material_ai.duplicate_labels(proj), {"tráiler"})

    def test_segment_range_suffix_counts_as_duplicate(self):
        # Segmentos del extractor: "<título> · 0:13–0:14" → mismo título base = genérico.
        proj = SimpleNamespace(clips=[
            _clip(index=0, id="src", label="Tráiler (HD)"),
            _clip(index=1, label="Tráiler (HD) · 0:13–0:14", parent_id="src", in_point=13.0, out_point=14.0),
            _clip(index=2, label="Tráiler (HD) · 1:02–1:03", parent_id="src", in_point=62.0, out_point=63.0),
        ], images=[])
        dups = material_ai.duplicate_labels(proj)
        self.assertEqual(dups, {"tráiler (hd)"})
        self.assertTrue(material_ai.is_generic_label("Tráiler (HD) · 0:13–0:14", "t.mp4", dups))
        self.assertEqual(material_ai.source_ids(proj), {"src"})

    def test_frame_times(self):
        self.assertEqual(material_ai.frame_times(1.0), [0.5])
        self.assertEqual(material_ai.frame_times(10.0), [1.5, 5.0, 8.5])
        self.assertEqual(len(material_ai.frame_times(9.0, 2)), 2)

    def test_clip_span_reference_segment(self):
        self.assertEqual(material_ai.clip_span(_clip(start=40.0, end=46.0)), (0.0, 6.0))
        seg = _clip(start=20.0, end=30.0, in_point=20.0, out_point=30.0)
        self.assertEqual(material_ai.clip_span(seg), (20.0, 10.0))

    def test_parse_result_fenced_and_nested(self):
        text = "```json\n" + json.dumps({
            "label": "  Cohete despega  ", "description": "Un cohete despega entre humo.",
            "semantic": {"subjects": ["cohete"], "mood": "épico"},
            "actions": "despegar, elevarse", "visual_priority": "Protagonista",
        }) + "\n```"
        out = material_ai.parse_result(text)
        self.assertEqual(out["label"], "Cohete despega")
        self.assertEqual(out["semantic"]["subjects"], ["cohete"])
        self.assertEqual(out["semantic"]["actions"], ["despegar", "elevarse"])
        self.assertEqual(out["semantic"]["visual_priority"], "protagonista")

    def test_parse_result_rejects_garbage(self):
        with self.assertRaises(ValueError):
            material_ai.parse_result("no sé")
        with self.assertRaises(ValueError):
            material_ai.parse_result('{"label": "x"}')

    def test_parse_result_drops_bad_priority(self):
        out = material_ai.parse_result('{"description": "d", "visual_priority": "estrella"}')
        self.assertNotIn("visual_priority", out["semantic"])

    def test_fields_never_overwrite_user_text(self):
        res = {"label": "Nuevo título", "description": "Lo que ve la IA", "semantic": {"mood": "tenso"}}
        item = _clip(label="Mi título", description="mi nota")
        f = material_ai.fields_to_save(item, res, rename_generic=True, dups=set())
        self.assertEqual(f, {"description_ai": "Lo que ve la IA", "semantic": {"mood": "tenso"}})

    def test_fields_fill_empty_and_placeholder(self):
        res = {"label": "Mono pensando", "description": "Un mono se rasca la cabeza.", "semantic": {}}
        gif = SimpleNamespace(label="Thinking Monkey GIF", description="Thinking Monkey GIF", filename="m.gif")
        f = material_ai.fields_to_save(gif, res, rename_generic=True, dups=set())
        self.assertEqual(f["description"], "Un mono se rasca la cabeza.")   # descripción = título → placeholder
        self.assertNotIn("label", f)                                        # título no genérico
        generic = SimpleNamespace(label="image", description=None, filename="i.png")
        f = material_ai.fields_to_save(generic, res, rename_generic=True, dups=set())
        self.assertEqual(f["label"], "Mono pensando")
        f = material_ai.fields_to_save(generic, res, rename_generic=False, dups=set())
        self.assertNotIn("label", f)

    def test_prompt_has_script_and_user_note(self):
        item = _clip(label="Tráiler", description="la nave volando")
        p = material_ai.build_prompt(project_name="Interstellar", script="La gravedad dobla el tiempo.",
                                     kind="clips", item=item, times=[1.5, 5.0, 8.5])
        self.assertIn("La gravedad dobla el tiempo.", p)
        self.assertIn("la nave volando", p)
        self.assertIn("1.5, 5, 8.5", p)
        same = _clip(label="Nota", description="nota")
        self.assertNotIn("Nota del usuario", material_ai.build_prompt(
            project_name="x", script="", kind="clips", item=same, times=[5.0]))

    def test_messages_attach_frames_low_detail(self):
        msgs = material_ai.build_messages("hola", [b"\xff\xd8a", b"\xff\xd8b"])
        parts = msgs[1]["content"]
        self.assertEqual(parts[0], {"type": "text", "text": "hola"})
        self.assertEqual([p["image_url"]["detail"] for p in parts[1:]], ["low", "low"])
        self.assertTrue(parts[1]["image_url"]["url"].startswith("data:image/jpeg;base64,"))


class RunTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Rompenieves").id
        projects.set_folder(self.pid, str(self.tmp / "proj"))
        projects.add_clips(self.pid, [
            _clip(index=0, label="Snowpiercer Tráiler Latino"),
            _clip(index=1, filename="b.mp4", label="Snowpiercer Tráiler Latino", description="el tren en la nieve"),
            _clip(index=2, filename="c.mp4", label="Ya hecho", description_ai="x", semantic={"mood": "frío"}),
        ])
        projects.add_image(self.pid, ImageInfo(id="im1", filename="p.png", url="/p", label="image"))
        projects.add_audio(self.pid, AudioInfo(id="au1", filename="n.wav", url="/n", voice="Charon",
                                               text="Un tren eterno cruza un planeta congelado."))
        self.p_avail = patch.object(foundry, "unavailable_reason", return_value=None)
        self.p_frames = patch.object(material_ai, "grab_frames", return_value=([b"\xff\xd8jpg"], [1.0]))
        self.p_avail.start()
        self.p_frames.start()

    def tearDown(self):
        self.p_avail.stop()
        self.p_frames.stop()
        config.DATA_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _reply(self, messages, **kw):
        text = messages[1]["content"][0]["text"]
        self.prompts.append(text)
        if "b.mp4" in text or "el tren en la nieve" in text:
            raise foundry.FoundryError("Foundry: límite de peticiones (429).", "rate_limit")
        return {"text": json.dumps({"label": "Tren en la nieve", "description": "Un tren cruza un paisaje nevado.",
                                    "subjects": ["tren"], "suggested_usage": "tren eterno"}),
                "usage": {"total_tokens": 300}}

    def test_run_saves_and_survives_one_failure(self):
        self.prompts = []
        progress = []
        with patch.object(foundry, "chat", side_effect=self._reply):
            out = material_ai.run(self.pid, on_progress=lambda f, m: progress.append(f))
        self.assertEqual((out["total"], out["analyzed"], len(out["failed"])), (3, 2, 1))  # clip 2 ya estaba
        self.assertEqual(out["tokens"], 600)
        self.assertEqual(progress[-1], 1.0)
        self.assertTrue(all("Un tren eterno cruza" in p for p in self.prompts))   # guion = texto del TTS
        proj = projects.get_project(self.pid)
        c0 = next(c for c in proj.clips if c.index == 0)
        self.assertEqual(c0.label, "Tren en la nieve")                 # título repetido del tráiler → renombrado
        self.assertEqual(c0.description, "Un tren cruza un paisaje nevado.")
        self.assertEqual(c0.semantic["subjects"], ["tren"])
        c1 = next(c for c in proj.clips if c.index == 1)
        self.assertIsNone(c1.description_ai)                           # falló: intacto
        self.assertEqual(c1.description, "el tren en la nieve")
        im = proj.images[0]
        self.assertEqual((im.label, im.description_ai), ("Tren en la nieve", "Un tren cruza un paisaje nevado."))

    def test_nothing_pending(self):
        with patch.object(foundry, "chat") as chat:
            out = material_ai.run(self.pid, refs=[{"kind": "clips", "id": "99"}])
        self.assertEqual(out["total"], 0)
        chat.assert_not_called()

    def test_refs_force_reanalysis(self):
        self.prompts = []
        with patch.object(foundry, "chat", side_effect=self._reply):
            out = material_ai.run(self.pid, refs=[{"kind": "clips", "id": "2"}])
        self.assertEqual((out["total"], out["analyzed"]), (1, 1))
        c2 = next(c for c in projects.get_project(self.pid).clips if c.index == 2)
        self.assertEqual(c2.label, "Ya hecho")                         # título propio: no se toca

    def test_not_configured(self):
        with patch.object(foundry, "unavailable_reason", return_value="Falta la clave"):
            with self.assertRaises(foundry.FoundryError):
                material_ai.run(self.pid)

    def test_job_and_mcp_tool(self):
        from app import jobs
        from app.mcp_server import tools_vision
        self.prompts = []
        sync = lambda job, pid, params: jobs._run_material_analysis(job.id, pid, params)  # noqa: E731
        with patch.object(foundry, "chat", side_effect=self._reply), \
             patch.object(jobs, "start_material_analysis_job", side_effect=sync):
            out = tools_vision.analyze_materials(self.pid)
        job = jobs.get_job(out["id"])
        self.assertEqual(job.status.value, "done")
        self.assertEqual(job.result["analyzed"], 2)
        self.assertIn("1 con error", job.message)

    def test_mcp_tool_not_configured(self):
        from app.mcp_server import tools_vision
        with patch.object(foundry, "unavailable_reason", return_value="Falta la clave"):
            with self.assertRaises(ValueError):
                tools_vision.analyze_materials(self.pid)


if __name__ == "__main__":
    unittest.main()
