"""Narrador TTS con Gemini (audio cinematográfico, estilo por prompt).

Usa el modelo TTS de Gemini. La clave se lee de ``GEMINI_API_KEY`` /
``GOOGLE_API_KEY`` o de ``settings.gemini_api_key``.
"""
from __future__ import annotations

import base64
import os
import wave
from pathlib import Path
from typing import Callable

from . import settings

ProgressCb = Callable[[float, str], None]

MODEL = "gemini-3.1-flash-tts-preview"
SAMPLE_RATE = 24000

VOICES = [
    {"id": "Kore", "label": "Kore — mujer, firme", "gender": "female"},
    {"id": "Charon", "label": "Charon — hombre, informativo", "gender": "male"},
    {"id": "Puck", "label": "Puck — hombre, animado", "gender": "male"},
    {"id": "Fenrir", "label": "Fenrir — hombre, expresivo", "gender": "male"},
    {"id": "Aoede", "label": "Aoede — mujer, ligera", "gender": "female"},
    {"id": "Gacrux", "label": "Gacrux — mujer, madura", "gender": "female"},
    {"id": "Sulafat", "label": "Sulafat — mujer, cálida", "gender": "female"},
    {"id": "Achird", "label": "Achird — hombre, amistoso", "gender": "male"},
    {"id": "Enceladus", "label": "Enceladus — hombre, susurrado", "gender": "male"},
    {"id": "Alnilam", "label": "Alnilam — hombre, firme", "gender": "male"},
]


def api_key() -> str:
    env = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if env:
        return env
    data = settings.load() or {}
    keys = data.get("api_keys") if isinstance(data.get("api_keys"), dict) else {}
    return str(keys.get("gemini") or data.get("gemini_api_key") or "").strip()


def unavailable_reason() -> str | None:
    if not api_key():
        return "Falta la API key de Gemini. Pégala aquí o define GEMINI_API_KEY."
    try:
        import google.genai  # noqa: F401
    except ImportError:
        return "Falta el paquete google-genai (pip install google-genai)."
    return None


def available() -> bool:
    return unavailable_reason() is None


def narration_prompt(text: str, style: str | None = None, speed: float = 1.0) -> str:
    body = (text or "").strip()
    close = (style or "").strip().lower() in ("close", "cercano")
    if close:
        prompt = (
            "Narra el siguiente texto en español como una persona real, cercana y curiosa, "
            "como si se lo contaras a un amigo. Natural, no de documental ni de enciclopedia. "
            "Ritmo vivo, pausas naturales, sin exagerar.\n\n"
            f"Texto:\n{body}"
        )
    else:
        prompt = (
            "Lee el siguiente texto como narrador profesional de documentales.\n\n"
            "Estilo:\n"
            "- Voz adulta\n"
            "- Misteriosa y seria\n"
            "- Natural, no exagerada\n"
            "- Ritmo pausado\n"
            "- Énfasis ligero en las palabras importantes\n"
            "- Pausas naturales entre frases\n"
            "- Sonido cinematográfico\n\n"
            f"Texto:\n{body}"
        )
    if speed >= 1.15:
        prompt += "\n\nHabla un poco más rápido, sin atropellar."
    elif speed <= 0.85:
        prompt += "\n\nHabla más despacio, con pausas claras."
    return prompt


def _as_bytes(data) -> bytes:
    if data is None:
        raise RuntimeError("Gemini no devolvió audio.")
    if isinstance(data, (bytes, bytearray, memoryview)):
        return bytes(data)
    if isinstance(data, str):
        return base64.b64decode(data)
    raise RuntimeError("Formato de audio de Gemini no reconocido.")


def _write_wav(out_path: Path, blob: bytes, mime: str = "") -> dict:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    raw = _as_bytes(blob)
    mime = (mime or "").lower()
    if raw[:4] == b"RIFF" or "wav" in mime:
        out_path.write_bytes(raw)
    else:
        with wave.open(str(out_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(raw)
    with wave.open(str(out_path), "rb") as wf:
        sr = wf.getframerate() or SAMPLE_RATE
        duration = round(wf.getnframes() / sr, 2)
    return {"duration": duration, "sample_rate": sr}


def _generate_pcm(prompt: str, voice: str, key: str) -> tuple[bytes, str]:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=key)
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice or "Kore"),
                ),
            ),
        ),
    )
    try:
        part = response.candidates[0].content.parts[0]
        inline = part.inline_data
        mime = getattr(inline, "mime_type", "") or ""
        return _as_bytes(inline.data), mime
    except (AttributeError, IndexError, TypeError) as exc:
        raise RuntimeError("Gemini no devolvió audio.") from exc


def run(
    text: str,
    voice: str,
    speed: float,
    out_path: Path,
    on_progress: ProgressCb,
    style: str | None = None,
    **_ignored,
) -> dict:
    """Genera el WAV en ``out_path``. Devuelve {duration, sample_rate}."""
    reason = unavailable_reason()
    if reason:
        raise RuntimeError(reason)
    prompt = narration_prompt(text, style=style, speed=speed)
    on_progress(0.15, "Enviando a Gemini…")
    pcm, mime = _generate_pcm(prompt, voice, api_key())
    on_progress(0.9, "Guardando audio…")
    info = _write_wav(Path(out_path), pcm, mime)
    on_progress(1.0, f"Audio generado ({info['duration']}s).")
    return info
