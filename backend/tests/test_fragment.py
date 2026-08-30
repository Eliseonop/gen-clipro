"""Fragmentación en Python + GOLDEN parity con el frontend.

`test_golden_*` recorren `shared/fragmentation_cases.json` (el mismo archivo que
verifica el test JS): si el port de Python diverge del de JS, uno de los dos falla.
"""
import json
import unittest
from pathlib import Path

from app import fragment

_CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "fragmentation_cases.json").read_text(encoding="utf-8")
)["cases"]

_ORIGIN_KEYS = ("transcript_id", "segment_index", "fragment_index", "word_range", "source_range")


def _norm(clip: dict) -> dict:
    """Solo campos estables (sin ids generados)."""
    return {
        "text": clip["text"],
        "start": clip["start"],
        "out_point": clip["out_point"],
        "words": [{"text": w["text"], "start": w["start"], "end": w["end"]} for w in clip.get("words", [])],
        "origin": {k: clip["origin"][k] for k in _ORIGIN_KEYS},
    }


class GoldenParityTest(unittest.TestCase):
    def test_todos_los_casos_coinciden_con_el_fixture(self):
        for case in _CASES:
            got = fragment.text_clips_from_transcript(
                case["src"], case["segments"], case["track_id"], case["style"], case.get("transcript_id"),
            )
            self.assertEqual([_norm(c) for c in got], case["expected"], msg=case["name"])


class ChunkTest(unittest.TestCase):
    def test_chunk_por_n_palabras(self):
        self.assertEqual(fragment.chunk_caption_text("a b c d e", 2), ["a b", "c d", "e"])

    def test_chunk_vacio(self):
        self.assertEqual(fragment.chunk_caption_text("   ", 2), [])

    def test_una_sola_pieza_si_n_invalido(self):
        self.assertEqual(fragment.chunk_caption_text("a b c", 0), ["a b c"])


class RelativeTest(unittest.TestCase):
    def test_words_relativas_al_fragmento(self):
        got = fragment.text_clips_from_transcript(
            {"start": 0, "in_point": 10, "out_point": 16},
            _CASES[0]["segments"], "T1", {"max_words": 3}, "tr_x",
        )
        # 2 fragmentos de 3 palabras; cada uno arranca su 1ª palabra en 0.
        self.assertEqual(len(got), 2)
        for c in got:
            self.assertEqual(c["words"][0]["start"], 0)


if __name__ == "__main__":
    unittest.main()
