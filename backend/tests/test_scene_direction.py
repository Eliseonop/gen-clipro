"""Dirección de escena: escaleta de tramos, paquete de contexto, beats del guion y acciones.

Cubre tramos CON y SIN subtítulos, la división automática que respeta lo ya dirigido,
el paquete compacto que recibe la IA, el plan con beats fijos (modelos pequeños) y las
acciones deterministas (colocar material, reutilizar escena).
"""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects, scene_direction as sd
from app.motion import scene, scene_ai
from app.motion import service as motion_service
from app.schemas import AudioInfo, ClipInfo, Timeline, TimelineClip, TimelineTrack, Word

W, H = 720, 1280
NO_LIBRARY = patch("app.library.list_library", return_value={"clips": [], "audios": [], "images": []})


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


def caption(cid, start, words):
    """Clip de subtítulo con palabras (tiempos relativos al clip)."""
    ws, t = [], 0.0
    for w in words.split():
        ws.append(Word(text=w, start=round(t, 2), end=round(t + 0.4, 2)))
        t += 0.45
    return TimelineClip(id=cid, track_id="T1", kind="text", asset_kind="text", asset_id="t" + cid, filename="",
                        text=words, words=ws, start=start,
                        in_point=0.0, out_point=round(t, 2), source_duration=round(t, 2), text_role="caption")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, config.OUTPUT_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        config.OUTPUT_DIR = self.tmp / "out"
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Marte").id
        NO_LIBRARY.start()

    def tearDown(self):
        NO_LIBRARY.stop()
        config.DATA_DIR, config.OUTPUT_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def timeline(self, clips, tracks=None):
        tracks = tracks or [TimelineTrack(id="V1", kind="video", name="V1"),
                            TimelineTrack(id="A1", kind="audio", name="A1"),
                            TimelineTrack(id="T1", kind="text", name="T1")]
        projects.save_timeline(self.pid, Timeline(width=W, height=H, fps=30, tracks=tracks, clips=clips).model_dump())
        return projects.get_project(self.pid)

    def captions_project(self):
        return self.timeline([
            caption("c1", 0.0, "¿Podrías sobrevivir solo en Marte?"),        # 0 – 2.7
            caption("c2", 3.0, "Watney necesita agua, comida y oxígeno."),    # 3 – 5.7
            caption("c3", 6.0, "Cultiva papas con suelo marciano."),          # 6 – 8.25
            caption("c4", 12.0, "Pero el suelo es tóxico."),                  # 12 – 14.25
        ])


class DocTest(Base):
    def test_normalize_status_references_and_materials(self):
        doc = sd.normalize_doc({"segments": [
            {"id": "sd_a", "start": 5, "end": 9, "instruction": "explica", "reference_id": "nope"},
            {"id": "sd_b", "start": 0, "end": 5, "mode": "material",
             "materials": [{"kind": "clips", "id": 7}, {"kind": "audios", "id": "x"}], "reference_id": "sd_a"},
            {"id": "bad", "start": 3, "end": 3.1},
        ]})
        a, b = doc["segments"]
        self.assertEqual((a["id"], b["id"]), ("sd_b", "sd_a"))          # ordenados por tiempo
        self.assertEqual(a["materials"], [{"kind": "clips", "id": "7", "scope": "project"}])
        self.assertEqual(a["reference_id"], "sd_a")
        self.assertIsNone(b["reference_id"])
        self.assertEqual(b["status"], "ready")
        sd.save(self.pid, doc)
        self.assertEqual(len(sd.load(projects.get_project(self.pid))["segments"]), 2)


class ScriptTest(Base):
    def test_units_from_captions_split_by_sentence_and_pause(self):
        units, source = sd.script_units(self.captions_project())
        self.assertEqual(source, "captions")
        self.assertEqual([u["text"] for u in units][:2],
                         ["¿Podrías sobrevivir solo en Marte?", "Watney necesita agua, comida y oxígeno."])
        self.assertEqual(units[0]["start"], 0.0)

    def test_units_without_captions_use_audio_text(self):
        projects.add_audio(self.pid, AudioInfo(id="a1", filename="a.wav", url="/a.wav", duration=10.0,
                                               text="Primera frase del guion. Segunda frase más larga del guion."))
        proj = self.timeline([TimelineClip(id="au", track_id="A1", kind="audio", asset_kind="audios", asset_id="a1",
                                           filename="a.wav", start=0.0, in_point=0.0, out_point=10.0,
                                           source_duration=10.0)])
        units, source = sd.script_units(proj)
        self.assertEqual(source, "audio_text_estimate")
        self.assertEqual(len(units), 2)
        self.assertLess(units[0]["end"], units[1]["end"])

    def test_no_script_at_all(self):
        self.assertEqual(sd.script_units(self.timeline([])), ([], "none"))

    def test_auto_segments_cover_without_gaps_and_keep_directed(self):
        proj = self.captions_project()
        kept = {"id": "sd_keep", "start": 12.0, "end": 14.5, "mode": "explain", "instruction": "tóxico"}
        segs = sd.auto_segments(proj, keep=[kept])
        self.assertEqual(segs[0]["start"], 0.0)
        self.assertIn("sd_keep", [s["id"] for s in segs])
        keep = next(s for s in segs if s["id"] == "sd_keep")
        self.assertEqual(keep["instruction"], "tóxico")
        self.assertFalse(any("tóxico" in s["text"] for s in segs if s["id"] != "sd_keep"))
        for a, b in zip(segs, segs[1:]):
            self.assertLessEqual(a["end"], b["start"] + 1e-6)

    def test_caption_lines_clip_words_at_range_border(self):
        proj = self.captions_project()
        lines = sd.caption_lines(proj, 3.9, 6.5)      # corta c2 por la mitad y toca c3
        self.assertTrue(lines[0]["text"].startswith("agua"))
        self.assertEqual(lines[0]["start"], 0.0)
        self.assertEqual(lines[-1]["text"], "Cultiva")


