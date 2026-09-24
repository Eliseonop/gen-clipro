"""Efectos y filtros de sonido (#16) para el export.

Cada efecto son una o más ETAPAS (cadenas de nodos) que suenan igual que en la
vista previa (Web Audio). La intensidad k (0–1, animable con keyframes) funde la
señal seca con las etapas: con una, ``out = (1 − k)·seco + k·efecto``; con N,
``p = k·N`` y la etapa j pesa ``max(0, 1 − |p − j|)`` (la 0 es la seca). Si se
anima, los pesos siguen la misma envolvente que el preview (``volume`` con
``eval=frame``). Espejo de ``frontend/src/lib/audioFx.js``.
"""
from __future__ import annotations

from typing import Any

from .clip_keyframes import clip_props_at, ffmpeg_envelope, keyframes_enabled

_BW = 0.7071

AUDIO_FX: tuple[dict, ...] = (
    # Efectos
    {"id": "eq", "label": "Brillo (EQ)", "group": "effect", "stages": [[{"t": "peaking", "f": 3000, "q": 1, "g": 4}]]},
    {"id": "compressor", "label": "Compresor", "group": "effect",
     "stages": [[{"t": "compressor", "threshold": -20, "ratio": 8, "attack": 0.02, "release": 0.2, "knee": 6}]]},
    {"id": "reverb", "label": "Reverberación", "group": "effect",
     "stages": [[{"t": "echo", "in": 0.8, "out": 0.88, "delay": 0.04, "decay": 0.4}]]},
    {"id": "echo", "label": "Eco", "group": "effect",
     "stages": [[{"t": "echo", "in": 0.8, "out": 0.9, "delay": 1.0, "decay": 0.3}]]},
    {"id": "denoise", "label": "Reducir ruido", "group": "effect",
     "stages": [[{"t": "highpass", "f": 80, "q": _BW}, {"t": "lowpass", "f": 12000, "q": _BW}]]},
    {"id": "distortion", "label": "Distorsión", "group": "effect", "stages": [[{"t": "drive", "k": 4}]]},
    # Filtros de sonido (#16)
    {"id": "underwater", "label": "Bajo el agua", "group": "filter", "stages": [
        [{"t": "lowpass", "f": 2500, "q": 0.8}, {"t": "lowshelf", "f": 160, "g": 2}],
        [{"t": "lowpass", "f": 900, "q": 0.85}, {"t": "lowshelf", "f": 160, "g": 3.5}],
        [{"t": "lowpass", "f": 380, "q": 0.9}, {"t": "lowshelf", "f": 160, "g": 5}],
    ]},
    {"id": "telephone", "label": "Teléfono", "group": "filter",
     "stages": [[{"t": "highpass", "f": 450, "q": _BW}, {"t": "lowpass", "f": 3000, "q": _BW},
               {"t": "peaking", "f": 1700, "q": 1, "g": 6}]]},
    {"id": "radio", "label": "Radio antigua", "group": "filter",
     "stages": [[{"t": "highpass", "f": 300, "q": _BW}, {"t": "lowpass", "f": 4500, "q": _BW},
               {"t": "peaking", "f": 1200, "q": 0.8, "g": 5}, {"t": "drive", "k": 1.5}]]},
    {"id": "megaphone", "label": "Megáfono", "group": "filter",
     "stages": [[{"t": "highpass", "f": 800, "q": _BW}, {"t": "lowpass", "f": 3200, "q": _BW},
               {"t": "peaking", "f": 2000, "q": 1.2, "g": 9}, {"t": "drive", "k": 3}]]},
    {"id": "muffled", "label": "Amortiguado", "group": "filter", "stages": [
        [{"t": "lowpass", "f": 3500, "q": _BW}],
        [{"t": "lowpass", "f": 1600, "q": _BW}],
        [{"t": "lowpass", "f": 900, "q": _BW}],
    ]},
)
AUDIO_FX_IDS = tuple(f["id"] for f in AUDIO_FX)
AUDIO_FX_BY_ID = {f["id"]: f for f in AUDIO_FX}


def fx_intensity(v: Any) -> float:
    if v is True:
        return 1.0
    if v is False or v is None:
        return 0.0
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if n != n else min(1.0, max(0.0, n))


def compressor_makeup(node: dict) -> float:
    """La compensación que Web Audio aplica sola: (1 / ganancia a 0 dBFS)^0,6."""
    full = 10 ** (node["threshold"] * (1 - 1 / node["ratio"]) / 20)
    return full ** -0.6


