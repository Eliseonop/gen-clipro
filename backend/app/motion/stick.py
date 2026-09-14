"""Historias con STICKMAN: storyboard → composición animada editable.

El storyboard es la FUENTE DE VERDAD y vive en ``composition.metadata['stick']``.
La composición tiene una única capa ``html`` cuyo js es constante
(``StickScene.mount(...)``); el motor ``stick.js`` lee la escena desde
``ctx.meta.stick`` y la dibuja como función pura del tiempo. Así el editor cambia
el storyboard en vivo sin reescribir JS y la IA solo decide QUÉ pasa (reparto,
planos, poses, cámara, efectos), nunca geometría.

Estructura (``normalize`` la garantiza):

    {
      "version": 1, "title", "logline", "script", "duration",
      "style": {"preset": clean|paper|chalk|transparent, "accent": "#hex", "captions": bool},
      "environment": {"preset": none|street|bus|office|room|classroom|park, "description"},
      "characters": [{"id", "name", "role", "body", "hair", "hair_color", "outfit",
                      "shirt", "pants", "accessory", "accent_color", "description"}],
      "shots": [{"id", "start", "end", "description", "caption", "camera", "focus",
                 "moving", "fx": [{"type", "target", "at"}],
                 "actors": [{"id", "pose", "expression", "x", "to_x", "facing"}]}]
    }
"""
from __future__ import annotations

import copy
import re
from typing import Any

from . import themes
from .models import MotionComposition, MotionLayer

STICK_JS = "StickScene.mount(tl, root, gsap, ctx);"
LAYER_ID = "stick_scene"

# --- Vocabulario (debe coincidir con stick.js; test de paridad) ---------------
POSES: dict[str, str] = {
    "stand": "De pie", "idle": "Reposo (respira)", "walk": "Caminar", "run": "Correr",
    "sit": "Sentado", "sit_phone": "Sentado con el móvil", "sit_sleep": "Dormido sentado",
    "hold_rail": "Agarrado a la barra", "wave": "Saludar", "point": "Señalar", "talk": "Hablar",
    "think": "Pensar", "laugh": "Reírse", "laugh_point": "Reírse señalando", "giggle": "Risita (tapa la boca)",
    "cheer": "Celebrar", "surprised": "Sorprendido", "scared": "Asustado / cubrirse",
    "hit": "Recibir golpe", "strike": "Golpear", "push": "Empujar", "fall": "Caerse",
    "lie": "Tumbado", "get_up": "Levantarse", "crouch": "Agacharse", "sad": "Triste",
    "angry": "Enfadado", "shrug": "Encogerse de hombros", "jump": "Saltar", "dance": "Bailar",
    "phone_call": "Llamada", "look_phone": "Mirar el móvil",
}
POSE_GROUPS: list[tuple[str, list[str]]] = [
    ("Básicas", ["stand", "idle", "walk", "run", "jump", "crouch"]),
    ("Sentado", ["sit", "sit_phone", "sit_sleep"]),
    ("Gestos", ["wave", "point", "talk", "think", "shrug", "phone_call", "look_phone", "hold_rail", "dance"]),
    ("Emociones", ["laugh", "laugh_point", "giggle", "cheer", "surprised", "scared", "sad", "angry"]),
    ("Acción", ["hit", "strike", "push", "fall", "lie", "get_up"]),
]
EXPRESSIONS: dict[str, str] = {
    "neutral": "Neutral", "happy": "Contento", "laugh": "Carcajada", "surprised": "Sorpresa",
    "sad": "Triste", "angry": "Enfado", "pain": "Dolor", "dizzy": "Mareado", "scared": "Miedo",
    "smirk": "Pícaro",
}
FX: dict[str, str] = {
    "impact": "Impacto", "shake": "Sacudida", "speed": "Velocidad", "exclaim": "¡!",
    "question": "¿?", "laugh": "Risas (JA)", "sweat": "Sudor", "dizzy": "Estrellas",
    "love": "Corazones", "zzz": "Sueño", "flash": "Destello",
}
ENVIRONMENTS: dict[str, str] = {
    "none": "Sin escenario", "street": "Calle", "bus": "Dentro del bus", "office": "Oficina",
    "room": "Habitación", "classroom": "Aula", "park": "Parque",
}
CAMERAS: dict[str, str] = {"wide": "General", "medium": "Medio", "close": "Cerca"}
STYLES: dict[str, str] = {"clean": "Limpio", "paper": "Papel", "chalk": "Pizarra", "transparent": "Transparente"}
BODIES: dict[str, str] = {"man": "Hombre", "woman": "Mujer", "child": "Niño/a"}
HAIRS: dict[str, str] = {"none": "Calvo", "short": "Corto", "long": "Largo", "bun": "Moño",
                         "ponytail": "Coleta", "curly": "Rizado", "spiky": "De punta"}
