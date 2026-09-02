import unittest

from app.schemas import TimelineClip
from app.text_ass import active_word_index, ass_bgr, ass_time, build_ass, caption_dialogues, word_opacity


class TextAssTest(unittest.TestCase):
    def test_word_index_matches_preview(self):
        self.assertEqual(active_word_index(4, -0.1, 2), -1)
        self.assertEqual(active_word_index(4, 0, 2), 0)
        self.assertEqual(active_word_index(4, 0.5, 2), 1)
        self.assertEqual(active_word_index(4, 2, 2), 3)

    def test_ass_color_is_bgr(self):
        self.assertEqual(ass_bgr("#ff3b5c"), "&H005C3BFF&")

    def test_ass_time(self):
        self.assertEqual(ass_time(0), "0:00:00.00")
        self.assertEqual(ass_time(65.5), "0:01:05.50")

    def test_karaoke_emits_one_event_per_word(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=1.0, in_point=0.0, out_point=2.0, source_duration=2.0,
            text="hola mundo", text_role="caption",
            style={"theme": "karaoke", "word_fx": "glow", "color": "#ffffff", "highlight_color": "#ff3b5c"},
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 2)
        self.assertIn("hola", lines[0])
        self.assertIn("mundo", lines[1])

    def test_fade_de_bloque_solo_en_el_primer_evento(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=2.0, source_duration=2.0,
            text="hola mundo", text_role="caption",
            style={"word_fx": "highlight", "block_appear": "fade", "color": "#ffffff", "highlight_color": "#ff3b5c"},
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 2)
        self.assertIn("\\fad(", lines[0])
        self.assertNotIn("\\fad(", lines[1])
        self.assertIn("\\pos(", lines[1])
        self.assertTrue(any("Dialogue:" in ln for ln in lines))

    def test_build_ass_includes_playres(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="hola",
            style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "highlight"},
        )
        doc = build_ass([clip], 720, 1280)
        self.assertIn("PlayResX: 720", doc)
        self.assertIn("PlayResY: 1280", doc)
        self.assertIn("Dialogue:", doc)


    def test_combined_glow_and_pop(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=2.0, source_duration=2.0,
            text="hola mundo",
            style={
                "word_fx": ["glow", "pop"],
                "color": "#ffffff",
                "highlight_color": "#ff3b5c",
            },
            text_role="caption",
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 2)
        self.assertTrue(any("\\blur3" in ln and "\\fscx118" in ln for ln in lines))

    def test_word_opacities_in_karaoke(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=2.0, source_duration=2.0,
            text="hola mundo",
            style={
                "word_fx": "highlight",
                "color": "#ffffff",
                "highlight_color": "#ff3b5c",
                "active_opacity": 1,
                "inactive_opacity": 0.5,
            },
            text_role="caption",
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertTrue(any("\\1a&H80&" in ln and "\\3a&H80&" in ln for ln in lines))
        self.assertTrue(any("\\c&H80FFFFFF&" in ln or "\\3c&H80000000&" in ln for ln in lines))
        # La palabra activa tiene que resetear el alpha (si no, hereda el de la inactiva).
        self.assertTrue(any("\\1a&H00&" in ln and "\\c&H005C3BFF&" in ln for ln in lines))

    def test_un_solo_vocablo_karaoke_usa_opacidad_activa(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="Morty.",
            style={
                "word_fx": "highlight",
                "color": "#ffffff",
                "highlight_color": "#ffe566",
                "active_opacity": 1,
                "inactive_opacity": 0.55,
            },
            text_role="caption",
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 1)
        self.assertIn("\\c&H0066E5FF&", lines[0])
        self.assertIn("\\1a&H00&", lines[0])
        self.assertNotIn("\\1a&H73&", lines[0])

    def test_active_opacity_without_karaoke(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="hola",
            style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", "active_opacity": 0.5},
        )
        doc = build_ass([clip], 720, 1280)
        self.assertIn("\\1a&H80&", doc)
        self.assertIn("\\3a&H80&", doc)

    def test_anton_font_name_in_ass(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="hola",
            style={"font": "Anton", "size": 0.05, "color": "#ffffff", "bold": True, "border_width": 6, "border_color": "#000000"},
        )
        doc = build_ass([clip], 720, 1280)
        self.assertIn("Anton", doc)
        self.assertIn("Style: sc1,Anton,", doc)


    def test_texto_free_sin_tema_es_estatico(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=20.0, source_duration=20.0,
            text="marca de agua", text_role="free",
            style={"word_fx": "none", "color": "#ffffff"},
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 1)
        self.assertIn("marca de agua", lines[0])

    def test_texto_free_con_tema_hace_karaoke(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=4.0, source_duration=4.0,
            text="hola mundo", text_role="free",
            style={"theme": "neon", "word_fx": "glow", "color": "#ffffff", "highlight_color": "#00f0ff"},
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 2)

    def test_opacidad_global_en_export(self):
        self.assertAlmostEqual(word_opacity({"opacity": 0.5, "word_fx": "none"}, False), 0.5)
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="hola", text_role="free",
            style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", "opacity": 0.5, "border_width": 6},
        )
        doc = build_ass([clip], 720, 1280)
        self.assertIn("\\1a&H80&", doc)
        self.assertIn("\\3a&H80&", doc)
        self.assertIn("\\alpha&H80&", doc)
        self.assertIn("\\pos(", doc)
        self.assertIn("\\an5", doc)

    def test_pos_usa_xy_asignados(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="hola", text_role="free",
            style={"font": "Arial", "size": 0.05, "color": "#ffffff", "x": 0.25, "y": 0.8, "word_fx": "none"},
        )
        doc = build_ass([clip], 720, 1280)
        self.assertIn("\\pos(180,1024)", doc)

    def test_glow_de_estilo_en_palabras_inactivas(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=2.0, source_duration=2.0,
            text="hola mundo", text_role="caption",
            style={"word_fx": "highlight", "glow": True, "color": "#ffffff", "highlight_color": "#ffe566"},
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertTrue(any("\\blur3" in ln for ln in lines))

    def test_karaoke_preserva_saltos_de_linea(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=2.0, source_duration=2.0,
            text="hola mundo\nRicky", text_role="caption",
            style={"word_fx": "highlight", "color": "#ffffff", "highlight_color": "#ffe566",
                   "inactive_opacity": 0.5, "active_opacity": 1},
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 3)
        self.assertTrue(all("\\N" in ln for ln in lines))


if __name__ == "__main__":
    unittest.main()
