"""Horneado de los efectos de vídeo (``clip.vfx``) para el export.

Los efectos se escriben UNA vez, en JavaScript (``frontend/src/fx``), y el mismo
código corre en el preview y aquí: un Chromium headless (Playwright, como el
motor de Motion) carga ``fx_assets/runtime.bundle.js`` y, dentro de la página,
decodifica el tramo del clip, aplica la pila y codifica un WebM VP9 con alfa
(WebCodecs vía mediabunny). Solo cruzan el proceso archivos comprimidos.

Flujo por clip (``bake_clip``):

1. FFmpeg prepara el tramo EXACTO que usaría ``compose`` (recorte temporal,
   fps del proyecto, velocidad/reverse y el alfa de Eliminar fondo), etiquetado
   BT.601 (el color que Chromium lee y escribe; medido: ±1 nivel de media).
2. La página lo hornea con los efectos → ``data/fxcache/<hash>.webm``.
3. ``compose`` usa ese archivo como material del clip (``baked_clip``): pose,
   recorte, máscaras, fusión y filtros siguen en FFmpeg sin cambios.

La caché depende del archivo, el tramo, la velocidad, el fps, el recorte de
fondo, la pila de efectos y el propio runtime: exportar dos veces no vuelve a
hornear. Ver docs/EFECTOS_ANIMADOS.md §8.
"""
from __future__ import annotations

import hashlib
import json
import logging
import subprocess
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, Optional

from . import config, fx_catalog
from .clip_kind import ffmpeg_input_args, ffmpeg_trim_filter, is_still_clip
from .clip_layout import crop_window, is_overlay
from .clip_speed import clip_reverse, clip_speed, clip_timeline_duration, video_speed_filters

log = logging.getLogger(__name__)

ProgressCb = Optional[Callable[[float, str], None]]

CACHE_DIR = config.DATA_DIR / "fxcache"
CACHE_MAX_BYTES = 4 * 1024 ** 3
PUBLIC_DIR = config.BASE_DIR.parent / "frontend" / "public"
FX_KINDS = ("video", "image", "motion")
_BAKE_TIMEOUT_MS = 20 * 60 * 1000
_ALPHA_EXTS = (".webm", ".png", ".gif", ".webp", ".mov", ".apng")
_BT601 = ["-colorspace", "smpte170m", "-color_primaries", "smpte170m",
          "-color_trc", "smpte170m", "-color_range", "tv"]


# --- Pila de efectos ----------------------------------------------------------

def active_vfx(clip) -> list[dict]:
    """Efectos aplicables del clip, normalizados (espejo de ``clipVfx``)."""
    raw = getattr(clip, "vfx", None) if not isinstance(clip, dict) else clip.get("vfx")
    out: list[dict] = []
    for e in raw or []:
        if not isinstance(e, dict) or e.get("enabled") is False:
            continue
        man = fx_catalog.effect(e.get("effect"))
        if not man or man.get("engine") == "generator":
            continue
        try:
            frm = max(0.0, float(e.get("from") or 0.0))
        except (TypeError, ValueError):
            frm = 0.0
        to = e.get("to")
        try:
            to = None if to is None else max(frm, float(to))
        except (TypeError, ValueError):
            to = None
        out.append({
            "uid": str(e.get("uid") or ""),
            "effect": man["id"],
            "v": int(e.get("v") or man.get("v") or 1),
            "enabled": True,
            "params": fx_catalog.resolve_params(man, e.get("params")),
            "from": frm,
            "to": to,
        })
    return out


def has_vfx(clip) -> bool:
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    return kind in FX_KINDS and bool(active_vfx(clip))


def pad_frac(entries: list[dict]) -> float:
    total = 0.0
    for e in entries:
        total += float((fx_catalog.effect(e["effect"]) or {}).get("pad") or 0.0)
    return min(0.5, total)


