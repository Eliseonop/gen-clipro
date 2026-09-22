"""Capacidades generativas sobre Microsoft Foundry.

Aquí viven los PROMPTS y la NORMALIZACIÓN/VALIDACIÓN de las respuestas de cada
función del editor (mejorar guion, hooks, títulos, descripción, sugerir
recursos, prompts visuales, analizar escena, asistente). El transporte y la
config están en ``foundry`` — así se puede cambiar de modelo/deployment sin
tocar esta lógica.

Reglas:
  - Nunca se modifica el proyecto aquí: solo se DEVUELVE contenido para que el
    usuario decida (Aplicar / Descartar).
  - Cuando una función necesita datos estructurados se pide JSON y se valida; si
    el modelo devuelve JSON inválido se intenta recuperar y, si no, se cae a un
    formato mínimo sin romper el editor.
  - El contexto (guion, selección, idioma, metadata de Vision/Speech) se pasa
    como datos; esta capa complementa Vision/Speech, no los reemplaza.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from . import foundry

log = logging.getLogger("videoyt.foundry_ops")

# Operaciones soportadas por el dispatcher ``run``.
OPS = (
    "improve_script", "generate_hooks", "generate_titles", "generate_description",
    "suggest_resources", "visual_prompt", "analyze_scene", "assistant",
)

_LANG_NAMES = {
    "es": "español", "en": "inglés", "pt": "portugués", "fr": "francés",
    "de": "alemán", "it": "italiano",
}

_IMPROVE_MODES = {
    "improve": "una versión mejorada (más clara y con mejor ritmo, mismo sentido)",
    "shorten": "una versión más corta y directa (sin perder lo esencial)",
    "natural": "una versión que suene más natural y hablada",
    "direct": "una versión más directa y contundente",
}


def _lang_name(code: str | None) -> str:
    code = (code or "es").strip().lower()[:2]
    return _LANG_NAMES.get(code, "español")


def _clip(text: str | None, limit: int = 6000) -> str:
    """Recorta un texto largo para no disparar el coste de tokens."""
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit] + " […]"


def _extract_json(text: str):
    """Extrae el primer objeto/array JSON de un texto (tolerante a ```json``` y
    a texto alrededor). Devuelve el objeto o ``None``."""
    if not text:
        return None
    # Bloque ```json ... ``` si lo hay.
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.DOTALL)
    candidates = []
    if fence:
        candidates.append(fence.group(1).strip())
    candidates.append(text.strip())
    # Primer {...} o [...] equilibrado por búsqueda simple.
    for m in re.finditer(r"[\{\[]", text):
        candidates.append(text[m.start():].strip())
        break
    for cand in candidates:
        try:
            return json.loads(cand)
        except (ValueError, TypeError):
            continue
    return None


def _project_brief(project_id: str | None) -> str:
    """Resumen compacto y seguro del proyecto (nombre + material). Vacío si no hay."""
    if not project_id:
        return ""
    try:
        from . import projects
        p = projects.get_project(project_id)
    except Exception:  # noqa: BLE001 - el contexto es opcional, nunca debe romper
        return ""
    if p is None:
        return ""
    try:
        return (f"proyecto '{p.name}' · material: {len(p.clips)} clips, "
                f"{len(p.audios)} audios, {len(p.images)} imágenes")
    except Exception:  # noqa: BLE001
        return ""


def _context_block(project_id: str | None, context: dict | None) -> str:
    """Construye el bloque de CONTEXTO para el prompt a partir de lo que envía el
    frontend (guion, tema, selección, metadata de Vision/Speech…) + un resumen
    del proyecto. No duplica datos: usa lo que ya existe."""
    ctx = context if isinstance(context, dict) else {}
    parts: list[str] = []
    brief = _project_brief(project_id)
    if brief:
        parts.append(f"- Proyecto: {brief}")
    if ctx.get("topic"):
        parts.append(f"- Tema: {_clip(str(ctx['topic']), 400)}")
    if ctx.get("title"):
        parts.append(f"- Título actual: {_clip(str(ctx['title']), 300)}")
    if ctx.get("script"):
        parts.append(f"- Guion:\n{_clip(str(ctx['script']))}")
    if ctx.get("transcript"):
        parts.append(f"- Transcripción (Azure Speech):\n{_clip(str(ctx['transcript']))}")
    if ctx.get("selected_text"):
        parts.append(f"- Texto seleccionado:\n{_clip(str(ctx['selected_text']), 3000)}")
    if ctx.get("scene"):
        parts.append(f"- Escena/segmento: {_clip(str(ctx['scene']), 2000)}")
    if ctx.get("current_time") is not None:
        parts.append(f"- Posición temporal: {ctx['current_time']}s")
    if ctx.get("duration") is not None:
        parts.append(f"- Duración objetivo del recurso: {ctx['duration']}s")
    # Metadata de Azure Vision de un asset: se REUTILIZA, no se re-analiza.
    vision = ctx.get("vision")
    if isinstance(vision, dict):
        bits = []
        if vision.get("caption"):
            bits.append(f"descripción='{vision['caption']}'")
        tags = [t.get("name") for t in (vision.get("tags") or []) if isinstance(t, dict)]
        if tags:
            bits.append("etiquetas=" + ", ".join(str(t) for t in tags[:12]))
        if vision.get("ocr_text"):
            bits.append(f"texto en imagen='{_clip(vision['ocr_text'], 300)}'")
        if bits:
            parts.append("- Recurso (Azure Vision): " + "; ".join(bits))
    fmt = ctx.get("format")
    if isinstance(fmt, dict) and fmt.get("aspect"):
        parts.append(f"- Formato del vídeo: {fmt.get('aspect')} "
                     f"({fmt.get('width')}x{fmt.get('height')})")
    elif ctx.get("vertical"):
        parts.append("- Formato del vídeo: vertical 9:16")
    return "\n".join(parts)


# --- Operaciones -------------------------------------------------------------

def _base_system(language: str) -> str:
    return (f"Eres un asistente creativo para un editor de vídeo vertical (Shorts/Reels). "
            f"Respondes SIEMPRE en {language}. Eres concreto, útil y no inventas datos "
            f"que no estén en el contexto.")


def improve_script(text: str, *, mode: str = "improve", language: str = "es",
                   project_id: str | None = None, context: dict | None = None) -> dict:
    lang = _lang_name(language)
    mode = mode if mode in _IMPROVE_MODES else "improve"
    what = _IMPROVE_MODES[mode]
    ctx = _context_block(project_id, context)
    source = _clip(text) or _clip((context or {}).get("selected_text")) or _clip((context or {}).get("script"))
    if not source:
        raise foundry.FoundryError("No hay texto que mejorar.", "bad_request")
    prompt = (
        f"Reescribe el siguiente texto como {what}.\n"
        f"Devuelve SOLO el texto reescrito, sin comillas ni explicaciones.\n"
        + (f"\nContexto:\n{ctx}\n" if ctx else "")
        + f"\nTexto:\n{source}"
    )
    res = foundry.complete(prompt, system=_base_system(lang), temperature=0.6, max_tokens=900)
    return {"op": "improve_script", "mode": mode, "result": res["text"],
            "model": res["model"], "usage": res["usage"]}


def generate_hooks(*, language: str = "es", n: int = 3,
                   project_id: str | None = None, context: dict | None = None) -> dict:
    lang = _lang_name(language)
    n = max(1, min(int(n or 3), 8))
    ctx = _context_block(project_id, context)
    prompt = (
        f"Genera {n} hooks (primeras frases que enganchen en los primeros 3 segundos) "
        f"para este vídeo vertical. Variados en tono. No numeres ni añadas comillas.\n"
        f"Devuelve JSON: {{\"hooks\": [\"...\", \"...\"]}}.\n"
        + (f"\nContexto:\n{ctx}" if ctx else "\n(No hay contexto: pide un tema si hace falta.)")
    )
    res = foundry.complete(prompt, system=_base_system(lang), temperature=0.9,
                           max_tokens=500, json_mode=True)
    data = _extract_json(res["text"]) or {}
    hooks = data.get("hooks") if isinstance(data, dict) else None
    if not isinstance(hooks, list):
        # Recuperación: líneas no vacías del texto.
        hooks = [l.strip("-• ").strip() for l in res["text"].splitlines() if l.strip()]
    hooks = [str(h).strip() for h in hooks if str(h).strip()][:n]
    return {"op": "generate_hooks", "hooks": hooks, "model": res["model"], "usage": res["usage"]}


def generate_titles(*, language: str = "es", n: int = 5,
                    project_id: str | None = None, context: dict | None = None) -> dict:
    lang = _lang_name(language)
    n = max(1, min(int(n or 5), 10))
    ctx = _context_block(project_id, context)
    prompt = (
        f"Genera {n} títulos para YouTube/Shorts a partir del contenido real del "
        f"proyecto. Atractivos pero no clickbait engañoso. Cortos.\n"
        f"Devuelve JSON: {{\"titles\": [\"...\"]}}.\n"
        + (f"\nContexto:\n{ctx}" if ctx else "")
    )
    res = foundry.complete(prompt, system=_base_system(lang), temperature=0.8,
                           max_tokens=400, json_mode=True)
    data = _extract_json(res["text"]) or {}
    titles = data.get("titles") if isinstance(data, dict) else None
    if not isinstance(titles, list):
        titles = [l.strip("-•0123456789. ").strip() for l in res["text"].splitlines() if l.strip()]
    titles = [str(t).strip() for t in titles if str(t).strip()][:n]
    return {"op": "generate_titles", "titles": titles, "model": res["model"], "usage": res["usage"]}


def generate_description(*, language: str = "es",
                         project_id: str | None = None, context: dict | None = None) -> dict:
    lang = _lang_name(language)
    ctx = _context_block(project_id, context)
    prompt = (
        "Escribe una descripción para el vídeo (2-4 frases + una línea con 3-5 hashtags "
        "relevantes) usando guion, tema y título si están disponibles.\n"
        "Devuelve SOLO la descripción, sin encabezados.\n"
        + (f"\nContexto:\n{ctx}" if ctx else "")
    )
    res = foundry.complete(prompt, system=_base_system(lang), temperature=0.7, max_tokens=500)
    return {"op": "generate_description", "description": res["text"],
            "model": res["model"], "usage": res["usage"]}


def suggest_resources(*, language: str = "es",
                      project_id: str | None = None, context: dict | None = None) -> dict:
    """Analiza el guion e identifica conceptos visuales → recursos sugeridos."""
    lang = _lang_name(language)
    ctx = _context_block(project_id, context)
    prompt = (
        "Analiza el contenido e identifica los conceptos que se benefician de apoyo "
        "visual. Propón recursos concretos para un vídeo vertical 9:16.\n"
        "Devuelve JSON EXACTO:\n"
        '{"suggestions": [{"type": "image|video|animation|diagram|text|broll", '
        '"title": "...", "description": "...", "duration": 3, "prompt": "...", "reason": "..."}]}\n'
        "- type: uno de esos valores. duration: segundos (número). prompt: listo para "
        "un generador de imagen/vídeo. reason: por qué encaja ahí.\n"
        + (f"\nContexto:\n{ctx}" if ctx else "")
    )
    res = foundry.complete(prompt, system=_base_system(lang), temperature=0.7,
                           max_tokens=1200, json_mode=True)
    data = _extract_json(res["text"])
    suggestions = []
    raw = (data.get("suggestions") if isinstance(data, dict) else data) or []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            suggestions.append(_normalize_suggestion(item))
    return {"op": "suggest_resources", "suggestions": suggestions,
            "model": res["model"], "usage": res["usage"]}


_SUGGESTION_TYPES = {"image", "video", "animation", "diagram", "text", "broll"}


def _normalize_suggestion(item: dict) -> dict:
    """Valida/normaliza una sugerencia contra un esquema estable."""
    t = str(item.get("type") or "").strip().lower()
    if t not in _SUGGESTION_TYPES:
        t = "image"
    try:
        dur = float(item.get("duration"))
    except (TypeError, ValueError):
        dur = 3.0
    return {
        "type": t,
        "title": str(item.get("title") or "").strip(),
        "description": str(item.get("description") or "").strip(),
        "duration": round(max(0.5, min(dur, 60.0)), 2),
        "prompt": str(item.get("prompt") or "").strip(),
        "reason": str(item.get("reason") or "").strip(),
    }


def visual_prompt(*, language: str = "es",
                  project_id: str | None = None, context: dict | None = None) -> dict:
    """Prompt de imagen + prompt de vídeo para el segmento seleccionado."""
    lang = _lang_name(language)
    ctx = _context_block(project_id, context)
    vertical = True
    if isinstance(context, dict):
        fmt = context.get("format")
        if isinstance(fmt, dict) and fmt.get("aspect"):
            vertical = str(fmt["aspect"]).replace(" ", "") in ("9:16", "9x16")
        elif context.get("vertical") is False:
            vertical = False
    ar = "9:16 (vertical)" if vertical else "16:9"
    prompt = (
        "Crea prompts visuales para este segmento del vídeo. Deben conectar con el "
        f"guion, el estilo y la posición temporal, y respetar la relación de aspecto {ar}. "
        "Deja el tercio inferior más despejado por los subtítulos.\n"
        "Devuelve JSON: {\"image_prompt\": \"...\", \"video_prompt\": \"...\", "
        f'"aspect": "{ "9:16" if vertical else "16:9" }", "negative_prompt": "..."}}.\n'
        "Los prompts, en inglés y detallados (sujeto, estilo, luz, composición, cámara).\n"
        + (f"\nContexto:\n{ctx}" if ctx else "")
    )
    res = foundry.complete(prompt, system=_base_system(lang), temperature=0.7,
                           max_tokens=600, json_mode=True)
    data = _extract_json(res["text"]) or {}
    if not isinstance(data, dict):
        data = {}
    return {
        "op": "visual_prompt",
        "image_prompt": str(data.get("image_prompt") or "").strip(),
        "video_prompt": str(data.get("video_prompt") or "").strip(),
        "negative_prompt": str(data.get("negative_prompt") or "").strip(),
        "aspect": "9:16" if vertical else "16:9",
        "model": res["model"], "usage": res["usage"],
    }


def analyze_scene(*, language: str = "es",
                  project_id: str | None = None, context: dict | None = None) -> dict:
    lang = _lang_name(language)
    ctx = _context_block(project_id, context)
    prompt = (
        "Analiza la escena/segmento/asset seleccionado. NO propongas cambios en la "
        "timeline; solo describe y sugiere.\n"
        "Devuelve JSON: {\"summary\": \"...\", \"concept\": \"...\", \"intent\": \"...\", "
        "\"resources\": [\"...\"], \"edits\": [\"...\"], \"improvements\": [\"...\"]}.\n"
        + (f"\nContexto:\n{ctx}" if ctx else "")
    )
    res = foundry.complete(prompt, system=_base_system(lang), temperature=0.5,
                           max_tokens=800, json_mode=True)
    data = _extract_json(res["text"]) or {}
    if not isinstance(data, dict):
        data = {"summary": res["text"].strip()}

    def _list(key):
        v = data.get(key)
        return [str(x).strip() for x in v if str(x).strip()] if isinstance(v, list) else []

    return {
        "op": "analyze_scene",
        "summary": str(data.get("summary") or "").strip(),
        "concept": str(data.get("concept") or "").strip(),
        "intent": str(data.get("intent") or "").strip(),
        "resources": _list("resources"),
        "edits": _list("edits"),
        "improvements": _list("improvements"),
        "model": res["model"], "usage": res["usage"],
    }


def assistant(message: str, *, language: str = "es",
              project_id: str | None = None, context: dict | None = None) -> dict:
    """Asistente contextual libre: recibe el contexto del proyecto automáticamente."""
    if not (message or "").strip():
        raise foundry.FoundryError("Escribe una pregunta o instrucción.", "bad_request")
    lang = _lang_name(language)
    ctx = _context_block(project_id, context)
    system = (_base_system(lang) +
              " Ayudas dentro del editor: recursos visuales, resúmenes de escenas, "
              "hooks, reescrituras y prompts. Responde breve y accionable. NO ejecutas "
              "cambios en el proyecto: propones y el usuario decide.")
    user = (f"Contexto del proyecto:\n{ctx}\n\n" if ctx else "") + f"Pregunta:\n{message.strip()}"
    res = foundry.complete(user, system=system, temperature=0.6, max_tokens=900)
    return {"op": "assistant", "text": res["text"], "model": res["model"], "usage": res["usage"]}


# --- Dispatcher --------------------------------------------------------------

def run(op: str, *, text: str | None = None, message: str | None = None,
        mode: str = "improve", language: str = "es", n: int | None = None,
        project_id: str | None = None, context: dict | None = None) -> dict:
    """Punto único de entrada usado por el endpoint genérico."""
    op = (op or "").strip()
    if op == "improve_script":
        return improve_script(text or "", mode=mode, language=language,
                              project_id=project_id, context=context)
    if op == "generate_hooks":
        return generate_hooks(language=language, n=n or 3, project_id=project_id, context=context)
    if op == "generate_titles":
        return generate_titles(language=language, n=n or 5, project_id=project_id, context=context)
    if op == "generate_description":
        return generate_description(language=language, project_id=project_id, context=context)
    if op == "suggest_resources":
        return suggest_resources(language=language, project_id=project_id, context=context)
    if op == "visual_prompt":
        return visual_prompt(language=language, project_id=project_id, context=context)
    if op == "analyze_scene":
        return analyze_scene(language=language, project_id=project_id, context=context)
    if op == "assistant":
        return assistant(message or text or "", language=language,
                         project_id=project_id, context=context)
    raise foundry.FoundryError(f"Operación de IA no soportada: {op!r}.", "bad_request")
