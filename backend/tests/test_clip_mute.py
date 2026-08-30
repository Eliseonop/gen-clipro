import unittest
from types import SimpleNamespace

from app.clip_audio import clip_mixes_audio


class ClipMuteTest(unittest.TestCase):
    def test_clip_mute_silences_even_if_track_is_open(self):
        track = SimpleNamespace(muted=False)
        self.assertTrue(clip_mixes_audio(SimpleNamespace(muted=False), track))
        self.assertFalse(clip_mixes_audio(SimpleNamespace(muted=True), track))

    def test_track_mute_still_wins(self):
        track = SimpleNamespace(muted=True)
        self.assertFalse(clip_mixes_audio(SimpleNamespace(muted=False), track))
