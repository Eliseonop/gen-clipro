"""Capacidades descubribles del editor (fuente única para tools + resources).

Fase 2 del rediseño: expone de forma compacta QUÉ dominios existen, qué verbos
hay en cada uno y —lo que antes había que adivinar— los VALORES VÁLIDOS + el
estado (modelos de transcripción, motores/voces TTS y su disponibilidad,
categorías de SFX, formatos…). No incluye JSON-Schemas (para eso está
``tools/list``) ni la guía larga (para eso ``help://<domain>``).

Los enums se toman del código real y deben mantenerse sincronizados cuando cambie
una capacidad (mismo patrón de "catch-up" que ``dto.CAPABILITIES``).
"""
from __future__ import annotations

from ..schemas import CropMode
from . import dto, help_content

# --- Enums de valores válidos (espejo de timeline_ops/clip_anim/clip_fx) ------
ASPECTS = ["9:16", "1:1", "16:9", "4:5", "4:3", "custom"]
MOTIONS = [
    "zoom_in", "zoom_out", "spin", "spin_in", "slide_left", "slide_right",
    "slide_up", "slide_down", "fade_in", "fade_out", "pop", "pulse",
]
TRANSITIONS = [
    "none", "fade", "dissolve", "wipe", "zoom",
    "slide_left", "slide_right", "slide_up", "slide_down", "pop",
]
VISUAL_FX = ["blur", "grayscale", "sepia", "brightness", "contrast", "saturation"]
AUDIO_FX = ["eq", "compressor", "reverb", "echo", "denoise", "distortion"]
LOOKS = ["bw", "cinematic", "vintage", "contrast", "warm", "cool", "saturated"]
POSITIONS = ["full", "top", "bottom", "free"]
REFRAME_MODES = ["center", "manual"]
TEXT_ROLES = ["caption", "free"]
TRACK_KINDS = ["video", "audio", "text"]


def crop_modes() -> list[str]:
    return [m.value for m in CropMode]


def verbs_by_domain() -> dict[str, list[str]]:
    """{dominio: [tools]} a partir del mapa real de help_content.TOOL_DOMAINS."""
    out: dict[str, list[str]] = {}
    for tool, domain in help_content.TOOL_DOMAINS.items():
        out.setdefault(domain, []).append(tool)
    return {d: sorted(v) for d, v in out.items()}


# --- Estado descubrible (modelos, voces, disponibilidad) ----------------------

def transcribe_models() -> list[dict]:
    from .. import transcribe_settings
    default = transcribe_settings.load()["model"]
    return [{**m, "default": m["id"] == default} for m in transcribe_settings.MODEL_INFO]


def tts_engines() -> list[dict]:
    """Motores TTS con su disponibilidad REAL en esta máquina y sus voces."""
    from .. import gemini_tts, piper_tts, tts
    out: list[dict] = []
    try:
        out.append({"id": "kokoro", "available": tts.available(),
                    "voices": [v["id"] for v in tts.VOICES]})
    except Exception:  # noqa: BLE001
        out.append({"id": "kokoro", "available": False, "voices": []})
    try:
        out.append({"id": "piper", "available": piper_tts.available(),
                    "voices": [v["id"] for v in piper_tts.list_voices()]})
    except Exception:  # noqa: BLE001
        out.append({"id": "piper", "available": False, "voices": []})
    try:
        reason = gemini_tts.unavailable_reason()
        out.append({"id": "gemini", "available": reason is None, "reason": reason,
                    "voices": [v["id"] for v in gemini_tts.VOICES]})
    except Exception:  # noqa: BLE001
        out.append({"id": "gemini", "available": False, "voices": []})
    return out


def sfx_categories() -> list[str]:
    from .. import sfx
    try:
        res = sfx.search(q="", category="", limit=1)
        return [c.get("id") for c in res.get("categories", []) if c.get("id")]
    except Exception:  # noqa: BLE001
        return []


# --- Vistas de descubrimiento -------------------------------------------------

