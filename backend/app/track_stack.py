"""Pila de capas de la timeline (espejo de ``frontend/.../editor/trackStack.js``).

Las pistas de VÍDEO y de TEXTO forman UNA sola pila, en el orden de
``timeline.tracks``: índice 0 = fondo, la última = delante. El audio no pinta
nada y queda fuera. Preview y export componen por este orden, así que un texto
puede quedar DETRÁS de un vídeo (texto detrás de una persona recortada).

En pantalla la pila va invertida (la de delante arriba) y el audio debajo.
"""
from __future__ import annotations

STACK_KINDS = ("video", "text")


def is_stack_track(t) -> bool:
    return getattr(t, "kind", None) in STACK_KINDS


def stack_layers(tracks) -> dict[str, int]:
    """track_id → capa (0 = fondo). Las pistas de audio no aparecen."""
    return {t.id: i for i, t in enumerate(t for t in tracks if is_stack_track(t))}


def default_track_index(tracks, kind: str) -> int:
    """Índice para una pista nueva sin cambiar lo que se ve: el vídeo encima del
    vídeo más alto (los textos de delante siguen delante); texto y audio al final
    (el texto queda arriba del todo de la pila: el audio no cuenta en ella)."""
    if kind == "video":
        return max((i for i, t in enumerate(tracks) if t.kind == "video"), default=-1) + 1
    return len(tracks)


def insert_track(tracks: list, track, index: int | None = None) -> None:
    """Inserta ``track`` en ``tracks`` (in place): en ``index`` o en su sitio por defecto."""
    at = default_track_index(tracks, track.kind) if index is None else max(0, min(len(tracks), index))
    tracks.insert(at, track)


def display_order(tracks) -> list:
    stack = [t for t in tracks if is_stack_track(t)]
    return stack[::-1] + [t for t in tracks if not is_stack_track(t)]


def reorder_track(tracks, track_id: str, target_id: str, place: str) -> list:
    """Nueva lista con ``track_id`` justo encima (``above``) o debajo (``below``)
    de ``target_id`` tal como se ven en pantalla, dentro de su grupo (pila o audio)."""
    if place not in ("above", "below"):
        raise ValueError("place debe ser 'above' o 'below'")
    rows = display_order(tracks)
    moving = next((t for t in rows if t.id == track_id), None)
    target = next((t for t in rows if t.id == target_id), None)
    if moving is None or target is None:
        raise ValueError(f"pista desconocida: {track_id if moving is None else target_id}")
    if moving is target:
        return list(tracks)
    if is_stack_track(moving) != is_stack_track(target):
        raise ValueError("una pista de audio solo se reordena entre pistas de audio "
                         "y una de vídeo/texto dentro de la pila de vídeo/texto")
    rest = [t for t in rows if t is not moving]
    rest.insert(rest.index(target) + (1 if place == "below" else 0), moving)
    stack = [t for t in rest if is_stack_track(t)]
    return stack[::-1] + [t for t in rest if not is_stack_track(t)]


def buried_text_track_ids(tracks) -> set[str]:
    """Pistas de texto con alguna pista de vídeo por encima en la pila. Sus textos
    se componen en su capa, no en el .ass global (que va encima de todo)."""
    buried: set[str] = set()
    video_above = False
    for t in reversed([t for t in tracks if is_stack_track(t)]):
        if t.kind == "video":
            video_above = True
        elif video_above:
            buried.add(t.id)
    return buried