class PackTest(Base):
    def setUp(self):
        super().setUp()
        projects.add_clips(self.pid, [ClipInfo(index=5, filename="huerto.mp4", url="/h.mp4", start=0, end=6,
                                               label="Huerto", description="Watney planta papas en la cápsula"),
                                      ClipInfo(index=6, filename="cielo.mp4", url="/c.mp4", start=0, end=3,
                                               label="Cielo", description="paneo de estrellas")])

    def test_pack_with_captions_candidates_and_budget(self):
        proj = self.captions_project()
        seg = sd.normalize_segment({"id": "sd_1", "start": 6.0, "end": 9.0, "mode": "represent",
                                    "instruction": "que se vea el huerto"})
        pack = sd.build_pack(proj, seg, {"segments": [seg]})
        self.assertTrue(pack["script"]["has_captions"])
        self.assertEqual(pack["candidates"][0]["title"], "Huerto")     # relevancia por palabras clave
        text = sd.pack_text(pack)
        for s in ("TRAMO: 6.00s", "Cultiva papas", "Representar la idea", "que se vea el huerto", "[vídeo 5] Huerto"):
            self.assertIn(s, text)
        self.assertLess(sd.estimate_tokens(text), 600)

    def test_pack_without_captions_is_explicit(self):
        proj = self.captions_project()
        seg = sd.normalize_segment({"id": "sd_2", "start": 9.0, "end": 11.5, "mode": "material",
                                    "materials": [{"kind": "clips", "id": "6"}], "strict": True})
        pack = sd.build_pack(proj, seg, {"segments": [seg]})
        text = sd.pack_text(pack)
        self.assertIn("nadie habla", text)
        self.assertIn("SUBTÍTULOS DEL TRAMO: ninguno", text)
        self.assertIn("MATERIAL ELEGIDO", text)
        self.assertIn("Vídeo elegido", sd.brief_defaults(pack)["notes"])
        self.assertEqual(sd.brief_defaults(pack)["must_include"], [])
        self.assertIn("ESTRICTAMENTE", text)
        self.assertEqual(pack["candidates"], [])
        self.assertEqual(sd.brief_defaults(pack)["structure"], "script")   # strict → beats del guion

    def test_skeleton_beats_follow_sentences_and_cover_range(self):
        proj = self.captions_project()
        seg = sd.normalize_segment({"id": "s", "start": 0.0, "end": 8.5})
        pack = sd.build_pack(proj, seg, {"segments": [seg]})
        beats = sd.skeleton_beats(pack, pace=2.5)
        self.assertEqual(beats[0]["start"], 0.0)
        self.assertEqual(beats[-1]["end"], 8.5)
        for a, b in zip(beats, beats[1:]):
            self.assertEqual(a["end"], b["start"])
            self.assertGreaterEqual(a["end"] - a["start"], 0.8)
        self.assertTrue(beats[0]["text"].startswith("¿Podrías"))
        # Sin subtítulos: partes iguales.
        empty = sd.build_pack(proj, sd.normalize_segment({"id": "e", "start": 9, "end": 11.5}), {"segments": []})
        self.assertEqual(len(sd.skeleton_beats(empty, pace=2.5)), 1)


