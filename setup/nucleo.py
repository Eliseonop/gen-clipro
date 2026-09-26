"""Núcleo del instalador de video-yt: requisitos, descargas, verificación.

Solo usa la librería estándar: tiene que funcionar en una PC recién formateada,
antes de que exista el ``.venv``. Lo usan ``instalador.py`` (GUI/CLI) y
``empaquetar.py`` (genera ``manifest.json`` en la PC de origen).

Modelo de datos: ``setup/manifest.json`` lista *componentes* (``items``). Cada
uno describe el estado FINAL en disco (``dest`` + ``files`` con tamaño y
SHA-256) y cómo conseguirlo:

  * ``get``: archivos sueltos, cada uno con sus URLs (se prueban en orden).
  * ``zip``: un archivo comprimido que se extrae en ``dest`` (modelos SAM,
    Piper y los paquetes subidos a Google Drive).

Además hay componentes de *sistema* fijos (entorno Python, npm, Chromium de
Playwright, Whisper) que se comprueban ejecutando comandos, no con hashes.
"""
from __future__ import annotations

import hashlib
import html
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

ROOT = Path(__file__).resolve().parent.parent
SETUP_DIR = ROOT / "setup"
MANIFEST = SETUP_DIR / "manifest.json"
WORK_DIR = SETUP_DIR / "_descargas"
HASH_CACHE = WORK_DIR / "hashcache.json"
LOG_FILE = WORK_DIR / "instalador.log"
VENV = ROOT / ".venv"
VENV_PY = VENV / "Scripts" / "python.exe"
FRONTEND = ROOT / "frontend"
REQS = ROOT / "backend" / "requirements.txt"
REQS_LOCK = SETUP_DIR / "requirements.lock.txt"

MIN_PYTHON = (3, 11)
MIN_NODE = (20, 19)
MIN_FFMPEG = 7          # -/filter_complex existe desde FFmpeg 7; se usa la 9
UA = "video-yt-instalador/1.0"
CHUNK = 1 << 20
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

Log = Callable[[str], None]
Progress = Callable[[float, str], None]


class Cancelado(Exception):
    """El usuario pulsó Cancelar."""


class ErrorInstalacion(Exception):
    """Fallo con un mensaje pensado para el usuario."""


# --- utilidades -------------------------------------------------------------

def human(n: Optional[float]) -> str:
    if not n:
        return "—"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit in ("B", "KB") else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def load_manifest() -> dict:
    if not MANIFEST.exists():
        return {"items": []}
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def save_manifest(data: dict) -> None:
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, MANIFEST)


