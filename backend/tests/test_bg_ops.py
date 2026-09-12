"""Eliminar fondo: operación de timeline (undo/redo) y endpoints HTTP."""
from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from app import clip_bg, timeline_ops
from app.schemas import Timeline, TimelineClip, TimelineTrack


def _tl(**kw) -> Timeline:
    clip = dict(
        id="c1", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
        filename="a.mp4", start=0.0, in_point=0.0, out_point=4.0,
        source_duration=4.0, layout="fill",
    )
    clip.update(kw)
    return Timeline(
        width=720, height=1280, fps=30,
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[TimelineClip(**clip)],
    )


class SetClipBgRemovalTest(unittest.TestCase):
    def test_activa_y_normaliza(self):
        res = timeline_ops.set_clip_bg_removal(
            _tl(), "c1", {"enabled": True, "chroma": {"enabled": True, "similarity": 9}})
        bg = res.timeline.clips[0].bg_removal
        self.assertTrue(bg["chroma"]["enabled"])
        self.assertEqual(bg["chroma"]["similarity"], 1.0)     # acotado
        self.assertEqual(bg["auto"]["provider"], clip_bg.DEFAULT_PROVIDER)
        self.assertEqual(res.changed, ["c1"])

    def test_no_muta_la_entrada(self):
        tl = _tl()
        timeline_ops.set_clip_bg_removal(tl, "c1", {"enabled": True})
        self.assertIsNone(tl.clips[0].bg_removal)

    def test_merge_por_secciones_conserva_la_clave_del_matte(self):
        """Tocar la tolerancia del croma NO puede borrar el matte ya calculado."""
        tl = _tl(bg_removal={
            "enabled": True, "mode": "auto",
            "auto": {"enabled": True, "base_key": "abc", "status": "ready", "threshold": 0.7},
            "chroma": {"enabled": True, "similarity": 0.2},
        })
        res = timeline_ops.set_clip_bg_removal(tl, "c1", {"chroma": {"similarity": 0.5}})
        bg = res.timeline.clips[0].bg_removal
        self.assertEqual(bg["auto"]["base_key"], "abc")
        self.assertEqual(bg["auto"]["status"], "ready")
        self.assertEqual(bg["auto"]["threshold"], 0.7)
        self.assertEqual(bg["chroma"]["similarity"], 0.5)
        self.assertTrue(bg["chroma"]["enabled"])

    def test_replace_sustituye_todo(self):
        tl = _tl(bg_removal={"enabled": True, "auto": {"base_key": "abc", "status": "ready"}})
        res = timeline_ops.set_clip_bg_removal(
            tl, "c1", {"enabled": True, "chroma": {"enabled": True}}, replace=True)
        self.assertEqual(res.timeline.clips[0].bg_removal["auto"]["base_key"], "")

    def test_none_lo_quita(self):
        tl = _tl(bg_removal={"enabled": True, "chroma": {"enabled": True}})
        res = timeline_ops.set_clip_bg_removal(tl, "c1", None)
        self.assertIsNone(res.timeline.clips[0].bg_removal)

    def test_rechaza_clips_no_visuales(self):
        tl = Timeline(
            width=720, height=1280, fps=30,
            tracks=[TimelineTrack(id="A1", kind="audio", name="A1")],
            clips=[TimelineClip(id="a1", track_id="A1", kind="audio", asset_kind="audios",
                                asset_id="1", filename="a.mp3", in_point=0, out_point=2,
                                source_duration=2)],
        )
        with self.assertRaises(ValueError):
            timeline_ops.set_clip_bg_removal(tl, "a1", {"enabled": True})

    def test_rechaza_payload_no_objeto(self):
        with self.assertRaises(ValueError):
            timeline_ops.set_clip_bg_removal(_tl(), "c1", "verde")

    def test_clip_inexistente(self):
        with self.assertRaises(ValueError):
            timeline_ops.set_clip_bg_removal(_tl(), "zzz", {"enabled": True})

    def test_está_en_la_allow_list_del_store(self):
        """Sin registrar, ni la IA ni el undo/redo del backend lo verían."""
        from app import timeline_store
        self.assertIn("set_clip_bg_removal", timeline_store.OPS)
        self.assertIs(timeline_store.OPS["set_clip_bg_removal"],
                      timeline_ops.set_clip_bg_removal)

    def test_deja_el_timeline_válido(self):
        res = timeline_ops.set_clip_bg_removal(_tl(), "c1", {"enabled": True})
        self.assertEqual(timeline_ops.validate_timeline(res.timeline), [])