def overview() -> dict:
    """Mapa compacto de dominios + verbos + defaults. Sin schemas ni guías largas."""
    vb = verbs_by_domain()
    return {
        "domains": [{"domain": d, "verbs": vb.get(d, [])} for d in sorted(vb)],
        "defaults": {
            "aspect": "9:16",
            "transcribe_model": _transcribe_default(),
            "tts_engines_available": [e["id"] for e in tts_engines() if e.get("available")],
        },
        "hint": (
            "describe_capabilities(domain) para valores válidos y la guía del "
            "dominio; get_project_context(project_id) para el estado del proyecto; "
            "list_projects/resolve_project para elegir proyecto."
        ),
    }


_DOMAIN_VALUES = {
    "transcription": lambda: {
        "models": transcribe_models(),
        "languages": "código ISO (es, en, …) o None = autodetección",
    },
    "audio": lambda: {
        "tts_engines": tts_engines(),
        "audio_fx": AUDIO_FX,
        "sfx_categories": sfx_categories(),
        "volume": "0–2 (1 = 100%)",
        "fade": ["in", "out"],
    },
    "clips": lambda: {
        "motions": MOTIONS,
        "transitions": TRANSITIONS,
        "visual_fx": VISUAL_FX,
        "looks": LOOKS,
        "positions": POSITIONS,
        "reframe_modes": REFRAME_MODES,
        "speed": "0.1–10 (keep_pitch, reverse)",
        "opacity": "0–1",
    },
    "media": lambda: {"crop_modes": crop_modes()},
    "workflow": lambda: {"crop_modes": crop_modes()},
    "project": lambda: {"aspects": ASPECTS},
    "text": lambda: {"roles": TEXT_ROLES},
    "timeline": lambda: {"track_kinds": TRACK_KINDS},
}


def domains() -> list[str]:
    return help_content.domains()


def describe(domain: str) -> dict:
    """Capacidades de UN dominio: verbos, valores válidos y guía. ValueError si no existe."""
    d = (domain or "").strip().lower()
    vb = verbs_by_domain()
    if d not in vb and d not in help_content.HELP:
        raise ValueError(f"Dominio desconocido: {domain}. Válidos: {sorted(set(vb) | set(help_content.HELP))}")
    out = {
        "domain": d,
        "verbs": vb.get(d, []),
        "guide": help_content.guide(d),
    }
    extra = _DOMAIN_VALUES.get(d)
    if extra:
        out["values"] = extra()
    return out


def runtime_info() -> dict:
    """Info de ejecución: GPU, proveedor de IA, binarios, defaults, rutas."""
    import shutil

    from .. import config
    info: dict = {
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "ffprobe": bool(shutil.which("ffprobe")),
        "transcribe_default": _transcribe_default(),
        "tts_engines": tts_engines(),
        "data_dir": str(config.DATA_DIR),
    }
    try:
        from .. import gpu
        info["gpu"] = gpu.summary()
    except Exception:  # noqa: BLE001
        info["gpu"] = None
    try:
        from ..ai import providers
        info["ai_provider"] = providers.ai_config()
    except Exception:  # noqa: BLE001
        info["ai_provider"] = None
    return info


def _transcribe_default() -> str:
    from .. import transcribe_settings
    try:
        return transcribe_settings.load()["model"]
    except Exception:  # noqa: BLE001
        return "base"


# --- Proyectos (para entrada-por-proyecto, §L) --------------------------------

def project_summary(proj) -> dict:
    """Resumen minúsculo de un proyecto para listar/desambiguar."""
    tl = proj.timeline
    w = tl.width if tl else 720
    h = tl.height if tl else 1280
    tld = dto._timeline_dto(tl)
    return {
        "project_id": proj.id,
        "name": proj.name,
        "aspect": dto.aspect_ratio(w, h),
        "duration": tld["duration"],
        "clips": tld["clip_count"],
        "created_at": proj.created_at,
        "folder": proj.folder,
    }
