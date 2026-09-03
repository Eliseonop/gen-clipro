"""Modelo de transcripción por defecto (Configuración del editor)."""
from __future__ import annotations

# De más rápido / menos preciso a más lento / más preciso.
MODELS = ("tiny", "base", "small", "medium", "large-v3")
DEFAULT = {"model": "base"}

MODEL_INFO = (
    {"id": "tiny", "label": "Tiny", "hint": "Más rápido, menos preciso (~75 MB)"},
    {"id": "base", "label": "Base", "hint": "Equilibrio velocidad / calidad (~140 MB)"},
    {"id": "small", "label": "Small", "hint": "Mejor precisión, un poco más lento (~460 MB)"},
    {"id": "medium", "label": "Medium", "hint": "Alta precisión, más lento (~1.5 GB)"},
    {"id": "large-v3", "label": "Large v3", "hint": "Máxima precisión (~3 GB)"},
)


def normalize(raw) -> dict:
    data = raw if isinstance(raw, dict) else {}
    model = data.get("model") or DEFAULT["model"]
    if model not in MODELS:
        model = DEFAULT["model"]
    return {"model": model}


def load() -> dict:
    from . import settings
    return normalize((settings.load() or {}).get("transcribe"))


def resolve(requested=None) -> str:
    """Usa el modelo pedido si es válido; si no, el guardado en ajustes."""
    if isinstance(requested, str) and requested in MODELS:
        return requested
    return load()["model"]


def public_view(raw=None) -> dict:
    cfg = normalize(raw if raw is not None else (load()))
    return {**cfg, "models": [dict(m) for m in MODEL_INFO]}
