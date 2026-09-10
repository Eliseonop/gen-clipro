"""Eliminar fondo: proveedores de segmentación y servicio de matte.

``clip_bg`` (en app/) es el modelo ligero y el espejo del JS. Aquí vive lo
pesado: cargar modelos, inferir y mantener la caché en disco.
"""
from __future__ import annotations

from . import providers, service

__all__ = ["providers", "service"]
