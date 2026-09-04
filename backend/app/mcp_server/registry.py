"""Registro de tools + capa de política + auditoría.

Toda tool del MCP se declara con ``@tool(mcp, access=...)``. El decorador:

1. Valida el nivel de acceso (``read`` / ``write`` / ``destructive``).
2. Envuelve la función con auditoría + cronometraje + captura de errores.
   El wrapper usa ``functools.wraps``, que preserva la firma → MCP puede
   introspeccionarla y generar el input-schema de la tool igual que si no
   estuviera envuelta.
3. La registra en el ``MCPServer`` y en un registro interno ``{name: ToolSpec}``
   para inspección y para la política (hoy no bloquea; el punto de control queda
   listo para cuando haya tools de escritura/destructivas).

Convención: la tool declara ``project_id`` como primer parámetro cuando opera
sobre un proyecto; el wrapper lo usa para etiquetar la auditoría.
"""
from __future__ import annotations

import functools
import inspect
import time
from dataclasses import dataclass
from typing import Callable

from mcp_types import ToolAnnotations

from . import audit, help_content

ACCESS_LEVELS = ("read", "write", "destructive")


@dataclass
class ToolSpec:
    name: str
    access: str
    fn: Callable


_registry: dict[str, ToolSpec] = {}


def registered() -> dict[str, ToolSpec]:
    """Vista del registro actual (para inspección/tests)."""
    return dict(_registry)


def reset() -> None:
    """Vacía el registro (solo para tests)."""
    _registry.clear()


def _bound_params(fn: Callable, args, kwargs) -> dict:
    try:
        bound = inspect.signature(fn).bind_partial(*args, **kwargs)
        return dict(bound.arguments)
    except (TypeError, ValueError):
        return dict(kwargs)


def _is_job_dto(result) -> bool:
    return (
        isinstance(result, dict)
        and isinstance(result.get("id"), str)
        and "status" in result
        and "progress" in result
        and "message" in result
    )


def _wrap(name: str, access: str, fn: Callable) -> Callable:
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        params = _bound_params(fn, args, kwargs)
        pid = params.get("project_id")
        if pid is None:
            pid = kwargs.get("project_id")
        if pid is None and args:
            pid = args[0]
        pid = pid if isinstance(pid, str) else None
        param_keys = list(kwargs.keys())
        meta = audit.extract_meta(name, params)
        token = audit.begin(name, access, project_id=pid, meta=meta)
        started = time.perf_counter()
        try:
            result = fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 - se audita y se re-lanza
            audit.finish(
                token,
                status="error",
                ms=(time.perf_counter() - started) * 1000,
                error=f"{type(exc).__name__}: {exc}",
                param_keys=param_keys,
            )
            raise
        extra = {}
        if _is_job_dto(result):
            extra["job_id"] = result["id"]
            extra["job_status"] = result.get("status")
            if (
                name not in ("get_job", "wait_for_job")
                and result.get("status") not in ("done", "error", "cancelled")
            ):
                audit.track_job(
                    result["id"], name, access,
                    project_id=pid, meta={**meta, **extra},
                )
        audit.finish(
            token,
            status="ok",
            ms=(time.perf_counter() - started) * 1000,
            param_keys=param_keys,
            extra_meta=extra or None,
        )
        return result

    return wrapper


def tool(mcp, *, access: str, name: str | None = None) -> Callable:
    """Decorador: registra ``fn`` como tool del MCP con auditoría y política."""
    if access not in ACCESS_LEVELS:
        raise ValueError(f"access inválido: {access!r} (usa {ACCESS_LEVELS})")

    def deco(fn: Callable) -> Callable:
        tool_name = name or fn.__name__
        if tool_name in _registry:
            raise ValueError(f"tool duplicada: {tool_name}")
        wrapped = _wrap(tool_name, access, fn)
        _registry[tool_name] = ToolSpec(tool_name, access, fn)
        # Etiqueta de dominio + hints de acceso: para agrupar en
        # describe_capabilities, para que clientes capaces marquen las
        # destructivas y para el router por intención del agente (Fase 5).
        meta = {"domain": help_content.TOOL_DOMAINS.get(tool_name, "other"), "access": access}
        annotations = ToolAnnotations(
            read_only_hint=(access == "read"),
            destructive_hint=(access == "destructive"),
        )
        mcp.tool(name=tool_name, meta=meta, annotations=annotations)(wrapped)
        # Devuelve el wrapper: llamar la tool (por MCP o directamente) siempre
        # audita. ``_registry[...].fn`` conserva la función original.
        return wrapped

    return deco
