"""Gestión de dónde se guardan los archivos de cada proyecto.

Cada proyecto puede tener una carpeta base (elegida por el usuario). Dentro se
crean dos subcarpetas: ``video/`` y ``audio/``. Si el proyecto no tiene carpeta
asignada, se usa ``backend/clips/<project_id>/`` por defecto.

Como la carpeta puede estar en cualquier ruta del disco, los archivos no se
sirven con un montaje estático fijo sino con un endpoint (/api/media/...).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from . import config


def default_base(project_id: str) -> Path:
    return config.OUTPUT_DIR / project_id


def project_base(project) -> Path:
    """Carpeta base del proyecto (la elegida por el usuario o la de por defecto)."""
    if getattr(project, "folder", None):
        return Path(project.folder)
    return default_base(project.id)


def ensure_dirs(base: Path) -> Path:
    """Crea la carpeta base y sus subcarpetas video/, audio/ e image/."""
    (base / "video").mkdir(parents=True, exist_ok=True)
    (base / "audio").mkdir(parents=True, exist_ok=True)
    (base / "image").mkdir(parents=True, exist_ok=True)
    return base


def safe_name(title: str, maxlen: int = 60) -> str:
    """Convierte un título de vídeo en un nombre de archivo válido."""
    s = re.sub(r'[<>:"/\\|?*\n\r\t]+', "", title or "").strip()
    s = re.sub(r"\s+", " ", s)
    s = s[:maxlen].strip()
    return s or "video"


def resolve_media(project, kind: str, filename: str) -> Path | None:
    """Ruta segura de un archivo dentro de video/, audio/ o image/ del proyecto.

    Devuelve None si el tipo no es válido o si se intenta salir de la carpeta.
    """
    if kind not in ("video", "audio", "image"):
        return None
    base = project_base(project).resolve()
    target = (base / kind / filename).resolve()
    if base not in target.parents:
        return None
    return target


def library_root() -> Path:
    root = config.DATA_DIR / "library"
    (root / "audio").mkdir(parents=True, exist_ok=True)
    (root / "video").mkdir(parents=True, exist_ok=True)
    (root / "image").mkdir(parents=True, exist_ok=True)
    return root


def resolve_library_media(kind: str, filename: str) -> Path | None:
    """Ruta segura bajo data/library/audio|video|image. None si el tipo es inválido o hay traversal."""
    if kind not in ("video", "audio", "image") or not filename:
        return None
    folder = (config.DATA_DIR / "library" / kind).resolve()
    target = (folder / filename).resolve()
    if target.parent != folder:
        return None
    return target


def pick_folder() -> str | None:
    """Abre un diálogo nativo de "seleccionar carpeta" en la máquina local.

    Se ejecuta en un subproceso aparte para no interferir con el servidor.
    Devuelve la ruta elegida, o None si se cancela / falla.
    Solo funciona en local (el backend corre en el mismo equipo que el usuario).
    """
    code = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "r = tk.Tk(); r.withdraw(); r.attributes('-topmost', True)\n"
        "p = filedialog.askdirectory(title='Elige la carpeta del proyecto')\n"
        "print(p or '')\n"
    )
    try:
        res = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True, text=True, timeout=120,
        )
        path = (res.stdout or "").strip()
        return path or None
    except Exception:
        return None