def ffmpeg_node(node: dict) -> str:
    """Un nodo de la cadena como filtro de FFmpeg (biquads del Cookbook, como Web Audio)."""
    t = node["t"]
    if t in ("lowpass", "highpass"):
        return f"{t}=f={node['f']}:t=q:w={node['q']}"
    if t == "peaking":
        return f"equalizer=f={node['f']}:t=q:w={node['q']}:g={node['g']}"
    if t in ("lowshelf", "highshelf"):
        return f"{t}=f={node['f']}:t=s:w=1:g={node['g']}"      # pendiente S=1 = Web Audio
    if t == "echo":
        return f"aecho={node['in']}:{node['out']}:{node['delay'] * 1000:g}:{node['decay']}"
    if t == "compressor":
        thr = 10 ** (node["threshold"] / 20)
        return (f"acompressor=threshold={thr:.5f}:ratio={node['ratio']}:attack={node['attack'] * 1000:g}"
                f":release={node['release'] * 1000:g}:knee={10 ** (node['knee'] / 20):.4f}"
                f":makeup={compressor_makeup(node):.4f}")   # knee de FFmpeg = factor lineal
    if t == "drive":
        k = float(node["k"])
        return f"aeval=exprs=tanh({k:g}*val(0))/{_tanh(k):.6f}|tanh({k:g}*val(1))/{_tanh(k):.6f}"
    raise ValueError(f"nodo de audio desconocido: {t}")


def _tanh(x: float) -> float:
    import math
    return math.tanh(x)


def _static_values(clip: Any) -> dict:
    if keyframes_enabled(clip):
        p = clip_props_at(clip, 0.0)
        return {i: fx_intensity(p.get(i)) for i in AUDIO_FX_IDS}
    raw = clip.get("audio_fx") if isinstance(clip, dict) else getattr(clip, "audio_fx", None)
    raw = raw if isinstance(raw, dict) else {}
    return {i: fx_intensity(raw.get(i)) for i in AUDIO_FX_IDS}


def stage_weights(k: float, n_stages: int) -> list[float]:
    """Peso de cada etapa (índice 0 = señal seca) para la intensidad k."""
    p = min(1.0, max(0.0, k)) * n_stages
    return [max(0.0, 1 - abs(p - j)) for j in range(n_stages + 1)]


def audio_fx_graph(clip: Any, in_label: str, tag: str) -> tuple[list[str], str]:
    """Pasos del grafo de FFmpeg (``[in]…[out]``) con los efectos del clip en serie.

    Devuelve (pasos, etiqueta de salida); sin efectos, ([], ``in_label``)."""
    steps: list[str] = []
    cur = in_label
    static = _static_values(clip)
    for n, fx in enumerate(AUDIO_FX):
        fid = fx["id"]
        env = ffmpeg_envelope(clip, fid, static[fid]) if keyframes_enabled(clip) else None
        k = static[fid]
        if env is None and k <= 1e-4:
            continue
        chains = [""] + [",".join(ffmpeg_node(nd) for nd in stage) for stage in fx["stages"]]
        ns = len(fx["stages"])
        out = f"{tag}f{n}"
        if env is None:
            branches = [(j, f"volume={w:.4f}") for j, w in enumerate(stage_weights(k, ns)) if w > 1e-4]
        else:
            e = f"min(1\\,max(0\\,{env}))"
            branches = [(j, f"volume='max(0\\,1-abs(({e})*{ns}-{j}))':eval=frame") for j in range(ns + 1)]
        if len(branches) == 1 and env is None:
            j, _vol = branches[0]
            steps.append(f"[{cur}]{chains[j]}[{out}]" if chains[j] else f"[{cur}]anull[{out}]")
        else:
            labels = "".join(f"[{out}s{j}]" for j, _ in branches)
            steps.append(f"[{cur}]asplit={len(branches)}{labels}")
            for j, vol in branches:
                body = f"{chains[j]},{vol}" if chains[j] else vol
                steps.append(f"[{out}s{j}]{body}[{out}m{j}]")
            mixed = "".join(f"[{out}m{j}]" for j, _ in branches)
            steps.append(f"{mixed}amix=inputs={len(branches)}:normalize=0:duration=first[{out}]")
        cur = out
    return steps, cur
