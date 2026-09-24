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

    # --- Carpetas del inicio ---------------------------------------------

    def test_legacy_projects_have_no_group(self):
        # projects.json de versiones anteriores: sin "groups" ni "group_id".
        projects._FILE.write_text('{"projects": [{"id": "old1", "name": "Viejo", '
                                  '"created_at": "2025-01-01T00:00:00+00:00"}]}', encoding="utf-8")
        self.assertIsNone(projects.get_project("old1").group_id)
        self.assertEqual(projects.list_groups(), [])

    def test_create_in_group(self):
        g = projects.create_group("  Shorts ")
        self.assertEqual(g.name, "Shorts")
        self.assertEqual(projects.create_project("A", g.id).group_id, g.id)
        # Carpeta inexistente: el proyecto se crea igual, sin carpeta.
        self.assertIsNone(projects.create_project("B", "nope").group_id)

    def test_move_between_groups(self):
        g = projects.create_group("Shorts")
        pid = projects.create_project("A").id
        self.assertEqual(projects.move_project(pid, g.id).group_id, g.id)
        self.assertIsNone(projects.move_project(pid, None).group_id)
        with self.assertRaises(ValueError):
            projects.move_project(pid, "nope")
        self.assertIsNone(projects.move_project("nope", g.id))

    def test_delete_group_keeps_projects(self):
        g = projects.create_group("Shorts")
        pid = projects.create_project("A", g.id).id
        self.assertTrue(projects.delete_group(g.id))
        self.assertFalse(projects.delete_group(g.id))
        self.assertIsNone(projects.get_project(pid).group_id)
        self.assertEqual(projects.list_groups(), [])

    def test_rename_group(self):
        g = projects.create_group("A")
        self.assertEqual(projects.rename_group(g.id, "B").name, "B")
        self.assertIsNone(projects.rename_group("nope", "B"))
        with self.assertRaises(ValueError):
            projects.create_group("   ")

    def test_duplicate_stays_in_group(self):
        g = projects.create_group("Shorts")
        pid = projects.create_project("A", g.id).id
        self.assertEqual(projects.duplicate_project(pid).group_id, g.id)


if __name__ == "__main__":
    unittest.main()
