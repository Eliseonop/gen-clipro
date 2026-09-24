"""Sonorizar una escena con IA (#17, truco «diseño sonoro» de CapCut).

La IA mira la escena (fotogramas si hay Foundry con visión; si no, su contexto de
texto: nota del clip, descripción del material y lo que se dice en ese tramo) y
propone QUÉ debería sonar y CUÁNDO, con palabras clave. El emparejamiento con la
biblioteca de SFX se hace aquí, en local: la IA no inventa archivos, y lo que no
está en la biblioteca se devuelve aparte («falta») para que el usuario lo sepa.

Colocar los sonidos en la timeline es ``timeline_ops.add_sound_design`` (espejo de
``frontend/src/lib/soundDesign.js``).
"""
from __future__ import annotations

import asyncio
import base64
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path
from typing import Any, Callable, Optional

MAX_SOUNDS = 6
FRAME_PX = 512
KINDS = ("ambience", "spot")
DEFAULT_VOLUME = {"ambience": 0.35, "spot": 0.8}
AI_TIMEOUT = 90

SYSTEM = (
    "Eres diseñador de sonido de vídeos cortos (Shorts/Reels). Propones efectos de sonido "
    "(SFX) que hacen la escena más inmersiva: el viento en un paisaje de montaña, un "
    "helicóptero que pasa, el grito de un águila, pasos, un golpe. Respondes SOLO con JSON."
)


# --- Texto --------------------------------------------------------------------------

def norm(text: Any) -> str:
    """Minúsculas, sin tildes y solo letras/números separados por un espacio."""
    s = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def build_prompt(ctx: dict, categories: list[dict], n_frames: int) -> str:
    dur = ctx["duration"]
    lines = [
        f"Proyecto: {ctx.get('project') or '—'}",
        f"Escena: un clip de {dur:.1f} s.",
    ]
    for key, label in (("label", "Material"), ("description", "Descripción"), ("note", "Qué representa"),
                       ("speech", "Lo que se dice en ese momento")):
        if ctx.get(key):
            lines.append(f"{label}: {ctx[key]}")
    if n_frames:
        times = ", ".join(f"{t:.1f} s" for t in ctx.get("frame_times") or [])
        lines.append(f"Te paso {n_frames} fotogramas de la escena (en {times}).")
    cats = "; ".join(f"{c['label']} ({c['uso']})" if c.get("uso") else c["label"] for c in categories)
    lines += [
        "",
        f"Biblioteca de sonidos disponible, por categorías: {cats}.",
        "Los nombres de los archivos están casi todos en INGLÉS: para cada sonido da de 3 a 6 "
        "palabras clave, en inglés y en español (p. ej. wind, viento, breeze, storm).",
        "",
        "Reglas:",
        f"- Como mucho {MAX_SOUNDS} sonidos. Solo lo que se VE o se deduce claramente de la escena.",
        "- kind «ambience»: fondo continuo (viento, lluvia, ciudad), casi siempre toda la escena, "
        "volumen bajo (0.2–0.4). kind «spot»: un sonido puntual en su momento (0.6–1).",
        f"- start y duration en segundos DESDE EL INICIO DEL CLIP (0 a {dur:.1f}).",
        "",
        'Formato: {"sounds": [{"what": "Viento de montaña", "kind": "ambience", '
        '"keywords": ["wind", "viento", "breeze"], "start": 0, "duration": '
        f'{dur:.1f}, "volume": 0.3}}]}}',
    ]
    return "\n".join(lines)


def parse_sounds(text: str, duration: float) -> list[dict]:
    """Respuesta de la IA → sonidos saneados (tiempos dentro del clip, volumen 0–1)."""
    from .foundry_ops import _extract_json

    data = _extract_json(text)
    raw = data.get("sounds") if isinstance(data, dict) else data
    if not isinstance(raw, list):
        raise ValueError("La IA no devolvió una lista de sonidos.")
    out: list[dict] = []
    for s in raw:
        if not isinstance(s, dict):
            continue
        kws = [str(k).strip() for k in (s.get("keywords") or []) if str(k).strip()]
        what = re.sub(r"\s+", " ", str(s.get("what") or "")).strip()[:60]
        if not kws and what:
            kws = [what]
        if not kws:
            continue
        kind = s.get("kind") if s.get("kind") in KINDS else "spot"
        try:
            start = float(s.get("start") or 0)
        except (TypeError, ValueError):
            start = 0.0
        start = min(max(0.0, start), max(0.0, duration - 0.1))
        try:
            dur = float(s.get("duration") or (duration if kind == "ambience" else 1.5))
        except (TypeError, ValueError):
            dur = duration if kind == "ambience" else 1.5
        dur = min(max(0.1, dur), duration - start)
        try:
            vol = float(s.get("volume"))
        except (TypeError, ValueError):
            vol = DEFAULT_VOLUME[kind]
        out.append({"what": what or kws[0], "kind": kind, "keywords": kws[:8],
                    "start": round(start, 3), "duration": round(dur, 3),
                    "volume": round(min(1.0, max(0.05, vol)), 3)})
        if len(out) >= MAX_SOUNDS:
            break
    return out


