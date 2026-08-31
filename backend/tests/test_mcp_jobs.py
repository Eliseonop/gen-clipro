"""Tools de lectura de jobs del MCP: get_job, wait_for_job."""
import threading
import time
import unittest

from app import jobs
from app.mcp_server import tools_jobs
from app.schemas import ClipInfo, JobStatus


class JobToolsTest(unittest.TestCase):
    def test_get_job_done_with_result(self):
        job = jobs.create_job()
        job.status = JobStatus.done
        job.progress = 1.0
        job.message = "listo"
        job.clips = [ClipInfo(index=0, filename="a.mp4", url="/x", start=0.0, end=5.0)]
        d = tools_jobs.get_job(job.id)
        self.assertEqual(d["status"], "done")
        self.assertEqual(d["result"]["clips"], 1)

    def test_get_unknown_job_raises(self):
        with self.assertRaises(ValueError):
            tools_jobs.get_job("noexiste")

    def test_wait_returns_immediately_when_done(self):
        job = jobs.create_job()
        job.status = JobStatus.error
        job.error = "boom"
        d = tools_jobs.wait_for_job(job.id, timeout_s=5, poll_interval=0.05)
        self.assertEqual(d["status"], "error")
        self.assertEqual(d["error"], "boom")
        self.assertNotIn("timed_out", d)

    def test_wait_times_out_on_pending(self):
        job = jobs.create_job()   # queda pending
        started = time.monotonic()
        d = tools_jobs.wait_for_job(job.id, timeout_s=0.2, poll_interval=0.05)
        self.assertTrue(d["timed_out"])
        self.assertEqual(d["status"], "pending")
        self.assertLess(time.monotonic() - started, 2.0)

    def test_wait_returns_when_job_completes(self):
        job = jobs.create_job()

        def finish():
            time.sleep(0.1)
            job.status = JobStatus.done
            job.message = "ok"

        threading.Thread(target=finish, daemon=True).start()
        d = tools_jobs.wait_for_job(job.id, timeout_s=3, poll_interval=0.05)
        self.assertEqual(d["status"], "done")
        self.assertNotIn("timed_out", d)

    def test_wait_unknown_job_raises(self):
        with self.assertRaises(ValueError):
            tools_jobs.wait_for_job("noexiste", timeout_s=0.1)


if __name__ == "__main__":
    unittest.main()