def pad_allowed(clip, iw: int, ih: int, W: int, H: int) -> bool:
    """El margen de los efectos solo se ve en un objeto libre que muestra la
    imagen ENTERA (sin recorte) en todo el clip. Espejo de ``vfxPadAllowed``
    (render/canvas.js): se comprueba al principio, a la mitad y al final."""
    if not is_overlay(clip) or iw <= 0 or ih <= 0 or W <= 0 or H <= 0:
        return False
    dur = clip_timeline_duration(clip)
    spd = clip_speed(clip)
    inp = float(getattr(clip, "in_point", 0) or 0)
    for lt in (0.0, dur / 2, dur):
        w = crop_window(clip, iw / ih, W / H, inp + lt * spd, lt)
        if w["wf"] < 0.999 or w["hf"] < 0.999:
            return False
    return True


# --- Clave de caché -------------------------------------------------------------

def _runtime_sig() -> str:
    try:
        st = fx_catalog.RUNTIME_PATH.stat()
        return f"{st.st_mtime_ns}:{st.st_size}"
    except OSError:
        return "missing"


def bake_key(clip, path: Path, fps: int, entries: list[dict], pad: bool) -> str:
    try:
        st = Path(path).stat()
        file_sig = [str(Path(path).resolve()), st.st_mtime_ns, st.st_size]
    except OSError:
        file_sig = [str(path)]
    bg = getattr(clip, "bg_removal", None)
    payload = {
        "v": 1,
        "runtime": _runtime_sig(),
        "file": file_sig,
        "kind": getattr(clip, "kind", None),
        "in": round(float(clip.in_point or 0), 4),
        "out": round(float(clip.out_point or 0), 4),
        "speed": round(clip_speed(clip), 5),
        "reverse": clip_reverse(clip),
        "loop": getattr(clip, "loop", None),
        "fps": int(fps),
        "bg": bg,
        "vfx": [{k: e[k] for k in ("effect", "v", "params", "from", "to")} for e in entries],
        "pad": pad,
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def prune_cache(max_bytes: int = CACHE_MAX_BYTES) -> None:
    """Borra los horneados usados hace más tiempo hasta quedar bajo el tope."""
    try:
        files = sorted(CACHE_DIR.glob("*.webm"), key=lambda p: p.stat().st_atime)
    except OSError:
        return
    total = sum(p.stat().st_size for p in files)
    for p in files:
        if total <= max_bytes:
            break
        try:
            size = p.stat().st_size
            p.unlink()
            total -= size
        except OSError:
            pass


# --- Entrada: el tramo exacto del clip ----------------------------------------------

def prepare_input(project, clip, path: Path, fps: int, out_dir: Path) -> tuple[Path, int, int]:
    """Tramo del clip listo para hornear: recorte temporal, velocidad, fps y alfa
    de Eliminar fondo, como en ``compose``, en BT.601. Devuelve (archivo, w, h)."""
    from . import clip_bg as _clip_bg
    from . import compose, detect
    from .bg import service as bg_service

    bg = _clip_bg.clip_bg(clip)
    has_bg = _clip_bg.bg_capable(clip) and (_clip_bg.auto_active(bg) or _clip_bg.chroma_active(bg))
    spec = bg_service.build_clip_bg_mask(clip, fps) if (has_bg and _clip_bg.auto_active(bg)) else None

    args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *ffmpeg_input_args(clip, path, fps)]
    bg_input = None
    if spec is not None:
        bg_input = 1
        args += compose._bg_input_args(spec)
    color_pre = (f"{compose.ASSUME_BT709_FILTER},"
                 if (not is_still_clip(clip) and compose._color_untagged(path)) else "")
    steps = [f"[0:v]{color_pre}{ffmpeg_trim_filter(clip, fps)},setpts=PTS-STARTPTS[s0]"]
    label = "s0"
    if has_bg:
        bg_steps, label = compose._bg_source_chain(clip, path, spec, bg_input, 0, fps, "s0")
        if bg_steps:
            ol_steps, label = _clip_bg.outline_ffmpeg_steps(bg["outline"], detect.dims(path)[1], label, 0)
            bg_steps += ol_steps
        steps += bg_steps
    alpha = bool(has_bg) or Path(path).suffix.lower() in _ALPHA_EXTS
    spd = "" if is_still_clip(clip) else video_speed_filters(clip)
    pix = "yuva420p" if alpha else "yuv420p"
    # Velocidad ANTES del fps: el fotograma n es el instante local n/fps del clip.
    steps.append(
        f"[{label}]{spd + ',' if spd else ''}fps={int(fps)},"
        f"crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,"
        f"scale=out_color_matrix=bt601:out_range=tv,format={pix}[vout]"
    )
    dur = max(0.05, clip_timeline_duration(clip))
    if alpha:
        out = out_dir / "in.webm"
        enc = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "12",
               "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-auto-alt-ref", "0"]
    else:
        out = out_dir / "in.mp4"
        enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p"]
    args += ["-filter_complex", ";".join(steps), "-map", "[vout]", "-an", *enc, *_BT601,
             "-t", f"{dur:.3f}", str(out)]
    proc = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0 or not out.exists():
        raise RuntimeError(f"FFmpeg no pudo preparar el clip para los efectos:\n{(proc.stderr or '')[-800:]}")
    w, h = detect.dims(out)
    return out, int(w), int(h)


