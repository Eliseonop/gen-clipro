"""Selección de aceleración por hardware: whisper device + encoder de vídeo."""
import os
import unittest
from unittest.mock import patch

from app import gpu


def _probe(hw):
    return {"ffmpeg": {"hw_encoders": list(hw)}}


class GpuSelectionTest(unittest.TestCase):
    def setUp(self):
        gpu._reset_cache()

    def tearDown(self):
        gpu._reset_cache()

    # --- Whisper device ---
    def test_whisper_cuda_when_available(self):
        with patch("ctranslate2.get_cuda_device_count", return_value=1), \
             patch("app.gpu._cuda_libs_ok", return_value=True):
            gpu._reset_cache()
            self.assertEqual(gpu.whisper_device(), ("cuda", "float16"))

    def test_whisper_cpu_when_no_cuda(self):
        with patch("ctranslate2.get_cuda_device_count", return_value=0):
            gpu._reset_cache()
            self.assertEqual(gpu.whisper_device(), ("cpu", "int8"))

    def test_whisper_cpu_when_gpu_visible_but_cublas_missing(self):
        with patch("ctranslate2.get_cuda_device_count", return_value=1), \
             patch("app.gpu._cuda_libs_ok", return_value=False):
            gpu._reset_cache()
            self.assertEqual(gpu.whisper_device(), ("cpu", "int8"))

    # --- Encoder de vídeo (sonda _encoder_works mockeada) ---
    def test_nvenc_selected_when_available_and_works(self):
        with patch("app.diagnostics.probe", return_value=_probe(["h264_nvenc", "h264_qsv"])), \
             patch("app.gpu._encoder_works", return_value=True):
            gpu._reset_cache()
            args = gpu.video_encoder_args()
            enc = gpu.selected_encoder()
        self.assertIn("h264_nvenc", args)
        self.assertIn("-cq", args)
        self.assertNotIn("-b:v", args)   # el '-b:v 0' rompía NVENC en algunos builds
        self.assertEqual(enc, "h264_nvenc")

    def test_listed_but_not_working_falls_back_to_libx264(self):
        # El caso real: h264_nvenc listado pero la sonda de encode falla.
        with patch("app.diagnostics.probe", return_value=_probe(["h264_nvenc"])), \
             patch("app.gpu._encoder_works", return_value=False):
            gpu._reset_cache()
            enc = gpu.selected_encoder()
            args = gpu.video_encoder_args()
        self.assertEqual(enc, "libx264")
        self.assertEqual(args[:2], ["-c:v", "libx264"])

    def test_qsv_when_only_qsv(self):
        with patch("app.diagnostics.probe", return_value=_probe(["h264_qsv"])), \
             patch("app.gpu._encoder_works", return_value=True):
            gpu._reset_cache()
            args = gpu.video_encoder_args()
        self.assertIn("h264_qsv", args)
        self.assertIn("-global_quality", args)

    def test_libx264_fallback_when_no_hw(self):
        with patch("app.diagnostics.probe", return_value=_probe([])):
            gpu._reset_cache()
            args = gpu.video_encoder_args()
        self.assertEqual(args[:2], ["-c:v", "libx264"])
        self.assertIn("-crf", args)
        self.assertEqual(gpu.selected_encoder(), "libx264")

    # --- Override por entorno ---
    def test_env_disables_gpu(self):
        with patch.dict(os.environ, {"VIDEOYT_GPU": "0"}), \
             patch("ctranslate2.get_cuda_device_count", return_value=1), \
             patch("app.diagnostics.probe", return_value=_probe(["h264_nvenc"])), \
             patch("app.gpu._encoder_works", return_value=True):
            gpu._reset_cache()
            self.assertEqual(gpu.whisper_device(), ("cpu", "int8"))
            self.assertEqual(gpu.selected_encoder(), "libx264")

    def test_cublas_missing_on_windows(self):
        with patch("app.gpu.os.name", "nt"), \
             patch("app.gpu._dll_loads", return_value=False):
            self.assertFalse(gpu._cuda_libs_ok())

    def test_cublas_present_on_windows(self):
        def loads(name):
            return name == "cublas64_12.dll"
        with patch("app.gpu.os.name", "nt"), \
             patch("app.gpu._dll_loads", side_effect=loads):
            self.assertTrue(gpu._cuda_libs_ok())

    def test_summary_shape(self):
        with patch("ctranslate2.get_cuda_device_count", return_value=0), \
             patch("app.diagnostics.probe", return_value=_probe([])):
            gpu._reset_cache()
            s = gpu.summary()
        self.assertEqual(set(s), {"gpu_disabled", "whisper_device", "whisper_compute",
                                  "video_encoder", "onnx_available", "onnx_providers",
                                  "onnx_selected"})


class OnnxProviderTest(unittest.TestCase):
    """Eliminar fondo: la elección de device nunca debe quedarse sin proveedor."""

    def setUp(self):
        gpu._reset_cache()

    def tearDown(self):
        gpu._reset_cache()

    def test_cpu_only_cae_a_cpu_sin_fallar(self):
        with patch("app.gpu._ort_available", return_value=("CPUExecutionProvider",)):
            for dev in ("auto", "cuda", "dml", "cpu"):
                self.assertEqual(gpu.onnx_providers(dev), ["CPUExecutionProvider"], dev)

    def test_cuda_se_prefiere_y_cpu_queda_de_respaldo(self):
        avail = ("CUDAExecutionProvider", "CPUExecutionProvider")
        with patch("app.gpu._ort_available", return_value=avail):
            self.assertEqual(gpu.onnx_providers("auto"),
                             ["CUDAExecutionProvider", "CPUExecutionProvider"])
            self.assertEqual(gpu.onnx_providers("cpu"), ["CPUExecutionProvider"])
            self.assertEqual(gpu.onnx_device_label(gpu.onnx_providers("auto")), "cuda")

    def test_directml_cuando_se_pide(self):
        avail = ("DmlExecutionProvider", "CPUExecutionProvider")
        with patch("app.gpu._ort_available", return_value=avail):
            self.assertEqual(gpu.onnx_providers("dml")[0], "DmlExecutionProvider")
            self.assertEqual(gpu.onnx_device_label(gpu.onnx_providers("dml")), "directml")

    def test_videoyt_gpu_0_fuerza_cpu(self):
        avail = ("CUDAExecutionProvider", "CPUExecutionProvider")
        with patch("app.gpu._ort_available", return_value=avail), \
             patch.dict(os.environ, {"VIDEOYT_GPU": "0"}):
            self.assertEqual(gpu.onnx_providers("cuda"), ["CPUExecutionProvider"])

    def test_sin_onnxruntime_devuelve_lista_vacia(self):
        with patch("app.gpu._ort_available", return_value=()):
            self.assertEqual(gpu.onnx_providers("auto"), [])


if __name__ == "__main__":
    unittest.main()
