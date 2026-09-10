"""Capa de abstracción del motor de render (spec §6).

La UI y el servicio hablan con ``RendererAdapter``, nunca con HyperFrames/
Playwright directamente. Así el motor concreto es intercambiable.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

from ..models import MotionComposition

ProgressCb = Callable[[float, str], None]


@dataclass
class RenderResult:
    path: Path
    frames: int
    width: int
    height: int
    fps: int
    has_alpha: bool


class RendererAdapter(Protocol):
    def available(self) -> tuple[bool, str]:
        """(ok, motivo). ok=False si falta el motor/navegador; motivo explica."""
        ...

    def render(self, comp: MotionComposition, out_path: Path,
               on_progress: ProgressCb) -> RenderResult:
        ...


def get_renderer() -> RendererAdapter:
    """Devuelve el motor por defecto (HyperFrames sobre Playwright)."""
    from .hyperframes import HyperFramesRenderer
    return HyperFramesRenderer()
