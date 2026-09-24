"""Sonorizar con IA (#17): respuesta de la IA, emparejamiento, colocación y MCP."""
import json
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from app import sound_design as sd
from app.clip_keyframes import clip_volume_at
from app.schemas import Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import add_sound_design

LIB = [
    {"id": "10_ANIMALS/EAGLE RAHHH.mp3", "name": "EAGLE RAHHH", "category": "Animal / Chaos", "uso": "Animales", "folder": "10_ANIMALS", "url": "/u/1"},
    {"id": "02_IMPACTS/Whoosh Wind.mp3", "name": "Whoosh Wind", "category": "Impact / Dramatic", "uso": "Golpe o transición", "folder": "02_IMPACTS", "url": "/u/2"},
    {"id": "02_IMPACTS/Whoosh sfx.mp3", "name": "Whoosh sfx", "category": "Impact / Dramatic", "uso": "Golpe o transición", "folder": "02_IMPACTS", "url": "/u/3"},
    {"id": "08_MEMES/helicopter helicopter.mp3", "name": "helicopter helicopter", "category": "Meme / Trend", "uso": "Meme", "folder": "08_MEMES", "url": "/u/4"},
    {"id": "02_IMPACTS/Punch Sound.mp3", "name": "Punch Sound", "category": "Impact / Dramatic", "uso": "Golpe", "folder": "02_IMPACTS", "url": "/u/5"},
]

ANSWER = json.dumps({"sounds": [
    {"what": "Viento de montaña", "kind": "ambience", "keywords": ["wind", "viento", "breeze"], "start": 0, "duration": 99, "volume": 0.3},
    {"what": "Águila", "kind": "spot", "keywords": ["eagle", "águila", "hawk"], "start": 2, "duration": 1.5, "volume": 0.9},
    {"what": "Olas", "kind": "ambience", "keywords": ["waves", "olas", "sea"], "start": 0, "duration": 5},
]})


class ParseTest(unittest.TestCase):
    def test_norm(self):
        self.assertEqual(sd.norm("Águila  REAL!"), "aguila real")

    def test_sanea_la_respuesta(self):
        s = sd.parse_sounds("```json\n" + ANSWER + "\n```", 6.0)
        self.assertEqual(len(s), 3)
        self.assertEqual(s[0]["duration"], 6.0, "no pasa del final de la escena")
        self.assertEqual(s[2]["volume"], sd.DEFAULT_VOLUME["ambience"], "volumen por defecto según el tipo")
        many = json.dumps({"sounds": [{"keywords": ["x"], "start": 9, "duration": 1}] * 9})
        out = sd.parse_sounds(many, 4.0)
        self.assertEqual(len(out), sd.MAX_SOUNDS)
        self.assertLessEqual(out[0]["start"] + out[0]["duration"], 4.0 + 1e-9)
        with self.assertRaises(ValueError):
            sd.parse_sounds("no sé", 4.0)

    def test_empareja_sin_inventar(self):
        sounds = sd.parse_sounds(ANSWER, 6.0)
        matched, missing = sd.match_sounds(sounds, LIB)
        self.assertEqual([m["sfx"]["name"] for m in matched], ["Whoosh Wind", "EAGLE RAHHH"])
        self.assertEqual([m["what"] for m in missing], ["Olas"], "lo que no está en la biblioteca, aparte")
        whoosh = {**sounds[0], "keywords": ["whoosh"]}
        again, _ = sd.match_sounds([whoosh, whoosh], LIB)
        self.assertNotEqual(again[0]["sfx"]["id"], again[1]["sfx"]["id"], "no repite el mismo archivo")
        _, lost = sd.match_sounds([sounds[0], sounds[0]], LIB)
        self.assertEqual(len(lost), 1, "si no hay otro archivo que encaje, va a «falta»")

    def test_prompt(self):
        p = sd.build_prompt({"duration": 6.0, "label": "Montañas", "speech": "qué vista"},
                            sd.categories_of(LIB), 3)
        self.assertIn("6.0 s", p)
        self.assertIn("Animal / Chaos (Animales)", p)
        self.assertIn("3 fotogramas", p)
        self.assertIn("qué vista", p)