# --- Chromium: la página del runtime --------------------------------------------------

def chromium_args() -> list[str]:
    if sys.platform == "win32":
        return ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]
    return ["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle"]


_PAGE = (b"<!doctype html><html><head><meta charset=\"utf-8\"></head><body>"
         b"<script type=\"module\" src=\"/runtime.js\"></script></body></html>")


class FxBaker:
    """Un Chromium y un servidor local para hornear varios clips seguidos.

    Úsalo como contexto (``with FxBaker() as b``) y desde UN solo hilo: la API
    síncrona de Playwright no se comparte entre hilos."""

    def __init__(self) -> None:
        self._pw = None
        self._browser = None
        self._page = None
        self._srv: Optional[ThreadingHTTPServer] = None
        self._files: dict[str, Path] = {}
        self._outs: dict[str, bytes] = {}
        self._progress: dict[str, Callable[[dict], None]] = {}
        self._lock = threading.Lock()

    def __enter__(self) -> "FxBaker":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    # servidor ------------------------------------------------------------------
    def _handler(self):
        baker = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_a):
                pass

            def _send(self, code: int, body: bytes, ctype: str, extra: Optional[dict] = None) -> None:
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                for k, v in (extra or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)

            def _file(self, p: Path, ctype: str) -> None:
                size = p.stat().st_size
                rng = self.headers.get("Range")
                if rng and rng.startswith("bytes="):
                    a, _, b = rng[6:].partition("-")
                    start = int(a or 0)
                    end = min(size - 1, int(b) if b else size - 1)
                    with open(p, "rb") as fh:
                        fh.seek(start)
                        chunk = fh.read(end - start + 1)
                    return self._send(206, chunk, ctype, {
                        "Content-Range": f"bytes {start}-{end}/{size}", "Accept-Ranges": "bytes"})
                return self._send(200, p.read_bytes(), ctype, {"Accept-Ranges": "bytes"})

            def do_HEAD(self):
                self.do_GET()

            def do_GET(self):
                path = self.path.split("?", 1)[0]
                if path == "/":
                    return self._send(200, _PAGE, "text/html; charset=utf-8")
                if path == "/runtime.js":
                    return self._file(fx_catalog.RUNTIME_PATH, "text/javascript; charset=utf-8")
                if path.startswith("/in/"):
                    p = baker._files.get(path[4:])
                    if p and p.exists():
                        return self._file(p, "application/octet-stream")
                if path.startswith("/assets/"):
                    rel = path[len("/assets/"):]
                    p = (PUBLIC_DIR / rel).resolve()
                    if PUBLIC_DIR.resolve() in p.parents and p.is_file():
                        ctype = "image/webp" if p.suffix == ".webp" else "application/octet-stream"
                        return self._file(p, ctype)
                self._send(404, b"", "text/plain")

            def do_POST(self):
                path = self.path.split("?", 1)[0]
                n = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(n) if n else b""
                if path.startswith("/out/"):
                    with baker._lock:
                        baker._outs[path[5:]] = body
                elif path.startswith("/progress/"):
                    cb = baker._progress.get(path[10:])
                    if cb:
                        try:
                            cb(json.loads(body or b"{}"))
                        except Exception:  # noqa: BLE001 - el progreso es opcional
                            pass
                self._send(204, b"", "text/plain")

        return Handler

    def _ensure(self) -> None:
        if self._page is not None:
            return
        try:
            from playwright.sync_api import sync_playwright
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "Los efectos de vídeo necesitan Playwright/Chromium: pip install playwright && "
                "python -m playwright install chromium") from exc
        if not fx_catalog.RUNTIME_PATH.exists():
            raise RuntimeError("Falta el runtime de efectos: ejecuta `npm run fx:build` en frontend/.")
        self._srv = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        threading.Thread(target=self._srv.serve_forever, name="fx-bake-http", daemon=True).start()
        port = self._srv.server_address[1]
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=True, args=chromium_args())
        self._page = self._browser.new_page()
        self._page.on("pageerror", lambda e: log.warning("fx-bake: error en la página: %s", e))
        self._page.on("console", lambda m: log.debug("fx-bake: %s", m.text) if m.type != "error"
                      else log.warning("fx-bake: %s", m.text))
        self._page.goto(f"http://127.0.0.1:{port}/")
        self._page.wait_for_function("window.__fx && window.__fx.ready === true", timeout=30000)
        self._base = f"http://127.0.0.1:{port}"

    def run(self, method: str, job: dict, files: dict[str, Path],
            on_frames: Optional[Callable[[int, int], None]] = None) -> tuple[dict, bytes]:
        """Ejecuta ``window.__fx[method](job)`` y devuelve (resultado, archivo)."""
        self._ensure()
        token = uuid.uuid4().hex
        for name, p in files.items():
            self._files[f"{token}-{name}"] = p
        job = dict(job)
        if "input" in files:
            job["input"] = f"{self._base}/in/{token}-input"
        job["output"] = f"{self._base}/out/{token}"
        job["progress"] = f"{self._base}/progress/{token}"
        job["assetBase"] = f"{self._base}/assets/"
        if on_frames:
            self._progress[token] = lambda d: on_frames(int(d.get("done") or 0), int(d.get("total") or 0))
        try:
            self._page.set_default_timeout(_BAKE_TIMEOUT_MS)
            result = self._page.evaluate("([m, j]) => window.__fx[m](j)", [method, job])
            with self._lock:
                data = self._outs.pop(token, None)
            if not data:
                raise RuntimeError("El horneado de efectos no devolvió ningún archivo.")
            return result or {}, data
        finally:
            self._progress.pop(token, None)
            for name in files:
                self._files.pop(f"{token}-{name}", None)

    def close(self) -> None:
        for fn in (lambda: self._browser and self._browser.close(),
                   lambda: self._pw and self._pw.stop(),
                   lambda: self._srv and self._srv.shutdown()):
            try:
                fn()
            except Exception:  # noqa: BLE001 - cerrar nunca debe fallar
                pass
        self._page = self._browser = self._pw = self._srv = None