OUTFITS: dict[str, str] = {"shirt_pants": "Camisa + pantalón", "dress": "Vestido", "shirt_skirt": "Camisa + falda"}
ACCESSORIES: dict[str, str] = {"none": "Ninguno", "glasses": "Gafas", "tie": "Corbata", "cap": "Gorra",
                               "hat": "Sombrero", "backpack": "Mochila", "headphones": "Auriculares"}

# Colores con nombre → hex (la IA a veces escribe "orange"/"naranja").
_COLOR_NAMES = {
    "orange": "#f97316", "naranja": "#f97316", "blue": "#2563eb", "azul": "#2563eb",
    "red": "#dc2626", "rojo": "#dc2626", "green": "#16a34a", "verde": "#16a34a",
    "yellow": "#eab308", "amarillo": "#eab308", "black": "#1f2937", "negro": "#1f2937",
    "white": "#f8fafc", "blanco": "#f8fafc", "gray": "#64748b", "grey": "#64748b", "gris": "#64748b",
    "purple": "#7c3aed", "morado": "#7c3aed", "pink": "#ec4899", "rosa": "#ec4899",
    "brown": "#92400e", "marron": "#92400e", "marrón": "#92400e", "navy": "#1e3a8a",
    "denim": "#3b5b8c", "jeans": "#3b5b8c", "beige": "#d6c7a1", "celeste": "#38bdf8",
}
_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

# Paleta por defecto para distinguir personajes sin color explícito.
_SHIRTS = ["#2563eb", "#f97316", "#16a34a", "#db2777", "#7c3aed", "#0891b2"]
_PANTS = ["#334155", "#3b5b8c", "#1f2937", "#57534e", "#475569", "#3f3f46"]

MAX_SHOTS = 16
MAX_CHARACTERS = 6
MAX_ACTORS_PER_SHOT = 4


def library() -> dict[str, Any]:
    """Vocabulario para la UI (desplegables con etiqueta) y para la IA."""
    def opts(d: dict[str, str]) -> list[dict[str, str]]:
        return [{"key": k, "label": v} for k, v in d.items()]
    return {
        "poses": opts(POSES),
        "pose_groups": [{"label": g, "keys": keys} for g, keys in POSE_GROUPS],
        "expressions": opts(EXPRESSIONS), "fx": opts(FX), "environments": opts(ENVIRONMENTS),
        "cameras": opts(CAMERAS), "styles": opts(STYLES), "bodies": opts(BODIES),
        "hairs": opts(HAIRS), "outfits": opts(OUTFITS), "accessories": opts(ACCESSORIES),
    }


# --- Normalización (tolerante: la entrada suele venir de un LLM) ---------------

def _num(v: Any, default: float) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return f if f == f and abs(f) != float("inf") else default


def _str(v: Any, default: str = "", limit: int = 400) -> str:
    s = str(v).strip() if v is not None else ""
    return (s or default)[:limit]


def _pick(v: Any, allowed: dict[str, str], default: str) -> str:
    s = _str(v).lower().replace(" ", "_").replace("-", "_")
    return s if s in allowed else default


def _color(v: Any, default: str | None) -> str | None:
    s = _str(v).lower()
    if not s:
        return default
    if _HEX.match(s):
        return s
    for name, hexv in _COLOR_NAMES.items():
        if name in s:
            return hexv
    return default


def _slug(v: Any, default: str) -> str:
    s = re.sub(r"[^a-z0-9_]+", "_", _str(v).lower()).strip("_")
    return s[:32] or default


