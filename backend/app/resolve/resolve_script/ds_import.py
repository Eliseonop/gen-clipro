#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Dynamic Subtitles — importador para DaVinci Resolve (script INTERNO).

Se ejecuta DENTRO de Resolve (Workspace > Scripts > ds_import). En la versión
Free el scripting externo está bloqueado (desde v19.1), pero los scripts internos
siguen funcionando: aquí tienes las globales ``resolve``, ``fusion`` y ``bmd``.

Qué hace: lee el "paquete" que genera la app (un ds_manifest.json cuya ruta se
guarda en ds_import_last.json, junto a este script) y monta un timeline con tus
clips de vídeo/audio en su sitio, e intenta insertar el Título Fusion animado.

Es DEFENSIVO: cada paso va en try/except y hace print() de lo que funciona o no,
para saber exactamente qué permite tu versión de Resolve Free. Los subtítulos
planos se importan a mano con File > Import > Subtitle (el .srt del paquete).
"""
import json
import os
import sys


def log(msg):
    print("[DS] " + str(msg))


def _script_dirs():
    """Carpetas donde puede estar el puntero/manifiesto.

    OJO: Resolve NO define ``__file__`` al ejecutar scripts, así que no dependemos
    de él: usamos las rutas conocidas de la carpeta de Scripts de Resolve por SO
    (más ``__file__``/``sys.argv[0]`` si por casualidad existen).
    """
    dirs = []
    for src in (globals().get("__file__"), (sys.argv[0] if sys.argv else None)):
        try:
            if src:
                dirs.append(os.path.dirname(os.path.abspath(src)))
        except Exception:  # noqa: BLE001
            pass
    if sys.platform.startswith("win"):
        ad = os.environ.get("APPDATA")
        if ad:
            base = os.path.join(ad, "Blackmagic Design", "DaVinci Resolve")
            dirs.append(os.path.join(base, "Support", "Fusion", "Scripts", "Edit"))
            dirs.append(os.path.join(base, "Fusion", "Scripts", "Edit"))
    elif sys.platform == "darwin":
        home = os.path.expanduser("~")
        dirs.append(os.path.join(home, "Library", "Application Support", "Blackmagic Design",
                                 "DaVinci Resolve", "Fusion", "Scripts", "Edit"))
    else:
        home = os.path.expanduser("~")
        dirs.append(os.path.join(home, ".local", "share", "DaVinciResolve",
                                 "Fusion", "Scripts", "Edit"))
    seen, out = set(), []
    for d in dirs:
        if d and d not in seen:
            seen.add(d)
            out.append(d)
    return out


def _find_manifest():
    """Localiza el ds_manifest.json por el puntero (ds_import_last.json) o adyacente."""
    for d in _script_dirs():
        ptr = os.path.join(d, "ds_import_last.json")
        if os.path.exists(ptr):
            try:
                data = json.load(open(ptr, encoding="utf-8"))
                mp = data.get("manifest")
                if mp and os.path.exists(mp):
                    return mp
            except Exception as e:  # noqa: BLE001
                log("No pude leer %s: %s" % (ptr, e))
        cand = os.path.join(d, "ds_manifest.json")
        if os.path.exists(cand):
            return cand
    return None


def _get_resolve():
    try:
        return resolve  # global inyectada por Resolve  # noqa: F821
    except NameError:
        pass
    try:
        import DaVinciResolveScript as dvr  # solo Studio (externo)
        return dvr.scriptapp("Resolve")
    except Exception:  # noqa: BLE001
        return None


def _ensure_tracks(tl, kind, n):
    """Asegura al menos ``n`` pistas del tipo dado."""
    try:
        have = tl.GetTrackCount(kind)
    except Exception:  # noqa: BLE001
        have = 1
    for _ in range(max(0, n - have)):
        try:
            tl.AddTrack(kind)
        except Exception as e:  # noqa: BLE001
            log("AddTrack(%s) falló: %s" % (kind, e))
            break


def main():
    res = _get_resolve()
    if res is None:
        log("Ejecútalo DENTRO de Resolve: Workspace > Scripts > ds_import.")
        return

    mpath = _find_manifest()
    if not mpath:
        log("No encuentro el paquete (ds_import_last.json / ds_manifest.json).")
        log("Genera el paquete en la app (botón Resolve) y vuelve a ejecutar.")
        return
    man = json.load(open(mpath, encoding="utf-8"))
    pkg_dir = os.path.dirname(mpath)

    fps = int(man.get("fps", 30) or 30)
    W = int(man.get("width", 1080) or 1080)
    H = int(man.get("height", 1920) or 1920)
    clips = man.get("clips", []) or []
    log("Paquete: %s | %dx%d @ %dfps | %d clips" % (man.get("project", "?"), W, H, fps, len(clips)))

    pm = res.GetProjectManager()
    proj = pm.GetCurrentProject()
    if not proj:
        log("Abre (o crea) un proyecto en Resolve antes de ejecutar.")
        return
    mp = proj.GetMediaPool()

    # Ajustes de timeline (pueden ignorarse en Free).
    for k, v in (("timelineFrameRate", str(fps)),
                 ("timelineResolutionWidth", str(W)),
                 ("timelineResolutionHeight", str(H))):
        try:
            proj.SetSetting(k, v)
        except Exception as e:  # noqa: BLE001
            log("SetSetting %s: %s" % (k, e))

    # 1) Importar medios al Media Pool.
    paths, seen = [], set()
    for c in clips:
        p = c.get("path")
        if p and os.path.exists(p) and p not in seen:
            seen.add(p)
            paths.append(p)
    if not paths:
        log("Ningún medio del manifiesto existe en disco. ¿Se movieron los archivos?")
    log("Importando %d medios…" % len(paths))
    items = []
    try:
        items = mp.ImportMedia(paths) or []
    except Exception as e:  # noqa: BLE001
        log("ImportMedia falló: %s" % e)
    by_path = {}
    for it in items:
        try:
            by_path[it.GetClipProperty("File Path")] = it
        except Exception:  # noqa: BLE001
            pass
    # Fallback: emparejar por nombre de archivo.
    if len(by_path) < len(paths):
        for it in items:
            try:
                nm = it.GetName()
            except Exception:  # noqa: BLE001
                continue
            for p in paths:
                if os.path.basename(p) == nm and p not in by_path:
                    by_path[p] = it

    # 2) Timeline vacío + pistas necesarias (nombre único para no chocar al re-ejecutar).
    import time
    name = "%s · DS %s" % (man.get("project") or "Dynamic Subtitles", time.strftime("%H%M%S"))
    tl = mp.CreateEmptyTimeline(name)
    if not tl:
        log("No se pudo crear el timeline.")
        return
    proj.SetCurrentTimeline(tl)
    max_v = max([int(c.get("track", 1)) for c in clips if c.get("kind") == "video"] or [1])
    max_a = max([int(c.get("track", 1)) for c in clips if c.get("kind") == "audio"] or [1])
    _ensure_tracks(tl, "video", max_v)
    _ensure_tracks(tl, "audio", max_a)

    try:
        start_frame = int(tl.GetStartFrame())
    except Exception:  # noqa: BLE001
        start_frame = 0

    # 3) Colocar clips (AppendToTimeline con recordFrame por posición).
    append = []
    for c in clips:
        it = by_path.get(c.get("path"))
        if not it:
            log("Sin media pool item para %s (omitido)." % os.path.basename(c.get("path", "?")))
            continue
        in_f = round(float(c.get("start_in", 0)) * fps)
        dur_f = max(1, round(float(c.get("duration", 0)) * fps))
        rec_f = start_frame + round(float(c.get("offset", 0)) * fps)
        append.append({
            "mediaPoolItem": it,
            "startFrame": in_f,
            "endFrame": in_f + dur_f - 1,
            "trackIndex": int(c.get("track", 1)),
            "recordFrame": rec_f,
            "mediaType": 1 if c.get("kind") == "video" else 2,
        })
    added = []
    try:
        added = mp.AppendToTimeline(append) or []
    except Exception as e:  # noqa: BLE001
        log("AppendToTimeline falló: %s" % e)
    log("Clips colocados en el timeline: %d / %d" % (len(added), len(append)))

    # 4) Subtítulos animados (Título Fusion).
    #    IMPORTANTE: un Fusion Composition/Title es un CLIP independiente; para hacer
    #    de overlay tiene que ir en una pista de vídeo SUPERIOR y abarcar el vídeo.
    #    El API no deja fijar pista/duración al insertar, así que NO lo insertamos
    #    suelto (salía "al lado"). Se entrega como Título en Effects > Titles.
    log("——")
    log("SUBTÍTULOS ANIMADOS: los instalé como Título 'DynamicSubtitles'.")
    log("  En Effects > Titles, arrastra 'DynamicSubtitles' a una pista de vídeo")
    log("  POR ENCIMA del vídeo y estíralo para cubrirlo (fondo transparente = overlay).")
    log("  (Si no aparece, reinicia Resolve una vez.)")
    srt = man.get("srt")
    if srt:
        log("Subtítulos simples alternativos: File > Import > Subtitle > %s" % srt)

    log("——")
    log("LISTO ✅  Timeline montado: '%s'. Añade arriba el Título para los subtítulos." % name)


main()
