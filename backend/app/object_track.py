"""Seguimiento de objetos (#15, «Tracking» de CapCut).

El usuario marca un recuadro sobre un objeto del vídeo en un instante; aquí se
sigue ese objeto hacia delante y hacia atrás dentro del tramo del clip con flujo
óptico Lucas-Kanade (puntos del recuadro, comprobación ida-vuelta) y una
transformación de semejanza por fotograma (desplazamiento + escala + giro,
RANSAC). Solo OpenCV: sin modelos que descargar.

El resultado (``track``) va en tiempo de ARCHIVO y coordenadas 0–1 de la fuente;
``follow_keys`` lo convierte en keyframes de pose de otro clip (texto, figura,
imagen…) para que acompañe al objeto en pantalla. Espejo de
``frontend/src/lib/objectTrack.js``.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

MAX_WIDTH = 640          # los fotogramas se procesan a este ancho como mucho
MAX_POINTS = 160
MIN_POINTS = 10
FB_MAX = 1.0             # error ida-vuelta (px) para aceptar un punto
STEP_SCALE = (0.8, 1.25)  # cambio de escala máximo entre dos fotogramas
BACK_CHUNK = 150         # fotogramas por bloque al seguir hacia atrás
SMOOTH = 2               # media móvil centrada de ±N fotogramas
FOLLOW_MODES = ("position", "position_scale", "position_scale_rotation")

_LK = dict(winSize=(21, 21), maxLevel=3,
           criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))


class _State:
    """Recuadro seguido en px de proceso: centro, escala y giro relativos al inicial."""

    def __init__(self, cx: float, cy: float, w: float, h: float):
        self.cx, self.cy, self.w, self.h = cx, cy, w, h
        self.s = 1.0
        self.rot = 0.0

    def bbox(self) -> tuple[int, int, int, int]:
        a = math.radians(self.rot)
        hw, hh = self.w * self.s / 2, self.h * self.s / 2
        ex = abs(hw * math.cos(a)) + abs(hh * math.sin(a))
        ey = abs(hw * math.sin(a)) + abs(hh * math.cos(a))
        return int(self.cx - ex), int(self.cy - ey), int(self.cx + ex), int(self.cy + ey)


def _features(gray: np.ndarray, st: _State) -> Optional[np.ndarray]:
    x0, y0, x1, y1 = st.bbox()
    h, w = gray.shape
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    mask = np.zeros_like(gray)
    mask[y0:y1, x0:x1] = 255
    return cv2.goodFeaturesToTrack(gray, maxCorners=MAX_POINTS, qualityLevel=0.01,
                                   minDistance=4, mask=mask, blockSize=5)


def _step(prev: np.ndarray, cur: np.ndarray, pts: np.ndarray, st: _State) -> Optional[np.ndarray]:
    """Avanza un fotograma. Devuelve los puntos que siguen (inliers) o None si se pierde."""
    if pts is None or len(pts) < 4:
        return None
    nxt, ok1, _ = cv2.calcOpticalFlowPyrLK(prev, cur, pts, None, **_LK)
    back, ok2, _ = cv2.calcOpticalFlowPyrLK(cur, prev, nxt, None, **_LK)
    fb = np.linalg.norm((pts - back).reshape(-1, 2), axis=1)
    good = (ok1.ravel() == 1) & (ok2.ravel() == 1) & (fb < FB_MAX)
    p0, p1 = pts[good].reshape(-1, 2), nxt[good].reshape(-1, 2)
    if len(p0) < 4:
        return None
    m, inl = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=2.0,
                                         maxIters=500, confidence=0.99)
    if m is None or inl is None or int(inl.sum()) < 4:
        return None
    ds = math.hypot(m[0, 0], m[1, 0])
    if not (STEP_SCALE[0] <= ds <= STEP_SCALE[1]):
        return None
    c = m @ np.array([st.cx, st.cy, 1.0])
    st.cx, st.cy = float(c[0]), float(c[1])
    st.s *= ds
    st.rot += math.degrees(math.atan2(m[1, 0], m[0, 0]))
    return p1[inl.ravel() == 1].reshape(-1, 1, 2).astype(np.float32)


def _track_run(frames, st: _State, n0: int, emit: Callable[[float, _State, bool], None]) -> None:
    """Sigue el objeto por ``frames`` (iterable de (t, gris)), empezando con el
    estado ``st`` en el primer fotograma (que no se emite)."""
    it = iter(frames)
    try:
        _t, prev = next(it)
    except StopIteration:
        return
    pts = _features(prev, st)
    for t, cur in it:
        nxt = _step(prev, cur, pts, st)
        ok = nxt is not None
        pts = nxt if ok else None
        if pts is None or len(pts) < max(MIN_POINTS, n0 // 2):
            pts = _features(cur, st)          # re-sembrar en el recuadro actual
        emit(t, st, ok)
        prev = cur


def _proc(frame: np.ndarray, scale: float) -> np.ndarray:
    if scale < 1:
        frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def _read_range(cap, scale: float, t0: float, t1: float, fps: float):
    """Fotogramas (t, gris) con t0 <= t < t1, leyendo desde t0."""
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t0) * 1000.0)
    while True:
        ok, frame = cap.read()
        if not ok:
            return
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if t < t0 - 0.5 / fps:
            continue
        if t >= t1 - 1e-6:
            return
        yield t, _proc(frame, scale)


def _smooth(track: list[dict]) -> list[dict]:
    if SMOOTH <= 0 or len(track) < 3:
        return track
    out = []
    keys = ("cx", "cy", "s", "rot")
    for i, p in enumerate(track):
        # Ventana simétrica que se encoge en los extremos: una asimétrica retrasa
        # el primer y el último fotograma respecto al movimiento real.
        half = min(SMOOTH, i, len(track) - 1 - i)
        win = track[i - half:i + half + 1]
        q = dict(p)
        for k in keys:
            q[k] = sum(w[k] for w in win) / len(win)
        out.append(q)
    return out


def track_object(path, box: dict, at: float, start: float, end: float,
                 on_progress: Optional[Callable[[float, str], None]] = None) -> dict:
    """Sigue el objeto del recuadro ``box`` ({cx, cy, w, h} en 0–1 de la fuente,
    visto en el instante ``at`` del archivo) entre ``start`` y ``end`` (s de archivo).

    Devuelve ``{width, height, fps, track: [{t, cx, cy, s, rot, ok}]}``: centro del
    objeto en 0–1 de la fuente, escala y giro (grados, horario) relativos al
    recuadro inicial, y si ese fotograma se siguió de verdad (``ok``) o se mantuvo.
    """
    cap = cv2.VideoCapture(str(Path(path)))
    if not cap.isOpened():
        raise ValueError("No se pudo abrir el vídeo para seguir el objeto.")
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0) or 30.0
        W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if W <= 0 or H <= 0:
            raise ValueError("El vídeo no tiene dimensiones válidas.")
        scale = min(1.0, MAX_WIDTH / W)
        pw, ph = W * scale, H * scale
        bw, bh = float(box.get("w", 0)) * pw, float(box.get("h", 0)) * ph
        if bw < 6 or bh < 6:
            raise ValueError("El recuadro es demasiado pequeño para seguir el objeto.")
        start, end = max(0.0, float(start)), max(float(start), float(end))
        at = min(max(float(at), start), end)
        span = max(1e-3, end - start)
        done = [0]
        n_total = max(1, int(span * fps))

        def tick(msg: str) -> None:
            done[0] += 1
            if on_progress and done[0] % 10 == 0:
                on_progress(min(0.98, 0.02 + 0.96 * done[0] / n_total), msg)

        def point(t: float, st: _State, ok: bool) -> dict:
            return {"t": round(t, 4), "cx": round(st.cx / pw, 5), "cy": round(st.cy / ph, 5),
                    "s": round(st.s, 5), "rot": round(st.rot, 3), "ok": bool(ok)}

        # Fotograma de partida (el que el usuario ve en el cursor).
        first = next(_read_range(cap, scale, at, end + 1.0 / fps, fps), None)
        if first is None:
            raise ValueError("No se pudo leer el fotograma del cursor.")
        t_at, g_at = first
        cx0, cy0 = float(box.get("cx", 0.5)) * pw, float(box.get("cy", 0.5)) * ph
        seed_pts = _features(g_at, _State(cx0, cy0, bw, bh))
        n0 = 0 if seed_pts is None else len(seed_pts)
        seed = _State(cx0, cy0, bw, bh)
        if n0 < 4:
            raise ValueError("El recuadro no tiene detalle que seguir: marca un objeto con textura.")
        track = [point(t_at, seed, True)]

        # Hacia delante.
        fwd: list[dict] = []
        st = _State(cx0, cy0, bw, bh)

        def emit_fwd(t, s, ok):
            fwd.append(point(t, s, ok))
            tick("Siguiendo el objeto…")

        _track_run(_read_range(cap, scale, t_at, end + 1e-6, fps), st, n0, emit_fwd)

        # Hacia atrás, por bloques (sin cargar todo el tramo en memoria).
        back: list[dict] = []
        st = _State(cx0, cy0, bw, bh)
        edge, g_edge = t_at, g_at
        while edge > start + 0.5 / fps:
            lo = max(start, edge - BACK_CHUNK / fps)
            chunk = list(_read_range(cap, scale, lo, edge - 0.5 / fps, fps))
            if not chunk:
                break
            seq = [(edge, g_edge)] + list(reversed(chunk))

            def emit_back(t, s, ok):
                back.append(point(t, s, ok))
                tick("Siguiendo el objeto hacia atrás…")

            _track_run(seq, st, n0, emit_back)
            edge, g_edge = chunk[0]
            if lo <= start:
                break

        track = list(reversed(back)) + track + fwd
        track = [p for p in track if start - 1e-3 <= p["t"] <= end + 1e-3]
        return {"width": W, "height": H, "fps": round(fps, 3), "track": _smooth(track)}
    finally:
        cap.release()


# --- Del recorrido a keyframes del clip que lo acompaña ---------------------------

def _obj_screen(video: dict, p: dict, w0: float, dims: dict) -> tuple[tuple, tuple]:
    """Centro del objeto y extremo de su eje (px de salida) en el punto ``p``."""
    from .clip_layout import source_point_to_output
    from .clip_speed import clip_speed

    src_w, src_h, out_w, out_h = dims["srcW"], dims["srcH"], dims["outW"], dims["outH"]
    sp = clip_speed(video)
    local = ((video["out_point"] - p["t"]) if video.get("reverse") else (p["t"] - video["in_point"])) / sp
    a = math.radians(p.get("rot", 0.0))
    r = w0 / 2 * p.get("s", 1.0)       # medio ancho del recuadro, en px de la fuente
    ex = p["cx"] + r * math.cos(a) / src_w
    ey = p["cy"] + r * math.sin(a) / src_h
    c = source_point_to_output(video, p["cx"], p["cy"], src_w, src_h, out_w, out_h, p["t"], local)
    e = source_point_to_output(video, ex, ey, src_w, src_h, out_w, out_h, p["t"], local)
    return (c[0] * out_w, c[1] * out_h), (e[0] * out_w, e[1] * out_h)


def follow_keys(video: dict, follower: dict, track: list, dims: dict, box_w: float,
                anchor_t: float, mode: str = "position_scale", min_gap: float = 0.1) -> list[dict]:
    """Keyframes de pose ({t local del seguidor, x, y[, scale][, rotation]}) para que
    ``follower`` acompañe al objeto: en ``anchor_t`` (s de timeline) conserva su pose
    y después se mueve, escala y gira lo que el objeto en pantalla. ``box_w`` = ancho
    del recuadro inicial en 0–1 de la fuente. Espejo de ``followObjectKeys``."""
    from .clip_anim import clip_pose
    from .clip_speed import clip_speed, clip_timeline_duration

    if mode not in FOLLOW_MODES:
        raise ValueError(f"mode debe ser uno de {list(FOLLOW_MODES)}")
    sp = clip_speed(video)
    pts = sorted((p for p in track or [] if video["in_point"] - 1e-6 <= p["t"] <= video["out_point"] + 1e-6),
                 key=lambda p: p["t"])
    if not pts:
        return []

    def tl_time(p):
        rel = (video["out_point"] - p["t"]) if video.get("reverse") else (p["t"] - video["in_point"])
        return video["start"] + rel / sp

    w0 = box_w * dims["srcW"]
    ref = min(pts, key=lambda p: abs(tl_time(p) - anchor_t))
    (c0, e0) = _obj_screen(video, ref, w0, dims)
    v0 = (e0[0] - c0[0], e0[1] - c0[1])
    len0 = math.hypot(*v0) or 1.0
    ang0 = math.atan2(v0[1], v0[0])
    base = clip_pose(follower, max(0.0, anchor_t - follower["start"]))
    f_dur = clip_timeline_duration(follower)
    out: list[dict] = []
    for p in sorted(pts, key=tl_time):
        lt = tl_time(p) - follower["start"]
        if lt < -1e-6 or lt > f_dur + 1e-6:
            continue
        if out and lt - out[-1]["t"] < min_gap - 1e-9:
            continue
        c, e = _obj_screen(video, p, w0, dims)
        k = {"t": round(max(0.0, lt), 4),
             "x": round(base["x"] + (c[0] - c0[0]) / dims["outW"], 5),
             "y": round(base["y"] + (c[1] - c0[1]) / dims["outH"], 5)}
        v = (e[0] - c[0], e[1] - c[1])
        if mode != "position":
            k["scale"] = round(base["scale"] * (math.hypot(*v) / len0), 5)
        if mode == "position_scale_rotation":
            d = math.degrees(math.atan2(v[1], v[0]) - ang0)
            k["rotation"] = round(base["rotation"] + (d + 180) % 360 - 180, 3)
        out.append(k)
    return out