# --- Un clip ------------------------------------------------------------------------

def bake_clip(project, clip, fps: int, W: int, H: int, baker: FxBaker,
              on_progress: ProgressCb = None) -> Optional[Path]:
    """Hornea ``clip`` con sus efectos (o devuelve el horneado de la caché)."""
    entries = active_vfx(clip)
    if not entries or getattr(clip, "kind", None) not in FX_KINDS:
        return None
    from . import compose, detect
    from .shapes import media_exists

    path = compose._clip_path(project, clip)
    if path is None or not media_exists(path):
        return None
    path = Path(path)
    iw, ih = detect.dims(path)
    pad = pad_frac(entries) > 0 and pad_allowed(clip, iw, ih, W, H)
    key = bake_key(clip, path, fps, entries, pad)
    out = CACHE_DIR / f"{key}.webm"
    if out.exists() and out.stat().st_size > 0:
        try:
            out.touch()   # uso reciente (la purga borra por antigüedad)
        except OSError:
            pass
        return out
    dur = max(0.05, clip_timeline_duration(clip))
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vy-fx-") as td:
        if on_progress:
            on_progress(0.0, "Preparando el clip para los efectos…")
        inp, w, h = prepare_input(project, clip, path, fps, Path(td))
        frames = max(1, int(round(dur * fps)))

        def frames_cb(done: int, total: int) -> None:
            if on_progress and total:
                on_progress(min(0.99, done / total), f"Efectos: fotograma {done}/{total}")

        job = {"entries": entries, "clipDur": dur, "width": w, "height": h, "fps": int(fps),
               "frames": frames, "padAllowed": pad, "bitrate": 16_000_000}
        result, data = baker.run("bake", job, {"input": inp}, frames_cb)
        tmp = out.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(out)
        log.info("Efectos horneados: clip %s (%s) → %s (%s fotogramas)",
                 getattr(clip, "id", "?"), ", ".join(e["effect"] for e in entries),
                 out.name, result.get("frames"))
    prune_cache()
    return out


