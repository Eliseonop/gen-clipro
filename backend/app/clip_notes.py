"""Notas de contexto de los clips de la timeline (§5-§8).

Un clip recortado pierde su significado: ver que un vídeo de 30 s usa los
segundos 12–17 no dice QUÉ representa ese trozo en la historia. La nota guarda
justamente eso ("el científico escribe la ecuación"), y viaja al contexto que
recibe la IA cuando se genera un recurso o se diseña una animación.

Aquí solo vive la PROPUESTA automática: la IA lee el guion de ese instante, el
material del que sale el fragmento y lo que hay alrededor, y escribe una frase.
El usuario la edita o la sustituye; guardar la nota es una edición normal de
timeline (``timeline_ops.set_clip_note``), deshacible como cualquier otra.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import AsyncIterator

from .ai.providers import get_provider
from .clip_speed import clip_timeline_duration
from .motion import segment_context

MAX_NOTE_CHARS = 200
NEIGHBOURS = 2          # clips antes/después que se le muestran a la IA
AI_TIMEOUT = 60.0       # s; hay modelos que piensan ~40 s antes del primer token


def _clip_end(c) -> float:
    return float(c.start or 0.0) + clip_timeline_duration(c)


def _material_of(proj, clip) -> dict:
    """Ficha del material del que sale el clip (nombre y descripción del archivo)."""
    kind = clip.kind
    if kind == "video":
        mat = next((m for m in (proj.clips or []) if str(m.index) == str(clip.asset_id)), None)
        if mat:
            # ClipInfo guarda el tramo como start/end del archivo, no una duración.
            return {"label": mat.label or mat.filename,
                    "description": mat.description or mat.description_ai or "",
                    "duration": round(float(mat.end or 0.0) - float(mat.start or 0.0), 2)}
    elif kind == "image":
        mat = next((m for m in (proj.images or []) if str(m.id) == str(clip.asset_id)), None)
        if mat:
            return {"label": mat.label or mat.filename, "description": mat.description or ""}
    elif kind == "motion":
        comp = next((c for c in (proj.motion_compositions or [])
                     if c.get("id") == clip.composition_id), None)
        if comp:
            return {"label": comp.get("name") or "Motion graphic", "description": ""}
    return {"label": clip.name or clip.filename or kind, "description": ""}


def build_context(proj, clip_id: str) -> dict:
    """Todo lo que hace falta para escribir la nota de UN clip."""
    tl = proj.timeline
    clip = next((c for c in (getattr(tl, "clips", None) or []) if c.id == clip_id), None)
    if clip is None:
        raise ValueError(f"Clip no encontrado en la timeline: {clip_id}")
    start, end = float(clip.start or 0.0), _clip_end(clip)
    script = segment_context.script_context(proj, start, end, segment_context.PAD)

    others = sorted((c for c in tl.clips if c.id != clip_id and c.kind != "audio"),
                    key=lambda c: float(c.start or 0.0))
    before = [c for c in others if _clip_end(c) <= start + 1e-3][-NEIGHBOURS:]
    after = [c for c in others if float(c.start or 0.0) >= end - 1e-3][:NEIGHBOURS]

    def brief(c) -> dict:
        row = {"kind": c.kind, "name": (c.text if c.kind == "text" else (c.name or c.filename)),
               "start": round(float(c.start or 0.0), 2)}
        if getattr(c, "note", None):
            row["note"] = c.note
        return row

    return {
        "clipId": clip_id,
        "kind": clip.kind,
        "timeline": {"start": round(start, 2), "end": round(end, 2),
                     "duration": round(end - start, 2)},
        "fragment": {"in": round(float(clip.in_point or 0.0), 2),
                     "out": round(float(clip.out_point or 0.0), 2),
                     "sourceDuration": round(float(clip.source_duration or 0.0), 2)},
        "material": _material_of(proj, clip),
        "scriptContext": script,
        "neighbours": {"before": [brief(c) for c in before], "after": [brief(c) for c in after]},
        "current": clip.note or "",
    }


def _fmt(t: float) -> str:
    t = max(0.0, float(t))
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


SYSTEM = (
    "Escribes la NOTA DE CONTEXTO de un fragmento de una timeline de vídeo. La nota "
    "dice QUÉ REPRESENTA ese fragmento dentro de la historia que se está contando, no "
    "qué archivo es ni qué propiedades técnicas tiene.\n\n"
    "REGLAS:\n"
    "1. UNA frase, en español, máximo 20 palabras.\n"
    "2. Describe el contenido y su papel en el relato: «se muestra al científico "
    "escribiendo las ecuaciones», «aquí se introduce el problema».\n"
    "3. NO repitas el nombre del archivo, ni tiempos, ni duración, ni resolución.\n"
    "4. Si el guion de ese instante lo deja claro, apóyate en él. Si no hay ninguna "
    "señal fiable, di qué se ve de la forma más neutra posible.\n"
    "5. No inventes nombres propios, fechas ni datos que no aparezcan en el contexto.\n\n"
    "Responde SOLO con la frase, sin comillas, sin prefijos y sin explicaciones."
)


def user_prompt(ctx: dict) -> str:
    tlr, frag, mat = ctx["timeline"], ctx["fragment"], ctx["material"]
    sc = ctx.get("scriptContext") or {}
    parts = [
        f"TIPO DE MATERIAL: {ctx['kind']}",
        f"ARCHIVO: {mat.get('label') or '—'}",
    ]
    if mat.get("description"):
        parts.append(f"DESCRIPCIÓN DEL MATERIAL: {mat['description']}")
    parts.append(f"POSICIÓN EN LA TIMELINE: {_fmt(tlr['start'])} → {_fmt(tlr['end'])} "
                 f"({tlr['duration']} s)")
    if frag["sourceDuration"]:
        parts.append(f"FRAGMENTO USADO DE LA FUENTE: {_fmt(frag['in'])} → {_fmt(frag['out'])} "
                     f"de {_fmt(frag['sourceDuration'])} totales")
    parts += [
        "GUION EN ESE MOMENTO:",
        f"  · antes: {sc.get('previous') or '—'}",
        f"  · AHORA: {sc.get('current') or '(nadie habla)'}",
        f"  · después: {sc.get('next') or '—'}",
    ]
    for side, label in (("before", "ANTES"), ("after", "DESPUÉS")):
        rows = ctx["neighbours"][side]
        if rows:
            parts.append(f"MATERIALES {label}:")
            parts += [f"  · {r['kind']}: {r.get('name') or '—'}"
                      + (f" — contexto: {r['note']}" if r.get("note") else "")
                      for r in rows]
    if ctx.get("current"):
        parts.append(f"NOTA ACTUAL (mejórala si puedes): {ctx['current']}")
    parts.append("Escribe la nota de contexto de este fragmento.")
    return "\n".join(parts)


def _clean(text: str) -> str:
    """Una frase limpia: sin comillas, sin prefijos de charla, acotada."""
    t = " ".join((text or "").split())
    for junk in ("Nota:", "Nota de contexto:", "Contexto:", "NOTA:"):
        if t.lower().startswith(junk.lower()):
            t = t[len(junk):].strip()
    t = t.strip(' "“”«»')
    if len(t) > MAX_NOTE_CHARS:
        cut = t[:MAX_NOTE_CHARS]
        t = (cut.rsplit(" ", 1)[0] if " " in cut else cut).rstrip(",;:") + "…"
    return t


# Visto en vivo: algunos proveedores devuelven su veredicto de moderación
# ("User Safety: safe") en vez de la respuesta. Eso nunca es una nota.
_JUNK_RE = re.compile(r"^(user\s+)?(safety|safe|unsafe|moderation)\b|^(ok|n/?a|none|null)\.?$",
                      re.I)


def usable(note: str) -> bool:
    """Una nota sirve si es una frase real (≥3 palabras) y no un veredicto de moderación."""
    t = (note or "").strip()
    return bool(t) and len(t.split()) >= 3 and not _JUNK_RE.search(t)


async def suggest(proj, clip_id: str) -> dict:
    """Propone la nota de un clip. Devuelve ``{note, context}``.

    Si no hay proveedor de IA lo dice en ``degraded`` en vez de fallar: la nota
    se puede escribir a mano igualmente.
    """
    ctx = build_context(proj, clip_id)
    provider = get_provider()
    reason = provider.unavailable_reason()
    if reason:
        return {"note": "", "context": ctx, "degraded": reason}

    captured = {"text": ""}

    async def emit(ev: dict) -> None:
        if ev.get("type") == "text":
            captured["text"] += ev.get("delta", "")

    async def no_tools(name: str, args: dict) -> dict:
        return {"ok": False, "text": "Sin herramientas: responde solo con la frase."}

    try:
        await asyncio.wait_for(
            provider.run(system=SYSTEM, history=[], user_message=user_prompt(ctx),
                         tools=[], call_tool=no_tools, emit=emit, max_iters=1),
            timeout=AI_TIMEOUT)
    except asyncio.TimeoutError:
        return {"note": "", "context": ctx,
                "degraded": "La IA tardó demasiado. Escribe la nota o vuelve a intentarlo."}
    except Exception as exc:  # noqa: BLE001
        return {"note": "", "context": ctx, "degraded": f"Error del modelo: {exc}"}
    note = _clean(captured["text"])
    if not usable(note):
        return {"note": "", "context": ctx,
                "degraded": "La IA no devolvió una nota útil. Escríbela o vuelve a intentarlo."}
    return {"note": note, "context": ctx}


async def suggest_many(proj, clip_ids: list[str]) -> AsyncIterator[dict]:
    """Propone notas para varios clips, emitiendo una por una (SSE)."""
    for cid in clip_ids:
        try:
            out = await suggest(proj, cid)
        except ValueError as exc:
            yield {"type": "error", "clip_id": cid, "message": str(exc)}
            continue
        yield {"type": "note", "clip_id": cid, "note": out["note"],
               **({"degraded": out["degraded"]} if out.get("degraded") else {})}
    yield {"type": "done"}


async def sse_many(proj, clip_ids: list[str]) -> AsyncIterator[str]:
    async for ev in suggest_many(proj, clip_ids):
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
