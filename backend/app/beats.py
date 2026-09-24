"""Beats automáticos (#12): dónde caen los golpes de la música de un clip.

Solo numpy (el proyecto no depende de librosa). Mismo esquema que las
herramientas clásicas (Ellis 2007, el de ``librosa.beat.beat_track``):

1. Audio mono a 22 050 Hz (FFmpeg).
2. **Fuerza de ataque**: flujo espectral positivo del espectrograma en escala
   logarítmica, restando su media móvil (lo que sube de golpe = un ataque).
3. **Tempo**: autocorrelación de esa curva entre 60 y 200 BPM, con preferencia
   suave por ~120 BPM (evita quedarse con la mitad o el doble del tempo real).
4. **Beats**: programación dinámica que premia caer en ataques fuertes y separarse
   un periodo del beat anterior; se recorre hacia atrás desde el mejor final.

Los tiempos son del ARCHIVO (s), como ``in_point``/``out_point`` del clip: el
editor los pasa a tiempo de timeline con la velocidad y el recorte del clip.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np

SR = 22050
HOP = 512
N_FFT = 2048
FPS = SR / HOP                      # fotogramas de la curva de ataque por segundo
BPM_RANGE = (60.0, 200.0)
BPM_PRIOR = 120.0
MAX_SECONDS = 20 * 60               # tope de análisis (un tema largo cabe de sobra)
TIGHTNESS = 100.0                   # cuánto castiga la DP salirse del periodo
# Retardo del flujo espectral respecto al golpe: el fotograma f empieza en f·HOP y
# el ataque pesa más cuando llega a ~¾ de la ventana (medido: 65 ms, igual de
# 90 a 174 BPM, ver tests/test_beats.py).
ONSET_LAG = 0.065

_cache: dict[tuple, dict] = {}


def decode_mono(path: Path, max_seconds: float = MAX_SECONDS) -> np.ndarray:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise ValueError("ffmpeg no está disponible para analizar el audio.")
    cmd = [exe, "-v", "error", "-i", str(path), "-t", f"{max_seconds:.1f}", "-vn",
           "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    r = subprocess.run(cmd, capture_output=True, timeout=300)
    if r.returncode != 0:
        raise ValueError(f"No se pudo leer el audio: {(r.stderr or b'').decode(errors='ignore')[-200:]}")
    y = np.frombuffer(r.stdout, dtype=np.float32)
    if y.size < N_FFT:
        raise ValueError("El clip no tiene audio suficiente para detectar beats.")
    return y


N_BANDS = 48                        # bandas logarítmicas (30 Hz – 11 kHz), como un mel


def _band_matrix() -> np.ndarray:
    """Promedio de los bins FFT en bandas espaciadas por octavas: el bombo (graves)
    pesa tanto como el hi-hat (agudos). En bins lineales los agudos se llevaban
    casi todo el peso y el seguimiento caía en el contratiempo."""
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / SR)
    edges = np.geomspace(30.0, SR / 2, N_BANDS + 1)
    m = np.zeros((len(freqs), N_BANDS), dtype=np.float32)
    for b in range(N_BANDS):
        sel = (freqs >= edges[b]) & (freqs < edges[b + 1])
        if not sel.any():                            # banda más estrecha que un bin
            sel = np.abs(freqs - np.sqrt(edges[b] * edges[b + 1])) == np.min(
                np.abs(freqs - np.sqrt(edges[b] * edges[b + 1])))
        m[sel, b] = 1.0 / sel.sum()
    return m


def onset_envelope(y: np.ndarray) -> np.ndarray:
    """Fuerza de ataque por fotograma (flujo espectral log por bandas)."""
    win = np.hanning(N_FFT).astype(np.float32)
    bands = _band_matrix()
    n = 1 + (len(y) - N_FFT) // HOP
    frames = np.lib.stride_tricks.sliding_window_view(y, N_FFT)[::HOP][:n]
    prev = None
    flux = np.zeros(n, dtype=np.float32)
    for a in range(0, n, 1024):                      # por bloques: memoria acotada
        spec = np.abs(np.fft.rfft(frames[a:a + 1024] * win, axis=1)).astype(np.float32)
        logs = np.log1p(100.0 * (spec @ bands))
        if prev is not None:
            logs = np.vstack([prev, logs])
            d = np.maximum(0.0, np.diff(logs, axis=0)).mean(axis=1)
            flux[a:a + len(d)] = d
        else:
            d = np.maximum(0.0, np.diff(logs, axis=0)).mean(axis=1)
            flux[1:1 + len(d)] = d
        prev = logs[-1:]
    # Quitar la tendencia lenta (media móvil de ~0,5 s) y normalizar.
    k = max(1, int(FPS * 0.5))
    trend = np.convolve(flux, np.ones(k) / k, mode="same")
    env = np.maximum(0.0, flux - trend)
    peak = float(env.max())
    return env / peak if peak > 0 else env


def estimate_bpm(env: np.ndarray) -> float:
    """Tempo por autocorrelación de la curva de ataque (60–200 BPM, preferencia ~120)."""
    x = env - env.mean()
    n = len(x)
    size = 1 << int(np.ceil(np.log2(2 * n)))
    spec = np.fft.rfft(x, size)
    ac = np.fft.irfft(spec * np.conj(spec), size)[:n]
    lags = np.arange(n, dtype=np.float64)
    lo = int(np.floor(FPS * 60.0 / BPM_RANGE[1]))
    hi = min(n - 1, int(np.ceil(FPS * 60.0 / BPM_RANGE[0])))
    if hi <= lo + 1:
        return BPM_PRIOR
    bpm = 60.0 * FPS / np.maximum(lags[lo:hi], 1e-9)
    # Prior log-normal alrededor de 120 BPM (σ = 1 octava), como librosa.
    prior = np.exp(-0.5 * (np.log2(bpm / BPM_PRIOR)) ** 2)
    score = ac[lo:hi] * prior
    best = lo + int(np.argmax(score))
    # Afinar con interpolación parabólica del pico.
    if lo < best < hi - 1:
        a, b, c = ac[best - 1], ac[best], ac[best + 1]
        den = a - 2 * b + c
        off = 0.5 * (a - c) / den if den != 0 else 0.0
        return float(60.0 * FPS / (best + off))
    return float(60.0 * FPS / best)


def track_beats(env: np.ndarray, bpm: float) -> np.ndarray:
    """Fotogramas de los beats (programación dinámica de Ellis)."""
    period = FPS * 60.0 / bpm
    std = env.std()
    norm = env / std if std > 0 else env
    # Suavizado con una gaussiana estrecha respecto al periodo.
    w = np.arange(-int(period), int(period) + 1)
    local = np.convolve(norm, np.exp(-0.5 * (w * 32.0 / period) ** 2), mode="same")
    n = len(local)
    window = np.arange(-int(round(2 * period)), -int(round(period / 2)) + 1)
    txwt = -TIGHTNESS * np.log(-window / period) ** 2
    cum = np.zeros(n)
    back = np.full(n, -1, dtype=np.int64)
    first = True
    for i in range(n):
        idx = i + window
        ok = idx >= 0
        if ok.any():
            cand = cum[idx[ok]] + txwt[ok]
            j = int(np.argmax(cand))
            best = cand[j]
            if first and local[i] < 0.01 * local.max():
                back[i] = -1
                cum[i] = local[i]
                continue
            first = False
            cum[i] = local[i] + best
            back[i] = idx[ok][j]
        else:
            cum[i] = local[i]
    # Último beat: el último máximo local de la puntuación que no sea flojo.
    maxes = np.flatnonzero((cum[1:-1] > cum[:-2]) & (cum[1:-1] >= cum[2:])) + 1
    if not len(maxes):
        return np.array([], dtype=np.int64)
    thr = 0.5 * np.median(cum[maxes])
    tail = int(maxes[cum[maxes] >= thr][-1])
    beats = []
    i = tail
    while i >= 0:
        beats.append(i)
        i = int(back[i])
    beats = np.array(beats[::-1], dtype=np.int64)
    # Recortar beats flojos al principio y al final (silencio antes/después de la música).
    strength = local[beats]
    ok = strength > 0.5 * np.sqrt(np.mean(local ** 2))
    if ok.any():
        beats = beats[np.flatnonzero(ok)[0]: np.flatnonzero(ok)[-1] + 1]
    return beats


def detect_beats(path: Path) -> dict:
    """``{"times": [s del archivo], "bpm": float}`` del audio de ``path`` (con caché)."""
    path = Path(path)
    st = path.stat()
    key = (str(path.resolve()), st.st_size, st.st_mtime_ns)
    if key in _cache:
        return _cache[key]
    y = decode_mono(path)
    env = onset_envelope(y)
    bpm = estimate_bpm(env)
    frames = track_beats(env, bpm)
    # Fotograma de análisis → tiempo del golpe (+ el retardo de la ventana).
    times = [round(float(f * HOP / SR + ONSET_LAG), 3) for f in frames]
    out = {"times": times, "bpm": round(bpm, 1)}
    if len(_cache) > 32:
        _cache.clear()
    _cache[key] = out
    return out
