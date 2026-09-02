"""Migración del JSON del timeline entre versiones de schema.

Reglas:
  * **Forward-only**: solo se sube de versión, nunca se baja.
  * **Idempotente**: migrar algo ya al día no lo cambia.
  * **No destructiva**: los proyectos viejos nunca se rompen; los campos nuevos
    los rellenan los modelos Pydantic por defecto, así que la mayoría de pasos
    son aditivos.

Para introducir la versión N+1: sube ``CURRENT_SCHEMA_VERSION``, añade una
función ``_vN_to_vN1(tl) -> dict`` y regístrala en ``MIGRATIONS[N]``. El default
de ``Timeline.schema_version`` (en ``schemas.py``) debe coincidir con
``CURRENT_SCHEMA_VERSION`` (hay un test que lo garantiza).
"""
from __future__ import annotations

from .text_role import resolve_text_role

CURRENT_SCHEMA_VERSION = 4


def _v1_to_v2(tl: dict) -> dict:
    """v1 → v2: introduce timing real por palabra en las transcripciones y
    sienta la base del modelo de texto. Es puramente aditivo (``words[]``,
    campos nuevos con default), así que aquí no hay que reescribir nada:
    solo se sella la versión. Los pasos con reestructuración real vendrán en
    versiones siguientes y tendrán su sitio aquí.
    """
    return tl


def _v2_to_v3(tl: dict) -> dict:
    out = dict(tl)
    clips = []
    for c in tl.get("clips") or []:
        if not isinstance(c, dict) or c.get("kind") != "text":
            clips.append(c)
            continue
        cc = dict(c)
        cc["text_role"] = resolve_text_role(c)
        clips.append(cc)
    out["clips"] = clips
    return out


def _v3_to_v4(tl: dict) -> dict:
    """v3 → v4: el preview conserva el tono al acelerar (preservesPitch).
    ``keep_pitch: false`` en clips viejos no se aplicaba al editor y el export
    sonaba a ardilla. Se alinea a True (atempo), igual que el Resultado.
    """
    out = dict(tl)
    clips = []
    for c in tl.get("clips") or []:
        if not isinstance(c, dict):
            clips.append(c)
            continue
        cc = dict(c)
        if cc.get("keep_pitch") is False:
            cc["keep_pitch"] = True
        clips.append(cc)
    out["clips"] = clips
    return out


# from_version -> paso que lleva a from_version + 1
MIGRATIONS = {1: _v1_to_v2, 2: _v2_to_v3, 3: _v3_to_v4}


def timeline_version(tl: dict | None) -> int:
    """Versión declarada del timeline. Ausente o inválida = 1 (legacy)."""
    v = (tl or {}).get("schema_version") if isinstance(tl, dict) else None
    return v if isinstance(v, int) and v > 0 else 1


def migrate_timeline(tl):
    """Lleva un timeline (dict) a ``CURRENT_SCHEMA_VERSION``.

    Devuelve la entrada tal cual si es ``None``/vacía o si ya está en una
    versión igual o más nueva (no se degrada). No muta la entrada.
    """
    if not isinstance(tl, dict) or not tl:
        return tl
    v = timeline_version(tl)
    if v >= CURRENT_SCHEMA_VERSION:
        return tl
    out = dict(tl)
    while v < CURRENT_SCHEMA_VERSION and v in MIGRATIONS:
        out = MIGRATIONS[v](out)
        v += 1
    out["schema_version"] = v
    return out