def _character(raw: Any, i: int) -> dict[str, Any]:
    c = raw if isinstance(raw, dict) else {}
    body = _pick(c.get("body") or c.get("gender"), BODIES, "man")
    if body == "man" and _str(c.get("gender")).lower() in ("female", "mujer", "woman", "f"):
        body = "woman"
    default_hair = "long" if body == "woman" else "short"
    outfit = _pick(c.get("outfit"), OUTFITS, "shirt_pants")
    return {
        "id": _slug(c.get("id") or c.get("name"), f"char{i + 1}"),
        "name": _str(c.get("name"), f"Personaje {i + 1}", 40),
        "role": _str(c.get("role"), "", 80),
        "body": body,
        "hair": _pick(c.get("hair"), HAIRS, default_hair),
        "hair_color": _color(c.get("hair_color"), None),
        "outfit": outfit,
        "shirt": _color(c.get("shirt"), _SHIRTS[i % len(_SHIRTS)]),
        "pants": _color(c.get("pants"), _PANTS[i % len(_PANTS)]),
        "accessory": _pick(c.get("accessory"), ACCESSORIES, "none"),
        "accent_color": _color(c.get("accent_color"), None),
        "description": _str(c.get("description"), "", 300),
    }


def _fx(raw: Any, char_ids: set[str]) -> dict[str, Any] | None:
    if isinstance(raw, str):
        raw = {"type": raw}
    if not isinstance(raw, dict):
        return None
    t = _pick(raw.get("type"), FX, "")
    if not t:
        return None
    out: dict[str, Any] = {"type": t}
    tgt = _slug(raw.get("target"), "") if raw.get("target") else ""
    if tgt in char_ids:
        out["target"] = tgt
    at = _num(raw.get("at"), 0.0)
    if at > 0:
        out["at"] = round(at, 2)
    return out


def _actor(raw: Any, char_ids: set[str]) -> dict[str, Any] | None:
    a = raw if isinstance(raw, dict) else {}
    aid = _slug(a.get("id"), "")
    if aid not in char_ids:
        return None
    out: dict[str, Any] = {
        "id": aid,
        "pose": _pick(a.get("pose"), POSES, "stand"),
        "expression": _pick(a.get("expression"), EXPRESSIONS, "neutral"),
        "x": round(min(1.4, max(-0.4, _num(a.get("x"), 0.5))), 3),
    }
    if a.get("to_x") is not None:
        tx = round(min(1.4, max(-0.4, _num(a.get("to_x"), out["x"]))), 3)
        if abs(tx - out["x"]) > 0.001:
            out["to_x"] = tx
    fac = a.get("facing")
    if isinstance(fac, str):
        fac = {"left": -1, "izquierda": -1, "right": 1, "derecha": 1}.get(fac.lower())
    if fac is not None:
        out["facing"] = -1 if _num(fac, 1) < 0 else 1
    return out


