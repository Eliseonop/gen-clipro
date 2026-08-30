"""Herencia pista→texto: estilo efectivo (la pista es base, el clip override)."""
import unittest

from app.schemas import TimelineClip, TimelineTrack
from app.text_ass import build_ass, effective_text_style


class EffectiveStyleTest(unittest.TestCase):
    def test_clip_sobreescribe_a_la_pista(self):
        track = {"font": "Anton", "color": "#ffffff", "size": 0.05}
        clip = {"color": "#ff0000"}
        self.assertEqual(
            effective_text_style(track, clip),
            {"font": "Anton", "color": "#ff0000", "size": 0.05},
        )

    def test_campo_ausente_en_el_clip_hereda_de_la_pista(self):
        track = {"font": "Anton", "max_words": 6, "opacity": 0.8}
        eff = effective_text_style(track, {"color": "#fff"})
        self.assertEqual(eff["font"], "Anton")     # heredado
        self.assertEqual(eff["max_words"], 6)       # fragmentación heredada
        self.assertEqual(eff["opacity"], 0.8)       # opacidad heredada
        self.assertEqual(eff["color"], "#fff")      # override del clip

    def test_casos_vacios(self):
        self.assertEqual(effective_text_style(None, None), {})
        self.assertEqual(effective_text_style({"font": "Anton"}, None), {"font": "Anton"})
        self.assertEqual(effective_text_style(None, {"color": "#fff"}), {"color": "#fff"})


class BuildAssInheritanceTest(unittest.TestCase):
    def _clip(self, style):
        return TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="hola", style=style,
        )

    def test_clip_hereda_la_fuente_de_la_pista(self):
        track = TimelineTrack(id="T1", kind="text", name="T1",
                              style={"font": "Anton", "size": 0.05, "color": "#ffffff"})
        clip = self._clip({})   # el clip no define fuente
        doc = build_ass([clip], 720, 1280, [track])
        self.assertIn("Style: sc1,Anton,", doc)   # heredó Anton de la pista

    def test_sin_tracks_se_comporta_como_antes(self):
        clip = self._clip({"font": "Arial", "size": 0.05, "color": "#ffffff"})
        self.assertEqual(build_ass([clip], 720, 1280), build_ass([clip], 720, 1280, None))


if __name__ == "__main__":
    unittest.main()