def _remap_reframe(clip):
    """``reframe.keyframes`` van en tiempo de FUENTE: al hornear (in 0, velocidad
    1, sin reverse) pasan a tiempo local del clip."""
    rf = getattr(clip, "reframe", None)
    if rf is None or not rf.keyframes:
        return rf
    inp = float(clip.in_point or 0)
    out = float(clip.out_point or 0)
    spd = clip_speed(clip)
    rev = clip_reverse(clip)
    kfs = []
    for k in rf.keyframes:
        t = (out - k.t) / spd if rev else (k.t - inp) / spd
        kfs.append(k.model_copy(update={"t": round(max(0.0, t), 4)}))
    return rf.model_copy(update={"keyframes": kfs})


def baked_clip(clip, baked_path: Path):
    """Copia del clip que usa el horneado como material (solo para el vídeo)."""
    dur = clip_timeline_duration(clip)
    update = {
        "in_point": 0.0,
        "out_point": dur,
        "source_duration": dur,
        "speed": 1.0,
        "reverse": False,
        "bg_removal": None,       # el alfa ya va en el horneado
        "vfx": None,
        "reframe": _remap_reframe(clip),
        "filename": baked_path.name,
    }
    if clip.kind == "image":
        update.update({"kind": "video", "asset_kind": "clips", "loop": None})
    return clip.model_copy(update=update)


def bake_timeline(project, timeline, on_progress: ProgressCb = None) -> dict:
    """Hornea todos los clips visibles con efectos. Devuelve ``{id: (clip, path)}``."""
    fps = int(timeline.fps or 30)
    W = int(timeline.width or config.OUTPUT_WIDTH)
    H = int(timeline.height or config.OUTPUT_HEIGHT)
    tracks = {t.id: t for t in timeline.tracks}
    targets = [c for c in timeline.clips
               if not c.disabled and c.track_id in tracks and not tracks[c.track_id].hidden
               and tracks[c.track_id].kind == "video" and has_vfx(c)]
    if not targets:
        return {}
    out: dict = {}
    with FxBaker() as baker:
        for i, c in enumerate(targets):
            def prog(f: float, msg: str, i=i) -> None:
                if on_progress:
                    on_progress((i + f) / len(targets), msg)
            path = bake_clip(project, c, fps, W, H, baker, prog)
            if path is not None:
                out[c.id] = (baked_clip(c, path), path)
    return out
