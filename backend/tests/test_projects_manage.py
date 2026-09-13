"""Renombrar y duplicar proyectos (checklist CapCut 1.2)."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, storage
from app.schemas import ClipInfo


class ProjectsManageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_out = config.OUTPUT_DIR
        projects._FILE = self.tmp / "projects.json"
        config.OUTPUT_DIR = self.tmp / "clips"

    def tearDown(self):
        projects._FILE = self._old_file
        config.OUTPUT_DIR = self._old_out
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _project_with_clip(self, name="Demo"):
        pid = projects.create_project(name).id
        base = storage.ensure_dirs(storage.default_base(pid))
        (base / "video" / "a.mp4").write_bytes(b"video")
        (base / "exports").mkdir()
        (base / "exports" / "final.mp4").write_bytes(b"render")
        projects.add_clips(pid, [ClipInfo(
            index=0, filename="a.mp4", url=f"/api/media/{pid}/video/a.mp4", start=0.0, end=5.0)])
        return pid

    def test_rename(self):
        pid = projects.create_project("Viejo").id
        self.assertEqual(projects.rename_project(pid, "  Nuevo ").name, "Nuevo")
        self.assertEqual(projects.get_project(pid).name, "Nuevo")

    def test_rename_empty_rejected(self):
        pid = projects.create_project("A").id
        with self.assertRaises(ValueError):
            projects.rename_project(pid, "   ")

    def test_rename_missing(self):
        self.assertIsNone(projects.rename_project("nope", "X"))

    def test_duplicate_copies_data_and_files(self):
        pid = self._project_with_clip()
        dup = projects.duplicate_project(pid)
        self.assertNotEqual(dup.id, pid)
        self.assertEqual(dup.name, "Demo (copia)")
        self.assertIsNone(dup.folder)
        self.assertEqual(dup.clips[0].url, f"/api/media/{dup.id}/video/a.mp4")
        new_base = storage.default_base(dup.id)
        self.assertEqual((new_base / "video" / "a.mp4").read_bytes(), b"video")
        self.assertFalse((new_base / "exports").exists())
        # El original sigue intacto.
        self.assertEqual(projects.get_project(pid).clips[0].url, f"/api/media/{pid}/video/a.mp4")

    def test_duplicate_from_custom_folder_is_independent(self):
        pid = projects.create_project("Propio").id
        folder = storage.ensure_dirs(self.tmp / "mi_carpeta")
        (folder / "image" / "i.png").write_bytes(b"png")
        projects.set_folder(pid, str(folder))
        dup = projects.duplicate_project(pid)
        self.assertIsNone(dup.folder)
        self.assertTrue((storage.default_base(dup.id) / "image" / "i.png").exists())

    def test_duplicate_missing(self):
        self.assertIsNone(projects.duplicate_project("nope"))


if __name__ == "__main__":
    unittest.main()
