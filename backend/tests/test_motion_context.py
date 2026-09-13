"""Generar Motion · Fase 1: capa de contexto de un tramo (sin mandar el proyecto entero)."""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, timeline_store
from app.mcp_server import capabilities, server, tools_motion
from app.mcp_server.registry import MCPError
from app.motion import segment_context as sc
from app.schemas import (
    AudioInfo, ImageInfo, Project, Timeline, TimelineClip, TimelineTrack, Word,
)


def _caption(cid, start, text, words):
    """Subtítulo con palabras RELATIVAS al inicio del clip (como en la timeline real)."""
    dur = words[-1][2]
    return TimelineClip(
        id=cid, track_id="T1", kind="text", asset_kind="text", asset_id=f"t{cid}",
        filename="", start=start, in_point=0.0, out_point=dur, source_duration=dur,
        text=text, text_role="caption",
        words=[Word(text=w, start=s, end=e) for w, s, e in words],
        style={"font": "Arial Black", "color": "#ffffff", "highlight_color": "#ffe566", "y": 0.8},
    )


def _project(**over) -> Project:
    tracks = [
        TimelineTrack(id="V1", kind="video", name="V1"),
        TimelineTrack(id="V2", kind="video", name="V2"),
        TimelineTrack(id="A1", kind="audio", name="A1"),
        TimelineTrack(id="T1", kind="text", name="T1"),
    ]
    clips = [
        TimelineClip(id="bg", track_id="V1", kind="image", asset_kind="images", asset_id="img1",
                     filename="bg.png", start=0.0, in_point=0.0, out_point=60.0, source_duration=60.0),
        TimelineClip(id="paper", track_id="V2", kind="video", asset_kind="clips", asset_id="7",
                     filename="paper.mp4", name="paper", start=24.0, in_point=0.0, out_point=5.0,
                     source_duration=5.0),
        TimelineClip(id="voz", track_id="A1", kind="audio", asset_kind="audios", asset_id="aud1",
                     filename="voz.wav", start=0.0, in_point=0.0, out_point=60.0, source_duration=60.0),
        _caption("c1", 22.0, "Ahora, OpenAI afirma", [("Ahora,", 0.0, 0.5), ("OpenAI", 0.5, 1.2), ("afirma", 1.2, 2.0)]),
        _caption("c2", 27.12, "El modelo descubrió", [("El", 0.0, 0.3), ("modelo", 0.3, 0.9), ("descubrió", 0.9, 1.9)]),
        _caption("c3", 29.5, "una singularidad", [("una", 0.0, 0.4), ("singularidad", 0.4, 1.6)]),
        _caption("c4", 33.0, "donde la velocidad", [("donde", 0.0, 0.4), ("la", 0.4, 0.6), ("velocidad", 0.6, 1.4)]),
        _caption("c5", 40.0, "muy lejos", [("muy", 0.0, 0.3), ("lejos", 0.3, 0.9)]),
    ]
    data = dict(
        id="p1", name="Demo", created_at="2026-09-13T00:00:00+00:00",
        images=[ImageInfo(id="img1", filename="bg.png", url="/x", label="fondo"),
                ImageInfo(id="img2", filename="sing.png", url="/y", label="diagrama de una singularidad")],
        audios=[AudioInfo(id="aud1", filename="voz.wav", url="/a", duration=60.0)],
        timeline=Timeline(width=720, height=1280, fps=30, tracks=tracks, clips=clips),
    )
    data.update(over)
    return Project(**data)


