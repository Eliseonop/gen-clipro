"""Guías de uso por dominio (borrador de ``help://<domain>``).

Fase 1 del rediseño: las descripciones de las tools se recortan a UNA línea para
no pagar su coste en tokens en cada turno. El "cómo" detallado (valores válidos,
ejemplos, avisos) vive AQUÍ y la Fase 2 lo servirá como recurso ``help://<domain>``
+ una tool ``describe_capabilities``. De momento este módulo no lo importa nadie
en caliente: es el depósito de conocimiento para que no se pierda nada al podar.

Cada entrada de ``HELP`` es una guía compacta pero completa de un dominio. Los
valores "válidos" que aquí aparecen se toman del código real (schemas, settings,
timeline_ops) y deben mantenerse sincronizados cuando cambie una capacidad.
"""
from __future__ import annotations

# Mapa tool → dominio (para agrupar en describe_capabilities y para el router del
# agente interno, Fase 5). Refleja el registro real de server.py.
TOOL_DOMAINS: dict[str, str] = {
    # discovery (meta-tools: qué puede hacer el editor y sobre qué proyecto)
    "describe_capabilities": "discovery",
    "list_projects": "discovery",
    "resolve_project": "discovery",
    # project
    "get_project_context": "project",
    "get_timeline": "project",
    "inspect_clip": "project",
    "list_media": "project",
    "search_transcript": "text",
    # jobs
    "get_job": "jobs",
    "wait_for_job": "jobs",
    "list_jobs": "jobs",
    "cancel_job": "jobs",
    # media
    "analyze_youtube": "media",
    "create_clips_from_segments": "media",
    "fetch_image": "media",
    "delete_media": "media",
    # transcription
    "transcribe": "transcription",
    "generate_subtitles": "transcription",
    # timeline (clips)
    "add_to_timeline": "timeline",
    "move_clip": "clips",
    "split_clip": "clips",
    "remove_clip": "clips",
    "duplicate_clip": "clips",
    "update_clip": "clips",
    "reframe_clip": "clips",
    "set_clip_effects": "clips",
    "set_clip_keyframes": "clips",
    "animate_clip": "clips",
    "add_shape": "clips",
    # text / subtitles
    "add_subtitles": "text",
    # audio
    "generate_voice": "audio",
    "search_sfx": "audio",
    "set_clip_audio_fx": "audio",
    "set_clip_volume": "audio",
    "set_track_audio": "audio",
    # timeline (tracks / proyecto)
    "add_track": "timeline",
    "rename_track": "timeline",
    "remove_track": "timeline",
    "link_tracks": "timeline",
    "unlink_track": "timeline",
    "set_project_format": "project",
    # render
    "export_project": "render",
    # workflow
    "create_short_from_youtube": "workflow",
    "make_short_from_library": "workflow",
    # vision
    "get_frame": "vision",
    "set_clip_ai_description": "vision",
    # history
    "undo": "history",
    "redo": "history",
    "checkpoint": "history",
    "restore_checkpoint": "history",
}