# --- Emparejar con la biblioteca ------------------------------------------------------

def score_sfx(item: dict, keywords: list[str]) -> float:
    """Cuánto se parece un SFX de la biblioteca a las palabras clave: frase entera en
    el nombre > palabra suelta en el nombre > en su categoría/uso."""
    name = f" {norm(item.get('name'))} "
    meta = f" {norm(item.get('category'))} {norm(item.get('uso'))} {norm(item.get('folder'))} "
    name_tokens = set(name.split())
    score = 0.0
    for kw in keywords:
        k = norm(kw)
        if not k:
            continue
        if f" {k} " in name:
            score += 3
        elif len(k) >= 4 and k in name:
            score += 2
        else:
            toks = [t for t in k.split() if len(t) >= 3]
            if toks and all(t in name_tokens for t in toks):
                score += 2
            elif any(t in name_tokens for t in toks):
                score += 1
        if f" {k} " in meta:
            score += 0.5
    return score


def match_sounds(sounds: list[dict], items: list[dict]) -> tuple[list[dict], list[dict]]:
    """(emparejados, sin sonido en la biblioteca). No repite un mismo SFX."""
    used: set[str] = set()
    matched: list[dict] = []
    missing: list[dict] = []
    for s in sounds:
        ranked = sorted(((score_sfx(it, s["keywords"]), it) for it in items if it.get("id") not in used),
                        key=lambda p: (-p[0], len(str(p[1].get("name") or ""))))
        best = ranked[0] if ranked else (0.0, None)
        if best[1] is None or best[0] < 2:
            missing.append(s)
            continue
        it = best[1]
        used.add(it["id"])
        alts = [{"id": a["id"], "name": a.get("name")} for sc, a in ranked[1:4] if sc >= 2]
        matched.append({**s, "sfx": {"id": it["id"], "name": it.get("name"), "url": it.get("url"),
                                     "category": it.get("category")},
                        "score": best[0], "alternatives": alts})
    return matched, missing


def categories_of(items: list[dict]) -> list[dict]:
    """Categorías de la biblioteca con su «uso» (el del primer sonido que lo tiene)."""
    seen: dict[str, str] = {}
    for it in items:
        cat = str(it.get("category") or it.get("folder") or "").strip()
        if cat and (cat not in seen or (not seen[cat] and it.get("uso"))):
            seen[cat] = str(it.get("uso") or "").strip()
    return [{"label": k, "uso": v} for k, v in seen.items()]


def probe_duration(path: Path) -> float:
    exe = shutil.which("ffprobe")
    if not exe:
        return 0.0
    try:
        r = subprocess.run([exe, "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=nk=1:nw=1", str(path)], capture_output=True, text=True, timeout=10)
        return round(float((r.stdout or "").strip()), 3)
    except Exception:  # noqa: BLE001
        return 0.0


# --- Contexto de la escena -----------------------------------------------------------

def scene_context(proj, clip) -> dict:
    """Lo que se sabe de la escena sin mirarla: material, nota y lo que se dice."""
    from .clip_speed import clip_timeline_duration

    dur = clip_timeline_duration(clip)
    ctx: dict = {"project": proj.name, "duration": dur, "note": clip.note or None}
    pool = proj.clips if clip.asset_kind == "clips" else (proj.images if clip.asset_kind == "images" else [])
    mat = next((m for m in pool or [] if str(getattr(m, "index", None)) == str(clip.asset_id)
                or str(getattr(m, "id", None)) == str(clip.asset_id)), None)
    if mat is not None:
        ctx["label"] = getattr(mat, "label", None)
        ctx["description"] = (getattr(mat, "description", None) or getattr(mat, "description_ai", None))
    tl = proj.timeline
    end = clip.start + dur
    said = [c.text for c in (tl.clips if tl else [])
            if c.kind == "text" and c.text and c.start < end and c.start + (c.out_point - c.in_point) > clip.start]
    if said:
        ctx["speech"] = re.sub(r"\s+", " ", " ".join(said))[:500]
    return {k: v for k, v in ctx.items() if v not in (None, "")} | {"duration": dur}


