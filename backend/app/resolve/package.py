"""Arma el **paquete de entrega a DaVinci Resolve Free** de un proyecto.

Resolve Free no tiene scripting externo (eso es Studio), así que la entrega es
por archivos que el usuario importa. Este builder deja en una carpeta:

  - ``<stem>.setting``      Título Fusion animado por palabra (estilo CapCut).
  - ``<stem>.srt``          Subtítulos de intercambio (Resolve los importa).
  - ``voz.wav``             La voz TTS generada (si se aporta), copiada al paquete.
  - ``LEEME_RESOLVE.txt``   Instrucciones de importación paso a paso.

(El ``.fcpxml`` que monta vídeo + voz + subtítulos en pistas llega en el
siguiente paso; requiere validación real en Resolve.)
"""
from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from app.resolve.fcpxml import FcpCaption, FcpItem, build_fcpxml
from app.resolve.free_fusion import generate_comp
from app.resolve.fusion.fonts import resolve_font
from app.resolve.otio import build_otio
from app.resolve.schemas import Project
from app.resolve.srt import build_srt
from app.resolve.styles import get_preset, resolve_style

# El script interno que se ejecuta DENTRO de Resolve (Workspace > Scripts).
_SCRIPT_SRC = Path(__file__).resolve().parent / "resolve_script" / "ds_import.py"


@dataclass
class ResolvePackage:
    dir: str
    files: list[str] = field(default_factory=list)
    font_note: str | None = None
    warnings: list[str] = field(default_factory=list)
    manifest: str | None = None   # ruta del ds_manifest.json (para el instalador)
    message: str = ""


def _readme(project: Project, has_voice: bool, has_timeline: bool = False) -> str:
    lines = [
        "ENTREGA PARA DAVINCI RESOLVE (FREE)",
        "=" * 40,
        "",
        f"Proyecto: {project.id or '(sin id)'}",
        f"Formato : {project.w}x{project.h} @ {project.fps:g} fps",
        f"Subtitulos: {len(project.segments)} bloques / {len(project.words)} palabras",
        "",
        "=== VIA RAPIDA: SCRIPT (monta el timeline solo, DENTRO de Resolve) ===",
        "   - La app ya copio 'ds_import.py' a tu carpeta de Scripts de Resolve.",
        "   - Abre tu proyecto en Resolve y ejecuta:  Workspace > Scripts > ds_import",
        "   - Importa tus medios, crea el timeline con las pistas colocadas e intenta",
        "     insertar el titulo Fusion animado. Si algo no lo permite tu version Free,",
        "     el script te lo dira por consola (Workspace > Console).",
        "   - Si no aparece en el menu: copia 'ds_import.py' a",
        "     %APPDATA%/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Edit/",
        "",
        "=== O POR ARCHIVO (sin scripting) ===",
        "",
        "1) SUBTITULOS ANIMADOS (Fusion, estilo CapCut)  ->  *.setting",
        "   - En la pagina Edit, crea un clip Fusion Composition que cubra el video.",
        "   - Abre la pagina Fusion, selecciona todo (Ctrl+A) y borra los nodos.",
        "   - Con el editor de nodos enfocado, pega el contenido del .setting (Ctrl+V).",
        "   - Alternativa (mas fiable): copia el .setting a",
        "     %APPDATA%/Blackmagic Design/DaVinci Resolve/Support/Fusion/Templates/Edit/Titles/",
        "     y reinicia Resolve; aparecera como Titulo en la libreria de Efectos.",
        "",
        "2) SUBTITULOS SIMPLES (por si prefieres pista de subtitulos)  ->  *.srt",
        "   - File > Import > Subtitle...  (o arrastralo al Media Pool y a una pista de subtitulos).",
        "   - Nota: Resolve importa el texto y los tiempos; el estilo se ajusta en el Inspector.",
        "",
    ]
    if has_voice:
        lines += [
            "3) VOZ (narracion TTS)  ->  voz.wav",
            "   - Arrastrala a una pista de audio en la posicion 0 (inicio del video).",
            "",
        ]
    if has_timeline:
        lines += [
            "4) TIMELINE MONTADO (import de archivo)  ->  *_timeline.fcpxml  o  *_timeline.otio",
            "   - File > Import > Timeline...  y elige el .fcpxml (o el .otio, mas robusto).",
            "   - Monta tus pistas de video y audio en su sitio. Relinkea los medios",
            "     si Resolve pide su ubicacion (estan en la carpeta del proyecto).",
            "   - NOTA: si un formato falla, prueba el otro; o usa la VIA RAPIDA (script).",
            "",
        ]
    lines += [
        "IMPORTANTE: la composicion Fusion asume que empieza en t=0 del video.",
        "Coloca el clip Fusion desde el primer fotograma para que los tiempos cuadren.",
    ]
    return "\n".join(lines) + "\n"


