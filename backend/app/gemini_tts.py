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
# Baja para que la entrega no derive de tono a mitad de la narración.
TEMPERATURE = 0.55

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


# Catálogo de estilos de narración. El ``id`` viaja tal cual desde el frontend
# (y por el MCP), la ``label`` se muestra en el selector, y ``instr`` es la
# instrucción de carácter que se inyecta en el prompt.
STYLES = [
    {
        "id": "documentary",
        "label": "Documental",
        "instr": (
            "Léelo como un narrador profesional de documentales: voz adulta, "
            "misteriosa y seria, ritmo pausado, énfasis ligero en las palabras "
            "clave y un sonido cinematográfico. Natural, nunca exagerado."
        ),
    },
    {
        "id": "close",
        "label": "Cercano",
        "instr": (
            "Cuéntalo como una persona real y cercana, como si se lo contaras a "
            "un amigo. Natural y con curiosidad, nada de tono de enciclopedia ni "
            "de documental. Ritmo vivo y pausas naturales, sin exagerar."
        ),
    },
    {
        "id": "fun",
        "label": "Divertido",
        "instr": (
            "Cuéntalo con energía y buen humor, con chispa y una sonrisa en la "
            "voz, como quien disfruta lo que dice. Dinámico y juguetón, pero sin "
            "gritar ni sonar de payaso."
        ),
    },
    {
        "id": "friendly",
        "label": "Amigable",
        "instr": (
            "Cuéntalo con calidez y cercanía, con un tono amable y acogedor, "
            "como alguien de confianza que te explica algo con cariño. Relajado, "
            "positivo y tranquilo."
        ),
    },
    {
        "id": "mysterious",
        "label": "Misterioso",
        "instr": (
            "Cuéntalo con aire de misterio e intriga: voz baja y envolvente, "
            "ritmo lento y pausas que crean suspense, como si revelaras un "
            "secreto. Sugerente, sin caer en el susurro teatral."
        ),
    },
    {
        "id": "curiosity",
        "label": "Curiosidad",
        "instr": (
            "Cuéntalo como quien comparte un dato curioso y fascinante que acaba "
            "de descubrir, con asombro contenido y ganas de sorprender. Cercano "
            "y enganchador, invitando a seguir escuchando."
        ),
    },
    {
        "id": "energetic",
        "label": "Enérgico",
        "instr": (
            "Cuéntalo con mucha energía y entusiasmo, ritmo ágil y voz que "
            "engancha desde la primera palabra, como una intro que no deja "
            "cambiar de vídeo. Vibrante pero claro, sin atropellarte."
        ),
    },
    {
        "id": "calm",
        "label": "Tranquilo",
        "instr": (
            "Cuéntalo con calma y serenidad, voz suave y relajante, ritmo "
            "pausado y respiración tranquila, como una narración para relajar. "
            "Íntimo y sereno."
        ),
    },
]

_STYLE_BY_ID = {s["id"]: s for s in STYLES}
# Alias por compatibilidad con valores antiguos o en español.
_STYLE_ALIASES = {
    "documental": "documentary",
    "cercano": "close",
    "divertido": "fun",
    "amigable": "friendly",
    "misterioso": "mysterious",
    "curiosidad": "curiosity",
    "enérgico": "energetic",
    "energico": "energetic",
    "tranquilo": "calm",
}


def resolve_style(style: str | None) -> dict:
    """Devuelve la definición de estilo (por id o alias); documental por defecto."""
    key = (style or "").strip().lower()
    key = _STYLE_ALIASES.get(key, key)
    return _STYLE_BY_ID.get(key) or _STYLE_BY_ID["documentary"]


def narration_prompt(text: str, style: str | None = None, speed: float = 1.0) -> str:
    body = (text or "").strip()
    spec = resolve_style(style)
    prompt = (
        "Narra el siguiente texto en español.\n\n"
        f"Estilo: {spec['instr']}\n\n"
        "Muy importante: mantén exactamente el mismo tono, la misma energía y el "
        "mismo carácter desde la primera hasta la última palabra. No cambies de "
        "estilo ni subas o bajes la intensidad a mitad de la narración; la voz "
        "debe sonar coherente y uniforme de principio a fin.\n"
    )
    if speed >= 1.15:
        prompt += "\nHabla un poco más rápido, sin atropellar."
    elif speed <= 0.85:
        prompt += "\nHabla más despacio, con pausas claras."
    prompt += f"\n\nTexto:\n{body}"
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
            temperature=TEMPERATURE,
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
