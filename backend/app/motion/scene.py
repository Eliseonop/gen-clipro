"""Generar Escena: brief, presets, plan por beats y ensamblado de la composición.

La escena es una ``MotionComposition`` normal cuya FUENTE DE VERDAD vive en
``metadata.scene`` (mismo patrón que ``metadata.stick``). Las capas se DERIVAN
con ``build_composition``:

- ``scene_bg``   fondo de la dirección creativa (solo si la escena es opaca)
- ``beat_<id>``  una capa html por beat, vida = tramo del beat
- ``tr_<n>``     transición determinista en cada corte entre beats

Cada beat guarda su fuente generada (``block`` html/css/js, ``stick`` storyboard o
``asset_id`` de imagen), así un beat se retoca o regenera sin rehacer la escena.
Ver docs/GENERAR_ESCENA.md.
"""
from __future__ import annotations

import copy
import json
import re
import threading
import time
import uuid
from typing import Any

from .. import config
from . import directions, stick
from .models import MotionComposition, MotionLayer

VERSION = 1
RESOURCES = ("stick", "graphic", "text", "image", "video")
RESOURCE_LABELS = {"stick": "Stickman", "graphic": "Gráficos y diagramas", "text": "Texto animado",
                   "image": "Imágenes y assets", "video": "Vídeo del material"}
RESOURCE_MODES = ("auto", "required", "off")
# Recursos que aún no se pueden construir (fase 2): se fuerzan a "off".
UNAVAILABLE_RESOURCES = {"video"}
BEAT_KINDS = ("stick", "graphic", "text", "image")
INTENTS = {
    "explicativa": "Explicar un concepto con claridad: primero situar, luego mostrar el mecanismo, cerrar con la idea.",
    "narrativa": "Contar una pequeña historia: personaje, situación, giro y reacción.",
    "cinematografica": "Crear atmósfera y emoción: pocas piezas, imagen dominante, ritmo pausado.",
    "grafica": "Comunicar con diseño: datos, diagramas y tipografía como protagonistas.",
}
PACES = {"calmo": 3.4, "medio": 2.5, "dinamico": 1.7}   # segundos medios por beat
TEXT_DENSITIES = ("minimo", "medio", "alto")
FREEDOMS = ("alta", "media", "baja")
MIN_BEAT = 0.8
MAX_BEATS = 10
TRANSITION_HALF = 0.3

_ALIASES = {
    "stickman": "stick", "stickmans": "stick", "personaje": "stick", "character": "stick", "story": "stick",
    "chart": "graphic", "diagram": "graphic", "diagrama": "graphic", "grafico": "graphic", "gráfico": "graphic",
    "data": "graphic", "framer": "graphic", "motion": "graphic", "shape": "graphic",
    "title": "text", "quote": "text", "texto": "text", "typography": "text", "kinetic": "text",
    "photo": "image", "foto": "image", "imagen": "image", "asset": "image", "picture": "image",
    "clip": "video", "footage": "video",
}

STICK_LAYER_JS = "StickScene.mount(tl, root, gsap, ctx, ctx.beat && ctx.beat.stick);"


# --- Brief -------------------------------------------------------------------------

def _str(v: Any, limit: int) -> str:
    return str(v).strip()[:limit] if isinstance(v, (str, int, float)) else ""


def _num(v: Any, default: float) -> float:
    try:
        f = float(v)
        return f if f == f else default   # NaN
    except (TypeError, ValueError):
        return default


def default_brief() -> dict[str, Any]:
    return {
        "idea": "", "script": "", "duration": 6.0,
        "intent": "explicativa", "direction": directions.DEFAULT_DIRECTION, "direction_overrides": {},
        "resources": {"stick": "auto", "graphic": "auto", "text": "auto", "image": "auto", "video": "off"},
        "pace": "medio", "text_density": "medio", "background": "opaque", "transitions": True,
        "must_include": [], "ai_freedom": "alta", "notes": "",
        # "script" = beats fijados por las frases del guion (la IA solo decide qué se ve;
        # ideal para modelos pequeños) · "free" = la IA divide el tramo.
        "structure": "free",
    }


