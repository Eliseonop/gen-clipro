"""Estilos y presets del generador de subtítulos.

Un preset es un JSON en ``presets/`` (junto a este módulo). El estilo efectivo se
resuelve una sola vez:

    estilo_efectivo = DEFAULT_STYLE  <-  preset.style  <-  overrides_usuario

Las claves coinciden con las que entiende el motor Fusion.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

# Estilo base (todas las claves que el motor conoce).
DEFAULT_STYLE: dict = {
    "font": "Open Sans",
    "font_style": "Bold",       # nombre de estilo de fuente para Text+ (Bold/Regular…)
    "size": 0.09,               # fracción de la altura del frame
    "bold": True,
    "italic": False,
    "color": "#FFFFFF",         # color base del texto
    "highlight_color": "#FFE44D",  # color de la palabra activa (karaoke)
    "border_color": "#000000",
    "border_width": 6,
    "shadow": True,
    "shadow_color": "#000000",
    "glow": False,
    "bg": "none",               # "none" o "#RRGGBB"
    "bg_opacity": 0.55,
    "x": 0.5,                   # 0=izq, 1=der
    "y": 0.82,                  # 0=arriba, 1=abajo
    "align": "center",          # left | center | right
    "w": 0.9,                   # ancho de caja (fracción) para el wrap
    "word_gap": 0.05,           # hueco entre palabras (X normalizada) en el layout
    "opacity": 1.0,
    "active_opacity": 1.0,
    "inactive_opacity": 0.65,
    "rotation": 0.0,
    "scale": 1.0,
}

# Animación base.
DEFAULT_ANIMATION: dict = {
    "word_fx": ["pop"],                 # pop | karaoke | highlight | bounce | typewriter | glow
    "pop_scale": [0.8, 1.15, 1.0],      # escala del pop (inicio, pico, reposo)
    "duration": 0.18,                   # duración del efecto por palabra (s)
    "bounce_height": 0.03,              # desplazamiento vertical del bounce (fracción)
    "block_appear": "fade",             # none | fade | slide_up | pop
    "mode": "accumulate",               # accumulate | all | typewriter | one
}


def resolve_style(preset: dict | None, overrides: dict | None = None) -> dict:
    st = dict(DEFAULT_STYLE)
    if preset:
        st.update(preset.get("style", {}) or {})
    if overrides:
        st.update(overrides)
    return st


def resolve_animation(preset: dict | None, overrides: dict | None = None) -> dict:
    an = dict(DEFAULT_ANIMATION)
    if preset:
        an.update(preset.get("animation", {}) or {})
    if overrides:
        an.update(overrides)
    # Normaliza word_fx a lista.
    fx = an.get("word_fx")
    if isinstance(fx, str):
        an["word_fx"] = [fx] if fx and fx != "none" else []
    elif not fx:
        an["word_fx"] = []
    return an


def _presets_dir() -> Path:
    # Los presets viven DENTRO del paquete (autocontenido).
    return Path(__file__).resolve().parent / "presets"


@lru_cache(maxsize=1)
def load_presets(dir_str: str | None = None) -> dict:
    """Carga todos los presets de ``presets/`` -> {id: preset_dict}."""
    d = Path(dir_str) if dir_str else _presets_dir()
    out: dict = {}
    if not d.exists():
        return out
    for f in sorted(d.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        pid = data.get("id") or f.stem
        data["id"] = pid
        out[pid] = data
    return out


def get_preset(preset_id: str) -> dict | None:
    return load_presets().get(preset_id)
