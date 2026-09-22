"""Speech-to-Text con Azure Speech (misma cuenta/recurso que el TTS).

Usa la **Fast Transcription API** REST (síncrona, sube el archivo por
multipart) vía ``urllib`` para no depender del SDK nativo (igual criterio que
``azure_tts.py``). Reutiliza EXACTAMENTE las mismas credenciales del TTS
(``azure_tts.api_key()`` / ``azure_tts.region()``): un solo recurso de Azure
Speech sirve para narrar y para transcribir.

La respuesta de Azure se normaliza al MISMO dict que ``transcribe.run_file``
(faster-whisper), así el resto del backend (subtítulos, karaoke, resaltado por
palabra) no distingue el motor::

    {"language": "es", "duration": 12.3, "segments": [
        {"start": 0.0, "end": 2.1, "text": "…",
         "words": [{"text": "…", "start": 0.0, "end": 0.2, "prob": 0.98}]},
    ]}

Docs de Azure: "Fast transcription" (api-version 2024-11-15). El endpoint vive
en ``https://{region}.api.cognitive.microsoft.com``.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Callable, Optional

from . import settings

log = logging.getLogger("videoyt.azure_stt")

ProgressCb = Callable[[float, str], None]

_API_VERSION = "2024-11-15"

# Locales candidatos cuando no se indica idioma (identificación automática, hasta
# 10). Español de varias regiones + inglés cubre el caso típico del editor.
_DEFAULT_LOCALES = ["es-ES", "es-MX", "es-AR", "en-US"]
_SHORT_TO_LOCALE = {"es": "es-ES", "en": "en-US", "pt": "pt-BR", "fr": "fr-FR"}


def api_key() -> str:
    """Misma clave que el TTS (un solo recurso de Azure Speech)."""
    env = (os.environ.get("AZURE_SPEECH_KEY") or os.environ.get("SPEECH_KEY") or "").strip()
    if env:
        return env
    return settings.api_key("azure")


def region() -> str:
    env = (os.environ.get("AZURE_SPEECH_REGION") or os.environ.get("SPEECH_REGION") or "").strip()
    if env:
        return env
    data = settings.load() or {}
    return str(data.get("azure_region") or "").strip()


def unavailable_reason() -> Optional[str]:
    """Mismo criterio que el TTS (clave + región del recurso de Speech)."""
    if not api_key():
        return "Falta la clave de Azure Speech. Configúrala o define AZURE_SPEECH_KEY."
    if not region():
        return "Falta la región de Azure (ej. eastus). Configúrala o define AZURE_SPEECH_REGION."
    return None


def available() -> bool:
    return unavailable_reason() is None


def _locales_for(language: Optional[str]) -> list[str]:
    lang = (language or "").strip()
    if not lang:
        return list(_DEFAULT_LOCALES)
    if "-" in lang:               # ya es un locale completo (es-ES)
        return [lang]
    return [_SHORT_TO_LOCALE.get(lang.lower(), f"{lang}-{lang.upper()}")]


def _transcode_wav(src: Path) -> Path:
    """Convierte cualquier audio/vídeo a WAV 16k mono PCM (formato seguro para
    Azure). Devuelve la ruta del WAV temporal (el llamador lo borra)."""
    exe = shutil.which("ffmpeg") or "ffmpeg"
    out = Path(tempfile.gettempdir()) / f"vy-stt-{uuid.uuid4().hex[:8]}.wav"
    cmd = [exe, "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000",
           "-c:a", "pcm_s16le", str(out)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not out.exists():
        raise RuntimeError(
            "No se pudo preparar el audio para Azure (FFmpeg). "
            + (proc.stderr or "").strip()[-200:]
        )
    return out


def _multipart(audio_bytes: bytes, filename: str, definition: dict) -> tuple[bytes, str]:
    """Cuerpo multipart/form-data con el archivo ``audio`` y el JSON ``definition``."""
    boundary = "----videoyt" + uuid.uuid4().hex
    crlf = b"\r\n"
    parts: list[bytes] = []
    # campo 'definition' (JSON)
    parts.append(f"--{boundary}".encode())
    parts.append(b'Content-Disposition: form-data; name="definition"')
    parts.append(b"Content-Type: application/json")
    parts.append(b"")
    parts.append(json.dumps(definition).encode("utf-8"))
    # campo 'audio' (binario)
    parts.append(f"--{boundary}".encode())
    parts.append(
        f'Content-Disposition: form-data; name="audio"; filename="{filename}"'.encode()
    )
    parts.append(b"Content-Type: application/octet-stream")
    parts.append(b"")
    body = crlf.join(parts) + crlf + audio_bytes + crlf + f"--{boundary}--".encode() + crlf
    return body, boundary


def _request(audio_bytes: bytes, filename: str, definition: dict, key: str, reg: str) -> dict:
    url = (f"https://{reg}.api.cognitive.microsoft.com"
           f"/speechtotext/transcriptions:transcribe?api-version={_API_VERSION}")
    body, boundary = _multipart(audio_bytes, filename, definition)
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
            "User-Agent": "video-yt/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:300]
        if exc.code in (401, 403):
            raise RuntimeError("Azure rechazó la clave/región de Speech (401/403). Revísalas.") from exc
        if exc.code == 429:
            raise RuntimeError("Azure Speech: límite de peticiones alcanzado (429). Espera y reintenta.") from exc
        if exc.code == 400:
            raise RuntimeError(f"Azure Speech rechazó la petición (400): {detail}") from exc
        raise RuntimeError(f"Azure Speech falló ({exc.code}): {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"No se pudo conectar con Azure Speech: {exc.reason}") from exc


def normalize(payload: dict) -> dict:
    """Convierte la respuesta de Fast Transcription al dict de whisper.

    Función PURA (sin red): testeable con un JSON de ejemplo. Tolera campos que
    falten (``words`` puede no venir).
    """
    payload = payload or {}
    phrases = payload.get("phrases") or []
    segments: list[dict] = []
    lang = ""
    for ph in phrases:
        off = float(ph.get("offsetMilliseconds") or 0) / 1000.0
        dur = float(ph.get("durationMilliseconds") or 0) / 1000.0
        text = (ph.get("text") or "").strip()
        if not text:
            continue
        if not lang and ph.get("locale"):
            lang = str(ph["locale"]).split("-")[0]
        conf = ph.get("confidence")
        words = []
        for w in ph.get("words") or []:
            wt = (w.get("text") or "").strip()
            if not wt:
                continue
            ws = float(w.get("offsetMilliseconds") or 0) / 1000.0
            wd = float(w.get("durationMilliseconds") or 0) / 1000.0
            item = {"text": wt, "start": round(ws, 2), "end": round(ws + wd, 2)}
            if conf is not None:
                item["prob"] = round(float(conf), 3)
            words.append(item)
        segments.append({
            "start": round(off, 2),
            "end": round(off + dur, 2),
            "text": text,
            "words": words,
        })
    duration = float(payload.get("durationMilliseconds") or 0) / 1000.0
    if not duration and segments:
        duration = segments[-1]["end"]
    return {"language": lang or None, "duration": round(duration, 1), "segments": segments}


def run_file(path: str, model: Optional[str], language: Optional[str],
             on_progress: ProgressCb) -> dict:
    """Transcribe un archivo local con Azure. ``model`` se ignora (Azure elige el
    suyo); la firma imita a ``transcribe.run_file`` para que los jobs sean iguales."""
    reason = unavailable_reason()
    if reason:
        raise RuntimeError(reason)
    src = Path(path)
    if not src.exists():
        raise RuntimeError("No se encuentra el archivo de audio.")

    on_progress(0.1, "Preparando el audio…")
    wav = _transcode_wav(src)
    try:
        on_progress(0.3, "Enviando a Azure Speech…")
        definition = {"locales": _locales_for(language), "profanityFilterMode": "None"}
        payload = _request(wav.read_bytes(), wav.name, definition, api_key(), region())
    finally:
        try:
            wav.unlink()
        except OSError:
            pass
    on_progress(0.9, "Procesando la transcripción…")
    result = normalize(payload)
    on_progress(1.0, f"Transcripción lista ({len(result['segments'])} frases).")
    return result
