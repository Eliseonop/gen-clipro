"""Entrega a DaVinci Resolve Free: adaptador + segmentación + paquete Fusion/SRT.

Portado desde mi-davinci y adaptado al modelo de video-yt (Transcript con
``segments[].words[]``). Verifica que el grafo Fusion SIEMPRE sale conectado.
"""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from xml.etree import ElementTree as ET

from app.resolve.adapter import build_project, text_clips_to_project, words_from_transcript
from app.resolve.fcpxml import FcpCaption, FcpItem, build_fcpxml
from app.resolve.fusion.validate import check_connectivity
from app.resolve.free_fusion import generate_comp
from app.resolve.package import build_package
from app.resolve.srt import build_srt
from app.resolve.styles import load_presets
from app.resolve.timeline_map import items_from_timeline


TRANSCRIPT = {
    "language": "es",
    "segments": [
        {"start": 0.0, "end": 2.0, "text": "hola mundo esto es", "words": [
            {"text": "hola", "start": 0.0, "end": 0.4, "prob": 0.9},
            {"text": "mundo", "start": 0.4, "end": 0.9},
            {"text": "esto", "start": 1.0, "end": 1.3},
            {"text": "es", "start": 1.3, "end": 1.6},
        ]},
        {"start": 2.2, "end": 4.0, "text": "una prueba real.", "words": [
            {"text": "una", "start": 2.2, "end": 2.5},
            {"text": "prueba", "start": 2.5, "end": 3.1},
            {"text": "real.", "start": 3.1, "end": 3.7},
        ]},
    ],
}


class AdapterTest(unittest.TestCase):
    def test_words_flattened_and_sorted(self):
        words = words_from_transcript(TRANSCRIPT)
        self.assertEqual([w.text for w in words],
                         ["hola", "mundo", "esto", "es", "una", "prueba", "real."])
        self.assertEqual(words[0].start, 0.0)
        self.assertEqual(words[-1].end, 3.7)

    def test_words_are_immutable_timestamps(self):
        proj = build_project(TRANSCRIPT, project_id="demo")
        # La segmentación agrupa pero NO reescribe los tiempos originales.
        self.assertEqual(proj.words[1].start, 0.4)
        self.assertEqual(proj.words[1].end, 0.9)

    def test_empty_transcript(self):
        proj = build_project({"segments": []})
        self.assertEqual(proj.words, [])
        self.assertEqual(proj.segments, [])

    def test_segments_cover_all_words(self):
        proj = build_project(TRANSCRIPT)
        covered = sum(s.i1 - s.i0 + 1 for s in proj.segments)
        self.assertEqual(covered, len(proj.words))


class FusionConnectivityTest(unittest.TestCase):
    def _all_presets(self):
        return list(load_presets().keys()) or ["word-pop"]

    def test_graph_connected_every_preset(self):
        for pid in self._all_presets():
            proj = build_project(TRANSCRIPT, project_id="demo", preset=pid)
            setting = generate_comp(proj)
            self.assertEqual(check_connectivity(setting), [],
                             f"grafo desconectado con preset {pid}")

    def test_has_single_media_out(self):
        proj = build_project(TRANSCRIPT, preset="word-pop")
        setting = generate_comp(proj)
        self.assertEqual(setting.count("MediaOut {"), 1)
        self.assertIn('ActiveTool = "MediaOut1"', setting)

    def test_font_fallback_never_emits_missing_font(self):
        # word-pop pide Anton; si no está instalada, debe caer a Open Sans.
        proj = build_project(TRANSCRIPT, preset="word-pop")
        setting = generate_comp(proj)
        self.assertNotIn('Font = Input { Value = "Anton"', setting)