HELP: dict[str, str] = {
    "discovery": (
        "Descubrir capacidades y proyecto (no obligan a conocer la arquitectura):\n"
        "- describe_capabilities(domain?): sin domain, mapa de dominios + verbos + "
        "defaults; con domain (transcription/audio/clips/media/project/text/…), los "
        "VALORES VÁLIDOS (modelos, voces disponibles, motions, crop_modes…) y la "
        "guía de ese dominio. Úsalo antes de usar un dominio nuevo, para no adivinar.\n"
        "- list_projects(): proyectos del editor (id, nombre, formato, duración).\n"
        "- resolve_project(query): resuelve por id/prefijo o por nombre → "
        "{project_id} o {candidates:[…]} si es ambiguo (entonces pregunta, no "
        "adivines). El project_id es obligatorio en el resto de tools."
    ),
    "project": (
        "Contexto en capas (mínimo → detalle):\n"
        "- get_project_context(project_id): formato de salida, inventario de "
        "material (clips/audios/imágenes/transcripciones con listas breves), "
        "timeline resumida e historial (undo/redo/checkpoints). Primer paso.\n"
        "- get_timeline: pistas y clips con sus propiedades (posición, duración, "
        "frame/layout/look/speed…), SIN datos pesados (words, keyframes).\n"
        "- inspect_clip(clip_id): un clip COMPLETO (reframe/keyframes, words, "
        "transform, origin). Úsalo solo para el clip que vas a tocar.\n"
        "- list_media: inventario detallado del material.\n"
        "- set_project_format(aspect|width/height/fps): 9:16/16:9/1:1/4:5/4:3. "
        "Reescala/reencuadra todo (deshacible con undo)."
    ),
    "text": (
        "Editar por CONTENIDO y subtítulos:\n"
        "- search_transcript(query, limit=20): busca texto en las "
        "transcripciones y devuelve dónde se dice con tiempos (scope project/clip, "
        "clip_index o transcript_id, start/end, text). Úsalo para 'corta donde "
        "dice X' o 'quita la intro': localiza el texto y luego split_clip/"
        "remove_clip/layout.\n"
        "- add_subtitles(source_clip_id, segments, track_id?, transcript_id?, "
        "style?): crea clips de texto con words[] reales desde los segments de una "
        "transcripción, alineados al clip fuente. Crea la pista de texto si falta.\n"
        "- Rol de un clip de texto: update_clip(clip_id, {role: caption|free})."
    ),
    "jobs": (
        "Operaciones largas (transcribe, subtitles, tts, create_clips, export, "
        "workflows) devuelven un job {id, status, progress, message, result}.\n"
        "- Espera con wait_for_job(job_id, timeout_s=60): bloquea en el threadpool "
        "hasta done/error, o devuelve el estado con timed_out:true. PREFIÉRELO al "
        "polling manual.\n"
        "- get_job(job_id): estado puntual. list_jobs(): todos los de este proceso.\n"
        "- cancel_job(job_id): cancelación cooperativa best-effort (aborta en el "
        "siguiente tick; un FFmpeg en marcha no se corta hasta ahí).\n"
        "Nota: los jobs viven en memoria del proceso; se pierden al reiniciar."
    ),
    "media": (
        "Material y YouTube:\n"
        "- analyze_youtube(url, min_score=0.40, max_clips=10, max_duration=60, "
        "padding=10): analiza el heatmap y devuelve los tramos más vistos "
        "(segments). Síncrono. Los segments se pasan tal cual a "
        "create_clips_from_segments.\n"
        "- create_clips_from_segments(url, segments, crop_mode=center): job que "
        "recorta los segments a clips del proyecto. crop_mode: center | smart_face "
        "| split_left | split_right. Espera con wait_for_job y mira list_media.\n"
        "- fetch_image(url, label?): descarga una imagen y la añade al proyecto "
        "(devuelve id para add_to_timeline con asset_kind=images).\n"
        "- delete_media(kind, ident): borra material Y su archivo. kind clips|"
        "audios|images; ident = index del clip o id del audio/imagen. NO deshacible."
    ),
    "transcription": (
        "Generar guion con words[] reales (faster-whisper, local):\n"
        "- transcribe(source? | clip_index?, model?, language?): pasa O source "
        "(URL de YouTube → guion del proyecto) O clip_index (transcribe ese clip "
        "del material), no ambos. model: tiny|base|small|medium|large-v3 (si se "
        "omite, el de Ajustes). Devuelve job.\n"
        "- generate_subtitles(filename, asset_kind=audios, model?, language?, "
        "asset_scope=project, source_clip_id?): transcribe un audio Y crea la pista "
        "de subtítulos en la timeline en un paso. filename = archivo del audio; "
        "asset_kind clips|audios; asset_scope project|library; source_clip_id = "
        "clip de la timeline a subtitular (si se omite, se busca por filename). "
        "Espera el job; los subtítulos quedan en la timeline al terminar."
    ),
    "clips": (
        "Operaciones sobre clips de la timeline (todas deshacibles con undo):\n"
        "- Estructura: move_clip(clip_id, start?, track_id?), "
        "split_clip(clip_id, at_time) [instante ABSOLUTO de timeline], "
        "remove_clip(clip_id) [destructivo, deshacible], "
        "duplicate_clip(clip_id, start?) [por defecto detrás del original].\n"
        "- Colocación: add_to_timeline(asset_kind, asset_id, track_id?, start=0, "
        "in_point?, out_point?). asset_kind clips|audios|images|sfx; asset_id = "
        "index del clip / id del audio o imagen / id de SFX de search_sfx. Un SFX "
        "entra como clip de audio (crea pista si falta). Por defecto usa el "
        "material completo; si el asset no tiene duración conocida, pasa out_point.\n"
        "- Propiedades escalares (UNA operación): update_clip(clip_id, patch). "
        "patch admite: opacity (0–1); speed (0.1–10) + keep_pitch/reverse [no en "
        "texto/imagen/figura]; appear/exit (none|fade|dissolve|wipe|zoom|slide_*|"
        "pop); position (full|top|bottom|free) + start + duration; role "
        "(caption|free, solo texto). Ej.: update_clip(id, {\"position\":\"top\", "
        "\"opacity\":0.8}).\n"
        "- Encuadre de FUENTE (no es animación): reframe_clip(clip_id, mode, zoom?, "
        "pan_from?, pan_to?). mode center (zoom) | manual (zoom + paneo estático "
        "en pan_from, o animado pan_from→pan_to; cada uno {cx,cy}).\n"
        "- Efectos visuales: set_clip_effects(effects, replace=False) blur|grayscale|"
        "sepia|brightness|contrast|saturation (MERGE por defecto, solo visuales).\n"
        "- Animación de aparición: usa animate_clip, NO set_clip_keyframes a mano. "
        "animate_clip(clip_id, motion, duration?, follow_audio_id?, intensity=1, "
        "turns=1). motion: zoom_in, zoom_out, spin, spin_in, slide_left, "
        "slide_right, slide_up, slide_down, fade_in, fade_out, pop, pulse. "
        "duration = ventana de la intro (~0.45s). turns = vueltas (spin/spin_in). "
        "follow_audio_id = id de un clip de audio/SFX en la timeline: la animación "
        "sigue su volumen (aparece/gira/entra con los golpes). Ej.: «haz zoom»→"
        "zoom_in; «que entre girando»→spin_in; «que aparezca de la izquierda con "
        "el sfx»→slide_left + follow_audio_id.\n"
        "- set_clip_keyframes(clip_id, keyframes|None): escape hatch experto. "
        "{enabled, items:[{id,t,interpolation,props}]}. props: x/y/scale/rotation/"
        "opacity y también volume (0–2) y fx de audio. Casi nunca a mano.\n"
        "- add_shape(shape, track_id?, start=0, duration?): figura vectorial "
        "(rect/línea/flecha/estrella/corazón…) en una pista de vídeo."
    ),
    "audio": (
        "Audio de clips y pistas + TTS + SFX:\n"
        "- set_clip_volume(clip_id, volume?, muted?, fade?, fade_dur=0.5): volume "
        "0–2 (1=100%, máx 200%); fade in|out crea keyframes de volumen (no recorta "
        "el audio).\n"
        "- set_track_audio(track_id, volume?, muted?, audio_fx?, fade?, "
        "fade_dur=0.5): aplica a TODOS los clips de una pista de audio (o vídeo con "
        "audio). Úsalo cuando el usuario hable de 'esa línea'/'esa pista'.\n"
        "- set_clip_audio_fx(clip_id, audio_fx, replace=False): eq, compressor, "
        "reverb, echo, denoise, distortion (0–1). MERGE por defecto; solo vídeo/"
        "audio.\n"
        "- generate_voice(text, engine=kokoro, voice=ef_dora, voice2?, blend=0.5, "
        "speed=1, pause=0.4, name?, style?): TTS de narrador → audio del proyecto. "
        "engine kokoro|piper|gemini (deben estar disponibles). Devuelve job.\n"
        "- search_sfx(query='', category='', limit=50): busca efectos de sonido en "
        "la biblioteca local. No necesita proyecto. Usa el id devuelto en "
        "add_to_timeline(asset_kind='sfx')."
    ),
    "timeline": (
        "Pistas y colocación:\n"
        "- add_track(kind, name?): kind video|audio|text; name opcional (SFX, Voz…); "
        "si se omite, A1/A2/V1…\n"
        "- rename_track(track_id, name): el id no cambia; el nombre es lo que se ve.\n"
        "- remove_track(track_id): elimina la pista y TODOS sus clips (deshacible).\n"
        "- link_tracks(track_id, to_track_id) / unlink_track(track_id): liga "
        "audio↔texto (al cambiar velocidad, la ligada se escala).\n"
        "- add_to_timeline: ver dominio clips."
    ),
    "render": (
        "Export final:\n"
        "- export_project(timeline?): renderiza el vídeo componiendo toda la "
        "timeline (job). Por defecto usa la timeline guardada del proyecto; pasa "
        "timeline solo para exportar una distinta. Espera con wait_for_job y recoge "
        "result.export_url. Operación cara: no deshacible."
    ),
    "workflow": (
        "Objetivos completos en UN job (úsalos cuando la petición es el objetivo "
        "entero, no cuando el usuario quiere iterar paso a paso):\n"
        "- create_short_from_youtube(url, crop_mode=smart_face, count=1, model?, "
        "language?, subtitles=True, export=True, min_score=0.40, max_duration=60, "
        "padding=10): heatmap → recorte a vertical → timeline 9:16 → transcribe → "
        "subtítulos → export. result.export_url.\n"
        "- make_short_from_library(asset_id, asset_kind=clips, model?, language?, "
        "subtitles=True, export=True): igual pero desde un clip ya en el proyecto "
        "(asset_id = index del clip), sin descargar.\n"
        "Pon export=False para frenar antes del render."
    ),
    "vision": (
        "Ojos de la IA + descripción de material:\n"
        "- get_frame(clip_index, at_time?): devuelve un fotograma (imagen) de un "
        "clip del material para que lo VEAS. at_time = segundo dentro del clip "
        "(por defecto el centro). Úsalo para entender/etiquetar un clip antes de "
        "editarlo.\n"
        "- set_clip_ai_description(clip_index, description): guarda tu descripción "
        "en un campo APARTE (description_ai); NO pisa la del usuario."
    ),
    "history": (
        "Toda edición estructural de la timeline es transaccional y deshacible:\n"
        "- undo() / redo(): deshace/rehace la última operación.\n"
        "- checkpoint(name): marca un punto seguro con nombre.\n"
        "- restore_checkpoint(name): vuelve a un checkpoint (también deshacible).\n"
        "Recomendado: un checkpoint antes de un cambio grande."
    ),
}


def domains() -> list[str]:
    """Lista de dominios con guía disponible."""
    return sorted(set(TOOL_DOMAINS.values()))


def guide(domain: str) -> str | None:
    """Guía de un dominio (o None si no existe)."""
    return HELP.get(domain)