class BgEndpointsTest(unittest.TestCase):
    def setUp(self):
        self.td = Path(tempfile.mkdtemp(prefix="vy-bgapi-"))
        from app.bg import service as bg_service
        self._patches = [
            patch.object(bg_service, "CACHE_ROOT", self.td / "bgcache"),
            patch.object(bg_service, "MATTE_ROOT", self.td / "bgcache" / "matte"),
            patch.object(bg_service, "MASK_ROOT", self.td / "bgcache" / "mask"),
        ]
        for p in self._patches:
            p.start()
        self.svc = bg_service

    def tearDown(self):
        for p in self._patches:
            p.stop()
        shutil.rmtree(self.td, ignore_errors=True)

    def _client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        return TestClient(app)

    def test_catálogo_de_proveedores(self):
        res = self._client().get("/api/bg/providers")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        ids = {p["id"] for p in body["providers"]}
        self.assertTrue({"u2net", "u2netp"} <= ids)      # automáticos
        self.assertTrue({"sam21_base_plus"} <= ids)      # asistido (SAM)
        self.assertIn("onnx_selected", body)

    def test_status_de_una_clave_inexistente_es_404(self):
        self.assertEqual(self._client().get("/api/bg/status/nada").status_code, 404)

    def test_status_devuelve_el_meta(self):
        self.svc.write_meta("k1", {"base_key": "k1", "mask_fps": 15, "range": [0, 9]})
        res = self._client().get("/api/bg/status/k1")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["range"], [0, 9])

    def test_fotograma_del_matte_lleva_alfa_y_se_cachea(self):
        folder = self.svc.matte_dir("k2")
        folder.mkdir(parents=True)
        m = np.zeros((8, 12), np.uint8)
        m[:, :6] = 255
        cv2.imwrite(str(self.svc.frame_path(folder, 0)), m)
        self.svc.write_meta("k2", {"base_key": "k2", "mask_fps": 15, "range": [0, 0]})
        res = self._client().get("/api/bg/matte/k2/0.png")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.headers["content-type"], "image/png")
        self.assertIn("immutable", res.headers.get("cache-control", ""))
        arr = cv2.imdecode(np.frombuffer(res.content, np.uint8), cv2.IMREAD_UNCHANGED)
        self.assertEqual(arr.shape[2], 4)
        self.assertGreater(int(arr[4, 1, 3]), 235)
        self.assertLess(int(arr[4, 10, 3]), 20)

    def test_fotograma_fuera_de_rango_se_acota(self):
        folder = self.svc.matte_dir("k3")
        folder.mkdir(parents=True)
        cv2.imwrite(str(self.svc.frame_path(folder, 0)), np.full((4, 4), 200, np.uint8))
        self.svc.write_meta("k3", {"base_key": "k3", "mask_fps": 15, "range": [0, 0]})
        self.assertEqual(self._client().get("/api/bg/matte/k3/500.png").status_code, 200)

    def test_matte_de_clave_inexistente_es_404(self):
        self.assertEqual(self._client().get("/api/bg/matte/nada/0.png").status_code, 404)

    def test_lanzar_sin_material_es_400(self):
        with patch("app.projects.get_project", return_value=object()):
            res = self._client().post("/api/projects/p1/bg-removal", json={})
        self.assertEqual(res.status_code, 400)

    def test_lanzar_en_proyecto_inexistente_es_404(self):
        with patch("app.projects.get_project", return_value=None):
            res = self._client().post("/api/projects/zzz/bg-removal",
                                      json={"filename": "a.mp4"})
        self.assertEqual(res.status_code, 404)

    def test_lanzar_devuelve_un_job(self):
        started = {}
        with patch("app.projects.get_project", return_value=object()), \
             patch("app.jobs.start_bg_removal_job",
                   side_effect=lambda job, pid, req: started.update(pid=pid, req=req)):
            res = self._client().post("/api/projects/p1/bg-removal",
                                      json={"filename": "a.mp4", "kind": "video"})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertIn("id", res.json())
        self.assertEqual(started["pid"], "p1")
        self.assertEqual(started["req"]["filename"], "a.mp4")

    def test_cancelar_un_job_inexistente_es_404(self):
        self.assertEqual(self._client().delete("/api/job/nope").status_code, 404)

    def test_cancelar_un_job_vivo(self):
        from app import jobs
        job = jobs.create_job()
        res = self._client().delete(f"/api/job/{job.id}")
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.json()["ok"])
        self.assertTrue(jobs.get_job(job.id).cancel_requested)

    def test_estadísticas_y_limpieza_de_caché(self):
        folder = self.svc.matte_dir("k4")
        folder.mkdir(parents=True)
        cv2.imwrite(str(self.svc.frame_path(folder, 0)), np.zeros((4, 4), np.uint8))
        client = self._client()
        stats = client.get("/api/bg/cache").json()
        self.assertGreaterEqual(stats["matte_frames"], 1)
        self.assertEqual(client.delete("/api/bg/cache?base_key=k4").status_code, 200)
        self.assertFalse(folder.exists())


