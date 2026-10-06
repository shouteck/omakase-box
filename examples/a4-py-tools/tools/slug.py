def slugify(text):
    """Return a URL slug for the text.

    Base implementation: returns the text unchanged. The Box outcome asks for
    real slugging (lowercase ASCII, separators collapsed to single hyphens).
    """
    if not isinstance(text, str):
        return ""
    return text