class SkeletonPlanTest(Base):
    def test_small_model_fills_beats_and_missing_are_filled(self):
        proj = self.captions_project()
        seg = sd.normalize_segment({"id": "s", "start": 0.0, "end": 8.5, "mode": "explain"})
        pack = sd.build_pack(proj, seg, {"segments": [seg]})
        brief = scene.normalize_brief({"structure": "script"}, duration=8.5)
        skeleton = sd.skeleton_beats(pack, pace=scene.PACES["medio"])
        ctx = {"directionPack": sd.pack_text(pack), "skeleton": skeleton, "availableAssets": []}
        reply = json.dumps({"title": "Marte", "beats": [{"n": 1, "kind": "stick", "action": "Watney duda"}]})
        prov = QueueProvider([reply])
        with patch("app.motion.scene_ai.get_provider", return_value=prov):
            evs = _collect(scene_ai.plan_stream(ctx=ctx, brief=brief, answers=[]))
        plan = next(e for e in evs if e["type"] == "plan")["plan"]
        self.assertEqual(len(plan["beats"]), len(skeleton))
        self.assertEqual(plan["beats"][0]["kind"], "stick")
        self.assertTrue(all(b["kind"] == "text" for b in plan["beats"][1:]))
        self.assertIn("se rellenaron", plan["warnings"][0])
        self.assertIn("BEATS (fijos)", prov.calls[0]["message"])
        self.assertIn("LO QUE DICE LA VOZ", prov.calls[0]["message"])
        self.assertEqual(len(prov.calls), 1)

    def test_garbage_twice_still_returns_plan(self):
        brief = scene.normalize_brief({"structure": "script"}, duration=4)
        skeleton = [{"text": "Una frase", "start": 0.0, "end": 2.0}, {"text": "Otra frase", "start": 2.0, "end": 4.0}]
        with patch("app.motion.scene_ai.get_provider", return_value=QueueProvider(["x", "y"])):
            evs = _collect(scene_ai.plan_stream(ctx={"skeleton": skeleton, "directionPack": "TRAMO"},
                                                brief=brief, answers=[]))
        plan = next(e for e in evs if e["type"] == "plan")["plan"]
        self.assertEqual([b["content"] for b in plan["beats"]], ["Una frase", "Otra frase"])


class ActionsTest(Base):
    def setUp(self):
        super().setUp()
        projects.add_clips(self.pid, [ClipInfo(index=5, filename="huerto.mp4", url="/h.mp4", start=0, end=3,
                                               label="Huerto")])

    def test_place_material_on_free_track_trimmed_to_segment(self):
        busy = TimelineClip(id="v0", track_id="V1", kind="video", asset_kind="clips", asset_id="5",
                            filename="huerto.mp4", start=9.0, in_point=0, out_point=3, source_duration=3)
        self.timeline([busy])
        sd.save(self.pid, {"segments": [{"id": "sd_m", "start": 10.0, "end": 12.0, "mode": "material",
                                         "materials": [{"kind": "clips", "id": "5"}]}]})
        out = sd.place_material(self.pid, "sd_m")
        proj = projects.get_project(self.pid)
        clip = next(c for c in proj.timeline.clips if c.id == out["clip_id"])
        self.assertNotEqual(clip.track_id, "V1")                     # V1 ocupada en el tramo → pista nueva
        self.assertEqual((clip.start, clip.in_point, clip.out_point), (10.0, 0.0, 2.0))
        seg = sd.load(proj)["segments"][0]
        self.assertEqual((seg["status"], seg["placed_clip_id"]), ("placed", out["clip_id"]))

    def test_place_without_material_is_an_error(self):
        self.timeline([])
        sd.save(self.pid, {"segments": [{"id": "sd_x", "start": 0, "end": 2}]})
        with self.assertRaises(ValueError):
            sd.place_material(self.pid, "sd_x")

    def test_reuse_scene_rescales_to_new_segment(self):
        self.timeline([])
        brief = scene.normalize_brief({"direction": "whiteboard"}, duration=4)
        beats = scene.normalize_plan({"beats": [{"kind": "text", "duration": 2, "content": "A"},
                                                {"kind": "text", "duration": 2, "content": "B"}]}, brief)["beats"]
        comp = scene.build_composition("mg_ref", {"brief": brief, "beats": beats}, width=W, height=H, fps=30,
                                       project_id=self.pid)
        motion_service.save_composition(self.pid, comp, bump=False)
        sd.save(self.pid, {"segments": [
            {"id": "sd_ref", "start": 0, "end": 4, "composition_id": "mg_ref", "status": "generated"},
            {"id": "sd_new", "start": 10, "end": 16, "mode": "reinforce", "reference_id": "sd_ref"}]})
        out = sd.reuse_scene(self.pid, "sd_new")
        new = motion_service.get_composition(self.pid, out["composition_id"])
        self.assertEqual(new.duration, 6.0)
        self.assertEqual([(b["start"], b["end"]) for b in new.metadata["scene"]["beats"]], [(0.0, 3.0), (3.0, 6.0)])
        self.assertTrue(new.metadata["draft"])
        seg = next(s for s in sd.load(projects.get_project(self.pid))["segments"] if s["id"] == "sd_new")
        self.assertEqual(seg["composition_id"], out["composition_id"])


class LibraryInfoTest(unittest.TestCase):
    def test_update_library_item_title_and_description(self):
        from app import library
        tmp = Path(tempfile.mkdtemp())
        try:
            with patch("app.library.library_root", return_value=tmp):
                library._save({"version": 1, "items": [{"id": "lib_1", "resource_type": "clip", "filename": "a.mp4",
                                                          "label": "viejo", "index": 0}]})
                out = library.update_item("lib_1", {"label": "  Huerto  ", "description": "papas", "filename": "x"})
                self.assertEqual((out["label"], out["description"], out["filename"]), ("Huerto", "papas", "a.mp4"))
                with self.assertRaises(LookupError):
                    library.update_item("lib_nope", {"label": "x"})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
