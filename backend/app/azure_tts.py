"""Narrador TTS con Azure Speech (voces neuronales, calidad "CapCut").

Las voces realistas de CapCut son, en gran parte, voces neuronales de Azure
Cognitive Services. Esta es la forma legal y estable de usarlas: con tu propio
recurso de Azure Speech.

Usa la API REST (``.../cognitiveservices/v1``) vía ``urllib`` para no depender
del SDK nativo (que da problemas de wheels en Python 3.14 + Windows, igual que
Piper). Devuelve directamente un WAV (RIFF), así que se escribe tal cual.

Credenciales (clave + región del recurso):
  - clave:   env ``AZURE_SPEECH_KEY`` / ``SPEECH_KEY``  o  settings api_keys["azure"]
  - región:  env ``AZURE_SPEECH_REGION`` / ``SPEECH_REGION``  o  settings["azure_region"]
             (ej. "eastus", "westeurope"). Es el "Location/Region" del recurso.
"""
from __future__ import annotations

import os
import urllib.error
import urllib.request
import wave
from pathlib import Path
from typing import Callable
from xml.sax.saxutils import escape

from . import settings
from .tts import _split_units   # misma división en frases que los demás motores

ProgressCb = Callable[[float, str], None]

SAMPLE_RATE = 24000
_OUTPUT_FORMAT = "riff-24khz-16bit-mono-pcm"

# Voces neuronales en español (locale-Nombre). El ``id`` es el nombre completo
# de la voz de Azure y viaja tal cual a la SSML; la ``label`` se muestra en el
# selector. El locale (xml:lang) se deriva del propio id.
VOICES = [
    # México
    {"id": "es-MX-DaliaNeural", "label": "Dalia — MX, natural", "gender": "female"},
    {"id": "es-MX-JorgeNeural", "label": "Jorge — MX, firme", "gender": "male"},
    {"id": "es-MX-RenataNeural", "label": "Renata — MX, cálida", "gender": "female"},
    {"id": "es-MX-CecilioNeural", "label": "Cecilio — MX, informativo", "gender": "male"},
    {"id": "es-MX-LucianoNeural", "label": "Luciano — MX, serio", "gender": "male"},
    {"id": "es-MX-MarinaNeural", "label": "Marina — MX, clara", "gender": "female"},
    # España
    {"id": "es-ES-ElviraNeural", "label": "Elvira — ES, natural", "gender": "female"},
    {"id": "es-ES-AlvaroNeural", "label": "Álvaro — ES, firme", "gender": "male"},
    {"id": "es-ES-AbrilNeural", "label": "Abril — ES, joven", "gender": "female"},
    {"id": "es-ES-ArnauNeural", "label": "Arnau — ES, cercano", "gender": "male"},
    {"id": "es-ES-TrianaNeural", "label": "Triana — ES, expresiva", "gender": "female"},
    {"id": "es-ES-DarioNeural", "label": "Darío — ES, informativo", "gender": "male"},
    # Argentina
    {"id": "es-AR-ElenaNeural", "label": "Elena — AR, natural", "gender": "female"},
    {"id": "es-AR-TomasNeural", "label": "Tomás — AR, firme", "gender": "male"},
    # Colombia
    {"id": "es-CO-SalomeNeural", "label": "Salomé — CO, cálida", "gender": "female"},
    {"id": "es-CO-GonzaloNeural", "label": "Gonzalo — CO, serio", "gender": "male"},
]

_VOICE_IDS = {v["id"] for v in VOICES}


def api_key() -> str:
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


def unavailable_reason() -> str | None:
    if not api_key():
        return "Falta la clave de Azure Speech. Pégala aquí o define AZURE_SPEECH_KEY."
    if not region():
        return "Falta la región de Azure (ej. eastus). Ponla aquí o define AZURE_SPEECH_REGION."
    return None


def available() -> bool:
    return unavailable_reason() is None


def _locale(voice: str) -> str:
    """'es-MX-DaliaNeural' -> 'es-MX'. Cae a es-ES si el formato es raro."""
    parts = (voice or "").split("-")
    return f"{parts[0]}-{parts[1]}" if len(parts) >= 2 else "es-ES"


def _rate_attr(speed: float) -> str:
    """speed (0.5..1.5) -> rate relativa de SSML, p.ej. '+10%' / '-20%'."""
    pct = int(round((max(0.5, min(2.0, float(speed))) - 1.0) * 100))
    return f"{pct:+d}%"


def _build_ssml(text: str, voice: str, speed: float, pause: float) -> str:
    voice = voice if voice in _VOICE_IDS else VOICES[0]["id"]
    locale = _locale(voice)
    units = _split_units(text)
    brk = f'<break time="{int(max(0.0, pause) * 1000)}ms"/>' if pause > 0 else ""
    body = brk.join(escape(u) for u in units) or escape(text)
    return (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xml:lang="{locale}">'
        f'<voice name="{voice}">'
        f'<prosody rate="{_rate_attr(speed)}">{body}</prosody>'
        '</voice></speak>'
    )


def _synthesize(ssml: str, key: str, reg: str) -> bytes:
    url = f"https://{reg}.tts.speech.microsoft.com/cognitiveservices/v1"
    req = urllib.request.Request(
        url,
        data=ssml.encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": _OUTPUT_FORMAT,
            "User-Agent": "video-yt/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:300]
        if exc.code in (401, 403):
            raise RuntimeError("Azure rechazó la clave/región (401/403). Revísalas.") from exc
        raise RuntimeError(f"Azure TTS falló ({exc.code}): {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"No se pudo conectar con Azure: {exc.reason}") from exc


def _write_wav(out_path: Path, blob: bytes) -> dict:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(blob)
    with wave.open(str(out_path), "rb") as wf:
        sr = wf.getframerate() or SAMPLE_RATE
        duration = round(wf.getnframes() / sr, 2)
    return {"duration": duration, "sample_rate": sr}


def run(
    text: str,
    voice: str,
    speed: float,
    out_path: Path,
    on_progress: ProgressCb,
    pause: float = 0.4,
    **_ignored,   # voice2/blend/style no aplican a Azure; se ignoran
) -> dict:
    """Genera el WAV en ``out_path``. Devuelve {duration, sample_rate}."""
    reason = unavailable_reason()
    if reason:
        raise RuntimeError(reason)
    ssml = _build_ssml(text, voice, speed, pause if pause is not None else 0.4)
    on_progress(0.15, "Enviando a Azure…")
    blob = _synthesize(ssml, api_key(), region())
    if blob[:4] != b"RIFF":
        raise RuntimeError("Azure no devolvió un WAV válido.")
    on_progress(0.9, "Guardando audio…")
    info = _write_wav(Path(out_path), blob)
    on_progress(1.0, f"Audio generado ({info['duration']}s).")
    return info