def normalize_brief(raw: Any, *, duration: float | None = None) -> dict[str, Any]:
    b = default_brief()
    r = raw if isinstance(raw, dict) else {}
    b["idea"] = _str(r.get("idea"), 1200)
    b["script"] = _str(r.get("script"), 3000)
    b["duration"] = round(max(1.0, min(120.0, _num(duration if duration else r.get("duration"), b["duration"]))), 3)
    if r.get("intent") in INTENTS:
        b["intent"] = r["intent"]
    if r.get("direction") in directions.DIRECTIONS:
        b["direction"] = r["direction"]
    ov = r.get("direction_overrides")
    if isinstance(ov, dict):
        clean: dict[str, Any] = {}
        for k in ("bg", "surface", "ink", "secondary", "accent"):
            if isinstance(ov.get(k), str) and re.match(r"^#[0-9a-fA-F]{3,6}$", ov[k].strip()):
                clean[k] = ov[k].strip()
        if isinstance(ov.get("notes"), str) and ov["notes"].strip():
            clean["notes"] = ov["notes"].strip()[:600]
        if isinstance(ov.get("forbidden"), list):
            clean["forbidden"] = [str(x).strip()[:80] for x in ov["forbidden"] if str(x).strip()][:12]
        b["direction_overrides"] = clean
    res = r.get("resources") if isinstance(r.get("resources"), dict) else {}
    for k in RESOURCES:
        mode = res.get(k)
        if mode in RESOURCE_MODES:
            b["resources"][k] = mode
        if k in UNAVAILABLE_RESOURCES:
            b["resources"][k] = "off"
    if r.get("pace") in PACES:
        b["pace"] = r["pace"]
    if r.get("text_density") in TEXT_DENSITIES:
        b["text_density"] = r["text_density"]
    if r.get("background") in ("opaque", "transparent"):
        b["background"] = r["background"]
    if isinstance(r.get("transitions"), bool):
        b["transitions"] = r["transitions"]
    must = r.get("must_include")
    if isinstance(must, str):
        must = [x for x in re.split(r"[\n;]+", must)]
    if isinstance(must, list):
        b["must_include"] = [_str(x, 160) for x in must if _str(x, 160)][:10]
    if r.get("ai_freedom") in FREEDOMS:
        b["ai_freedom"] = r["ai_freedom"]
    b["notes"] = _str(r.get("notes"), 1200)
    if r.get("structure") in ("script", "free"):
        b["structure"] = r["structure"]
    return b


def resolved_direction(brief: dict[str, Any]) -> dict[str, Any]:
    return directions.resolve(brief.get("direction"), brief.get("direction_overrides"))


def options() -> dict[str, Any]:
    """Opciones del formulario del brief (UI)."""
    return {
        "resources": [{"key": k, "label": RESOURCE_LABELS[k], "available": k not in UNAVAILABLE_RESOURCES}
                      for k in RESOURCES],
        "resource_modes": list(RESOURCE_MODES),
        "intents": [{"key": k, "note": v} for k, v in INTENTS.items()],
        "paces": list(PACES), "text_densities": list(TEXT_DENSITIES), "freedoms": list(FREEDOMS),
        "default_brief": default_brief(),
    }


# --- Presets -----------------------------------------------------------------------

# Un preset es un brief PARCIAL (sin idea/guion/duración): al cargarlo se fusiona.
PRESET_FIELDS = ("intent", "direction", "direction_overrides", "resources", "pace", "text_density",
                 "background", "transitions", "must_include", "ai_freedom", "notes")

BUILTIN_PRESETS: list[dict[str, Any]] = [
    {"id": "builtin_divulgacion_pizarra", "name": "Divulgación · Pizarra", "brief": {
        "intent": "explicativa", "direction": "whiteboard", "pace": "medio", "text_density": "medio",
        "resources": {"stick": "auto", "graphic": "required", "text": "auto", "image": "auto", "video": "off"}}},
    {"id": "builtin_explicacion_sketchbook", "name": "Explicación · Sketchbook", "brief": {
        "intent": "explicativa", "direction": "sketchbook", "pace": "medio", "text_density": "medio",
        "resources": {"stick": "auto", "graphic": "required", "text": "auto", "image": "auto", "video": "off"}}},
    {"id": "builtin_documental", "name": "Documental", "brief": {
        "intent": "cinematografica", "direction": "documentary", "pace": "calmo", "text_density": "minimo",
        "resources": {"stick": "off", "graphic": "auto", "text": "auto", "image": "required", "video": "off"}}},
    {"id": "builtin_historia_stick", "name": "Historia con stickman", "brief": {
        "intent": "narrativa", "direction": "paper_collage", "pace": "medio", "text_density": "minimo",
        "resources": {"stick": "required", "graphic": "auto", "text": "auto", "image": "off", "video": "off"}}},
    {"id": "builtin_dato_editorial", "name": "Dato editorial", "brief": {
        "intent": "grafica", "direction": "infographic_news", "pace": "medio", "text_density": "medio",
        "resources": {"stick": "off", "graphic": "required", "text": "auto", "image": "auto", "video": "off"}}},
    {"id": "builtin_investigacion", "name": "Investigación / misterio", "brief": {
        "intent": "narrativa", "direction": "investigation_board", "pace": "medio", "text_density": "medio",
        "resources": {"stick": "auto", "graphic": "auto", "text": "auto", "image": "required", "video": "off"}}},
    {"id": "builtin_ciencia_campo", "name": "Ciencia · Cuaderno de campo", "brief": {
        "intent": "explicativa", "direction": "field_notes", "pace": "calmo", "text_density": "medio",
        "resources": {"stick": "auto", "graphic": "required", "text": "auto", "image": "auto", "video": "off"}}},
    {"id": "builtin_tecnico", "name": "Cómo funciona · Blueprint", "brief": {
        "intent": "explicativa", "direction": "blueprint", "pace": "medio", "text_density": "minimo",
        "resources": {"stick": "off", "graphic": "required", "text": "auto", "image": "auto", "video": "off"}}},
]

