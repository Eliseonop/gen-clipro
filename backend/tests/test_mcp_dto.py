"""DTO semántico del MCP: contexto de proyecto + capabilities."""
import unittest

from app.mcp_server import dto
from app.schemas import (
    AudioInfo,
    ClipInfo,
    Project,
    Timeline,
    TimelineClip,
    TimelineTrack,
)


def _make_project() -> Project:
    tl = Timeline(
        width=720, height=1280, fps=30,
        tracks=[
            TimelineTrack(id="V1", kind="video", name="V1"),
            TimelineTrack(id="T1", kind="text", name="T1"),
        ],
        clips=[
            TimelineClip(id="c1", track_id="V1", kind="video", asset_kind="clips",
                         asset_id="0", filename="a.mp4", start=0.0,
                         in_point=0.0, out_point=10.0, source_duration=10.0),
            # speed 2x → dura 4s en la timeline (8s de fuente / 2)
            TimelineClip(id="c2", track_id="V1", kind="video", asset_kind="clips",
                         asset_id="1", filename="b.mp4", start=10.0,
                         in_point=0.0, out_point=8.0, source_duration=8.0, speed=2.0),
            TimelineClip(id="t1", track_id="T1", kind="text", asset_kind="clips",
                         asset_id="x", filename="", start=0.0,
                         in_point=0.0, out_point=5.0, text="hola"),
        ],
    )
    return Project(
        id="p1", name="Demo", created_at="2026-08-30T00:00:00+00:00",
        clips=[ClipInfo(index=0, filename="a.mp4", url="/x", start=0.0, end=10.0, label="Intro")],
        audios=[AudioInfo(id="a1", filename="v.m4a", url="/y", duration=30.0, label="Voz")],
        timeline=tl,
    )


class AspectRatioTest(unittest.TestCase):
    def test_common_ratios(self):
        self.assertEqual(dto.aspect_ratio(720, 1280), "9:16")
        self.assertEqual(dto.aspect_ratio(1080, 1080), "1:1")
        self.assertEqual(dto.aspect_ratio(1920, 1080), "16:9")

    def test_degenerate(self):
        self.assertEqual(dto.aspect_ratio(0, 100), "?")


class ProjectContextTest(unittest.TestCase):
    def test_shape_and_counts(self):
        ctx = dto.project_context(_make_project())
        self.assertEqual(ctx["project"]["id"], "p1")
        self.assertEqual(ctx["format"]["aspect"], "9:16")
        self.assertEqual(ctx["format"]["fps"], 30)
        self.assertEqual(ctx["media"]["clips"], 1)
        self.assertEqual(ctx["media"]["audios"], 1)
        self.assertEqual(ctx["media"]["clip_list"][0]["label"], "Intro")
        self.assertEqual(ctx["timeline"]["clip_count"], 3)
        self.assertEqual(ctx["timeline"]["kinds"], {"video": 2, "audio": 0, "text": 1})

    def test_timeline_duration_uses_speed(self):
        ctx = dto.project_context(_make_project())
        # c1 termina en 10; c2 en 10 + 4 = 14; t1 en 5 → máx 14
        self.assertEqual(ctx["timeline"]["duration"], 14.0)

    def test_capabilities_present(self):
        ctx = dto.project_context(_make_project())
        caps = ctx["capabilities"]
        self.assertIn("clip.speed:0.1-10|keep_pitch|reverse", caps)
        self.assertIn("clip.position:top|bottom|full", caps)
        self.assertIn("media.library", caps)

    def test_no_timeline_uses_defaults(self):
        p = Project(id="p2", name="x", created_at="t")
        ctx = dto.project_context(p)
        self.assertFalse(ctx["timeline"]["present"])
        self.assertEqual(ctx["format"]["aspect"], "9:16")
        self.assertEqual(ctx["timeline"]["clip_count"], 0)

    def test_history_passthrough(self):
        ctx = dto.project_context(
            _make_project(),
            history={"can_undo": True, "can_redo": False, "checkpoints": ["antes-subs"]},
        )
        self.assertTrue(ctx["history"]["can_undo"])
        self.assertFalse(ctx["history"]["can_redo"])
        self.assertEqual(ctx["history"]["checkpoints"], ["antes-subs"])


if __name__ == "__main__":
    unittest.main()
