"""Tools de Render/Export + jobs: export_project, list_jobs, cancel_job + cancelación."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, jobs, projects
from app.mcp_server import registry, server, tools_render  # noqa: F401 (server puebla el registro)
from app.schemas import JobStatus, Timeline, TimelineClip, TimelineTrack


def _timeline() -> Timeline:
    return Timeline(
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[TimelineClip(id="c1", track_id="V1", kind="video", asset_kind="clips",
                            asset_id="0", filename="a.mp4", start=0.0,
                            in_point=0.0, out_point=5.0, source_duration=5.0)],
    )


class ExportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        projects.save_timeline(self.pid, _timeline().model_dump())

    def tearDown(self):
        projects._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_export_starts_job(self):
        cap = {}
        with patch("app.jobs.start_export_job", side_effect=lambda job, pid, tl: cap.update(pid=pid, tl=tl)):
            out = tools_render.export_project(self.pid)
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["pid"], self.pid)
        self.assertEqual(len(cap["tl"]["clips"]), 1)

    def test_export_empty_timeline_raises(self):
        projects.save_timeline(self.pid, Timeline().model_dump())
        with self.assertRaises(ValueError):
            tools_render.export_project(self.pid)

    def test_export_unknown_project_raises(self):
        with self.assertRaises(ValueError):
            tools_render.export_project("nope")


class JobsMgmtTest(unittest.TestCase):
    def test_list_jobs_includes_created(self):
        job = jobs.create_job()
        job.status = JobStatus.running
        out = tools_render.list_jobs()
        ids = {j["id"] for j in out["jobs"]}
        self.assertIn(job.id, ids)

    def test_cancel_pending_job(self):
        job = jobs.create_job()   # pending
        out = tools_render.cancel_job(job.id)
        self.assertEqual(out["status"], "cancelled")
        self.assertTrue(jobs.get_job(job.id).cancel_requested)

    def test_cancel_unknown_raises(self):
        with self.assertRaises(ValueError):
            tools_render.cancel_job("noexiste")

    def test_cancel_finished_job_raises(self):
        job = jobs.create_job()
        job.status = JobStatus.done
        with self.assertRaises(ValueError):
            tools_render.cancel_job(job.id)


class CooperativeCancelTest(unittest.TestCase):
    """La cancelación aborta el runner en el siguiente on_progress (best-effort)."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        self._old_file = projects._FILE
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        projects.set_folder(self.pid, str(self.tmp / "proj"))
        projects.save_timeline(self.pid, _timeline().model_dump())

    def tearDown(self):
        config.DATA_DIR = self._old_data
        projects._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_run_export_aborts_when_cancelled(self):
        reached_end = {"v": False}

        def fake_render(project, timeline, out_path, on_progress):
            on_progress(0.1, "renderizando")   # aquí debe abortar
            reached_end["v"] = True            # no debería llegar
            return out_path

        job = jobs.create_job()
        jobs.request_cancel(job.id)            # se pide cancelar antes de correr
        tl = projects.get_project(self.pid).timeline.model_dump()
        with patch("app.compose.render", side_effect=fake_render):
            jobs._run_export(job.id, self.pid, tl)
        self.assertFalse(reached_end["v"])     # abortó dentro de on_progress
        # el dto lo refleja como 'cancelled'
        from app.mcp_server import dto
        self.assertEqual(dto.job_dto(jobs.get_job(job.id))["status"], "cancelled")


class RenderPolicyTest(unittest.TestCase):
    def test_access_levels(self):
        specs = registry.registered()
        self.assertEqual(specs["export_project"].access, "write")
        self.assertEqual(specs["list_jobs"].access, "read")
        self.assertEqual(specs["cancel_job"].access, "write")


if __name__ == "__main__":
    unittest.main()
