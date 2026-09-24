"""Copiar / pegar ATRIBUTOS entre clips, eligiendo qué (#13; «Pegar atributos» de CapCut).

Un atributo es un GRUPO de propiedades (posición, mezcla, animación, máscara,
audio…) que se pega en uno o varios clips sin tocar su contenido, su id ni su
sitio en la timeline. Trabaja sobre dicts (``TimelineClip.model_dump()``).
Espejo de ``frontend/src/lib/clipAttrs.js``.
"""
from __future__ import annotations

import copy
import uuid
from typing import Any, Optional

from .clip_keyframes import AUDIO_FX_KEYS, KF_PROP_KEYS, interp_items, static_props
from .clip_mask import MASK_KF_KEYS

_VISUAL = ("video", "image", "shape", "text")
_MEDIA = ("video", "image")
_SOUND = ("video", "audio")

# (id, etiqueta, tipos de clip, solo entre clips del mismo tipo)
ATTR_GROUPS: tuple[tuple[str, str, tuple[str, ...], bool], ...] = (
    ("transform", "Posición, escala y giro", _VISUAL, False),
    ("flip", "Voltear", _VISUAL, False),
    ("blend", "Opacidad y modo de fusión", _VISUAL, False),
    ("animation", "Animación (keyframes)", _VISUAL, False),
    ("transitions", "Entrada y salida", ("video", "image", "text"), False),
    ("crop", "Recorte y encuadre", _MEDIA, False),
    ("effects", "Filtro, efectos y ajustes", (*_MEDIA, "adjustment"), False),
    ("mask", "Máscara", _VISUAL, False),
    ("chroma", "Croma y contorno", _MEDIA, False),
    ("style", "Estilo", ("text", "shape"), True),
    ("speed", "Velocidad", _SOUND, False),
    ("audio", "Volumen y efectos de audio", _SOUND, False),
)
ATTR_GROUP_IDS = tuple(g[0] for g in ATTR_GROUPS)
_GROUP_BY_ID = {g[0]: g for g in ATTR_GROUPS}

# Propiedades animables que lleva cada grupo (ver clipAttrs.js).
_KF_FAMILIES = {
    "animation": ("x", "y", "scale", "rotation", "opacity", "rot_x", "rot_y", "draw"),
    "crop": ("cx", "cy", "zoom"),
    "mask": tuple(MASK_KF_KEYS),
    "audio": ("volume", *AUDIO_FX_KEYS),
}
_KF_TOUCH = {*_KF_FAMILIES, "transform", "blend"}
_CROP_KEYS = set(_KF_FAMILIES["crop"])

