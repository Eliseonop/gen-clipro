"""render_frame (modo ``frame_at``): el grafo no debe dejar salidas sin mapear.

Con ``frame_at`` el comando lleva ``-an``; si el grafo aún generaba ``[aout]``,
FFmpeg 9 fallaba con "Error binding filtergraph inputs/outputs" en cuanto la
timeline tenía audio (render_timeline_frame del MCP quedaba inservible).
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.compose import build_command
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack

_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def _graph(frame_at=None):
    tmp = Path(tempfile.mkdtemp())
    img = tmp / "a.png"
    img.write_bytes(_PNG)
    tl = Timeline(
        width=720, height=1280, fps=30,
        tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                TimelineTrack(id="A1", kind="audio", name="A1")],
        clips=[
            TimelineClip(id="v", track_id="V1", kind="image", asset_kind="images", asset_id="1",
                         filename="a.png", start=0.0, in_point=0.0, out_point=4.0,
                         source_duration=4.0, layout="fill"),
            TimelineClip(id="a", track_id="A1", kind="audio", asset_kind="audios", asset_id="2",
                         filename="n.wav", start=0.0, in_point=0.0, out_point=4.0,
                         source_duration=4.0),
        ],
    )
    proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
    with patch("app.detect.dims", return_value=(1080, 1920)), \
         patch("app.compose._clip_path", return_value=img), \
         patch("app.compose._has_audio", return_value=True):
        cmd = build_command(proj, tl, tmp / "out.png", frame_at=frame_at)
    return cmd, cmd[cmd.index("-filter_complex") + 1]


class FrameModeAudioTest(unittest.TestCase):
    def test_export_mezcla_el_audio(self):
        cmd, graph = _graph()
        self.assertIn("[aout]", graph)
        self.assertIn("[aout]", cmd)

    def test_frame_sin_cadena_de_audio(self):
        cmd, graph = _graph(frame_at=1.0)
        self.assertNotIn("[aout]", graph)
        self.assertNotIn(":a]", graph)
        self.assertIn("-an", cmd)
