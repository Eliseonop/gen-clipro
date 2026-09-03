"""Palabras clave de Explorar a partir de audio / transcripción."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.explore_keywords import (
    CLASSIC_SUGGESTIONS,
    extract_keywords,
    gather_theme_text,
    parse_keyword_list,
    suggest_keywords,
)
from app.schemas import AudioInfo, Timeline, TimelineClip, TimelineTrack, Transcript, TranscriptSegment


class ExtractTest(unittest.TestCase):
    def test_ignora_muletillas(self):
        self.assertEqual(extract_keywords("Por favor, quiero que veas esto. Gracias."), [])

    def test_saca_tema(self):
        keys = extract_keywords(
            "Por favor, quiero que viajemos al futuro con una máquina del tiempo "
            "en una ciudad antigua llena de científicos."
        )
        self.assertTrue(keys)
        blob = " ".join(keys)
        self.assertNotIn("quiero", blob)
        self.assertNotIn("favor", blob)
        self.assertTrue(any(w in blob for w in ("máquina", "tiempo", "ciudad", "futuro", "científic")))

    def test_parse_json_sucio(self):
        self.assertEqual(
            parse_keyword_list('```json\n["time machine", "future city"]\n```'),
            ["time machine", "future city"],
        )

    def test_sin_texto_clasicas(self):
        out = suggest_keywords("   ")
        self.assertEqual(out["source"], "classic")
        self.assertEqual(out["keywords"], CLASSIC_SUGGESTIONS)

    def test_local_si_no_hay_ia(self):
        with patch("app.explore_keywords._llm_keywords", return_value=[]):
            out = suggest_keywords("Una explosión en el laboratorio de ciencia")
        self.assertEqual(out["source"], "local")
        self.assertTrue(out["keywords"])

    def test_ia_gana(self):
        with patch("app.explore_keywords._llm_keywords", return_value=["time machine", "scientist"]):
            out = suggest_keywords("máquina del tiempo")
        self.assertEqual(out["source"], "ai")
        self.assertEqual(out["keywords"][0], "time machine")


class GatherTest(unittest.TestCase):
    def test_audio_transcripcion_y_timeline(self):
        proj = SimpleNamespace(
            audios=[AudioInfo(id="a1", filename="n.wav", url="/n", description="cine épico", text="")],
            clips=[],
            transcripts=[Transcript(
                id="t1", model="base",
                segments=[TranscriptSegment(start=0, end=1, text="Una explosión en el laboratorio")],
            )],
            timeline=Timeline(
                tracks=[TimelineTrack(id="A1", kind="audio", name="A1")],
                clips=[TimelineClip(
                    id="x", track_id="A1", kind="audio", asset_kind="audios",
                    asset_id="a1", filename="n.wav", start=0, in_point=0,
                    out_point=2, source_duration=2, text="el héroe viaja al futuro",
                )],
            ),
        )
        blob = gather_theme_text(proj)
        self.assertIn("cine épico", blob)
        self.assertIn("laboratorio", blob)
        self.assertIn("futuro", blob)
