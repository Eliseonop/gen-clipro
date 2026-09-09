"""Fallback CUDA → CPU de Whisper cuando la inferencia GPU revienta."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app import transcribe


class _Info:
    duration = 1.0
    language = "es"


class _Seg:
    start = 0.0
    end = 1.0
    text = " hola "
    words = []


class _CudaThenCpu:
    calls = []

    def __init__(self, size, device="cpu", compute_type="int8", **kwargs):
        self.device = device
        type(self).calls.append(device)

    def transcribe(self, *args, **kwargs):
        if self.device == "cuda":
            raise RuntimeError("Could not locate cublas64_12.dll")
        return iter([_Seg()]), _Info()


class _Batched:
    """Doble del pipeline batched: delega en el modelo envuelto (ignora
    ``batch_size``), para probar el fallback sin ejecutar el batched real."""

    def __init__(self, model=None):
        self.model = model

    def transcribe(self, *args, **kwargs):
        kwargs.pop("batch_size", None)
        return self.model.transcribe(*args, **kwargs)


class TranscribeCudaFallbackTest(unittest.TestCase):
    def setUp(self):
        transcribe._models.clear()
        _CudaThenCpu.calls = []

    def tearDown(self):
        transcribe._models.clear()

    def test_reintenta_en_cpu_si_cuda_falla_al_inferir(self):
        progress = []
        with patch("app.gpu.whisper_device", side_effect=[("cuda", "float16"), ("cpu", "int8")]), \
             patch("app.gpu.mark_cuda_broken") as marked, \
             patch("app.transcribe.WhisperModel", _CudaThenCpu), \
             patch("app.transcribe.BatchedInferencePipeline", _Batched):
            out = transcribe.run_file("x.wav", "base", "es", lambda f, m: progress.append((f, m)))
        self.assertEqual(_CudaThenCpu.calls, ["cuda", "cpu"])
        self.assertEqual(out["language"], "es")
        self.assertEqual(out["segments"][0]["text"], "hola")
        marked.assert_called_once()
