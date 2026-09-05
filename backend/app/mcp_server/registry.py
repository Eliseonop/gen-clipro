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
import json
import time
from dataclasses import dataclass
from typing import Callable

from mcp.server.mcpserver.exceptions import ToolError as _SdkToolError
from mcp_types import ToolAnnotations

from . import audit, help_content

ACCESS_LEVELS = ("read", "write", "destructive")

# Códigos de error estructurados (§J del rediseño). Cerrado y corto: el agente
# distingue "corregir y reintentar" de "replantear" de "avisar al humano".
ERROR_CODES = (
    "invalid_parameter",     # valor/forma mal → corregir el param (retryable)
    "resource_not_found",    # clip/track/asset/job inexistente → releer estado
    "operation_not_allowed",  # p. ej. velocidad en texto → usar otra tool
    "configuration_error",   # falta API key / modelo → avisar al humano
    "dependency_error",      # binario/modelo ausente (ffmpeg/whisper/piper) → avisar
    "processing_error",      # fallo interno del job/ffmpeg
    "temporary_error",       # red/timeout → reintentar con backoff
    "job_running",           # acción en curso → wait_for_job y reintentar
)


class MCPError(ValueError):
    """Error de tool con código estructurado (§J).

    Subclase de ``ValueError`` a propósito: las tools se llaman también
    directamente (fuera del MCP) y los tests esperan ``ValueError``. En el camino
    MCP, el wrapper la serializa a un ``ToolError`` del SDK cuyo contenido es el
    JSON ``{"error": {...}}`` (llega al modelo como resultado ``is_error``).

    OJO: no confundir con ``mcp.shared.exceptions.MCPError`` (error de PROTOCOLO
    JSON-RPC). Esta es de dominio y viaja como resultado de tool, no como error de
    protocolo, para que el agente pueda leerla y recuperarse.
    """

    def __init__(self, code: str, message: str, *, hint: str | None = None,
                 retryable: bool = False, param: str | None = None):
        self.code = code
        self.message = message
        self.hint = hint
        self.retryable = retryable
        self.param = param
        super().__init__(message)

    def payload(self) -> dict:
        err: dict = {"code": self.code, "message": self.message, "retryable": self.retryable}
        if self.hint:
            err["hint"] = self.hint
        if self.param:
            err["param"] = self.param
        return {"error": err}


def _classify_value_error(msg: str) -> tuple[str, bool]:
    """Mapea un ValueError "suelto" (p. ej. de timeline_ops) a un código + retryable."""
    m = (msg or "").lower()
    if any(k in m for k in ("no encontrad", "not found", "inexistente", "no existe",
                            "no se encuentra", "ningún", "ninguna", "no se encontr")):
        return "resource_not_found", False
    if any(k in m for k in ("inválid", "invalid", "no válid", "debe ser", "vacío",
                            "vacía", "falta", "desconocid", "no hay")):
        return "invalid_parameter", True
    return "processing_error", False


def _to_tool_error(exc: Exception):
    """Traduce una excepción a un ToolError del SDK con payload estructurado.

    Devuelve ``None`` para un crash inesperado (no ValueError): así el SDK lo
    oculta al cliente y registra la traza en el servidor (comportamiento por
    defecto para bugs reales)."""
    if isinstance(exc, MCPError):
        payload = exc.payload()
    elif isinstance(exc, ValueError):
        code, retryable = _classify_value_error(str(exc))
        payload = {"error": {"code": code, "message": str(exc), "retryable": retryable}}
    else:
        return None
    return _SdkToolError(json.dumps(payload, ensure_ascii=False))


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
            # Camino MCP: serializa el error a un ToolError estructurado (is_error
            # con JSON {"error":{code,…}}). Un crash inesperado (None) se re-lanza
            # tal cual → el SDK lo oculta y registra la traza.
            tool_err = _to_tool_error(exc)
            if tool_err is None:
                raise
            raise tool_err from exc
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