def normalize(raw: Any, *, duration: float | None = None) -> dict[str, Any]:
    """Devuelve un storyboard válido y completo. Nunca lanza: rellena con defaults.

    Los planos quedan CONTIGUOS (start del siguiente = end del anterior) y la
    duración total es la suma. Si se pasa ``duration`` se reescalan a ese total."""
    sb = raw if isinstance(raw, dict) else {}
    style_raw = sb.get("style") if isinstance(sb.get("style"), dict) else {}
    env_raw = sb.get("environment")
    if isinstance(env_raw, str):
        env_raw = {"preset": env_raw}
    env_raw = env_raw if isinstance(env_raw, dict) else {}

    chars: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, c in enumerate((sb.get("characters") or [])[:MAX_CHARACTERS] if isinstance(sb.get("characters"), list) else []):
        ch = _character(c, i)
        base, n = ch["id"], 2
        while ch["id"] in seen:
            ch["id"] = f"{base}_{n}"
            n += 1
        seen.add(ch["id"])
        chars.append(ch)
    char_ids = {c["id"] for c in chars}

    shots_raw = sb.get("shots") if isinstance(sb.get("shots"), list) else []
    shots: list[dict[str, Any]] = []
    for i, s in enumerate(shots_raw[:MAX_SHOTS]):
        if not isinstance(s, dict):
            continue
        start, end = s.get("start"), s.get("end")
        length = _num(s.get("duration"), 0.0)
        if length <= 0 and start is not None and end is not None:
            length = _num(end, 0) - _num(start, 0)
        if length <= 0:
            length = 2.0
        actors = []
        for a in (s.get("actors") or [])[:MAX_ACTORS_PER_SHOT] if isinstance(s.get("actors"), list) else []:
            na = _actor(a, char_ids)
            if na and all(x["id"] != na["id"] for x in actors):
                actors.append(na)
        fxs = [x for x in (_fx(f, char_ids) for f in (s.get("fx") or []) if isinstance(s.get("fx"), list)) if x]
        shot: dict[str, Any] = {
            "id": _slug(s.get("id"), f"s{i + 1}"),
            "length": max(0.5, min(20.0, length)),
            "description": _str(s.get("description") or s.get("action"), "", 400),
            "caption": _str(s.get("caption"), "", 80),
            "camera": _pick(s.get("camera"), CAMERAS, "wide"),
            "actors": actors,
            "fx": fxs[:6],
        }
        focus = _slug(s.get("focus"), "") if s.get("focus") else ""
        if focus in {a["id"] for a in actors}:
            shot["focus"] = focus
        if s.get("moving") is not None:
            shot["moving"] = bool(s.get("moving"))
        shots.append(shot)

    if not shots:
        shots.append({"id": "s1", "length": 3.0, "description": "", "caption": "", "camera": "wide",
                      "actors": [{"id": c["id"], "pose": "idle", "expression": "neutral",
                                  "x": round(0.35 + 0.3 * k, 3)} for k, c in enumerate(chars[:2])],
                      "fx": []})

    # Ids de plano únicos.
    used: set[str] = set()
    for i, sh in enumerate(shots):
        if sh["id"] in used:
            sh["id"] = f"s{i + 1}_{len(used)}"
        used.add(sh["id"])

    total = sum(sh["length"] for sh in shots)
    target = _num(duration, 0.0) if duration is not None else 0.0
    scale = (target / total) if target > 0 and total > 0 else 1.0
    cursor = 0.0
    for sh in shots:
        length = sh.pop("length") * scale
        sh["start"] = round(cursor, 3)
        cursor += length
        sh["end"] = round(cursor, 3)
    shots[-1]["end"] = round(target if target > 0 else cursor, 3)

    return {
        "version": 1,
        "title": _str(sb.get("title"), "Historia", 80),
        "logline": _str(sb.get("logline"), "", 300),
        "script": _str(sb.get("script"), "", 2000),
        "duration": shots[-1]["end"],
        "style": {
            "preset": _pick(style_raw.get("preset"), STYLES, "clean"),
            "accent": _color(style_raw.get("accent"), None),
            "captions": bool(style_raw.get("captions", True)),
        },
        "environment": {
            "preset": _pick(env_raw.get("preset"), ENVIRONMENTS, "none"),
            "description": _str(env_raw.get("description"), "", 200),
        },
        "characters": chars,
        "shots": shots,
    }


def is_stick(comp: MotionComposition | dict | None) -> bool:
    meta = comp.metadata if isinstance(comp, MotionComposition) else ((comp or {}).get("metadata") or {})
    return isinstance((meta or {}).get("stick"), dict)


def build_composition(comp_id: str, storyboard: Any, *, width: int = 1080, height: int = 1920,
                      fps: int = 30, name: str | None = None,
                      metadata: dict | None = None) -> MotionComposition:
    """Storyboard → ``MotionComposition`` editable (una capa html con el motor)."""
    sb = normalize(storyboard)
    meta = dict(metadata or {})
    meta.update({"template": "stick_scene", "stick": sb,
                 "theme": themes.resolve_theme("light", accent=sb["style"]["accent"])})
    return MotionComposition(
        id=comp_id, name=name or sb["title"], width=int(width), height=int(height), fps=int(fps),
        # El motor pinta su propio fondo (salvo el estilo transparente): la composición
        # siempre es transparente para poder usarse también como overlay.
        duration=sb["duration"], background="transparent",
        metadata=meta,
        layers=[MotionLayer(id=LAYER_ID, type="html", x=0, y=0, width=int(width), height=int(height),
                            start=0.0, end=None, html="", css="", js=STICK_JS)],
    )


# --- Prompts para IAs generativas externas (boceto + vídeo) --------------------

_BODY_EN = {"man": "male stick figure", "woman": "female stick figure", "child": "small child stick figure"}
_HAIR_EN = {"none": "bald", "short": "short hair", "long": "long hair", "bun": "hair in a bun",
            "ponytail": "ponytail", "curly": "curly hair", "spiky": "spiky hair"}