_POSE_DEFAULTS = {"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0.0}
_TEXT_3D_KEYS = ("rot_x", "rot_y", "perspective")
_TEXT_KEEP_KEYS = (*_POSE_DEFAULTS, *_TEXT_3D_KEYS, "opacity")
SHAPE_STYLE_KEYS = ("fill", "stroke", "strokeWidth", "cornerRadius", "dash")

_EPS = 1e-6
_T_EPS = 1e-4


def _num(v: Any, default: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    return default if v is None or n != n else n


def _kf_id() -> str:
    return f"k{uuid.uuid4().hex[:8]}"


def group_applies(group_id: str, source: dict, target: dict) -> bool:
    """¿Se puede pegar el grupo ``group_id`` de ``source`` en ``target``?"""
    g = _GROUP_BY_ID.get(group_id)
    if not g or source.get("kind") not in g[2] or target.get("kind") not in g[2]:
        return False
    return not (g[3] and source.get("kind") != target.get("kind"))


# --- Valores fijos ----------------------------------------------------------

def _holder(clip: dict) -> Optional[str]:
    return {"text": "style", "shape": "shape"}.get(clip.get("kind"))


def _pose_of(clip: dict) -> dict:
    h = _holder(clip)
    src = (clip.get(h) if h else clip.get("transform")) or {}
    return {k: _num(src.get(k), d) for k, d in _POSE_DEFAULTS.items()}


def _opacity_of(clip: dict) -> float:
    h = _holder(clip)
    return _num((clip.get(h) or {}).get("opacity") if h else clip.get("opacity"), 1.0)


def _paste_transform(out: dict, src: dict) -> None:
    h = _holder(out)
    key = h or "transform"
    out[key] = {**(out.get(key) or {}), **_pose_of(src)}
    if out.get("kind") == "text" and src.get("kind") == "text":
        sst = src.get("style") or {}
        for k in _TEXT_3D_KEYS:
            if sst.get(k) is None:
                out["style"].pop(k, None)
            else:
                out["style"][k] = sst[k]
    if out.get("kind") in _MEDIA and src.get("kind") in _MEDIA:
        if src.get("layout"):
            out["layout"] = src["layout"]
        if src.get("frame"):
            out["frame"] = src["frame"]


def _paste_blend(out: dict, src: dict) -> None:
    h = _holder(out)
    o = _opacity_of(src)
    if h:
        out[h] = {**(out.get(h) or {}), "opacity": o}
    else:
        out["opacity"] = o
    out["blend_mode"] = src.get("blend_mode") or None


def _paste_crop(out: dict, src: dict) -> None:
    if not src.get("reframe"):
        out["reframe"] = None
        return
    rf = copy.deepcopy(src["reframe"])
    for k in ("keyframes", "keyframes2"):
        rf[k] = [{**kf, "id": _kf_id()} for kf in (rf.get(k) or [])]
    # `master` es de cómo está guardado el ARCHIVO del destino.
    rf["master"] = bool((out.get("reframe") or {}).get("master"))
    out["reframe"] = rf


def _paste_chroma(out: dict, src: dict) -> None:
    sb = src.get("bg_removal") if isinstance(src.get("bg_removal"), dict) else None
    tb = out.get("bg_removal") if isinstance(out.get("bg_removal"), dict) else None
    if not sb and not tb:
        return
    # El recorte IA (auto) es del archivo del destino: nunca se pega.
    nxt = dict(tb or {})
    for k in ("chroma", "outline"):
        if sb and sb.get(k):
            nxt[k] = copy.deepcopy(sb[k])
        else:
            nxt.pop(k, None)
    if not tb:
        nxt["enabled"] = sb.get("enabled") is not False
        if sb.get("mode"):
            nxt["mode"] = sb["mode"]
    elif sb and (sb.get("chroma") or {}).get("enabled"):
        nxt["enabled"] = True
    out["bg_removal"] = nxt if (nxt.get("chroma") or nxt.get("outline") or nxt.get("auto")) else None


def _paste_style(out: dict, src: dict) -> None:
    if out.get("kind") == "text":
        st = copy.deepcopy(src.get("style") or {})
        tst = out.get("style") or {}
        for k in _TEXT_KEEP_KEYS:
            if tst.get(k) is None:
                st.pop(k, None)
            else:
                st[k] = tst[k]
        out["style"] = st
        return
    shape = dict(out.get("shape") or {})
    sshape = src.get("shape") or {}
    for k in SHAPE_STYLE_KEYS:
        if sshape.get(k) is None:
            shape.pop(k, None)
        else:
            shape[k] = sshape[k]
    out["shape"] = shape


def _paste_mask(out: dict, src: dict) -> None:
    out["masks"] = [{**copy.deepcopy(m), "id": f"m{uuid.uuid4().hex[:8]}"} for m in (src.get("masks") or [])]


def _set(**fn):
    def apply(out: dict, src: dict) -> None:
        for k, f in fn.items():
            out[k] = f(src)
    return apply


_APPLY = {
    "transform": _paste_transform,
    "flip": _set(flip_h=lambda s: bool(s.get("flip_h")), flip_v=lambda s: bool(s.get("flip_v"))),
    "blend": _paste_blend,
    "animation": _set(anim=lambda s: copy.deepcopy(s.get("anim"))),   # pistas `anim` antiguas
    "transitions": _set(appear=lambda s: s.get("appear") or "none", exit=lambda s: s.get("exit") or "none"),
    "crop": _paste_crop,
    "effects": _set(effects=lambda s: copy.deepcopy(s.get("effects")) or {}, look=lambda s: s.get("look") or "none",
                    filters=lambda s: copy.deepcopy(s.get("filters"))),
    "mask": _paste_mask,
    "chroma": _paste_chroma,
    "style": _paste_style,
    "speed": _set(speed=lambda s: _num(s.get("speed"), 1.0), keep_pitch=lambda s: s.get("keep_pitch") is not False,
                  reverse=lambda s: bool(s.get("reverse"))),
    "audio": _set(volume=lambda s: _num(s.get("volume"), 1.0), muted=lambda s: bool(s.get("muted")),
                  audio_fx=lambda s: copy.deepcopy(s.get("audio_fx")) or {}),
}


# --- Keyframes --------------------------------------------------------------

def _items_of(clip: dict) -> list[dict]:
    kf = clip.get("keyframes")
    if not isinstance(kf, dict) or not kf.get("enabled") or not isinstance(kf.get("items"), list):
        return []
    out = []
    for k in kf["items"]:
        if not isinstance(k, dict):
            continue
        t = _num(k.get("t"), float("nan"))
        if t != t:
            continue
        out.append({**k, "t": t, "props": dict(k.get("props") or {})})
    return sorted(out, key=lambda k: k["t"])


def _restrict_items(items: list[dict], keys, base: dict) -> list[dict]:
    """Solo las propiedades ``keys`` que cambian algo (fuera las que valen lo mismo
    que el valor fijo en todos los keyframes); sin keyframes vacíos."""
    keep = [
        key for key in keys
        if any(k["props"].get(key) is not None for k in items) and (
            key in _CROP_KEYS
            or not all(k["props"].get(key) is None or abs(float(k["props"][key]) - base[key]) < _EPS
                       for k in items)
        )
    ]
    out = []
    for k in items:
        props = {key: float(k["props"][key]) for key in keep if k["props"].get(key) is not None}
        if props:
            out.append({**k, "props": props})
    return out


def _constant_props(items: list[dict]) -> Optional[dict]:
    out: dict = {}
    keys = {key for k in items for key in k["props"]}
    for key in keys:
        v0 = items[0]["props"].get(key)
        if v0 is None or any(k["props"].get(key) is None or abs(k["props"][key] - v0) > _EPS for k in items):
            return None
        out[key] = v0
    return out


def _keys_of(items: list[dict]) -> list[str]:
    seen: dict = {}
    for k in items:
        for key in k["props"]:
            seen.setdefault(key, True)
    return list(seen)


def _resample(s: list[dict], t: list[dict], base: dict) -> list[dict]:
    times: list[float] = []
    for v in sorted(k["t"] for k in (*s, *t)):
        if not times or v - times[-1] > _T_EPS:
            times.append(v)
    s_keys, t_keys = _keys_of(s), _keys_of(t)
    out = []
    for time in times:
        own = next((k for k in (*s, *t) if abs(k["t"] - time) <= _T_EPS), {})
        ps, pt = interp_items(s, time, base), interp_items(t, time, base)
        props = {key: round(pt[key], 6) for key in t_keys}
        props.update({key: round(ps[key], 6) for key in s_keys})
        item = {"t": time, "interpolation": own.get("interpolation") or "linear", "props": props}
        if own.get("bezier"):
            item["bezier"] = own["bezier"]
        out.append(item)
    return out


def merge_keyframes(target: dict, source: dict, keys) -> Optional[dict]:
    """Keyframes del destino tras pegar las propiedades ``keys`` del origen: las del
    origen sustituyen a las del destino (si el origen no las anima, el destino deja
    de animarlas) y el resto del destino se conserva."""
    pasted = set(keys)
    s = _restrict_items(_items_of(source), [k for k in KF_PROP_KEYS if k in pasted], static_props(source))
    t = _restrict_items(_items_of(target), [k for k in KF_PROP_KEYS if k not in pasted], static_props(target))
    tkf = target.get("keyframes")
    if not s and not (isinstance(tkf, dict) and tkf.get("enabled")):
        return tkf
    if not s:
        items = t
    elif not t:
        items = s
    else:
        ct = _constant_props(t)
        cs = None if ct is not None else _constant_props(s)
        if ct is not None:
            items = [{**k, "props": {**k["props"], **ct}} for k in s]
        elif cs is not None:
            items = [{**k, "props": {**k["props"], **cs}} for k in t]
        else:
            items = _resample(s, t, static_props(target))
    if not items:
        return None
    return {"enabled": True, "items": [{**k, "id": _kf_id()} for k in items]}


def paste_attributes(target: dict, source: dict, groups) -> dict:
    """``target`` con los grupos ``groups`` de ``source`` pegados (no muta la
    entrada). Los grupos que no valen para ese par de clips se ignoran."""
    if target.get("id") == source.get("id"):
        return target
    wanted = set(groups or ())
    ids = [g for g in ATTR_GROUP_IDS if g in wanted and group_applies(g, source, target)]
    if not ids:
        return target
    out = copy.deepcopy(target)
    for g in ids:
        _APPLY[g](out, source)
    if any(g in _KF_TOUCH for g in ids):
        keys = [k for g in ids for k in _KF_FAMILIES.get(g, ())]
        out["keyframes"] = merge_keyframes(target, source, keys)
    return out