def _frames(proj, clip, dur: float) -> tuple[list[bytes], list[float]]:
    from . import compose, frame_grab
    from .clip_speed import clip_speed

    path = compose._clip_path(proj, clip)
    if path is None or not path.exists():
        return [], []
    times = [round(dur * f, 2) for f in (0.15, 0.5, 0.85)] if dur > 1.5 else [round(dur / 2, 2)]
    frames = []
    for t in times:
        if clip.kind == "image":
            src = 0.0
        else:
            rel = t * clip_speed(clip)
            src = (clip.out_point - rel) if clip.reverse else (clip.in_point + rel)
        frames.append(frame_grab.extract_frame(path, src, max_px=FRAME_PX))
    return frames, times


def _ask_text(prompt: str) -> str:
    """Cualquier proveedor de chat configurado (sin imágenes)."""
    from .ai.providers import get_provider

    provider = get_provider()
    reason = provider.unavailable_reason()
    if reason:
        raise RuntimeError(f"No hay IA disponible: {reason}")
    captured = {"text": ""}

    async def emit(ev: dict) -> None:
        if ev.get("type") == "text":
            captured["text"] += ev.get("delta", "")

    async def no_tools(name: str, args: dict) -> dict:
        return {"ok": False, "text": "Sin herramientas: responde solo con el JSON."}

    async def run() -> None:
        await asyncio.wait_for(provider.run(system=SYSTEM, history=[], user_message=prompt, tools=[],
                                            call_tool=no_tools, emit=emit, max_iters=1), timeout=AI_TIMEOUT)

    asyncio.run(run())
    return captured["text"]


def propose(pid: str, clip_data: dict, on_progress: Optional[Callable[[float, str], None]] = None) -> dict:
    """Propone el diseño sonoro de un clip. Devuelve
    ``{sounds: [...emparejados con su sfx y duración...], missing: [...], mode}``."""
    from . import foundry, projects, sfx
    from .schemas import TimelineClip

    proj = projects.get_project(pid)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    clip = TimelineClip.model_validate(clip_data)
    if clip.kind not in ("video", "image"):
        raise ValueError("Sonorizar con IA funciona con clips de vídeo o imagen.")
    lib = sfx.search("", limit=100000)
    if not lib.get("items"):
        raise ValueError("La biblioteca de SFX está vacía: añade sonidos en la pestaña SFX.")
    ctx = scene_context(proj, clip)
    cats = categories_of(lib["items"])

    mode = "text"
    if foundry.available():
        if on_progress:
            on_progress(0.15, "Mirando la escena…")
        frames, times = _frames(proj, clip, ctx["duration"])
        ctx["frame_times"] = times
        prompt = build_prompt(ctx, cats, len(frames))
        content: list[dict] = [{"type": "text", "text": prompt}]
        for jpg in frames:
            content.append({"type": "image_url", "image_url": {
                "url": "data:image/jpeg;base64," + base64.b64encode(jpg).decode("ascii"), "detail": "low"}})
        if on_progress:
            on_progress(0.35, "Pensando qué debería sonar…")
        res = foundry.chat([{"role": "system", "content": SYSTEM}, {"role": "user", "content": content}],
                           max_tokens=900, json_mode=True, timeout=AI_TIMEOUT)
        text = res["text"]
        mode = "vision" if frames else "text"
    else:
        if on_progress:
            on_progress(0.35, "Pensando qué debería sonar…")
        text = _ask_text(build_prompt(ctx, cats, 0))

    sounds = parse_sounds(text, ctx["duration"])
    if on_progress:
        on_progress(0.8, "Buscando en tu biblioteca de SFX…")
    matched, missing = match_sounds(sounds, lib["items"])
    for m in matched:
        path = sfx.resolve(m["sfx"]["id"])
        m["sfx"]["duration"] = probe_duration(path) if path else 0.0
    return {"sounds": matched, "missing": missing, "mode": mode, "clip_id": clip.id}
