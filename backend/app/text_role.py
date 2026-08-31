def resolve_text_role(clip) -> str | None:
    if clip is None:
        return None
    if isinstance(clip, dict):
        kind = clip.get("kind")
        role = clip.get("text_role")
        origin = clip.get("origin")
        words = clip.get("words")
    else:
        kind = getattr(clip, "kind", None)
        role = getattr(clip, "text_role", None)
        origin = getattr(clip, "origin", None)
        words = getattr(clip, "words", None)
    if kind != "text":
        return None
    if role in ("caption", "free"):
        return role
    if origin or (isinstance(words, list) and len(words) > 0):
        return "caption"
    return "free"
