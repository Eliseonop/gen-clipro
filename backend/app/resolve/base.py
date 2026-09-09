"""Contrato común de integración con Resolve.

Permite añadir el target Studio (scripting API) en el futuro **sin tocar** el
motor, los presets ni la UI: solo se implementa otro ``ResolveTarget``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol

from app.resolve.schemas import Project

ProgressCb = Callable[[float, str], None]


@dataclass
class ExportResult:
    method: str                       # "fusion" | "srt" | "overlay" | "fcpxml" | "studio"
    files: list[str] = field(default_factory=list)
    message: str = ""
    install_hint: str = ""            # cómo usarlo dentro de Resolve


class ResolveTarget(Protocol):
    """Genera recursos que Resolve puede usar a partir del documento interno."""
    name: str

    def export(self, project: Project, out_dir: Path,
               on_progress: ProgressCb | None = None) -> ExportResult: ...
