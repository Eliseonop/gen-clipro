"""Descarga Piper (binario) y voces en español mexicano (es_MX).

Uso:  python get_piper.py

Deja todo en backend/models/piper/ listo para que el backend lo detecte.
Solo usa la librería estándar (urllib, zipfile), sin dependencias extra.
"""
from __future__ import annotations

import io
import sys
import urllib.request
import zipfile
from pathlib import Path

MODELS = Path(__file__).resolve().parent / "models" / "piper"
VOICES = MODELS / "voices"

# Binario oficial de Piper por plataforma (release estable).
BIN_BASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2"
BINARIES = {
    "win32": "piper_windows_amd64.zip",
    "linux": "piper_linux_x86_64.tar.gz",
    "darwin": "piper_macos_x64.tar.gz",
}

# Voces mexicanas del repo oficial rhasspy/piper-voices.
VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX"
MX_VOICES = [
    ("ald", "medium"),      # es_MX-ald-medium  (voz masculina)
    ("claude", "high"),     # es_MX-claude-high (voz femenina/infantil, alta calidad)
]


def _download(url: str) -> bytes:
    print(f"  ↓ {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "video-yt/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def get_binary() -> None:
    if any((MODELS / n).exists() for n in ("piper.exe", "piper")):
        print("• Binario de Piper ya presente, lo salto.")
        return
    fname = BINARIES.get(sys.platform)
    if not fname:
        print(f"! Plataforma {sys.platform} no soportada por este script; "
              "descarga Piper a mano en models/piper/.")
        return
    print("• Descargando binario de Piper…")
    blob = _download(f"{BIN_BASE}/{fname}")
    MODELS.mkdir(parents=True, exist_ok=True)
    if fname.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            z.extractall(MODELS.parent)   # el zip trae una carpeta 'piper/'
    else:
        import tarfile
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
            t.extractall(MODELS.parent)
    print("  ✓ Binario listo.")


def get_voices() -> None:
    VOICES.mkdir(parents=True, exist_ok=True)
    for name, quality in MX_VOICES:
        stem = f"es_MX-{name}-{quality}"
        onnx = VOICES / f"{stem}.onnx"
        if onnx.exists():
            print(f"• Voz {stem} ya presente, la salto.")
            continue
        print(f"• Descargando voz {stem}…")
        base = f"{VOICE_BASE}/{name}/{quality}/{stem}"
        onnx.write_bytes(_download(f"{base}.onnx"))
        (VOICES / f"{stem}.onnx.json").write_bytes(_download(f"{base}.onnx.json"))
        print(f"  ✓ {stem} lista.")


if __name__ == "__main__":
    print("== Instalando Piper (voces mexicanas) ==")
    try:
        get_binary()
        get_voices()
        print("\n✓ Todo listo. Reinicia el backend y elige el motor 'Piper' en la pestaña Audio.")
    except Exception as exc:  # noqa: BLE001
        print(f"\n✗ Error: {exc}")
        print("Puedes instalar Piper a mano: binario en models/piper/, voces en models/piper/voices/.")
        sys.exit(1)
