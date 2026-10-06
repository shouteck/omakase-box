def slugify(text):
    """Return a URL slug for the text.

    Base implementation: returns the text unchanged. The Box outcome asks for
    real slugging (lowercase ASCII, separators collapsed to single hyphens).
    """
    if not isinstance(text, str):
        return ""
    import re
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