def build_package(
    project: Project,
    out_dir: str | Path,
    *,
    voice_wav: str | Path | None = None,
    stem: str = "subtitulos",
    fcp_items: list[FcpItem] | None = None,
    fcp_captions: list[FcpCaption] | None = None,
    fcp_warnings: list[str] | None = None,
) -> ResolvePackage:
    """Genera todos los archivos del paquete en ``out_dir`` y devuelve el resumen."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    files: list[str] = []
    warnings: list[str] = list(fcp_warnings or [])

    # 1) Fusion .setting (validado internamente; grafo siempre conectado).
    setting_path = out / f"{stem}.setting"
    setting_path.write_text(generate_comp(project), encoding="utf-8")
    files.append(str(setting_path))

    # 2) SRT.
    srt_path = out / f"{stem}.srt"
    srt_path.write_text(build_srt(project), encoding="utf-8")
    files.append(str(srt_path))

    # 3) Voz (si se aporta): copiar al paquete con nombre estable.
    has_voice = False
    if voice_wav:
        src = Path(voice_wav)
        if src.exists():
            dst = out / "voz.wav"
            shutil.copyfile(src, dst)
            files.append(str(dst))
            has_voice = True

    # 4) Timeline importable: vídeo + audio del proyecto en pistas.
    #    (a) FCPXML  (b) OTIO — dos formatos de import de archivo (Free-friendly).
    has_timeline = False
    fps = int(project.fps or 30)
    if fcp_items:
        fcp = build_fcpxml(
            fps=fps, width=int(project.w), height=int(project.h),
            duration=float(project.duration or 0.0), items=fcp_items,
            project_name=(project.id or "Dynamic Subtitles"), captions=fcp_captions or None,
        )
        (out / f"{stem}_timeline.fcpxml").write_text(fcp, encoding="utf-8")
        files.append(str(out / f"{stem}_timeline.fcpxml"))
        otio = build_otio(fps=fps, items=fcp_items, project_name=(project.id or "Dynamic Subtitles"))
        (out / f"{stem}_timeline.otio").write_text(otio, encoding="utf-8")
        files.append(str(out / f"{stem}_timeline.otio"))
        has_timeline = True

    # 4b) Manifiesto + script interno (automatización en Resolve Free).
    #     ds_import.py se ejecuta DENTRO de Resolve y lee este ds_manifest.json.
    manifest = {
        "project": project.id or "Dynamic Subtitles",
        "fps": fps, "width": int(project.w), "height": int(project.h),
        "duration": float(project.duration or 0.0),
        "clips": [
            {
                "path": it.path,
                "kind": it.kind,
                "track": abs(it.lane) or 1,
                "offset": round(it.offset, 3),
                "start_in": round(it.src_in, 3),
                "duration": round(it.duration, 3),
                "name": it.name,
            }
            for it in (fcp_items or [])
        ],
        "fusion_setting": f"{stem}.setting",
        "srt": f"{stem}.srt",
    }
    manifest_path = out / "ds_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    files.append(str(manifest_path))
    if _SCRIPT_SRC.exists():
        shutil.copyfile(_SCRIPT_SRC, out / "ds_import.py")
        files.append(str(out / "ds_import.py"))

    # 5) LEEME.
    readme_path = out / "LEEME_RESOLVE.txt"
    readme_path.write_text(_readme(project, has_voice, has_timeline), encoding="utf-8")
    files.append(str(readme_path))

    # Aviso de fuente (para que la UI muestre "Anton no instalada, usando Open Sans").
    st = resolve_style(get_preset(project.preset), project.style)
    _f, _s, note = resolve_font(str(st.get("font", "Open Sans")), str(st.get("font_style", "Bold")))

    return ResolvePackage(
        dir=str(out),
        files=files,
        font_note=note,
        warnings=warnings,
        manifest=str(manifest_path),
        message=f"Paquete Resolve generado: {len(files)} archivos.",
    )
