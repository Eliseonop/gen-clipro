"""Prepara video-yt para instalarlo en otra PC. Se ejecuta en la PC de ORIGEN.

Genera:
  * ``setup/manifest.json``: qué debe haber en disco (tamaño + SHA-256 de cada
    archivo) y de dónde sacarlo. Los modelos IA se bajan de sus URLs oficiales
    (GitHub / HuggingFace); los recursos propios, del zip que subas a Drive.
  * ``setup/requirements.lock.txt``: versiones exactas del ``.venv`` de aquí.
  * ``setup/_paquetes/video-yt-assets.zip`` (y con ``--proyectos`` también
    ``video-yt-proyectos.zip``): lo que hay que subir a Google Drive.

Uso (desde la raíz del repo):
  python setup/empaquetar.py                    manifiesto + zip de recursos
  python setup/empaquetar.py --proyectos        + zip con tus proyectos y clips
  python setup/empaquetar.py --drive assets=URL [--drive proyectos=URL]
  python setup/empaquetar.py --comprobar-urls   prueba que cada URL responde

Después: sube los zips a Drive, compártelos como «Cualquier persona con el
enlace», guarda los enlaces con ``--drive`` y haz commit + push de ``setup/``.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nucleo as N  # noqa: E402

ROOT = N.ROOT
MODELS = ROOT / "backend" / "models"
ASSETS = ROOT / "assets"
DATA = ROOT / "backend" / "data"
CLIPS = ROOT / "backend" / "clips"
OUT = N.SETUP_DIR / "_paquetes"

# --- de dónde se baja cada modelo (las mismas URLs que usa el backend) --------
# backend/app/bg/providers.py, bg/sam.py, tts.py, detect.py, get_piper.py
REMBG = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/"
RVM = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/"
KOKORO = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
YUNET = ("https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/"
         "face_detection_yunet_2023mar.onnx")
SAM = "https://huggingface.co/vietanhdev/segment-anything-2.1-onnx-models/resolve/main/"
SAM_ZIPS = {
    "tiny": "sam2.1_hiera_tiny_20260221.zip",
    "small": "sam2.1_hiera_small_20260221.zip",
    "base_plus": "sam2.1_hiera_base_plus_20260221.zip",
    "large": "sam2.1_hiera_large_20260221.zip",
}
PIPER_BIN = ("https://github.com/rhasspy/piper/releases/download/2023.11.14-2/"
             "piper_windows_amd64.zip")
PIPER_VOICES = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/"

# (id, etiqueta, grupo, requerido, [(archivo en backend/models, url)])
SINGLE_MODELS = [
    ("yunet", "Detección de caras YuNet (reencuadre)", "Modelos IA", True,
     [("face_detection_yunet_2023mar.onnx", YUNET)]),
    ("kokoro", "Voz local Kokoro", "Voces TTS", False,
     [("kokoro-v1.0.onnx", KOKORO + "kokoro-v1.0.onnx"),
      ("voices-v1.0.bin", KOKORO + "voices-v1.0.bin")]),
    ("u2net", "Quitar fondo · U²-Net", "Quitar fondo", False,
     [("u2net.onnx", REMBG + "u2net.onnx")]),
    ("u2netp", "Quitar fondo · U²-Net lite", "Quitar fondo", False,
     [("u2netp.onnx", REMBG + "u2netp.onnx")]),
    ("birefnet", "Quitar fondo · BiRefNet (imágenes)", "Quitar fondo", False,
     [("BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
       REMBG + "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx")]),
    ("rvm", "Quitar fondo · RVM (personas en vídeo)", "Quitar fondo", False,
     [("rvm_mobilenetv3_fp32.onnx", RVM + "rvm_mobilenetv3_fp32.onnx")]),
    ("rvm_resnet50", "Quitar fondo · RVM ResNet-50", "Quitar fondo", False,
     [("rvm_resnet50_fp32.onnx", RVM + "rvm_resnet50_fp32.onnx")]),
]

JUNK = {"thumbs.db", "desktop.ini", ".ds_store"}
TEXT_EXT = {".json", ".txt", ".yaml", ".yml", ".ass", ".srt", ".vtt", ".svg", ".html",
            ".js", ".css", ".md", ".jsonl", ".csv"}
# Datos del usuario que NO viajan: cachés regenerables y secretos.
DATA_SKIP_DIRS = {"bgcache", "proxies"}
DATA_SKIP_FILES = {"settings.json", "youtube_cookies.txt", "mcp_audit.jsonl"}
SECRET_RE = re.compile(r"key|token|secret|password|cookie", re.I)

_cancel = threading.Event()
_cache = N.HashCache()


def log(msg: str) -> None:
    print(msg, flush=True)


def _files_map(base: Path, paths: list[Path]) -> dict:
    out = {}
    for p in sorted(paths, key=lambda x: x.relative_to(base).as_posix().lower()):
        out[p.relative_to(base).as_posix()] = [p.stat().st_size, _cache.sha256(p)]
    return out


def _walk(base: Path, skip_dirs: set[str] = frozenset()) -> list[Path]:
    out = []
    for p in base.rglob("*"):
        rel = p.relative_to(base).parts
        if any(part in skip_dirs for part in rel[:-1]):
            continue
        if p.is_file() and p.name.lower() not in JUNK and not p.name.endswith((".part", ".tmp")):
            out.append(p)
    return out


# --- componentes ------------------------------------------------------------

def model_items() -> tuple[list[dict], set[Path]]:
    items, used = [], set()
    for mid, label, group, required, files in SINGLE_MODELS:
        present = [(name, url) for name, url in files if (MODELS / name).is_file()]
        if len(present) != len(files):
            log(f"  · {label}: no está completo en esta PC, se omite")
            continue
        paths = [MODELS / name for name, _ in files]
        used.update(paths)
        items.append({
            "id": mid, "label": label, "group": group, "required": required,
            "dest": "backend/models", "files": _files_map(MODELS, paths),
            "get": [{"file": name, "sources": [url]} for name, url in files],
        })

    piper = MODELS / "piper"
    if (piper / "piper.exe").is_file():
        paths = [p for p in _walk(piper) if p.relative_to(piper).parts[0] != "voices"]
        used.update(paths)
        items.append({
            "id": "piper", "label": "Voz local Piper (programa)", "group": "Voces TTS",
            "required": False, "dest": "backend/models", "files": _files_map(MODELS, paths),
            "zip": {"name": "piper_windows_amd64.zip", "sources": [PIPER_BIN]},
        })
        voices = sorted((piper / "voices").glob("*.onnx*"))
        if voices:
            used.update(voices)
            gets = []
            for v in voices:
                stem = v.name.split(".onnx")[0]
                region, *name, quality = stem.split("-")
                gets.append({"file": v.name, "sources": [
                    f"{PIPER_VOICES}{region}/{'-'.join(name)}/{quality}/{v.name}"]})
            items.append({
                "id": "piper_voces", "label": "Voces de Piper en español", "group": "Voces TTS",
                "required": False, "dest": "backend/models/piper/voices",
                "files": _files_map(piper / "voices", voices), "get": gets,
            })

    for bb, zname in SAM_ZIPS.items():
        d = MODELS / "sam" / bb
        paths = _walk(d) if d.is_dir() else []
        if not any(p.name.endswith("encoder.onnx") for p in paths):
            continue
        used.update(paths)
        items.append({
            "id": f"sam_{bb}", "label": f"Quitar fondo asistido · SAM 2.1 {bb}",
            "group": "Quitar fondo", "required": False,
            "dest": f"backend/models/sam/{bb}", "files": _files_map(d, paths),
            "zip": {"name": zname, "sources": [SAM + zname]},
        })

    extra = [p for p in _walk(MODELS) if p not in used]
    for p in extra:
        log(f"  ! {p.relative_to(ROOT)} no está catalogado: la otra PC no lo recibirá")
    return items, used


def _zip_bundle(zpath: Path, entries: list[tuple[str, Path | bytes]]) -> None:
    """Zip determinista (fecha fija) para que el hash solo cambie con el contenido."""
    tmp = zpath.with_suffix(".zip.tmp")
    total = len(entries)
    with zipfile.ZipFile(tmp, "w", allowZip64=True) as z:
        for i, (arc, src) in enumerate(entries, 1):
            info = zipfile.ZipInfo(arc, date_time=(2020, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            ext = Path(arc).suffix.lower()
            info.compress_type = zipfile.ZIP_DEFLATED if ext in TEXT_EXT else zipfile.ZIP_STORED
            if isinstance(src, bytes):
                z.writestr(info, src)
            else:
                info.file_size = src.stat().st_size
                with open(src, "rb") as fh, z.open(info, "w",
                                                   force_zip64=info.file_size > 0x7FFF0000) as out:
                    while chunk := fh.read(N.CHUNK * 4):
                        out.write(chunk)
            if i % 50 == 0 or i == total:
                print(f"\r    {i}/{total} archivos", end="", flush=True)
    print()
    tmp.replace(zpath)


def _firma(entries: list[tuple[str, Path | bytes]]) -> str:
    """Huella barata del contenido (ruta + tamaño + mtime) para no rehacer el zip."""
    h = hashlib.sha256()
    for arc, src in entries:
        if isinstance(src, bytes):
            h.update(f"{arc}|{hashlib.sha256(src).hexdigest()}\n".encode())
        else:
            st = src.stat()
            h.update(f"{arc}|{st.st_size}|{st.st_mtime_ns}\n".encode())
    return h.hexdigest()[:16]


def bundle_item(old: dict, *, iid: str, label: str, group: str, required: bool,
                default: bool, dest: str, zname: str, entries: list[tuple[str, Path | bytes]],
                files: dict, **extra) -> dict:
    """Crea (o reutiliza si nada cambió) el zip de un paquete para Drive."""
    OUT.mkdir(parents=True, exist_ok=True)
    zpath = OUT / zname
    prev = old.get(iid, {})
    prev_zip = prev.get("zip", {})
    firma = _firma(entries)
    same = (prev.get("_firma") == firma and zpath.is_file()
            and zpath.stat().st_size == prev_zip.get("size"))
    if same:
        log(f"  · {zname}: sin cambios, se reutiliza")
        sha, size = prev_zip["sha256"], prev_zip["size"]
    else:
        log(f"  · Creando {zname} ({len(entries)} archivos)…")
        _zip_bundle(zpath, entries)
        size = zpath.stat().st_size
        sha = N._sha256_file(zpath, _cancel)
        if prev_zip.get("sources") and prev_zip.get("sha256") != sha:
            log(f"  ! {zname} CAMBIÓ: vuelve a subirlo a Drive (Drive → Administrar "
                "versiones conserva el mismo enlace)")
    item = {
        "id": iid, "label": label, "group": group, "required": required, "default": default,
        "dest": dest, "files": files, "_firma": firma,
        "zip": {"name": zname, "size": size, "sha256": sha,
                "sources": prev_zip.get("sources", [])},
    }
    item["zip"].update(extra.pop("zip_extra", {}))
    item.update(extra)
    return item


def assets_item(old: dict) -> dict | None:
    if not ASSETS.is_dir():
        log("  ! No hay carpeta assets/: no se crea el paquete de recursos")
        return None
    paths = _walk(ASSETS)
    files = _files_map(ASSETS, paths)
    entries = [(rel, ASSETS / rel) for rel in files]
    mutable = [rel for rel in files if rel.endswith(".json")]
    return bundle_item(
        old, iid="assets", label="Recursos: efectos de sonido, letras, material",
        group="Recursos (Drive)", required=True, default=True, dest="assets",
        zname="video-yt-assets.zip", entries=entries, files=files, mutable=mutable)


def _clean_settings() -> bytes | None:
    path = DATA / "settings.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))

    def strip(obj):
        if isinstance(obj, dict):
            return {k: strip(v) for k, v in obj.items()
                    if not (SECRET_RE.search(k) and not isinstance(v, (bool, int, float)))}
        return obj
    return json.dumps(strip(data), ensure_ascii=False, indent=2).encode("utf-8")


def projects_item(old: dict) -> dict:
    """Proyectos + clips, sin cachés ni claves. Cambian con el uso: se verifican
    por una marca de instalación, no archivo a archivo."""
    paths = [p for p in _walk(DATA, DATA_SKIP_DIRS) if not (
        p.parent == DATA and p.name in DATA_SKIP_FILES)]
    paths += _walk(CLIPS) if CLIPS.is_dir() else []
    base = ROOT / "backend"
    entries: list[tuple[str, Path | bytes]] = [(p.relative_to(base).as_posix(), p) for p in paths]
    settings = _clean_settings()
    if settings:
        entries.append(("data/settings.json", settings))
    total = sum(p.stat().st_size for p in paths)
    log(f"  · Proyectos: {len(entries)} archivos, {N.human(total)} "
        "(sin bgcache/proxies, que se regeneran solos; sin API keys)")
    return bundle_item(
        old, iid="proyectos", label="Mis proyectos y clips (SOBRESCRIBE los de esa PC)",
        group="Recursos (Drive)", required=False, default=False, dest="backend",
        zname="video-yt-proyectos.zip", entries=entries, files={},
        marker="data/.paquete-proyectos.json", zip_extra={"keep": ["data/settings.json"]})


# --- varios -----------------------------------------------------------------

def _venv_py() -> Path | None:
    return N.VENV_PY if N.VENV_PY.exists() else None


def write_lock() -> str | None:
    py = _venv_py()
    if not py:
        log("  ! No hay .venv aquí: no se fijan versiones de pip")
        return None
    code, ver = N.run_quiet([str(py), "-c", "import sys;print('%d.%d'%sys.version_info[:2])"])
    code2, freeze = N.run_quiet([str(py), "-m", "pip", "freeze", "--exclude-editable"],
                                timeout=120)
    if code or code2:
        log("  ! pip freeze falló: no se fijan versiones")
        return None
    lines = [ln for ln in freeze.splitlines()
             if ln and not ln.startswith(("-e", "#")) and " @ " not in ln]
    head = [f"# python {ver.strip()}",
            f"# Versiones exactas del .venv de origen ({time.strftime('%Y-%m-%d')}).",
            "# Lo genera setup/empaquetar.py; lo usa el instalador si la versión de Python coincide."]
    N.REQS_LOCK.write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    log(f"  · requirements.lock.txt: {len(lines)} paquetes (Python {ver.strip()})")
    return ver.strip()


def system_info() -> dict:
    info = {}
    py = _venv_py()
    if py:
        _, v = N.run_quiet([str(py), "-c", "import platform;print(platform.python_version())"])
        info["python"] = v.strip()
    for name, cmd in (("node", ["node", "--version"]),
                      ("ffmpeg", ["ffmpeg", "-hide_banner", "-version"])):
        code, txt = N.run_quiet(cmd)
        if code == 0 and txt:
            info[name] = txt.splitlines()[0].strip()[:80]
    return info


def git_commit() -> str | None:
    code, sha = N.run_quiet(["git", "rev-parse", "HEAD"], cwd=ROOT)
    if code:
        return None
    _, dirty = N.run_quiet(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT)
    changed = [ln for ln in dirty.splitlines() if ln.strip()]
    if changed:
        log(f"  ! Hay {len(changed)} archivos con cambios sin commit: haz commit + push "
            "para que la otra PC tenga el mismo código")
    return sha.strip()


def whisper_model() -> str:
    try:
        s = json.loads((DATA / "settings.json").read_text(encoding="utf-8"))
        return (s.get("transcribe") or {}).get("model") or "base"
    except (OSError, ValueError):
        return "base"


def set_drive(manifest: dict, pairs: list[str]) -> None:
    by_id = {i["id"]: i for i in manifest.get("items", [])}
    for pair in pairs:
        iid, _, url = pair.partition("=")
        if iid not in by_id or "zip" not in by_id[iid]:
            raise SystemExit(f"--drive: no existe el paquete «{iid}» "
                             f"(hay: {', '.join(k for k, v in by_id.items() if 'zip' in v)})")
        N.drive_id(url)          # valida (y rechaza enlaces de carpeta)
        by_id[iid]["zip"]["sources"] = [url.strip()]
        log(f"  ✓ {iid} → {url.strip()}")


def check_urls(manifest: dict) -> int:
    bad = 0
    for item in manifest.get("items", []):
        targets = []
        if "zip" in item:
            targets = [(item["zip"].get("name"), s, item["zip"].get("size"))
                       for s in item["zip"].get("sources", [])]
            if not targets:
                log(f"  ⚠ {item['id']}: sin enlace")
        for g in item.get("get", []):
            size = item["files"].get(g["file"], [None])[0]
            targets += [(g["file"], s, size) for s in g["sources"]]
        for name, src, size in targets:
            try:
                req = urllib.request.Request(N._direct_url(src),
                                             headers={"User-Agent": N.UA, "Range": "bytes=0-0"})
                with urllib.request.urlopen(req, timeout=30) as res:
                    ctype = res.headers.get("Content-Type", "")
                    rng = res.headers.get("Content-Range", "")
                    total = int(rng.rsplit("/", 1)[1]) if "/" in rng else int(
                        res.headers.get("Content-Length") or 0)
                if ctype.startswith("text/html"):
                    log(f"  ⚠ {name}: Drive responde con página (aviso/permiso); "
                        "el instalador lo intentará resolver")
                elif size and total and total != size:
                    bad += 1
                    log(f"  ✗ {name}: el servidor da {N.human(total)}, se esperaba {N.human(size)}")
                else:
                    log(f"  ✓ {name} ({N.human(total)})")
            except (urllib.error.URLError, OSError, ValueError) as exc:
                bad += 1
                log(f"  ✗ {name}: {exc} — {src}")
    return bad


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--proyectos", action="store_true",
                    help="empaqueta también backend/data + backend/clips")
    ap.add_argument("--drive", action="append", default=[], metavar="ID=URL",
                    help="guarda el enlace de Drive de un paquete (assets, proyectos)")
    ap.add_argument("--comprobar-urls", action="store_true",
                    help="solo comprueba que las URLs del manifiesto responden")
    args = ap.parse_args()

    manifest = N.load_manifest()
    if args.comprobar_urls:
        sys.exit(1 if check_urls(manifest) else 0)
    if args.drive and not args.proyectos and N.MANIFEST.exists():
        set_drive(manifest, args.drive)
        N.save_manifest(manifest)
        log("Manifiesto actualizado. Haz commit + push de setup/manifest.json.")
        return

    old = {i["id"]: i for i in manifest.get("items", [])}
    log("== Modelos IA (se descargarán de sus URLs oficiales)")
    items, _ = model_items()
    log("== Recursos para Drive")
    bundles = [b for b in [assets_item(old)] if b]
    if args.proyectos:
        bundles.append(projects_item(old))
    elif "proyectos" in old:
        bundles.append(old["proyectos"])     # se conserva el de la vez anterior
    log("== Entorno")
    write_lock()
    _cache.save()

    required_first = [i for i in items if i["required"]]
    manifest = {
        "version": 1,
        "generado": time.strftime("%Y-%m-%d %H:%M"),
        "commit": git_commit(),
        "sistema": system_info(),
        "whisper": whisper_model(),
        "items": required_first + bundles + [i for i in items if not i["required"]],
    }
    if args.drive:
        set_drive(manifest, args.drive)
    N.save_manifest(manifest)

    log("\n== Listo")
    log(f"Manifiesto: {N.MANIFEST.relative_to(ROOT)}")
    for b in bundles:
        z = b["zip"]
        path = OUT / z["name"]
        state = "✓ enlace guardado" if z.get("sources") else "✗ SIN ENLACE"
        log(f"  {path.relative_to(ROOT)}  {N.human(z['size'])}  [{state}]")
    pending = [b["id"] for b in bundles if not b["zip"].get("sources")]
    if pending:
        log("\nSiguiente paso:\n"
            "  1. Sube esos .zip a Google Drive.\n"
            "  2. Clic derecho → Compartir → Acceso general: «Cualquier persona con el enlace».\n"
            "  3. Copia el enlace y guárdalo:\n"
            + "".join(f"       python setup/empaquetar.py --drive {i}=<enlace>\n" for i in pending)
            + "  4. git add setup && git commit && git push")
    else:
        log("\nSi algún zip cambió, vuelve a subirlo (misma entrada de Drive → Administrar "
            "versiones) y haz commit + push de setup/.")


if __name__ == "__main__":
    main()