class SegmentContextTest(unittest.TestCase):
    def test_script_split_previous_current_next_from_captions(self):
        ctx = sc.build_segment_context(_project(), 27.12, 32.12, playhead=27.12)
        script = ctx["scriptContext"]
        self.assertEqual(script["source"], "captions")
        self.assertEqual(script["current"], "El modelo descubrió una singularidad")
        # Margen de 4 s: solo "afirma" (centro 23.6 s ≥ 23.12) entra como anterior.
        self.assertEqual(script["previous"], "afirma")
        self.assertIn("velocidad", script["next"])
        self.assertNotIn("lejos", script["next"])          # 40 s queda fuera del margen
        self.assertIn("singularidad", script["keyTerms"])

    def test_previous_uses_padding_window(self):
        ctx = sc.build_segment_context(_project(), 24.0, 26.0)
        self.assertIn("OpenAI", ctx["scriptContext"]["previous"])
        self.assertIn("OpenAI", sc.key_terms("Ahora, OpenAI afirma haberlo resuelto"))

    def test_default_duration_from_playhead(self):
        ctx = sc.build_segment_context(_project(), None, None, playhead=30.0)
        self.assertEqual(ctx["selection"], {"start": 30.0, "end": 35.0, "duration": 5.0, "explicit": False})

    def test_timeline_context_active_clip_and_elements(self):
        ctx = sc.build_segment_context(_project(), 27.12, 32.12, playhead=27.5)
        tlc = ctx["timelineContext"]
        self.assertEqual(tlc["activeClip"]["id"], "paper")   # V2 está encima de V1
        ids = [e["id"] for e in tlc["existingElements"]]
        self.assertIn("bg", ids)
        self.assertIn("paper", ids)
        self.assertNotIn("voz", ids)                          # audio fuera
        self.assertFalse(any(i.startswith("c") for i in ids))  # subtítulos van en el guion

    def test_motion_in_range_reports_overlap(self):
        p = _project()
        p.timeline.clips.append(TimelineClip(
            id="m1", track_id="V2", kind="motion", asset_kind="motion", asset_id="mg_1",
            composition_id="mg_1", filename="mg_1_v1.webm", name="motion_027_032",
            start=27.12, in_point=0.0, out_point=5.0, source_duration=5.0))
        tlc = sc.build_segment_context(p, 27.12, 32.12)["timelineContext"]
        self.assertEqual(tlc["motionInRange"][0]["composition_id"], "mg_1")
        self.assertEqual(tlc["motionInRange"][0]["overlap"], 1.0)

    def test_assets_ranked_by_script_terms_and_style(self):
        ctx = sc.build_segment_context(_project(), 27.12, 32.12)
        self.assertEqual(ctx["availableAssets"][0]["id"], "img2")
        style = ctx["style"]
        self.assertEqual(style["format"], {"width": 720, "height": 1280, "fps": 30})
        self.assertEqual(style["captionFont"], "Arial Black")
        self.assertEqual(style["accent"], "#ffe566")
        self.assertEqual(style["avoidY"], [0.73, 0.87])

    def test_audio_text_estimate_without_captions(self):
        p = _project()
        p.timeline.clips = [c for c in p.timeline.clips if c.kind != "text"]
        p.audios[0].text = "a" * 300 + " FRASE CLAVE " + "b" * 287   # 600 chars en 60 s → 10 chars/s
        ctx = sc.build_segment_context(p, 30.0, 32.0)
        self.assertEqual(ctx["scriptContext"]["source"], "audio_text_estimate")
        self.assertIn("FRASE", ctx["scriptContext"]["current"])

    def test_context_is_compact(self):
        size = len(json.dumps(sc.build_segment_context(_project(), 27.12, 32.12), ensure_ascii=False))
        self.assertLess(size, 4000)

    def test_focus_roundtrip(self):
        sc.set_focus("px", start=10, end=15, playhead=11, clip_id="c2")
        f = sc.get_focus("px")
        self.assertEqual((f["start"], f["end"], f["playhead"], f["clip_id"]), (10.0, 15.0, 11.0, "c2"))


class SegmentContextToolTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"

    def tearDown(self):
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _saved_project(self):
        proj = projects.create_project("Ctx")
        projects.save_timeline(proj.id, _project().timeline.model_dump())
        return proj

    def test_tool_with_times(self):
        proj = self._saved_project()
        out = tools_motion.motion_segment_context(proj.id, 27.12, 32.12)
        self.assertEqual(out["scriptContext"]["current"], "El modelo descubrió una singularidad")

    def test_tool_uses_editor_focus_without_times(self):
        proj = self._saved_project()
        with self.assertRaises(MCPError):
            tools_motion.motion_segment_context(proj.id)
        sc.set_focus(proj.id, start=27.12, end=32.12, playhead=27.12)
        out = tools_motion.motion_segment_context(proj.id)
        self.assertEqual(out["selection"]["start"], 27.12)

    def test_tool_listed_in_motion_domain(self):
        names = {t.name for t in asyncio.run(server.mcp.list_tools())}
        self.assertIn("motion_segment_context", names)
        d = capabilities.describe("motion")
        self.assertIn("motion_segment_context", d["verbs"])
        self.assertIn("avoidY", d["guide"])


if __name__ == "__main__":
    unittest.main()
