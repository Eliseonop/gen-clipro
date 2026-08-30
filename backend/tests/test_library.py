"""Biblioteca global: DTO, Guardar (mueve), Unsave y resolución de archivos."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, storage
from app.schemas import AudioInfo, Timeline, TimelineClip, TimelineTrack


class InferOriginTest(unittest.TestCase):
    def test_tts_audio_con_engine(self):
        from app.library import infer_origin_source

        o, s = infer_origin_source({"engine": "kokoro", "voice": "ef_dora"}, "audio")
        self.assertEqual((o, s), ("tts", "generated"))

    def test_youtube_audio_con_url(self):
        from app.library import infer_origin_source

        o, s = infer_origin_source(
            {"youtube_url": "https://www.youtube.com/watch?v=abc", "origin": "youtube"},
            "audio",
        )
        self.assertEqual((o, s), ("youtube", "external"))

    def test_clip_con_source_url_youtube(self):
        from app.library import infer_origin_source

        o, s = infer_origin_source(
            {"source_url": "https://youtu.be/xyz", "filename": "a.mp4"},
            "clip",
        )
        self.assertEqual((o, s), ("youtube", "external"))

    def test_clip_compuesto_sin_youtube(self):
        from app.library import infer_origin_source

        o, s = infer_origin_source({"filename": "mix.mp4"}, "clip")
        self.assertEqual((o, s), ("compose", "generated"))

    def test_respeta_origin_persistido(self):
        from app.library import infer_origin_source

        o, s = infer_origin_source(
            {"origin": "compose", "source": "generated", "source_url": "https://youtu.be/x"},
            "clip",
        )
        self.assertEqual((o, s), ("compose", "generated"))


class MaterialDtoTest(unittest.TestCase):
    def test_library_marca_saved_y_url(self):
        from app.library import material_dto

        dto = material_dto(
            {"id": "lib_aaa", "resource_type": "audio", "filename": "n.m4a",
             "origin": "youtube", "source": "external"},
            "library",
        )
        self.assertEqual(dto["scope"], "library")
        self.assertTrue(dto["is_saved"])
        self.assertEqual(dto["resource_type"], "audio")
        self.assertEqual(dto["url"], "/api/library/media/audio/n.m4a")

    def test_project_no_esta_saved(self):
        from app.library import material_dto

        dto = material_dto(
            {"id": "ab12", "filename": "n.wav", "engine": "kokoro", "voice": "ef_dora"},
            "project",
        )
        self.assertEqual(dto["scope"], "project")
        self.assertFalse(dto["is_saved"])
        self.assertEqual(dto["origin"], "tts")
        self.assertEqual(dto["resource_type"], "audio")


class LibrarySaveTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_data = config.DATA_DIR
        projects._FILE = self.tmp / "projects.json"
        config.DATA_DIR = self.tmp
        self.proj_dir = self.tmp / "proj"
        (self.proj_dir / "audio").mkdir(parents=True)
        (self.proj_dir / "video").mkdir(parents=True)
        self.pid = projects.create_project("A").id
        projects.set_folder(self.pid, str(self.proj_dir))

    def tearDown(self):
        projects._FILE = self._old_file
        config.DATA_DIR = self._old_data
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _add_audio(self, aid="au1", name="voz.wav"):
        src = self.proj_dir / "audio" / name
        src.write_bytes(b"RIFF....WAVEfmt ")
        audio = AudioInfo(
            id=aid, filename=name, url=f"/api/media/{self.pid}/audio/{name}",
            voice="ef_dora", engine="kokoro", duration=1.5,
        )
        projects.add_audio(self.pid, audio)
        return audio

    def test_save_audio_mueve_a_biblioteca_y_sale_del_proyecto(self):
        from app.library import list_library, save_from_project

        self._add_audio()
        saved = save_from_project(self.pid, "audio", "au1")
        self.assertTrue(saved["id"].startswith("lib_"))
        self.assertEqual(saved["scope"], "library")
        self.assertTrue(saved["is_saved"])
        self.assertEqual(saved["origin"], "tts")
        self.assertEqual(saved["source"], "generated")
        self.assertEqual(saved["resource_type"], "audio")

        proj = projects.get_project(self.pid)
        self.assertEqual(proj.audios, [])
        self.assertFalse((self.proj_dir / "audio" / "voz.wav").exists())

        lib = list_library()
        self.assertEqual(len(lib["audios"]), 1)
        self.assertEqual(len(lib["clips"]), 0)
        dest = storage.resolve_library_media("audio", saved["filename"])
        self.assertIsNotNone(dest)
        self.assertTrue(dest.exists())

    def test_save_reescribe_timeline_de_ese_proyecto(self):
        from app.library import save_from_project

        self._add_audio()
        projects.save_timeline(self.pid, Timeline(
            tracks=[TimelineTrack(id="A1", kind="audio", name="A1")],
            clips=[TimelineClip(
                id="c1", track_id="A1", kind="audio", asset_kind="audios",
                asset_id="au1", filename="voz.wav", out_point=1.5, source_duration=1.5,
            )],
        ).model_dump())
        saved = save_from_project(self.pid, "audio", "au1")
        tl = projects.get_project(self.pid).timeline
        clip = tl.clips[0]
        self.assertEqual(clip.asset_scope, "library")
        self.assertEqual(clip.asset_id, saved["id"])
        self.assertEqual(clip.filename, saved["filename"])

    def test_save_inexistente_es_lookup_error(self):
        from app.library import save_from_project

        with self.assertRaises(LookupError):
            save_from_project(self.pid, "audio", "nope")

    def test_unsave_sin_uso_borra_catalogo_y_archivo(self):
        from app.library import list_library, save_from_project, unsave

        self._add_audio()
        saved = save_from_project(self.pid, "audio", "au1")
        dest = storage.resolve_library_media("audio", saved["filename"])
        unsave(saved["id"])
        self.assertEqual(list_library()["audios"], [])
        self.assertFalse(dest.exists())

    def test_unsave_en_uso_lanza(self):
        from app.library import LibraryInUseError, save_from_project, unsave

        self._add_audio()
        saved = save_from_project(self.pid, "audio", "au1")
        projects.save_timeline(self.pid, Timeline(
            tracks=[TimelineTrack(id="A1", kind="audio", name="A1")],
            clips=[TimelineClip(
                id="c1", track_id="A1", kind="audio", asset_kind="audios",
                asset_id=saved["id"], filename=saved["filename"],
                asset_scope="library", out_point=1.5, source_duration=1.5,
            )],
        ).model_dump())
        with self.assertRaises(LibraryInUseError) as ctx:
            unsave(saved["id"])
        self.assertEqual(ctx.exception.projects[0]["id"], self.pid)

    def test_list_library_no_mezcla_con_proyecto(self):
        from app.library import list_library, save_from_project

        self._add_audio("au1", "a.wav")
        self._add_audio("au2", "b.wav")
        save_from_project(self.pid, "audio", "au1")
        proj = projects.get_project(self.pid)
        self.assertEqual([a.id for a in proj.audios], ["au2"])
        lib = list_library()
        self.assertEqual(len(lib["audios"]), 1)
        self.assertNotIn("au2", [a["id"] for a in lib["audios"]])


class TimelineAssetScopeDefaultTest(unittest.TestCase):
    def test_ausente_es_project(self):
        clip = TimelineClip(
            id="c1", track_id="V1", kind="video", asset_kind="clips",
            asset_id="0", filename="a.mp4",
        )
        self.assertEqual(clip.asset_scope, "project")


class ResolveLibraryMediaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        config.DATA_DIR = self.tmp

    def tearDown(self):
        config.DATA_DIR = self._old_data
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_rechaza_path_traversal(self):
        self.assertIsNone(storage.resolve_library_media("audio", "../secret.wav"))
        self.assertIsNone(storage.resolve_library_media("clips", "x.mp4"))

    def test_resuelve_bajo_library(self):
        dest_dir = self.tmp / "library" / "audio"
        dest_dir.mkdir(parents=True)
        (dest_dir / "n.m4a").write_bytes(b"x")
        p = storage.resolve_library_media("audio", "n.m4a")
        self.assertEqual(p, dest_dir / "n.m4a")


if __name__ == "__main__":
    unittest.main()
