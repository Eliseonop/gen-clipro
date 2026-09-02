import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import projects


class ProjectsSaveTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = projects._FILE
        projects._FILE = self.tmp / "projects.json"

    def tearDown(self):
        projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_save_writes_json(self):
        projects.create_project("A")
        data = json.loads(projects._FILE.read_text(encoding="utf-8"))
        self.assertEqual(data["projects"][0]["name"], "A")
        self.assertFalse(projects._FILE.with_suffix(".tmp").exists())

    def test_replace_retries_then_succeeds(self):
        calls = {"n": 0}
        real_replace = os.replace

        def flaky(src, dest):
            calls["n"] += 1
            if calls["n"] < 3:
                raise PermissionError(13, "Acceso denegado")
            real_replace(src, dest)

        with patch("app.projects.os.replace", side_effect=flaky):
            with patch("app.projects.time.sleep"):
                proj = projects.create_project("B")
        self.assertEqual(calls["n"], 3)
        self.assertEqual(projects.get_project(proj.id).name, "B")

    def test_overwrite_when_replace_stays_locked(self):
        def always_locked(src, dest):
            raise PermissionError(5, "Acceso denegado")

        with patch("app.projects.os.replace", side_effect=always_locked):
            with patch("app.projects.time.sleep"):
                proj = projects.create_project("C")
        self.assertEqual(projects.get_project(proj.id).name, "C")
        self.assertFalse(projects._FILE.with_suffix(".tmp").exists())


if __name__ == "__main__":
    unittest.main()
