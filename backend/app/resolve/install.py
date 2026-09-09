"""Instala en Resolve el script interno y la plantilla de Título animado.

- ``ds_import.py`` -> carpeta de Scripts (Workspace > Scripts): monta el timeline.
- ``<name>.setting`` -> carpeta de Templates/Edit/Titles: aparece en Effects > Titles
  como un Título que arrastras a una pista superior para el overlay animado.

Un Fusion Composition/Title es un clip independiente: para hacer de subtítulo hay
que ponerlo en una pista de vídeo ARRIBA y estirarlo sobre el vídeo (su fondo es
transparente). El API no permite colocar/duración por script, por eso lo dejamos
como Título arrastrable.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

_SCRIPT_SRC = Path(__file__).resolve().parent / "resolve_script" / "ds_import.py"


def _fusion_base() -> Path | None:
    """Carpeta base ``…/DaVinci Resolve/…/Fusion`` (Support/Fusion o Fusion), por SO."""
    if sys.platform.startswith("win"):
        appdata = os.environ.get("APPDATA")
        if not appdata:
            return None
        base = Path(appdata) / "Blackmagic Design" / "DaVinci Resolve"
        if (base / "Support" / "Fusion").exists():
            return base / "Support" / "Fusion"
        return base / "Fusion"
    if sys.platform == "darwin":
        return (Path.home() / "Library" / "Application Support" / "Blackmagic Design"
                / "DaVinci Resolve" / "Fusion")
    return Path.home() / ".local" / "share" / "DaVinciResolve" / "Fusion"


def resolve_scripts_dir() -> Path | None:
    base = _fusion_base()
    return (base / "Scripts" / "Edit") if base else None


def resolve_titles_dir() -> Path | None:
    base = _fusion_base()
    return (base / "Templates" / "Edit" / "Titles") if base else None


def install_script(manifest_path: str | None = None) -> dict:
    """Copia ds_import.py a la carpeta de Scripts de Resolve y apunta al manifest."""
    if not _SCRIPT_SRC.exists():
        return {"installed": False, "reason": "No encuentro ds_import.py de origen."}
    d = resolve_scripts_dir()
    if d is None:
        return {"installed": False, "reason": "Sistema operativo no soportado."}
    try:
        d.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(_SCRIPT_SRC, d / "ds_import.py")
        if manifest_path:
            (d / "ds_import_last.json").write_text(
                json.dumps({"manifest": str(manifest_path)}, ensure_ascii=False),
                encoding="utf-8",
            )
        return {
            "installed": True,
            "dir": str(d),
            "script": str(d / "ds_import.py"),
            "run": "En Resolve: Workspace > Scripts > ds_import",
        }
    except Exception as exc:  # noqa: BLE001
        return {"installed": False, "reason": str(exc), "dir": str(d)}


def install_title_template(setting_path: str, name: str = "DynamicSubtitles") -> dict:
    """Copia el .setting a Templates/Edit/Titles para que salga en Effects > Titles."""
    src = Path(setting_path)
    if not src.exists():
        return {"installed": False, "reason": "No encuentro el .setting."}
    d = resolve_titles_dir()
    if d is None:
        return {"installed": False, "reason": "Sistema operativo no soportado."}
    try:
        d.mkdir(parents=True, exist_ok=True)
        dst = d / f"{name}.setting"
        shutil.copyfile(src, dst)
        return {
            "installed": True,
            "dir": str(d),
            "title": name,
            "use": "Effects > Titles > %s → arrástralo a una pista superior y estíralo." % name,
        }
    except Exception as exc:  # noqa: BLE001
        return {"installed": False, "reason": str(exc), "dir": str(d)}
