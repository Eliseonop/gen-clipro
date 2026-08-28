"""Configuración central del proyecto.

Todos los valores por defecto viven aquí para poder ajustarlos en un solo
sitio (o, más adelante, sobreescribirlos desde variables de entorno).
"""
from __future__ import annotations

from pathlib import Path

# Raíz del backend (…/backend)
BASE_DIR = Path(__file__).resolve().parent.parent

# Carpeta donde se guardan los clips generados. Se sirve como estático.
# Los clips se organizan en subcarpetas por proyecto: clips/<project_id>/...
OUTPUT_DIR = BASE_DIR / "clips"
OUTPUT_DIR.mkdir(exist_ok=True)

# Carpeta de datos persistentes (proyectos, y en el futuro config de audio).
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
PROJECTS_FILE = DATA_DIR / "projects.json"

# --- Valores por defecto del recorte -------------------------------------
DEFAULTS = {
    "min_score": 0.40,     # umbral del heatmap (0.0 - 1.0)
    "max_clips": 10,       # nº máximo de clips por vídeo
    "max_duration": 60,    # duración máxima de cada clip (segundos)
    "padding": 10,         # segundos añadidos antes y después de cada tramo
}

# --- Formato de salida (vertical 9:16) -----------------------------------
OUTPUT_WIDTH = 720
OUTPUT_HEIGHT = 1280
TOP_HEIGHT = 960       # alto de la parte superior en modo split
BOTTOM_HEIGHT = 320    # alto de la parte inferior (facecam) en modo split

# Ajustes de codificación de FFmpeg
VIDEO_CRF = 26
VIDEO_PRESET = "veryfast"
AUDIO_BITRATE = "128k"
