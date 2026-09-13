"""Configuración central del proyecto.

Todos los valores por defecto viven aquí para poder ajustarlos en un solo
sitio (o, más adelante, sobreescribirlos desde variables de entorno).
"""
from __future__ import annotations

import os
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

# Recursos locales del programa (fuera de Git): cada instalación trae los suyos.
# Copiar esta carpeta a otra máquina basta para llevárselos. ``VIDEO_YT_ASSETS``
# permite apuntar a otra ubicación sin tocar el código.
#   assets/sfx_library/  biblioteca de efectos de sonido (sfx_library.json)
#   assets/alfnum/       letras recortadas para Paper Animator (catalog.json)
ASSETS_DIR = Path(os.environ.get("VIDEO_YT_ASSETS") or BASE_DIR.parent / "assets")
SFX_DIR = ASSETS_DIR / "sfx_library"
LETTERS_DIR = ASSETS_DIR / "alfnum"

# --- Formato de salida (vertical 9:16) -----------------------------------
OUTPUT_WIDTH = 720
OUTPUT_HEIGHT = 1280
TOP_HEIGHT = 960       # alto de la parte superior en modo split

# Ajustes de codificación de FFmpeg
VIDEO_CRF = 26
VIDEO_PRESET = "veryfast"
AUDIO_BITRATE = "128k"
