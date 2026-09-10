"""Importar imágenes al proyecto como PNG de trabajo (listo para alpha / quitar fondo)."""
from __future__ import annotations

import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen

from . import projects, storage
from .schemas import ImageInfo

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif"}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
GIF_MAGICS = (b"GIF87a", b"GIF89a")
MAX_FETCH_BYTES = 25 * 1024 * 1024
FETCH_TIMEOUT = 15
_FETCH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def probe_size(path: Path) -> tuple[int | None, int | None]:
    try:
        import cv2
        img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
        if img is None:
            return None, None
        h, w = img.shape[:2]
        return int(w), int(h)
    except Exception:
        return None, None


def to_working_png(filename: str, data: bytes) -> bytes:
    """Devuelve bytes PNG. Si ya es PNG, no reencoda (conserva alpha)."""
    if data.startswith(PNG_MAGIC):
        return data
    try:
        import cv2
        import numpy as np
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError("unreadable")
        ok, buf = cv2.imencode(".png", img)
        if not ok:
            raise ValueError("encode")
        return bytes(buf)
    except ValueError:
        raise ValueError("No se pudo leer la imagen. Usa PNG, JPG, WebP o GIF.") from None
    except Exception:
        raise ValueError("No se pudo leer la imagen. Usa PNG, JPG, WebP o GIF.") from None


def _skip_subblocks(data: bytes, pos: int) -> int:
    """Salta una cadena de sub-bloques GIF (``size`` byte + datos, terminada en 0)."""
    n = len(data)
    while pos < n:
        size = data[pos]
        pos += 1
        if size == 0:
            break
        pos += size
    return pos


def probe_gif(data: bytes) -> dict:
    """Metadatos de un GIF leyendo su cabecera (sin dependencias externas).

    Recorre los bloques del GIF para contar fotogramas, sumar sus retardos
    (Graphic Control Extension), leer dimensiones, transparencia y si repite
    (extensión de aplicación NETSCAPE2.0, contador 0 = infinito). Un GIF animado
    sin NETSCAPE se trata como ``loop=True`` (comportamiento estilo CapCut).
    """
    out = {"animated": False, "frames": 1, "duration": 0.0, "fps": 0.0,
           "width": None, "height": None, "loop": False, "has_alpha": False}
    if len(data) < 13 or data[:6] not in GIF_MAGICS:
        return out
    try:
        out["width"] = int.from_bytes(data[6:8], "little")
        out["height"] = int.from_bytes(data[8:10], "little")
        packed = data[10]
        pos = 13
        if packed & 0x80:                                   # tabla de color global
            pos += 3 * (2 ** ((packed & 0x07) + 1))
        frames = 0
        total_delay = 0.0
        pending_delay = 0.1
        has_alpha = False
        loop = False
        netscape = False
        n = len(data)
        while pos < n:
            b = data[pos]
            if b == 0x3B:                                   # trailer
                break
            if b == 0x21:                                   # extensión
                label = data[pos + 1]
                if label == 0xF9 and pos + 6 < n:           # Graphic Control Extension
                    delay_cs = int.from_bytes(data[pos + 4:pos + 6], "little")
                    pending_delay = (delay_cs / 100.0) if delay_cs > 0 else 0.1
                    if data[pos + 3] & 0x01:
                        has_alpha = True
                elif label == 0xFF and data[pos + 2:pos + 14] == b"\x0bNETSCAPE2.0":
                    sb = pos + 14
                    if data[sb:sb + 2] == b"\x03\x01":
                        netscape = True
                        loop = int.from_bytes(data[sb + 2:sb + 4], "little") == 0
                pos = _skip_subblocks(data, pos + 2)
                continue
            if b == 0x2C:                                   # Image Descriptor → un fotograma
                frames += 1
                total_delay += pending_delay
                pending_delay = 0.1
                img_packed = data[pos + 9]
                pos += 10
                if img_packed & 0x80:                       # tabla de color local
                    pos += 3 * (2 ** ((img_packed & 0x07) + 1))
                pos += 1                                     # LZW min code size
                pos = _skip_subblocks(data, pos)
                continue
            pos += 1                                         # byte inesperado: avanzar
        out["frames"] = max(1, frames)
        out["animated"] = frames > 1
        out["duration"] = round(total_delay, 3) if frames else 0.0
        out["fps"] = round(frames / total_delay, 3) if total_delay > 0 else 0.0
        out["has_alpha"] = has_alpha
        out["loop"] = loop if netscape else (frames > 1)
    except Exception:
        pass
    return out


def _clean_filename(filename: str) -> str:
    name = Path(unquote(filename or "")).name
    name = name.split("?")[0].split("#")[0].strip()
    return name or "imagen.png"