def _proc_env() -> dict:
    env = dict(os.environ)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def run_quiet(cmd: list[str], timeout: float = 60, cwd: Optional[Path] = None) -> tuple[int, str]:
    """Ejecuta y devuelve (código, salida). Nunca lanza: -1 si no existe."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout, cwd=cwd,
                           env=_proc_env(), creationflags=NO_WINDOW)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except (OSError, subprocess.SubprocessError) as exc:
        return -1, str(exc)


def run_stream(cmd: list[str], log: Log, cancel: threading.Event,
               cwd: Optional[Path] = None) -> int:
    """Ejecuta mostrando la salida línea a línea en el log."""
    log("$ " + " ".join(f'"{c}"' if " " in c else c for c in cmd))
    try:
        proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True,
                                encoding="utf-8", errors="replace",
                                env=_proc_env(), creationflags=NO_WINDOW)
    except OSError as exc:
        raise ErrorInstalacion(f"No se pudo ejecutar {cmd[0]}: {exc}") from exc
    assert proc.stdout is not None
    for line in proc.stdout:
        if cancel.is_set():
            proc.kill()
            raise Cancelado()
        line = line.rstrip()
        if line:
            log("  " + line)
    return proc.wait()


def refresh_path() -> None:
    """Recarga el PATH del registro (tras instalar algo con winget)."""
    if sys.platform != "win32":
        return
    import winreg
    parts: list[str] = []
    for hive, key in ((winreg.HKEY_LOCAL_MACHINE,
                       r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
                      (winreg.HKEY_CURRENT_USER, "Environment")):
        try:
            with winreg.OpenKey(hive, key) as k:
                val, _ = winreg.QueryValueEx(k, "Path")
                parts += [os.path.expandvars(p) for p in val.split(";") if p]
        except OSError:
            pass
    links = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links"
    parts.append(str(links))
    seen, merged = set(), []
    for p in parts + os.environ.get("PATH", "").split(";"):
        if p and p.lower() not in seen:
            seen.add(p.lower())
            merged.append(p)
    os.environ["PATH"] = ";".join(merged)


def base_python() -> str:
    """El intérprete 'de sistema' (no el de un venv) para crear el .venv."""
    if sys.prefix != sys.base_prefix:
        return getattr(sys, "_base_executable", sys.executable)
    return sys.executable


# --- requisitos del sistema -------------------------------------------------

@dataclass
class Req:
    id: str
    label: str
    ok: Optional[bool]          # True ok · False falta/viejo · None aviso
    detail: str
    winget: Optional[str] = None
    required: bool = True


def _version_tuple(text: str) -> tuple[int, ...]:
    m = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", text)
    return tuple(int(g) for g in m.groups() if g) if m else ()


def check_requirements(manifest: dict) -> list[Req]:
    wanted = manifest.get("sistema", {})
    out: list[Req] = []

    py = sys.version_info
    rec = wanted.get("python", "")
    ok = py[:2] >= MIN_PYTHON
    det = f"{platform.python_version()} ({base_python()})"
    if ok and rec and not platform.python_version().startswith(rec.rsplit(".", 1)[0]):
        ok, det = None, det + f" · el origen usa {rec}: se instalará sin versiones fijas"
    out.append(Req("python", "Python", ok, det, "Python.Python.3.14"))

    node = shutil.which("node")
    if node:
        code, txt = run_quiet([node, "--version"])
        v = _version_tuple(txt)
        ok = code == 0 and v[:2] >= MIN_NODE
        out.append(Req("node", "Node.js", ok,
                       txt.strip() + ("" if ok else f" · se necesita ≥ {MIN_NODE[0]}.{MIN_NODE[1]}"),
                       "OpenJS.NodeJS.LTS"))
    else:
        out.append(Req("node", "Node.js", False, "no encontrado", "OpenJS.NodeJS.LTS"))

    ff = shutil.which("ffmpeg")
    if ff:
        code, txt = run_quiet([ff, "-hide_banner", "-version"])
        first = (txt.splitlines()[0] if txt else "").split(" Copyright")[0]
        v = _version_tuple(first.replace("ffmpeg version", ""))
        if not v:
            ok, det = None, f"{first[:60]} · versión no reconocida (se recomienda 9)"
        else:
            ok = v[0] >= MIN_FFMPEG
            det = first[:70] + ("" if ok else f" · se necesita ≥ {MIN_FFMPEG}")
        if ok and not shutil.which("ffprobe"):
            ok, det = False, det + " · falta ffprobe"
        out.append(Req("ffmpeg", "FFmpeg", ok, det, "Gyan.FFmpeg"))
    else:
        out.append(Req("ffmpeg", "FFmpeg", False, "no encontrado en el PATH", "Gyan.FFmpeg"))

    out.append(_git_req(manifest.get("commit")))
    ok = shutil.which("winget") is not None
    out.append(Req("winget", "winget", True if ok else None,
                   "disponible" if ok else "no disponible: instala lo que falte a mano",
                   None, False))
    return out


def _git_req(commit: Optional[str]) -> Req:
    git = shutil.which("git")
    if not git:
        return Req("git", "Git", None, "no encontrado (solo hace falta para actualizar)",
                   "Git.Git", False)
    _, txt = run_quiet([git, "--version"])
    detail = txt.strip()
    if commit and (ROOT / ".git").exists():
        code, _ = run_quiet([git, "merge-base", "--is-ancestor", commit, "HEAD"], cwd=ROOT)
        if code != 0:
            return Req("git", "Git", None,
                       f"{detail} · este código es anterior al empaquetado ({commit[:8]}): "
                       "haz «git pull»", "Git.Git", False)
    return Req("git", "Git", True, detail, "Git.Git", False)


def winget_install(pkg: str, log: Log, cancel: threading.Event) -> None:
    exe = shutil.which("winget")
    if not exe:
        raise ErrorInstalacion("winget no está disponible en esta PC.")
    cmd = [exe, "install", "-e", "--id", pkg, "--accept-package-agreements",
           "--accept-source-agreements", "--disable-interactivity"]
    code = run_stream(cmd, log, cancel)
    # 0x8A15002B (sin actualización) y 0x8A150061 (ya instalado) no son errores.
    if code not in (0, 0x8A15002B, 0x8A150061, 0x8A15002B - (1 << 32),
                    0x8A150061 - (1 << 32)):
        raise ErrorInstalacion(f"winget terminó con código {code} al instalar {pkg}.")
    refresh_path()


# --- caché de hashes (como el índice de git: tamaño + mtime) -----------------

class HashCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        try:
            self._data = json.loads(HASH_CACHE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self._data = {}
        self._dirty = False

    def sha256(self, path: Path, cancel: Optional[threading.Event] = None,
               use_cache: bool = True) -> str:
        st = path.stat()
        key = str(path.resolve()).lower()
        stamp = [st.st_size, st.st_mtime_ns]
        with self._lock:
            hit = self._data.get(key)
        if use_cache and hit and hit[:2] == stamp:
            return hit[2]
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            while chunk := fh.read(CHUNK * 4):
                if cancel is not None and cancel.is_set():
                    raise Cancelado()
                h.update(chunk)
        digest = h.hexdigest()
        with self._lock:
            self._data[key] = stamp + [digest]
            self._dirty = True
        return digest

    def save(self) -> None:
        if not self._dirty:
            return
        WORK_DIR.mkdir(parents=True, exist_ok=True)
        with self._lock:
            HASH_CACHE.write_text(json.dumps(self._data), encoding="utf-8")
            self._dirty = False


# --- componentes ------------------------------------------------------------

OK, FALTA, CORRUPTO, MODIFICADO, SIN_FUENTE, AVISO = (
    "ok", "falta", "corrupto", "modificado", "sin_fuente", "aviso")

ESTADO_TXT = {
    OK: "✓ correcto",
    FALTA: "✗ falta",
    CORRUPTO: "✗ dañado",
    MODIFICADO: "⚠ modificado",
    SIN_FUENTE: "⚠ falta el enlace de Drive",
    AVISO: "⚠ revisar",
}


@dataclass
class Estado:
    code: str
    detail: str = ""
    bad: list[str] = field(default_factory=list)


SYSTEM_ITEMS = [
    {"id": "venv", "kind": "venv", "group": "Programa", "required": True,
     "label": "Entorno Python (.venv + librerías)", "approx": 1_300_000_000},
    {"id": "npm", "kind": "npm", "group": "Programa", "required": True,
     "label": "Dependencias del frontend (npm)", "approx": 120_000_000},
    {"id": "chromium", "kind": "chromium", "group": "Programa", "required": False,
     "label": "Navegador de Motion Studio (Chromium de Playwright)", "approx": 180_000_000},
]


def all_items(manifest: dict) -> list[dict]:
    items = [dict(i) for i in SYSTEM_ITEMS]
    items += [dict(i) for i in manifest.get("items", [])]
    wh = manifest.get("whisper")
    if wh:
        items.append({"id": "whisper", "kind": "whisper", "group": "Modelos IA",
                      "required": False, "model": wh,
                      "label": f"Transcripción Whisper ({wh})",
                      "approx": {"large-v3": 3_100_000_000, "medium": 1_500_000_000,
                                 "small": 480_000_000}.get(wh, 150_000_000)})
    return items


def item_size(item: dict) -> int:
    if item.get("files"):
        return sum(v[0] for v in item["files"].values())
    if item.get("zip", {}).get("size"):
        return item["zip"]["size"]
    return item.get("approx", 0)


def item_sources_ok(item: dict) -> bool:
    if "zip" in item:
        z = item["zip"]
        return bool(z.get("sources") or local_copies(z.get("name", ""), z.get("size")))
    return all(g.get("sources") for g in item.get("get", []))


def verify_item(item: dict, cache: HashCache, cancel: threading.Event,
                progress: Optional[Progress] = None, deep: bool = True) -> Estado:
    kind = item.get("kind", "files")
    if kind == "venv":
        return _verify_venv(item)
    if kind == "npm":
        return _verify_npm()
    if kind == "chromium":
        return _verify_chromium()
    if kind == "whisper":
        return _verify_whisper(item)
    return _verify_files(item, cache, cancel, progress, deep)


def _verify_files(item: dict, cache: HashCache, cancel: threading.Event,
                  progress: Optional[Progress], deep: bool) -> Estado:
    dest = ROOT / item["dest"]
    files: dict = item.get("files") or {}
    if item.get("marker"):          # paquetes que cambian con el uso (proyectos)
        m = dest / item["marker"]
        return Estado(OK, "instalado") if m.exists() else Estado(FALTA, "no instalado")
    if not files:
        return Estado(AVISO, "el manifiesto no lista archivos")
    mutable = set(item.get("mutable", []))
    missing, broken, changed = [], [], []
    total = sum(v[0] for v in files.values()) or 1
    done = 0
    for rel, (size, sha) in files.items():
        if cancel.is_set():
            raise Cancelado()
        p = dest / rel
        if not p.is_file():
            missing.append(rel)
        else:
            bad = p.stat().st_size != size or (
                deep and sha and cache.sha256(p, cancel) != sha)
            if bad:
                (changed if rel in mutable else broken).append(rel)
        done += size
        if progress:
            progress(done / total, f"Verificando {item['label']}…")
    if not item_sources_ok(item) and (missing or broken):
        return Estado(SIN_FUENTE, f"{len(missing) + len(broken)} archivos por descargar",
                      missing + broken)
    if missing and len(missing) == len(files):
        return Estado(FALTA, "no descargado", missing)
    if missing or broken:
        parts = []
        if missing:
            parts.append(f"{len(missing)} faltan")
        if broken:
            parts.append(f"{len(broken)} dañados")
        return Estado(CORRUPTO, ", ".join(parts), missing + broken)
    if changed:
        return Estado(MODIFICADO, f"{len(changed)} catálogos editados en esta PC", changed)
    return Estado(OK, f"{len(files)} archivos")


def _venv_python_ok() -> tuple[bool, str]:
    if not VENV_PY.exists():
        return False, "no existe .venv"
    code, txt = run_quiet([str(VENV_PY), "-c", "import sys; print(sys.version.split()[0])"])
    if code != 0:
        return False, ".venv roto (¿copiado de otra PC?): se recreará"
    return True, txt.strip()


# Módulos que el backend importa (ver backend/app); si uno falla, pip de nuevo.
VENV_IMPORTS = ["fastapi", "uvicorn", "yt_dlp", "cv2", "numpy", "PIL", "faster_whisper",
                "kokoro_onnx", "soundfile", "google.genai", "mcp", "openai", "onnxruntime",
                "playwright"]


def _verify_venv(item: dict) -> Estado:
    ok, ver = _venv_python_ok()
    if not ok:
        return Estado(FALTA, ver)
    probe = ("import importlib,sys\nbad=[]\n"
             f"for m in {VENV_IMPORTS!r}:\n"
             "    try: importlib.import_module(m)\n"
             "    except Exception as e: bad.append(f'{m}: {e}')\n"
             "print('\\n'.join(bad)); sys.exit(1 if bad else 0)")
    code, txt = run_quiet([str(VENV_PY), "-c", probe], timeout=180)
    if code != 0:
        bad = [ln for ln in txt.splitlines() if ln.strip()]
        return Estado(CORRUPTO, f"{len(bad)} librerías no cargan", bad)
    code, txt = run_quiet([str(VENV_PY), "-m", "pip", "check"], timeout=120)
    if code != 0:
        issues = [ln for ln in txt.splitlines() if ln.strip()][:10]
        return Estado(AVISO, f"Python {ver} · pip check: {len(issues)} avisos", issues)
    return Estado(OK, f"Python {ver}")


def _npm() -> Optional[str]:
    return shutil.which("npm")


def _verify_npm() -> Estado:
    if not (FRONTEND / "node_modules").is_dir():
        return Estado(FALTA, "falta node_modules")
    npm = _npm()
    if not npm:
        return Estado(AVISO, "node_modules existe pero no hay npm para comprobarlo")
    code, txt = run_quiet([npm, "ls", "--depth=0"], timeout=120, cwd=FRONTEND)
    if code != 0:
        bad = [ln for ln in txt.splitlines() if "ERR" in ln or "missing" in ln or "invalid" in ln]
        return Estado(CORRUPTO, "dependencias incompletas", bad[:10])
    return Estado(OK, "dependencias al día")


_CHROMIUM_PROBE = (
    "from playwright.sync_api import sync_playwright\n"
    "with sync_playwright() as p:\n"
    "    b = p.chromium.launch(); b.close()\n"
    "print('ok')")


def _verify_chromium() -> Estado:
    if not _venv_python_ok()[0]:
        return Estado(FALTA, "primero el entorno Python")
    code, txt = run_quiet([str(VENV_PY), "-c", _CHROMIUM_PROBE], timeout=120)
    if code == 0:
        return Estado(OK, "Chromium arranca")
    if "Executable doesn't exist" in txt or "playwright install" in txt:
        return Estado(FALTA, "Chromium no instalado")
    return Estado(CORRUPTO, (txt.strip().splitlines() or ["error"])[-1][:120])


def _verify_whisper(item: dict) -> Estado:
    if not _venv_python_ok()[0]:
        return Estado(FALTA, "primero el entorno Python")
    code, txt = run_quiet([str(VENV_PY), "-c",
                           "from faster_whisper import download_model as d;"
                           f"print(d({item['model']!r}, local_files_only=True))"], timeout=120)
    if code == 0:
        return Estado(OK, "en caché de HuggingFace")
    return Estado(FALTA, "se descargará (o en la primera transcripción)")


# --- descargas --------------------------------------------------------------

_DRIVE_PATTERNS = (r"/file/d/([\w-]{20,})", r"[?&]id=([\w-]{20,})", r"^drive:([\w-]{20,})$")


def drive_id(url: str) -> Optional[str]:
    url = url.strip()
    if "/folders/" in url:
        raise ErrorInstalacion(
            "Ese enlace es de una CARPETA de Drive. Comparte el archivo .zip "
            "(clic derecho → Compartir → «Cualquier persona con el enlace») y usa su enlace.")
    if "drive.google.com" not in url and "drive.usercontent.google.com" not in url \
            and not url.startswith("drive:"):
        return None
    for pat in _DRIVE_PATTERNS:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    raise ErrorInstalacion(f"No reconozco el ID de Google Drive en: {url}")


def _direct_url(url: str) -> str:
    fid = drive_id(url)
    if fid:
        return f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"
    if "dropbox.com" in url:
        return re.sub(r"([?&])dl=0", r"\1dl=1", url) if "dl=0" in url else url + (
            "&dl=1" if "?" in url else "?dl=1")
    return url


def _open(url: str, start: int = 0):
    headers = {"User-Agent": UA}
    if start:
        headers["Range"] = f"bytes={start}-"
    req = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(req, timeout=60)


def _drive_html(res, url: str) -> str:
    """Google devolvió una página en vez del archivo: aviso de antivirus,
    cuota superada o archivo privado. Devuelve la URL buena o lanza."""
    body = res.read(400_000).decode("utf-8", "replace")
    low = body.lower()
    if "quota" in low or "too many users" in low or "demasiados usuarios" in low:
        raise ErrorInstalacion(
            "Google Drive bloqueó la descarga por exceso de tráfico en ese archivo. "
            "Espera unas horas o sube una copia nueva y actualiza el enlace.")
    form = re.search(r'<form[^>]+id="download-form"[^>]+action="([^"]+)"(.*?)</form>',
                     body, re.S)
    if form:
        params = dict(re.findall(r'name="([^"]+)"\s+value="([^"]*)"', form.group(2)))
        action = html.unescape(form.group(1))
        return action + "?" + urllib.parse.urlencode(params)
    if "accounts.google.com" in low or "servicelogin" in low or "request access" in low:
        raise ErrorInstalacion(
            "El archivo de Drive no es público. Compártelo como «Cualquier persona "
            "con el enlace» (Lector).")
    raise ErrorInstalacion(f"Drive devolvió una página inesperada para {url}.")


def download(url: str, part: Path, cancel: threading.Event, progress: Progress,
             label: str, expected: Optional[int] = None) -> Path:
    """Descarga a ``part`` (reanudable). Devuelve la ruta del archivo completo."""
    part.parent.mkdir(parents=True, exist_ok=True)
    real = _direct_url(url)
    last_err: Optional[Exception] = None
    for attempt in range(4):
        start = part.stat().st_size if part.exists() else 0
        if expected and start == expected:
            return part
        if expected and start > expected:
            part.unlink()
            start = 0
        try:
            res = _open(real, start)
            ctype = res.headers.get("Content-Type", "")
            if ctype.startswith("text/html"):
                real = _drive_html(res, url)
                res.close()
                continue
            if start and res.status != 206:
                start = 0               # el servidor no reanuda: desde cero
            length = int(res.headers.get("Content-Length") or 0)
            total = expected or (start + length if length else 0)
            done = start
            t0, shown = time.monotonic(), 0.0
            with res, open(part, "ab" if start else "wb") as fh:
                while True:
                    if cancel.is_set():
                        raise Cancelado()
                    chunk = res.read(CHUNK)
                    if not chunk:
                        break
                    fh.write(chunk)
                    done += len(chunk)
                    now = time.monotonic()
                    if now - shown > 0.25:
                        shown = now
                        speed = (done - start) / max(now - t0, 1e-3)
                        frac = done / total if total else 0.0
                        progress(frac, f"{label}: {human(done)} / {human(total)} "
                                       f"· {human(speed)}/s")
            if total and done < total:
                raise ErrorInstalacion(f"descarga incompleta ({human(done)} de {human(total)})")
            return part
        except (Cancelado, ErrorInstalacion):
            raise
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (403, 404, 410):
                raise ErrorInstalacion(f"HTTP {exc.code} en {url}") from exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code == 416:
                part.unlink(missing_ok=True)
            last_err = exc
            progress(0.0, f"{label}: reintentando ({attempt + 1}/3)…")
            time.sleep(2 + attempt * 3)
    raise ErrorInstalacion(f"No se pudo descargar {url}: {last_err}")


def _sha256_file(path: Path, cancel: threading.Event) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(CHUNK * 4):
            if cancel.is_set():
                raise Cancelado()
            h.update(chunk)
    return h.hexdigest()


def _safe_target(base: Path, rel: str) -> Path:
    target = (base / rel).resolve()
    if base.resolve() not in target.parents and target != base.resolve():
        raise ErrorInstalacion(f"Ruta peligrosa dentro del zip: {rel}")
    return target


def extract_zip(zpath: Path, dest: Path, strip: str, keep: set[str],
                cancel: threading.Event, progress: Progress, label: str,
                log: Log) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    n = 0
    with zipfile.ZipFile(zpath) as z:
        members = [m for m in z.infolist() if not m.is_dir()]
        total = sum(m.file_size for m in members) or 1
        done = 0
        for m in members:
            if cancel.is_set():
                raise Cancelado()
            name = m.filename
            if strip:
                if not name.startswith(strip):
                    continue
                name = name[len(strip):]
            target = _safe_target(dest, name)
            if name in keep and target.exists():
                log(f"  · {name}: ya existe en esta PC, no se toca")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + ".tmp")
            with z.open(m) as src, open(tmp, "wb") as out:
                shutil.copyfileobj(src, out, CHUNK)
            os.replace(tmp, target)
            n += 1
            done += m.file_size
            progress(done / total, f"Descomprimiendo {label}… {n}/{len(members)}")
    return n


def local_copies(zname: str, size: Optional[int]) -> list[Path]:
    """Copias del zip ya presentes en esta PC (USB, Descargas…): se usan antes
    que Drive. El SHA-256 se comprueba igual que si se hubiera descargado."""
    spots = [SETUP_DIR / "_paquetes", ROOT, Path.home() / "Downloads"]
    found = []
    for d in spots:
        p = d / zname
        if p.is_file() and (not size or p.stat().st_size == size):
            found.append(p)
    return found


def install_files_item(item: dict, cancel: threading.Event, progress: Progress,
                       log: Log, cache: HashCache) -> None:
    dest = ROOT / item["dest"]
    files = item.get("files") or {}
    work = WORK_DIR / item["id"]
    if "zip" in item:
        z = item["zip"]
        zname = z.get("name") or f"{item['id']}.zip"
        part = work / (zname + ".part")
        sources: list = local_copies(zname, z.get("size")) + list(z.get("sources", []))
        if not sources:
            raise ErrorInstalacion(
                f"«{item['label']}» no tiene enlace de descarga: pega el enlace de Drive "
                "(botón «Enlace de Drive…»), edita setup/manifest.json o copia "
                f"{zname} en setup\\_paquetes\\.")
        errors = []
        for src in sources:
            try:
                if isinstance(src, Path):
                    log(f"• {item['label']}: usando la copia local {src}")
                    zpath = src
                else:
                    log(f"↓ {item['label']} desde {src}")
                    zpath = download(src, part, cancel, progress, item["label"], z.get("size"))
                if z.get("sha256"):
                    progress(1.0, f"Comprobando {zname}…")
                    got = _sha256_file(zpath, cancel)
                    if got != z["sha256"]:
                        if zpath == part:
                            part.unlink(missing_ok=True)
                        raise ErrorInstalacion(
                            f"{zname} NO coincide con el manifiesto (SHA-256). ¿Se subió al "
                            "Drive una versión distinta a la empaquetada? Vuelve a ejecutar "
                            "empaquetar.py en la PC de origen y sube el zip nuevo.")
                if not zipfile.is_zipfile(zpath):
                    if zpath == part:
                        part.unlink(missing_ok=True)
                    raise ErrorInstalacion(f"{zname} no es un zip válido.")
                n = extract_zip(zpath, dest, z.get("strip", ""), set(z.get("keep", [])),
                                cancel, progress, item["label"], log)
                log(f"  ✓ {n} archivos extraídos en {item['dest']}")
                part.unlink(missing_ok=True)
                if item.get("marker"):
                    (dest / item["marker"]).write_text(
                        json.dumps({"zip_sha256": z.get("sha256"), "fecha": time.ctime()}),
                        encoding="utf-8")
                errors = []
                break
            except (Cancelado, KeyboardInterrupt):
                raise
            except (ErrorInstalacion, OSError, zipfile.BadZipFile) as exc:
                errors.append(str(exc))
                log(f"  ✗ {exc}")
        if errors:
            raise ErrorInstalacion(errors[-1])
    else:
        for g in item.get("get", []):
            rel = g["file"]
            target = dest / rel
            size, sha = files.get(rel, [None, None])
            if target.is_file() and (size is None or target.stat().st_size == size) and (
                    not sha or cache.sha256(target, cancel) == sha):
                continue
            part = work / (Path(rel).name + ".part")
            errors = []
            for src in g.get("sources", []):
                try:
                    log(f"↓ {rel} desde {src}")
                    download(src, part, cancel, progress, Path(rel).name, size)
                    if sha:
                        progress(1.0, f"Comprobando {Path(rel).name}…")
                        if _sha256_file(part, cancel) != sha:
                            part.unlink(missing_ok=True)
                            raise ErrorInstalacion(f"{rel}: el SHA-256 no coincide con el manifiesto")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(part, target)
                    log(f"  ✓ {rel} ({human(target.stat().st_size)})")
                    errors = []
                    break
                except (Cancelado, KeyboardInterrupt):
                    raise
                except (ErrorInstalacion, OSError) as exc:
                    errors.append(str(exc))
                    log(f"  ✗ {exc}")
            if errors or not target.is_file():
                raise ErrorInstalacion(errors[-1] if errors else f"sin fuentes para {rel}")


# --- pasos de sistema -------------------------------------------------------

def lock_python_version() -> Optional[str]:
    if not REQS_LOCK.exists():
        return None
    first = REQS_LOCK.read_text(encoding="utf-8").splitlines()[:3]
    for line in first:
        m = re.match(r"#\s*python\s+(\d+\.\d+)", line)
        if m:
            return m.group(1)
    return None


def install_venv(cancel: threading.Event, log: Log) -> None:
    ok, why = _venv_python_ok()
    if not ok and VENV.exists():
        log(f"• {why}: borrando .venv")
        shutil.rmtree(VENV, ignore_errors=True)
    if not VENV_PY.exists():
        py = base_python()
        log(f"• Creando .venv con {py}")
        if run_stream([py, "-m", "venv", str(VENV)], log, cancel) != 0:
            raise ErrorInstalacion("No se pudo crear el entorno virtual (.venv).")
    py = str(VENV_PY)
    run_stream([py, "-m", "pip", "install", "--upgrade", "pip"], log, cancel)
    code, ver = run_quiet([py, "-c", "import sys;print('%d.%d'%sys.version_info[:2])"])
    lock = lock_python_version()
    if lock and lock == ver.strip():
        log(f"• Instalando las MISMAS versiones que la PC de origen ({REQS_LOCK.name})")
        cmd = [py, "-m", "pip", "install", "-r", str(REQS_LOCK)]
    else:
        if lock:
            log(f"• El origen usaba Python {lock} y aquí hay {ver.strip()}: "
                "se instalan las últimas versiones compatibles")
        cmd = [py, "-m", "pip", "install", "-r", str(REQS), "playwright"]
    if run_stream(cmd, log, cancel) != 0:
        raise ErrorInstalacion("pip no pudo instalar las librerías (mira el registro).")


def install_npm(cancel: threading.Event, log: Log) -> None:
    npm = _npm()
    if not npm:
        raise ErrorInstalacion("Falta Node.js/npm: instálalo en «Requisitos».")
    lock = FRONTEND / "package-lock.json"
    cmd = [npm, "ci" if lock.exists() else "install", "--no-audit", "--no-fund"]
    if run_stream(cmd, log, cancel, cwd=FRONTEND) != 0:
        raise ErrorInstalacion("npm no pudo instalar el frontend (mira el registro).")


def install_chromium(cancel: threading.Event, log: Log) -> None:
    if not _venv_python_ok()[0]:
        raise ErrorInstalacion("Primero instala el entorno Python.")
    if run_stream([str(VENV_PY), "-m", "playwright", "install", "chromium"], log, cancel) != 0:
        raise ErrorInstalacion("No se pudo instalar Chromium de Playwright.")


def install_whisper(item: dict, cancel: threading.Event, log: Log) -> None:
    if not _venv_python_ok()[0]:
        raise ErrorInstalacion("Primero instala el entorno Python.")
    code = run_stream([str(VENV_PY), "-c",
                       "from faster_whisper import download_model as d;"
                       f"print('Guardado en', d({item['model']!r}))"], log, cancel)
    if code != 0:
        raise ErrorInstalacion(f"No se pudo descargar Whisper {item['model']}.")


def install_item(item: dict, cancel: threading.Event, progress: Progress, log: Log,
                 cache: HashCache) -> None:
    kind = item.get("kind", "files")
    progress(0.0, f"Instalando {item['label']}…")
    if kind == "venv":
        install_venv(cancel, log)
    elif kind == "npm":
        install_npm(cancel, log)
    elif kind == "chromium":
        install_chromium(cancel, log)
    elif kind == "whisper":
        install_whisper(item, cancel, log)
    else:
        install_files_item(item, cancel, progress, log, cache)


def file_logger(echo: Log) -> Log:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    fh = open(LOG_FILE, "a", encoding="utf-8")
    fh.write(f"\n===== {time.ctime()} =====\n")
    lock = threading.Lock()

    def log(msg: str) -> None:
        with lock:
            fh.write(msg + "\n")
            fh.flush()
        echo(msg)
    return log