class PlaceTest(unittest.TestCase):
    """Mismo caso que frontend/src/lib/soundDesign.test.mjs."""

    def _tl(self):
        return Timeline(tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                                TimelineTrack(id="S", kind="audio", name="SFX")],
                        clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips", asset_id="0",
                                            filename="a.mp4", start=10, in_point=0, out_point=6, source_duration=6),
                               TimelineClip(id="busy", track_id="S", kind="audio", asset_kind="sfx", asset_id="x",
                                            filename="x", start=12, out_point=1, source_duration=1)])

    SOUNDS = [
        {"what": "Viento", "kind": "ambience", "start": 0, "duration": 6, "volume": 0.3,
         "sfx": {"id": "02_IMPACTS/Whoosh Wind.mp3", "name": "Whoosh Wind", "duration": 4.5}},
        {"what": "Águila", "kind": "spot", "start": 5.5, "duration": 2, "volume": 0.9,
         "sfx": {"id": "10_ANIMALS/EAGLE RAHHH.mp3", "name": "EAGLE RAHHH", "duration": 3}},
    ]

    def test_coloca_en_pistas_sfx(self):
        r = add_sound_design(self._tl(), "v", self.SOUNDS)
        tl = r.timeline
        tracks = [t.name for t in tl.tracks if t.kind == "audio"]
        self.assertEqual(tracks, ["SFX", "SFX 2"], "la pista SFX ya tenía algo en ese tramo")
        wind = next(c for c in tl.clips if c.asset_id.endswith("Whoosh Wind.mp3"))
        eagle = next(c for c in tl.clips if c.asset_id.endswith("EAGLE RAHHH.mp3"))
        self.assertEqual((wind.start, wind.out_point), (10.0, 4.5), "no pasa del archivo")
        self.assertEqual(tl.tracks[-1].id, wind.track_id)
        self.assertEqual((eagle.start, eagle.out_point), (15.5, 0.5), "no pasa del final de la escena")
        self.assertEqual(eagle.track_id, "S", "cabe en la primera pista SFX")
        self.assertEqual((wind.note, wind.note_source), ("Viento", "ai"))
        self.assertAlmostEqual(clip_volume_at(wind, 0.0), 0.0, "el ambiente entra con fundido")
        self.assertAlmostEqual(clip_volume_at(wind, 2.0), 0.3)
        self.assertAlmostEqual(eagle.volume, 0.9)
        with self.assertRaises(ValueError):
            add_sound_design(self._tl(), "v", [])


class ProposeTest(unittest.TestCase):
    def setUp(self):
        from app import config, projects, timeline_store
        self.tmp = Path(tempfile.mkdtemp())
        self.old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Montaña").id
        tl = Timeline(tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                              TimelineTrack(id="T1", kind="text", name="T1")],
                      clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips", asset_id="0",
                                          filename="a.mp4", start=0, out_point=6, source_duration=6,
                                          note="el dron sobrevuela la cordillera"),
                             TimelineClip(id="t", track_id="T1", kind="text", asset_kind="text", asset_id="t",
                                          filename="", text="qué vista más brutal", start=1, out_point=2,
                                          source_duration=2)])
        projects.save_timeline(self.pid, tl.model_dump())

    def tearDown(self):
        from app import config, projects, timeline_store
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self.old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _patches(self):
        return [patch("app.sfx.search", return_value={"items": LIB, "categories": []}),
                patch("app.sfx.resolve", return_value=None)]

    def test_con_vision(self):
        from app import projects
        seen = {}

        def chat(messages, **kw):
            seen["content"] = messages[1]["content"]
            return {"text": ANSWER}

        clip = next(c for c in projects.get_project(self.pid).timeline.clips if c.id == "v").model_dump()
        with patch("app.foundry.available", return_value=True), patch("app.foundry.chat", side_effect=chat), \
                patch("app.sound_design._frames", return_value=([b"jpg1", b"jpg2"], [1.0, 3.0])), \
                self._patches()[0], self._patches()[1]:
            res = sd.propose(self.pid, clip)
        self.assertEqual(res["mode"], "vision")
        self.assertEqual(len([c for c in seen["content"] if c["type"] == "image_url"]), 2)
        prompt = seen["content"][0]["text"]
        self.assertIn("el dron sobrevuela la cordillera", prompt)
        self.assertIn("qué vista más brutal", prompt, "lo que se dice en ese tramo")
        self.assertEqual([s["what"] for s in res["sounds"]], ["Viento de montaña", "Águila"])
        self.assertEqual([m["what"] for m in res["missing"]], ["Olas"])

    def test_sin_foundry_usa_el_chat(self):
        from app import projects
        clip = next(c for c in projects.get_project(self.pid).timeline.clips if c.id == "v").model_dump()
        with patch("app.foundry.available", return_value=False), \
                patch("app.sound_design._ask_text", return_value=ANSWER) as ask, \
                self._patches()[0], self._patches()[1]:
            res = sd.propose(self.pid, clip)
        self.assertEqual(res["mode"], "text")
        self.assertIn("el dron sobrevuela", ask.call_args[0][0])
        self.assertEqual(len(res["sounds"]), 2)

    def test_mcp_coloca_los_sonidos(self):
        from app import jobs, projects
        from app.mcp_server.tools_edit import sound_design

        with patch("app.foundry.available", return_value=False), \
                patch("app.sound_design._ask_text", return_value=ANSWER), \
                self._patches()[0], self._patches()[1]:
            job = sound_design(self.pid, "v", apply=True)
            for _ in range(100):
                j = jobs.get_job(job["id"])
                if j.status.value in ("done", "error"):
                    break
                time.sleep(0.05)
        self.assertEqual(j.status.value, "done", j.error)
        clips = projects.get_project(self.pid).timeline.clips
        self.assertEqual(sorted(c.name for c in clips if c.asset_kind == "sfx"), ["EAGLE RAHHH", "Whoosh Wind"])
        # Sin duración de archivo, el viento dura toda la escena y el águila se solapa: 2 pistas.
        self.assertEqual(len(j.result["added"]), 4, "dos clips + dos pistas SFX")


if __name__ == "__main__":
    unittest.main()