_PRESETS_FILE = config.DATA_DIR / "scene_presets.json"
_presets_lock = threading.Lock()


def _preset_brief(raw: Any) -> dict[str, Any]:
    full = normalize_brief(raw)
    src = raw if isinstance(raw, dict) else {}
    return {k: full[k] for k in PRESET_FIELDS if k in src}


def _read_user_presets() -> list[dict[str, Any]]:
    try:
        data = json.loads(_PRESETS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [p for p in data if isinstance(p, dict) and p.get("id") and p.get("name")] if isinstance(data, list) else []


def list_presets() -> list[dict[str, Any]]:
    out = [{**copy.deepcopy(p), "builtin": True} for p in BUILTIN_PRESETS]
    with _presets_lock:
        out += [{**p, "builtin": False} for p in _read_user_presets()]
    return out


def save_preset(name: str, brief: Any, preset_id: str | None = None) -> dict[str, Any]:
    name = _str(name, 80)
    if not name:
        raise ValueError("El preset necesita un nombre.")
    if preset_id and preset_id.startswith("builtin_"):
        raise ValueError("Los presets incluidos no se pueden sobrescribir; guárdalo con otro nombre.")
    with _presets_lock:
        items = _read_user_presets()
        now = time.time()
        entry = {"id": preset_id or f"sp_{uuid.uuid4().hex[:8]}", "name": name,
                 "brief": _preset_brief(brief), "updated_at": now}
        for i, p in enumerate(items):
            if p["id"] == entry["id"]:
                entry["created_at"] = p.get("created_at", now)
                items[i] = entry
                break
        else:
            entry["created_at"] = now
            items.append(entry)
        _PRESETS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _PRESETS_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return {**entry, "builtin": False}


def delete_preset(preset_id: str) -> bool:
    if preset_id.startswith("builtin_"):
        raise ValueError("Los presets incluidos no se pueden borrar.")
    with _presets_lock:
        items = _read_user_presets()
        keep = [p for p in items if p["id"] != preset_id]
        if len(keep) == len(items):
            return False
        _PRESETS_FILE.write_text(json.dumps(keep, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


# --- Preguntas y plan (normalización de la salida de la IA) ------------------------

def normalize_questions(raw: Any) -> list[dict[str, Any]]:
    items = raw.get("questions") if isinstance(raw, dict) else raw
    out: list[dict[str, Any]] = []
    for i, q in enumerate(items if isinstance(items, list) else []):
        if not isinstance(q, dict) or not _str(q.get("question"), 240):
            continue
        opts = [_str(o, 120) for o in (q.get("options") or []) if _str(o, 120)][:6]
        out.append({"id": _str(q.get("id"), 40) or f"q{i + 1}", "question": _str(q.get("question"), 240),
                    "why": _str(q.get("why"), 240), "options": opts, "multi": bool(q.get("multi"))})
    return out[:4]


def normalize_answers(raw: Any) -> list[dict[str, str]]:
    out = []
    for a in raw if isinstance(raw, list) else []:
        if isinstance(a, dict) and _str(a.get("question"), 240) and _str(a.get("answer"), 400):
            out.append({"question": _str(a["question"], 240), "answer": _str(a["answer"], 400)})
    return out[:6]


def _kind(v: Any) -> str:
    k = _str(v, 30).lower()
    return k if k in BEAT_KINDS or k == "video" else _ALIASES.get(k, "graphic")


def _available(kind: str, brief: dict[str, Any], image_ids: set[str]) -> bool:
    if brief["resources"].get(kind) == "off" or kind in UNAVAILABLE_RESOURCES:
        return False
    if kind == "image" and not image_ids:
        return False
    return True


def _fallback_kind(kind: str, brief: dict[str, Any], image_ids: set[str]) -> str:
    order = {"video": ["image", "graphic", "text", "stick"], "image": ["graphic", "text", "stick"],
             "stick": ["graphic", "text", "image"], "graphic": ["text", "image", "stick"],
             "text": ["graphic", "image", "stick"]}.get(kind, ["graphic", "text"])
    for k in order:
        if _available(k, brief, image_ids):
            return k
    return "text"


def normalize_plan(raw: Any, brief: dict[str, Any], *, image_ids: set[str] | None = None) -> dict[str, Any]:
    """Plan válido: beats contiguos que suman la duración, recursos respetados.

    Nunca lanza. ``warnings`` explica lo que se ajustó (recurso prohibido reconvertido,
    obligatorio ausente, asset inexistente…)."""
    image_ids = set(image_ids or ())
    r = raw if isinstance(raw, dict) else {}
    total = float(brief["duration"])
    warnings: list[str] = []
    beats: list[dict[str, Any]] = []
    for i, b in enumerate((r.get("beats") or [])[:MAX_BEATS] if isinstance(r.get("beats"), list) else []):
        if not isinstance(b, dict):
            continue
        kind = _kind(b.get("kind") or b.get("type"))
        asset = _str(b.get("asset_id"), 60) or None
        if kind == "image" and asset not in image_ids:
            asset = None
            if image_ids and brief["resources"].get("image") != "off":
                warnings.append(f"Beat {i + 1}: la imagen indicada no existe; se usa la primera disponible.")
                asset = sorted(image_ids)[0]
        if not _available(kind, brief, image_ids):
            new = _fallback_kind(kind, brief, image_ids)
            warnings.append(f"Beat {i + 1}: '{kind}' no está disponible → '{new}'.")
            kind = new
            if kind == "image" and not asset:
                asset = sorted(image_ids)[0] if image_ids else None
        length = _num(b.get("duration"), 0.0)
        if length <= 0 and b.get("start") is not None and b.get("end") is not None:
            length = _num(b.get("end"), 0) - _num(b.get("start"), 0)
        bid = _str(b.get("id"), 24)
        if not re.match(r"^[A-Za-z0-9_-]+$", bid) or any(x["id"] == bid for x in beats):
            bid = f"b{len(beats) + 1}"
            while any(x["id"] == bid for x in beats):
                bid += "x"
        beats.append({
            "id": bid, "kind": kind, "length": length if length > 0 else 0.0,
            "purpose": _str(b.get("purpose"), 300), "content": _str(b.get("content") or b.get("text"), 400),
            "visual": _str(b.get("visual"), 500), "asset_id": asset if kind == "image" else None,
            "action": _str(b.get("action"), 500) if kind == "stick" else "",
        })

    if not beats:
        text = brief.get("idea") or brief.get("script") or "Idea principal"
        beats.append({"id": "b1", "kind": _fallback_kind("text", brief, image_ids) if not _available("text", brief, image_ids) else "text",
                      "length": total, "purpose": "Presentar la idea", "content": text[:120],
                      "visual": "", "asset_id": None, "action": ""})
        warnings.append("La IA no devolvió beats: se creó uno de texto.")

    # Máximo de beats según la duración (cada beat ≥ MIN_BEAT).
    max_n = max(1, int(total // MIN_BEAT))
    if len(beats) > max_n:
        warnings.append(f"Demasiados beats para {total:g}s: se quedan {max_n}.")
        beats = beats[:max_n]
    known = sum(b["length"] for b in beats if b["length"] > 0)
    missing = [b for b in beats if b["length"] <= 0]
    rest = max(0.0, total - known)
    for b in missing:
        b["length"] = rest / len(missing) if rest > 0 else total / len(beats)
    s = sum(b["length"] for b in beats)
    scale = total / s if s > 0 else 1.0
    lengths = [max(MIN_BEAT, b["length"] * scale) for b in beats]
    over = sum(lengths) - total
    if over > 1e-6:   # los mínimos se comen tiempo de los beats largos
        longest = sorted(range(len(lengths)), key=lambda k: -lengths[k])
        for k in longest:
            take = min(over, lengths[k] - MIN_BEAT)
            lengths[k] -= take
            over -= take
            if over <= 1e-6:
                break
    cursor = 0.0
    for b, ln in zip(beats, lengths):
        b.pop("length")
        b["start"] = round(cursor, 3)
        cursor += ln
        b["end"] = round(cursor, 3)
    beats[-1]["end"] = round(total, 3)

    for k in RESOURCES:
        if brief["resources"].get(k) == "required" and k not in UNAVAILABLE_RESOURCES \
                and not any(b["kind"] == k for b in beats):
            warnings.append(f"El recurso obligatorio '{RESOURCE_LABELS[k]}' no aparece en el plan.")

    return {
        "title": _str(r.get("title"), 80) or "Escena",
        "logline": _str(r.get("logline"), 300),
        "rationale": _str(r.get("rationale"), 800),
        "beats": beats,
        "warnings": warnings,
    }


def normalize_beats_edit(beats: Any, brief: dict[str, Any], *, image_ids: set[str] | None = None) -> dict[str, Any]:
    """Beats editados por el usuario (ya con start/end) → mismo contrato que ``normalize_plan``."""
    return normalize_plan({"beats": [
        {**b, "duration": _num(b.get("end"), 0) - _num(b.get("start"), 0)} for b in (beats or []) if isinstance(b, dict)
    ]}, brief, image_ids=image_ids)


# --- Constructores deterministas -----------------------------------------------------

def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def backdrop_layer(width: int, height: int) -> MotionLayer:
    return MotionLayer(id="scene_bg", type="html", x=0, y=0, width=width, height=height, start=0.0, end=None,
                       z_index=0, html='<div class="sc-backdrop"></div>', css="", js="")


def _split_caption(content: str) -> tuple[str, str]:
    """"Etiqueta: texto" → (etiqueta, texto)."""
    if ":" in content and len(content.split(":", 1)[0]) <= 28:
        a, b = content.split(":", 1)
        return a.strip(), b.strip()
    return "", content.strip()


_IMAGE_JS = """
var u = Math.min(ctx.width, ctx.height) / 100, L = ctx.life;
var fr = root.querySelector('.im-frame'), img = root.querySelector('.im-frame img');
var cap = root.querySelectorAll('.im-cap'), deco = root.querySelectorAll('.im-deco');
var rot = parseFloat(fr.getAttribute('data-rot') || '0');
tl.fromTo(fr, {autoAlpha: 0, y: u * 5, rotation: rot - 2.5}, {autoAlpha: 1, y: 0, rotation: rot, duration: 0.7, ease: 'power3.out'}, 0);
if (img) tl.fromTo(img, {scale: 1.1}, {scale: 1.0, duration: Math.max(0.5, L), ease: 'none'}, 0);
if (deco.length) tl.fromTo(deco, {autoAlpha: 0, scale: 0.7}, {autoAlpha: 1, scale: 1, duration: 0.35, ease: 'power2.out', stagger: 0.08}, 0.45);
if (cap.length) tl.fromTo(cap, {autoAlpha: 0, y: u * 1.6}, {autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.12}, Math.min(0.6, L * 0.3));
"""


def image_block(beat: dict[str, Any], d: dict[str, Any], width: int, height: int) -> dict[str, str]:
    """Tratamiento de imagen propio de la dirección (determinista)."""
    treatment = d["engine"]["image_treatment"]
    src = f"asset:image/{beat.get('asset_id')}"
    label, text = _split_caption(beat.get("content") or "")
    vertical = height >= width
    w = 78 if vertical else 52
    h = 62 if vertical else 70
    img = f'<img src="{src}" alt="">'
    cap_label = f'<div class="im-cap sc-label">{_esc(label)}</div>' if label else ""
    cap_text = _esc(text)
    css_common = (".im-pos{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);}"
                  ".im-frame{position:relative;}"
                  ".im-frame .ph{position:relative;overflow:hidden;width:100%;height:100%;}"
                  ".im-frame .ph img{display:block;width:100%;height:100%;object-fit:cover;}")
    if treatment == "full_bleed":
        html = (f'<div class="sc-scene"><div class="im-pos fbp"><div class="im-frame fb" data-rot="0"><div class="ph">{img}</div></div></div>'
                f'<div class="im-shade"></div><div class="im-caps">{cap_label}'
                f'<div class="im-cap sc-display">{cap_text}</div><div class="im-cap sc-rule"></div></div></div>')
        css = (css_common + ".im-pos.fbp{left:0;top:0;transform:none;width:100%;height:100%;}.im-frame.fb{width:100%;height:100%;}"
               ".im-shade{position:absolute;inset:0;background:linear-gradient(transparent 55%,rgba(0,0,0,.55));}"
               ".im-caps{position:absolute;left:8%;right:10%;bottom:24%;display:flex;flex-direction:column;gap:calc(var(--u)*1.6);}"
               ".im-caps .sc-display{color:#f5f1e8;font-size:calc(var(--u)*9);}"
               ".im-caps .sc-label{color:rgba(245,241,232,.75);}"
               ".im-caps .sc-rule{width:calc(var(--u)*14);background:var(--sc-accent);}")
        return {"html": html, "css": css, "js": _IMAGE_JS}
    frames = {
        "taped": ("background:#fff;padding:calc(var(--u)*1.8);box-shadow:0 3px 0 rgba(0,0,0,.06),0 18px 30px -18px rgba(0,0,0,.45);",
                  '<div class="im-deco sc-tape" style="left:-4%;top:-2%;transform:rotate(-24deg)"></div>'
                  '<div class="im-deco sc-tape" style="right:-4%;bottom:-2%;transform:rotate(-22deg)"></div>', -2.2),
        "polaroid": ("background:#fbfaf6;padding:calc(var(--u)*2.2) calc(var(--u)*2.2) calc(var(--u)*11);"
                     "box-shadow:0 18px 30px -16px rgba(0,0,0,.45);", "", 2.0),
        "archive_card": ("background:var(--sc-surface);padding:calc(var(--u)*2.4);border:1px solid rgba(0,0,0,.18);"
                         "box-shadow:0 10px 24px -18px rgba(0,0,0,.4);",
                         '<div class="im-deco inv sc-label">INV. Nº ' + _esc((beat.get("asset_id") or "")[:6].upper())
                         + '</div>', 0.0),
        "clipping": ("background:var(--sc-surface);padding:calc(var(--u)*1.6);box-shadow:0 12px 22px -16px rgba(0,0,0,.45);",
                     "", -1.2),
        "blueprint_frame": ("border:2px solid var(--sc-ink);padding:calc(var(--u)*1.4);",
                            '<div class="im-deco dim dim-h"></div><div class="im-deco dim dim-v"></div>', 0.0),
        "pinned": ("background:#fff;padding:calc(var(--u)*1.6) calc(var(--u)*1.6) calc(var(--u)*7);"
                   "box-shadow:0 16px 26px -16px rgba(0,0,0,.55);",
                   '<div class="im-deco pin"></div>', 3.0),
        "wash": ("padding:0;", "", 0.0),
        "specimen": ("background:var(--sc-surface);padding:calc(var(--u)*2);border:1px dashed var(--sc-secondary);",
                     '<div class="im-deco sc-tape" style="left:38%;top:-3%;transform:rotate(-4deg)"></div>', -1.0),
        "card": ("background:transparent;padding:0;", "", 0.0),
    }
    frame_css, deco, rot = frames.get(treatment, frames["card"])
    img_filter = {"clipping": "filter:grayscale(1) contrast(1.15);",
                  "blueprint_frame": "filter:grayscale(1) contrast(1.1);mix-blend-mode:screen;opacity:.85;",
                  "wash": "filter:grayscale(.85) sepia(.25) contrast(.95);",
                  "archive_card": "filter:sepia(.35) contrast(.95);",
                  "specimen": "filter:saturate(.8);"}.get(treatment, "")
    mask = ("-webkit-mask-image:radial-gradient(ellipse 70% 65% at 50% 50%,#000 55%,transparent 100%);"
            "mask-image:radial-gradient(ellipse 70% 65% at 50% 50%,#000 55%,transparent 100%);") if treatment == "wash" else ""
    cap_font = "sc-hand" if treatment in ("polaroid", "pinned", "taped", "specimen") else "sc-display"
    in_frame_cap = treatment in ("polaroid", "pinned")
    cap_html = f'<div class="im-cap {cap_font} in">{cap_text}</div>' if in_frame_cap and cap_text else ""
    below = ("" if in_frame_cap else
             f'<div class="im-caps">{cap_label}<div class="im-cap {cap_font}">{cap_text}</div>'
             f'<div class="im-cap sc-rule"></div></div>') if (cap_text or cap_label) else ""
    html = (f'<div class="sc-scene"><div class="im-pos"><div class="im-frame" data-rot="{rot}"><div class="ph">{img}</div>{deco}{cap_html}</div></div>'
            f'{below}</div>')
    css = (css_common
           + f".im-frame{{width:calc(var(--u)*{w});height:calc(var(--u)*{h});{frame_css}box-sizing:content-box;}}"
           + f".im-frame .ph img{{{img_filter}}}.im-frame .ph{{{mask}}}"
           + ".im-cap.in{position:absolute;left:0;right:0;bottom:calc(var(--u)*2.2);text-align:center;"
             "font-size:calc(var(--u)*6.4);color:#2a2724;}"
           + ".im-caps{position:absolute;left:11%;right:11%;top:calc(44% + var(--u)*" + str(h / 2 + 7) + ");"
             "display:flex;flex-direction:column;gap:calc(var(--u)*1.4);}"
           + ".im-caps .sc-display{font-size:calc(var(--u)*7);}.im-caps .sc-hand{font-size:calc(var(--u)*8.4);}"
           + ".im-caps .sc-rule{width:calc(var(--u)*12);background:var(--sc-accent);}"
           + ".inv{position:absolute;right:calc(var(--u)*2.4);bottom:calc(var(--u)*-5);}"
           + ".pin{position:absolute;left:50%;top:calc(var(--u)*-1.4);width:calc(var(--u)*3.4);height:calc(var(--u)*3.4);"
             "margin-left:calc(var(--u)*-1.7);border-radius:50%;background:var(--sc-accent);"
             "box-shadow:0 3px 4px rgba(0,0,0,.35);}"
           + ".dim{position:absolute;border-color:var(--sc-secondary);border-style:solid;}"
             ".dim-h{left:0;right:0;bottom:calc(var(--u)*-4.5);height:calc(var(--u)*2);border-width:0 2px 2px 2px;}"
             ".dim-v{top:0;bottom:0;left:calc(var(--u)*-4.5);width:calc(var(--u)*2);border-width:2px 0 2px 2px;}")
    return {"html": html, "css": css, "js": _IMAGE_JS}


_TEXT_FALLBACK_JS = """
var u = Math.min(ctx.width, ctx.height) / 100;
var lab = root.querySelector('.fb-label'), tit = root.querySelector('.fb-title'), rule = root.querySelector('.sc-rule');
if (lab) tl.fromTo(lab, {autoAlpha: 0, y: u * 1.5}, {autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out'}, 0.05);
tl.fromTo(tit, {autoAlpha: 0, y: u * 3}, {autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out'}, 0.18);
tl.fromTo(rule, {scaleX: 0}, {scaleX: 1, duration: 0.6, ease: 'power2.inOut'}, 0.55);
"""


def text_fallback_block(beat: dict[str, Any], d: dict[str, Any]) -> dict[str, str]:
    """Tarjeta tipográfica en la dirección: se usa si la IA no logra un bloque válido."""
    label, text = _split_caption(beat.get("content") or beat.get("purpose") or "")
    text = text or "…"
    size = 13 if len(text) < 30 else 9.5 if len(text) < 70 else 7
    html = ('<div class="sc-scene"><div class="fb-wrap">'
            + (f'<div class="fb-label sc-label">{_esc(label)}</div>' if label else "")
            + f'<div class="fb-title sc-display">{_esc(text)}</div><div class="sc-rule"></div></div></div>')
    css = (".fb-wrap{position:absolute;left:9%;right:12%;top:30%;display:flex;flex-direction:column;"
           "gap:calc(var(--u)*2.4);}"
           f".fb-title{{font-size:calc(var(--u)*{size});}}"
           ".fb-wrap .sc-rule{width:calc(var(--u)*16);background:var(--sc-accent);height:calc(var(--u)*.8);}")
    return {"html": html, "css": css, "js": _TEXT_FALLBACK_JS}


def transition_block(kind: str) -> dict[str, str] | None:
    """Transición determinista (vida = 2·TRANSITION_HALF, centrada en el corte)."""
    h = TRANSITION_HALF
    if kind == "cut":
        return None
    if kind == "page_slide":
        return {"html": '<div class="tr-sheet"></div>',
                "css": ".tr-sheet{position:absolute;inset:-2% -2%;background:var(--sc-surface);"
                       "box-shadow:0 0 40px rgba(0,0,0,.25);}",
                "js": f"var s=root.querySelector('.tr-sheet');"
                      f"tl.fromTo(s,{{xPercent:-110,rotation:-2}},{{xPercent:0,rotation:0,duration:{h},ease:'power2.in'}},0);"
                      f"tl.fromTo(s,{{xPercent:0,rotation:0}},{{xPercent:110,rotation:2,duration:{h},ease:'power2.out',immediateRender:false}},{h});"}
    if kind == "line_wipe":
        return {"html": '<div class="tr-panel"><div class="tr-edge"></div></div>',
                "css": ".tr-panel{position:absolute;inset:0;background:var(--sc-bg);}"
                       ".tr-edge{position:absolute;top:0;bottom:0;right:0;width:max(3px,calc(var(--u)*.5));background:var(--sc-ink);}",
                "js": f"var p=root.querySelector('.tr-panel');"
                      f"tl.fromTo(p,{{clipPath:'inset(0 100% 0 0)'}},{{clipPath:'inset(0 0% 0 0)',duration:{h},ease:'power2.inOut'}},0);"
                      f"tl.fromTo(p,{{clipPath:'inset(0 0 0 0%)'}},{{clipPath:'inset(0 0 0 100%)',duration:{h},ease:'power2.inOut',immediateRender:false}},{h});"}
    if kind == "ink_bloom":
        return {"html": '<div class="tr-ink"></div>',
                "css": ".tr-ink{position:absolute;left:50%;top:50%;width:calc(var(--u)*420);height:calc(var(--u)*420);"
                       "margin:calc(var(--u)*-210) 0 0 calc(var(--u)*-210);"
                       "border-radius:47% 53% 51% 49%;background:var(--sc-ink);filter:url(#sc-rough);}",
                "js": f"var k=root.querySelector('.tr-ink');"
                      f"tl.fromTo(k,{{scale:0,autoAlpha:1}},{{scale:1,duration:{h},ease:'power2.in'}},0);"
                      f"tl.fromTo(k,{{autoAlpha:1}},{{autoAlpha:0,duration:{h},ease:'power1.out',immediateRender:false}},{h});"}
    color = "#fff6e0" if kind == "film_flash" else "var(--sc-bg)"
    return {"html": '<div class="tr-dip"></div>',
            "css": f".tr-dip{{position:absolute;inset:0;background:{color};}}",
            "js": f"var q=root.querySelector('.tr-dip');"
                  f"tl.fromTo(q,{{autoAlpha:0}},{{autoAlpha:{0.9 if kind == 'film_flash' else 1},duration:{h},ease:'power1.in'}},0);"
                  f"tl.fromTo(q,{{autoAlpha:{0.9 if kind == 'film_flash' else 1}}},{{autoAlpha:0,duration:{h},ease:'power1.out',immediateRender:false}},{h});"}


def stick_style_for(d: dict[str, Any], brief: dict[str, Any]) -> dict[str, Any]:
    """Estilo del storyboard para que el stickman viva en la dirección."""
    pal = directions.stick_palette(d)
    pal.pop("bg", None)                     # el fondo lo pinta la dirección (o el vídeo)
    pal["halo"] = d["palette"]["bg"]
    return {"preset": "transparent", "accent": d["palette"]["accent"], "palette": pal,
            "captions": brief.get("text_density") != "minimo"}


# --- Ensamblado ----------------------------------------------------------------------

def beat_layer(beat: dict[str, Any], d: dict[str, Any], width: int, height: int) -> MotionLayer:
    kind = beat.get("kind")
    common = dict(id=f"beat_{beat['id']}", type="html", x=0, y=0, width=width, height=height,
                  start=float(beat["start"]), end=float(beat["end"]), z_index=10, beat=beat["id"])
    if kind == "stick" and isinstance(beat.get("stick"), dict):
        return MotionLayer(**common, html="", css="", js=STICK_LAYER_JS)
    if kind == "image" and beat.get("asset_id"):
        blk = image_block(beat, d, width, height)
    elif isinstance(beat.get("block"), dict) and (beat["block"].get("html") or beat["block"].get("js")):
        blk = beat["block"]
    else:
        blk = text_fallback_block(beat, d)
    return MotionLayer(**common, html=blk.get("html") or "", css=blk.get("css") or "", js=blk.get("js") or "")


def build_composition(comp_id: str, scene: dict[str, Any], *, width: int, height: int, fps: int,
                      project_id: str, name: str | None = None,
                      metadata: dict[str, Any] | None = None) -> MotionComposition:
    """``metadata.scene`` → composición editable con capas derivadas."""
    brief = normalize_brief(scene.get("brief"))
    d = resolved_direction(brief)
    beats = [b for b in (scene.get("beats") or []) if isinstance(b, dict) and b.get("id")]
    duration = float(brief["duration"])
    layers: list[MotionLayer] = []
    if brief["background"] == "opaque":
        layers.append(backdrop_layer(width, height))
    for b in beats:
        layers.append(beat_layer(b, d, width, height))
    if brief["transitions"] and len(beats) > 1:
        tr = transition_block(d["engine"]["transition"])
        if tr:
            for n, b in enumerate(beats[1:], start=1):
                t = float(b["start"])
                s, e = max(0.0, t - TRANSITION_HALF), min(duration, t + TRANSITION_HALF)
                if e - s < 2 * TRANSITION_HALF - 1e-6:
                    continue
                layers.append(MotionLayer(id=f"tr_{n}", type="html", x=0, y=0, width=width, height=height,
                                          start=round(s, 3), end=round(e, 3), z_index=50, **tr))
    meta = dict(metadata or {})
    meta.update({
        "template": "scene", "project_id": project_id,
        "scene": {**scene, "version": VERSION, "brief": brief, "beats": beats},
        "theme": directions.theme_tokens(d),
    })
    plan = (scene.get("plan") or {}) if isinstance(scene.get("plan"), dict) else {}
    return MotionComposition(id=comp_id, name=name or plan.get("title") or "Escena",
                             width=int(width), height=int(height), fps=int(fps), duration=duration,
                             background="transparent", layers=layers, metadata=meta)


def is_scene(comp: MotionComposition | dict | None) -> bool:
    meta = comp.metadata if isinstance(comp, MotionComposition) else ((comp or {}).get("metadata") or {})
    return isinstance((meta or {}).get("scene"), dict)


def prepare_stick(storyboard: Any, beat: dict[str, Any], d: dict[str, Any], brief: dict[str, Any]) -> dict[str, Any]:
    life = max(0.5, float(beat["end"]) - float(beat["start"]))
    sb = stick.normalize(storyboard, duration=life)
    sb["style"] = stick_style_for(d, brief)
    return sb