class PackageTest(unittest.TestCase):
    def test_package_writes_all_files(self):
        proj = build_project(TRANSCRIPT, project_id="demo")
        with tempfile.TemporaryDirectory() as d:
            pkg = build_package(proj, d, stem="subtitulos")
            names = sorted(Path(f).name for f in pkg.files)
            self.assertIn("subtitulos.setting", names)
            self.assertIn("subtitulos.srt", names)
            self.assertIn("LEEME_RESOLVE.txt", names)
            for f in pkg.files:
                self.assertTrue(Path(f).exists())

    def test_package_with_timeline_writes_manifest_otio_and_script(self):
        proj = build_project(TRANSCRIPT, project_id="demo")
        items = [FcpItem(path="/tmp/v1.mp4", kind="video", offset=0.0, duration=2.0,
                         src_duration=2.0, lane=1, name="v1")]
        with tempfile.TemporaryDirectory() as d:
            pkg = build_package(proj, d, stem="subtitulos", fcp_items=items)
            names = sorted(Path(f).name for f in pkg.files)
            for want in ("subtitulos_timeline.fcpxml", "subtitulos_timeline.otio",
                         "ds_manifest.json", "ds_import.py"):
                self.assertIn(want, names)
            man = json.loads((Path(d) / "ds_manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(man["clips"][0]["track"], 1)
            self.assertEqual(man["fusion_setting"], "subtitulos.setting")
            self.assertTrue(pkg.manifest.endswith("ds_manifest.json"))

    def test_package_includes_voice_when_present(self):
        proj = build_project(TRANSCRIPT)
        with tempfile.TemporaryDirectory() as d:
            fake = Path(d) / "narracion.wav"
            fake.write_bytes(b"RIFF....WAVEfake")
            pkg = build_package(proj, d, voice_wav=fake, stem="subtitulos")
            self.assertTrue((Path(pkg.dir) / "voz.wav").exists())


class SrtTest(unittest.TestCase):
    def test_srt_has_indices_and_timecodes(self):
        proj = build_project(TRANSCRIPT)
        srt = build_srt(proj)
        self.assertIn("1\n00:00:00,000 --> ", srt)
        self.assertIn("-->", srt)


class TextClipsSourceTest(unittest.TestCase):
    # Los subtítulos de video-yt viven en clips de TEXTO del timeline, con words[]
    # RELATIVOS al inicio del clip. Deben pasarse a tiempo absoluto (clip.start + w).
    TIMELINE = {
        "width": 1080, "height": 1920, "fps": 30,
        "tracks": [{"id": "T1", "kind": "text", "name": "T1"}],
        "clips": [
            {"kind": "text", "track_id": "T1", "start": 0.11, "in_point": 0.0, "out_point": 2.94,
             "text": "Primero vamos a iniciar", "words": [
                 {"text": "Primero", "start": 0.0, "end": 0.66, "prob": 0.99},
                 {"text": "vamos", "start": 0.66, "end": 1.0},
                 {"text": "a", "start": 1.0, "end": 1.1},
                 {"text": "iniciar", "start": 1.1, "end": 1.6},
             ]},
            {"kind": "text", "track_id": "T1", "start": 3.21, "in_point": 0.0, "out_point": 3.1,
             "text": "sin words aqui", "words": []},
        ],
    }

    def test_absolute_timing_from_clip_start(self):
        doc = text_clips_to_project(self.TIMELINE, project_id="t")
        self.assertEqual(doc.words[0].text, "Primero")
        self.assertAlmostEqual(doc.words[0].start, 0.11)          # 0.11 + 0.0
        self.assertAlmostEqual(doc.words[0].end, 0.77)            # 0.11 + 0.66

    def test_one_segment_per_text_clip(self):
        doc = text_clips_to_project(self.TIMELINE, project_id="t")
        self.assertEqual(len(doc.segments), 2)                    # un subtítulo por clip
        self.assertEqual(doc.segments[0].text, "Primero vamos a iniciar")

    def test_clip_without_words_synthesized(self):
        doc = text_clips_to_project(self.TIMELINE, project_id="t")
        seg2 = doc.segments[1]
        self.assertEqual(seg2.i1 - seg2.i0 + 1, 3)                # "sin words aqui" -> 3 palabras
        self.assertGreaterEqual(doc.words[seg2.i0].start, 3.21)   # arranca en el start del clip

    def test_fusion_graph_connected_from_text_clips(self):
        doc = text_clips_to_project(self.TIMELINE, project_id="t", preset="karaoke")
        self.assertEqual(check_connectivity(generate_comp(doc)), [])


class FcpxmlTest(unittest.TestCase):
    def _items(self):
        return [
            FcpItem(path="/tmp/v1.mp4", kind="video", offset=0.0, duration=3.0,
                    src_in=0.5, src_duration=10.0, lane=1, name="v1"),
            FcpItem(path="/tmp/voz.wav", kind="audio", offset=0.0, duration=4.0,
                    src_duration=4.0, lane=-1, name="voz"),
        ]

    def test_valid_xml_and_structure(self):
        xml = build_fcpxml(fps=30, width=1080, height=1920, duration=5.0, items=self._items())
        root = ET.fromstring(xml)                     # parsea => bien formado
        self.assertEqual(root.tag, "fcpxml")
        self.assertEqual(root.get("version"), "1.9")
        assets = root.findall("./resources/asset")
        self.assertEqual(len(assets), 2)              # un asset por archivo único
        clips = root.findall(".//spine/gap/asset-clip")
        self.assertEqual(len(clips), 2)
        lanes = sorted(int(c.get("lane")) for c in clips)
        self.assertEqual(lanes, [-1, 1])              # audio abajo, vídeo arriba

    def test_dedupes_assets_by_path(self):
        items = self._items() + [FcpItem(path="/tmp/v1.mp4", kind="video", offset=3.0,
                                         duration=2.0, lane=1, name="v1b")]
        xml = build_fcpxml(fps=30, width=1080, height=1920, duration=5.0, items=items)
        root = ET.fromstring(xml)
        self.assertEqual(len(root.findall("./resources/asset")), 2)     # v1.mp4 reutilizado
        self.assertEqual(len(root.findall(".//asset-clip")), 3)

    def test_frame_aligned_times(self):
        xml = build_fcpxml(fps=30, width=1080, height=1920, duration=5.0, items=self._items())
        self.assertIn('frameDuration="1/30s"', xml)
        self.assertIn('duration="90/30s"', xml)       # 3.0s * 30 = 90 frames

    def test_captions_included(self):
        xml = build_fcpxml(fps=30, width=1080, height=1920, duration=5.0, items=self._items(),
                           captions=[FcpCaption(text="hola", offset=0.0, duration=1.0)])
        root = ET.fromstring(xml)
        caps = root.findall(".//caption")
        self.assertEqual(len(caps), 1)
        self.assertIn("hola", xml)

    def test_empty_items_still_valid(self):
        xml = build_fcpxml(fps=30, width=1080, height=1920, duration=2.0, items=[])
        root = ET.fromstring(xml)                     # sin clips: sigue bien formado
        self.assertTrue(root.findall(".//spine/gap"))


class OtioTest(unittest.TestCase):
    def _items(self):
        return [
            FcpItem(path="/tmp/v1.mp4", kind="video", offset=1.0, duration=3.0,
                    src_in=0.0, src_duration=10.0, lane=1, name="v1"),
            FcpItem(path="/tmp/voz.wav", kind="audio", offset=0.0, duration=4.0,
                    src_duration=4.0, lane=-1, name="voz"),
        ]

    def test_valid_json_and_schema(self):
        from app.resolve.otio import build_otio
        doc = json.loads(build_otio(fps=30, items=self._items(), project_name="p"))
        self.assertEqual(doc["OTIO_SCHEMA"], "Timeline.1")
        tracks = doc["tracks"]["children"]
        kinds = sorted(t["kind"] for t in tracks)
        self.assertEqual(kinds, ["Audio", "Video"])

    def test_offset_becomes_leading_gap(self):
        from app.resolve.otio import build_otio
        doc = json.loads(build_otio(fps=30, items=self._items()))
        vtrack = next(t for t in doc["tracks"]["children"] if t["kind"] == "Video")
        # offset 1.0s => un Gap de 30 frames antes del clip.
        self.assertEqual(vtrack["children"][0]["OTIO_SCHEMA"], "Gap.1")
        self.assertEqual(vtrack["children"][0]["source_range"]["duration"]["value"], 30)
        self.assertEqual(vtrack["children"][1]["OTIO_SCHEMA"], "Clip.1")


class TimelineMapTest(unittest.TestCase):
    def test_resolves_media_and_lanes_skips_missing(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base / "video").mkdir()
            (base / "audio").mkdir()
            (base / "video" / "clip1.mp4").write_bytes(b"x")
            (base / "audio" / "voz.wav").write_bytes(b"x")
            project = SimpleNamespace(id="ticketera", folder=str(base))
            timeline = {
                "tracks": [
                    {"id": "V1", "kind": "video", "name": "V1"},
                    {"id": "A1", "kind": "audio", "name": "A1"},
                    {"id": "T1", "kind": "text", "name": "T1"},
                ],
                "clips": [
                    {"kind": "video", "track_id": "V1", "filename": "clip1.mp4",
                     "start": 0.0, "in_point": 0.0, "out_point": 3.0, "source_duration": 3.0},
                    {"kind": "audio", "track_id": "A1", "filename": "voz.wav",
                     "start": 0.0, "in_point": 0.0, "out_point": 4.0, "source_duration": 4.0},
                    {"kind": "video", "track_id": "V1", "filename": "no_existe.mp4",
                     "start": 3.0, "in_point": 0.0, "out_point": 2.0, "source_duration": 2.0},
                    {"kind": "text", "track_id": "T1", "text": "hola", "start": 0.0},
                ],
            }
            items, warnings = items_from_timeline(project, timeline)
            self.assertEqual(len(items), 2)                       # texto ignorado, faltante omitido
            self.assertEqual(len(warnings), 1)
            lanes = sorted(i.lane for i in items)
            self.assertEqual(lanes, [-1, 1])
            vid = next(i for i in items if i.kind == "video")
            self.assertTrue(vid.path.endswith("clip1.mp4"))
            self.assertAlmostEqual(vid.duration, 3.0)


if __name__ == "__main__":
    unittest.main()