_ENV_EN = {"none": "plain empty background", "street": "simple city street", "bus": "inside a city bus",
           "office": "simple office", "room": "simple living room", "classroom": "classroom",
           "park": "simple park"}
_STYLE_EN = {
    "clean": "minimalist stick figure animation, clean black line art on a white background, flat colors",
    "paper": "hand-drawn stick figure sketch on warm off-white paper, clean ink lines",
    "chalk": "white chalk stick figure drawing on a dark slate board",
    "transparent": "minimalist stick figure line art, isolated, plain background",
}
_CAM_EN = {"wide": "wide shot", "medium": "medium shot", "close": "close-up"}


_COLOR_EN = {
    "#f97316": "orange", "#2563eb": "blue", "#dc2626": "red", "#16a34a": "green", "#eab308": "yellow",
    "#1f2937": "black", "#f8fafc": "white", "#64748b": "gray", "#7c3aed": "purple", "#ec4899": "pink",
    "#92400e": "brown", "#1e3a8a": "navy blue", "#3b5b8c": "denim blue", "#d6c7a1": "beige",
    "#38bdf8": "light blue", "#334155": "dark gray", "#db2777": "magenta", "#0891b2": "teal",
    "#57534e": "dark brown", "#475569": "slate gray", "#3f3f46": "charcoal",
}


def _color_word(hexv: str | None) -> str:
    return _COLOR_EN.get(hexv or "", hexv or "")


def _char_sheet(c: dict[str, Any]) -> str:
    parts = [_BODY_EN.get(c["body"], "stick figure"), _HAIR_EN.get(c["hair"], "")]
    if c["outfit"] == "dress":
        parts.append(f"{_color_word(c['shirt'])} dress")
    elif c["outfit"] == "shirt_skirt":
        parts.append(f"{_color_word(c['shirt'])} shirt and {_color_word(c['pants'])} skirt")
    else:
        parts.append(f"{_color_word(c['shirt'])} shirt and {_color_word(c['pants'])} pants")
    if c["accessory"] != "none":
        parts.append(c["accessory"])
    if c["description"]:
        parts.append(c["description"])
    return f"{c['name']}: " + ", ".join(p for p in parts if p)


def prompts(storyboard: Any) -> dict[str, str]:
    """Prompts deterministas (en inglés, lo que mejor entienden los modelos de
    imagen/vídeo) con bloqueo de continuidad del reparto."""
    sb = normalize(storyboard)
    names = {c["id"]: c["name"] for c in sb["characters"]}
    style = _STYLE_EN[sb["style"]["preset"]]
    env = sb["environment"]["description"] or _ENV_EN[sb["environment"]["preset"]]
    cast = "\n".join(f"- {_char_sheet(c)}" for c in sb["characters"]) or "- (no characters)"
    continuity = (
        "CONTINUITY LOCK: every character keeps exactly the same body proportions, hairstyle, clothing "
        "and colors in every shot. Same art style, same line weight, same setting throughout."
    )

    def shot_line(s: dict[str, Any]) -> str:
        who = "; ".join(
            f"{names.get(a['id'], a['id'])} {POSES[a['pose']].lower()} ({a['pose']}), {a['expression']} face"
            + (f", moving {'right' if a['to_x'] > a['x'] else 'left'}" if 'to_x' in a else "")
            for a in s["actors"])
        desc = s["description"] or who
        fx = ", ".join(f["type"] for f in s["fx"])
        return (f"{s['start']:.1f}-{s['end']:.1f}s [{_CAM_EN[s['camera']]}] {desc}"
                + (f" | poses: {who}" if s["description"] and who else "")
                + (f" | effects: {fx}" if fx else ""))

    first = sb["shots"][0]
    image = (
        f"{style}. Storyboard keyframe. Setting: {env}.\n"
        f"Characters:\n{cast}\n"
        f"Scene: {first['description'] or sb['logline'] or sb['title']}.\n"
        f"Composition: {_CAM_EN[first['camera']]}, full bodies visible, simple readable poses, "
        "generous empty space, no text.\n" + continuity
    )
    video = (
        f"{style}. {sb['duration']:.0f}-second animation. Setting: {env}.\n"
        f"Characters:\n{cast}\n"
        "Timeline:\n" + "\n".join(f"- {shot_line(s)}" for s in sb["shots"]) + "\n"
        "Smooth, readable stick figure motion; clear poses; any impact or conflict is shown "
        "non-graphically with poses, motion lines and reactions only.\n" + continuity
    )
    negative = (
        "realistic, 3D render, photo, detailed anatomy, blood, gore, wounds, weapons close-up, "
        "text, watermark, logo, extra limbs, extra characters, changing clothes, inconsistent colors, "
        "different art style between shots, caricatured or stereotyped ethnic features, blurry, noisy"
    )
    return {"image": image, "video": video, "negative": negative, "continuity": continuity}