class BgJobTest(unittest.TestCase):
    """El job NO escribe la timeline: devuelve el resultado en el Job."""

    def test_material_inexistente_deja_el_job_en_error(self):
        from app import jobs

        job = jobs.create_job()
        with patch("app.projects.get_project", return_value=object()), \
             patch("app.compose._clip_path", return_value=None):
            jobs._run_bg_removal(job.id, "p1", {"filename": "no.mp4", "kind": "video"})
        self.assertEqual(job.status.value, "error")
        self.assertIn("No se encuentra el material", job.error)

    def test_clip_no_visual_deja_el_job_en_error(self):
        from app import jobs

        job = jobs.create_job()
        with patch("app.projects.get_project", return_value=object()):
            jobs._run_bg_removal(job.id, "p1", {"filename": "a.mp3", "kind": "audio"})
        self.assertEqual(job.status.value, "error")
        self.assertIn("vídeo o imagen", job.error)

    def test_al_terminar_devuelve_la_clave_de_caché_en_el_job(self):
        from app import jobs

        job = jobs.create_job()
        meta = {"base_key": "bk", "provider": "u2net", "model_version": "u2net-1",
                "mask_fps": 15, "mask_height": 512, "range": [0, 44],
                "source_duration": 3.0, "device": "cpu"}
        src = Path(tempfile.mkdtemp()) / "a.mp4"
        src.write_bytes(b"x")
        with patch("app.projects.get_project", return_value=object()), \
             patch("app.compose._clip_path", return_value=src), \
             patch("app.bg.service.build_matte", return_value=meta):
            jobs._run_bg_removal(job.id, "p1", {
                "clip_id": "c1", "filename": "a.mp4", "kind": "video",
                "in_point": 0.0, "out_point": 3.0, "source_duration": 3.0})
        self.assertEqual(job.status.value, "done", job.error)
        self.assertEqual(job.bg_removal["base_key"], "bk")
        self.assertEqual(job.bg_removal["clip_id"], "c1")
        self.assertEqual(job.bg_removal["device"], "cpu")

    def test_cancelar_deja_el_job_en_error_con_mensaje_claro(self):
        from app import jobs
        from app.bg import service as bg_service

        job = jobs.create_job()
        src = Path(tempfile.mkdtemp()) / "a.mp4"
        src.write_bytes(b"x")
        with patch("app.projects.get_project", return_value=object()), \
             patch("app.compose._clip_path", return_value=src), \
             patch("app.bg.service.build_matte",
                   side_effect=bg_service.BgCancelled("cancelado")):
            jobs._run_bg_removal(job.id, "p1", {"filename": "a.mp4", "kind": "video"})
        self.assertEqual(job.status.value, "error")
        self.assertEqual(job.error, "Cancelado.")


if __name__ == "__main__":
    unittest.main()
