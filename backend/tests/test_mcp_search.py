"""search_transcript: editar por contenido (buscar en el guion)."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects
from app.mcp_server import tools_read
from app.schemas import ClipInfo, Transcript, TranscriptSegment


class SearchTranscriptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        projects.add_transcript(self.pid, Transcript(
            id="tr1", model="base", segments=[
                TranscriptSegment(start=0.0, end=2.0, text="Hola a todos"),
                TranscriptSegment(start=2.0, end=4.0, text="hoy hablamos del precio"),
            ]))
        projects.add_clips(self.pid, [ClipInfo(
            index=0, filename="a.mp4", url="/x", start=0.0, end=10.0,
            transcript=Transcript(id="c0", model="base", segments=[
                TranscriptSegment(start=1.0, end=3.0, text="el PRECIO es clave"),
            ]))])

    def tearDown(self):
        config.DATA_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_finds_in_project_and_clip(self):
        res = tools_read.search_transcript(self.pid, "precio")
        self.assertEqual(res["count"], 2)   # segmento de proyecto + de clip
        scopes = {m["scope"] for m in res["matches"]}
        self.assertEqual(scopes, {"project", "clip"})
        # trae marcas de tiempo
        self.assertTrue(all("start" in m and "end" in m for m in res["matches"]))

    def test_case_insensitive_no_match(self):
        self.assertEqual(tools_read.search_transcript(self.pid, "HOLA")["count"], 1)
        self.assertEqual(tools_read.search_transcript(self.pid, "zzz")["count"], 0)

    def test_empty_query_raises(self):
        with self.assertRaises(ValueError):
            tools_read.search_transcript(self.pid, "  ")


if __name__ == "__main__":
    unittest.main()