# --- Reparto del proyecto (continuidad entre escenas) -------------------------

def project_cast(project_id: str) -> list[dict[str, Any]]:
    """Personajes definidos en las historias del proyecto (sin duplicados por id;
    gana la versión más reciente)."""
    from . import service as motion_service
    by_id: dict[str, dict[str, Any]] = {}
    for comp in motion_service.list_compositions(project_id):
        if not is_stick(comp):
            continue
        for ch in comp.metadata["stick"].get("characters") or []:
            if isinstance(ch, dict) and ch.get("id"):
                by_id[ch["id"]] = copy.deepcopy(ch)
    return list(by_id.values())


# --- Ejemplo (plantilla de la galería) -----------------------------------------

DEMO_STORYBOARD: dict[str, Any] = {
    "title": "El frenazo del bus",
    "logline": "Leo va al trabajo en bus; un frenazo lo tira al suelo y Rosa no puede aguantar la risa.",
    "style": {"preset": "clean", "captions": True},
    "environment": {"preset": "bus"},
    "characters": [
        {"id": "leo", "name": "Leo", "role": "protagonista", "body": "man", "hair": "short",
         "shirt": "#2563eb", "pants": "#334155", "accessory": "backpack", "accent_color": "#f59e0b"},
        {"id": "rosa", "name": "Rosa", "role": "pasajera", "body": "woman", "hair": "bun",
         "outfit": "shirt_pants", "shirt": "#f97316", "pants": "#3b5b8c"},
    ],
    "shots": [
        {"duration": 2.2, "description": "Leo va de pie en el bus, agarrado a la barra, camino al trabajo.",
         "caption": "Lunes, 7:40 a. m.", "camera": "wide",
         "actors": [{"id": "leo", "pose": "hold_rail", "expression": "neutral", "x": 0.36, "facing": 1},
                    {"id": "rosa", "pose": "sit_phone", "expression": "neutral", "x": 0.74, "facing": -1}]},
        {"duration": 1.6, "description": "El bus frena de golpe y Leo sale despedido.", "caption": "¡Frenazo!",
         "camera": "medium", "focus": "leo", "moving": False, "fx": ["shake", {"type": "exclaim", "target": "leo"}],
         "actors": [{"id": "leo", "pose": "fall", "expression": "surprised", "x": 0.36, "facing": 1},
                    {"id": "rosa", "pose": "sit_phone", "expression": "surprised", "x": 0.74, "facing": -1}]},
        {"duration": 1.8, "description": "Leo queda tumbado en el suelo, mareado.", "camera": "close", "focus": "leo",
         "moving": False, "fx": [{"type": "dizzy", "target": "leo"}],
         "actors": [{"id": "leo", "pose": "lie", "expression": "dizzy", "x": 0.36, "facing": 1}]},
        {"duration": 2.4, "description": "Rosa, con su polo naranja, no puede aguantar la risa.",
         "caption": "…y Rosa lo vio todo", "camera": "medium", "focus": "rosa", "moving": False,
         "fx": [{"type": "laugh", "target": "rosa"}],
         "actors": [{"id": "leo", "pose": "lie", "expression": "pain", "x": 0.36, "facing": 1},
                    {"id": "rosa", "pose": "laugh_point", "expression": "laugh", "x": 0.74, "facing": -1}]},
    ],
}


def demo_template(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    sb = copy.deepcopy(params.get("storyboard") or DEMO_STORYBOARD)
    if params.get("theme") == "dark":
        sb.setdefault("style", {})["preset"] = "chalk"
    elif params.get("theme") == "editorial":
        sb.setdefault("style", {})["preset"] = "paper"
    return build_composition(comp_id, sb, width=int(params.get("width") or 1080),
                             height=int(params.get("height") or 1920),
                             name=params.get("name"))
