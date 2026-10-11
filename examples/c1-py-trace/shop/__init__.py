# Module-level code only: this runs at import and calls no function of ours,
# so the file belongs in the trace's `files` list and nowhere in `functions`.
TAX_BANDS = {band: points / 100 for band, points in [('standard', 20), ('reduced', 5)]}