def _ext_from_magic(data: bytes) -> str:
    if data.startswith(PNG_MAGIC):
        return ".png"
    if data[:3] == JPEG_MAGIC:
        return ".jpg"
    if data[:6] in GIF_MAGICS:
        return ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ""


def fetch_image(url: str) -> tuple[str, bytes]:
    """Descarga bytes de una imagen http(s). No la guarda en el proyecto."""
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("La URL debe ser http o https.")
    req = Request(raw, headers={"User-Agent": _FETCH_UA, "Accept": "image/*,*/*;q=0.8"})
    try:
        with urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            chunks: list[bytes] = []
            total = 0
            while True:
                piece = resp.read(64 * 1024)
                if not piece:
                    break
                total += len(piece)
                if total > MAX_FETCH_BYTES:
                    raise ValueError("La imagen es demasiado grande.")
                chunks.append(piece)
            data = b"".join(chunks)
            header_name = ""
            cd = ""
            try:
                cd = resp.headers.get("Content-Disposition") or ""
            except Exception:
                cd = ""
            if "filename=" in cd.lower():
                header_name = cd.split("filename=", 1)[-1].strip().strip("\"'")
    except HTTPError as exc:
        raise ValueError(f"No se pudo descargar la imagen ({exc.code}).") from None
    except URLError:
        raise ValueError("No se pudo descargar la imagen.") from None
    except TimeoutError:
        raise ValueError("La descarga de la imagen tardó demasiado.") from None
    if not data:
        raise ValueError("La URL no devolvió una imagen.")
    name = _clean_filename(header_name or parsed.path or "imagen.png")
    ext = Path(name).suffix.lower()
    if ext not in IMAGE_EXTS:
        guessed = _ext_from_magic(data) or ".png"
        name = f"{Path(name).stem or 'imagen'}{guessed}"
        ext = guessed
    try:
        to_working_png(name, data)
    except ValueError:
        raise ValueError("Esa URL no es una imagen válida.") from None
    return name, data


def import_image(
    project,
    filename: str,
    data: bytes,
    description: str | None = None,
    label: str | None = None,
    *,
    keep_gif: bool = False,
    origin: str | None = None,
    source: str | None = None,
    provider: str | None = None,
    external_id: str | None = None,
    source_url: str | None = None,
    author: str | None = None,
    license_info: str | None = None,
) -> ImageInfo:
    """Guarda la imagen como PNG de trabajo en ``image/`` y la registra."""
    if not data:
        raise ValueError("Archivo vacío.")
    name = _clean_filename(filename)
    ext = Path(name).suffix.lower()
    if ext not in IMAGE_EXTS:
        guessed = _ext_from_magic(data)
        if not guessed:
            name = f"{Path(name).stem or 'imagen'}.png"
        else:
            name = f"{Path(name).stem or 'imagen'}{guessed}"
            ext = guessed
        if ext and ext not in IMAGE_EXTS and not guessed:
            raise ValueError("Formato no válido. Usa PNG, JPG, WebP o GIF.")
    is_gif = data[:6] in GIF_MAGICS
    storage.ensure_dirs(storage.project_base(project))
    ident = _new_id()
    stem = storage.safe_name(Path(name).stem)
    gif_meta = None
    if keep_gif and is_gif:
        dest_name = f"{stem}_{ident}.gif"
        payload = data
        gif_meta = probe_gif(data)
    else:
        payload = to_working_png(name, data)
        dest_name = f"{stem}_{ident}.png"
    dest = storage.resolve_media(project, "image", dest_name)
    if dest is None:
        raise ValueError("No se pudo guardar la imagen.")
    dest.write_bytes(payload)
    w, h = probe_size(dest)
    if gif_meta:                                  # dims desde la cabecera si cv2 no las leyó
        w = w or gif_meta.get("width")
        h = h or gif_meta.get("height")
    info = ImageInfo(
        id=ident,
        filename=dest_name,
        url=f"/api/media/{project.id}/image/{quote(dest_name)}",
        width=w,
        height=h,
        label=(label or Path(name).stem or None),
        description=(description or None),
        origin=origin or "upload",
        source=source or "external",
        provider=provider,
        external_id=external_id,
        source_url=source_url,
        author=author,
        license_info=license_info,
        animated=(gif_meta or {}).get("animated"),
        frames=(gif_meta or {}).get("frames"),
        fps=(gif_meta or {}).get("fps"),
        duration=(gif_meta or {}).get("duration"),
        loop=(gif_meta or {}).get("loop"),
        has_alpha=(gif_meta or {}).get("has_alpha"),
    )
    projects.add_image(project.id, info)
    return info
