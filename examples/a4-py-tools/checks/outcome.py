import importlib.util
import pathlib
import sys

sys.dont_write_bytecode = True

MODULE = pathlib.Path(__file__).resolve().parent.parent / "tools" / "slug.py"
spec = importlib.util.spec_from_file_location("a4_slug", MODULE)
slug = importlib.util.module_from_spec(spec)
spec.loader.exec_module(slug)

# Outcome: the requested change — slugify(text) lowercases ASCII, maps every
# run of characters outside [a-z0-9] to a single hyphen and strips leading and
# trailing hyphens. Output is intentionally fixed text so owner-base and Box
# runs compare byte-wise.
CASES = [
    ("Hello World", "hello-world"),
    ("  Trim  Me  ", "trim-me"),
    ("Cafe! au_lait", "cafe-au-lait"),
    ("", ""),
    ("already-good", "already-good"),
    ("--lead--trail--", "lead-trail"),
    ("A1 b2", "a1-b2"),
]

failures = 0
for text, want in CASES:
    try:
        got = slug.slugify(text)
    except Exception:
        got = "<threw>"
    if got != want:
        failures += 1
        print("OUTCOME FAIL slugify(%r) expected %r got %r" % (text, want, got))
if failures:
    print("a4-py-tools outcome: %d failing case(s)" % failures)
    sys.exit(1)
print("a4-py-tools outcome: all cases pass")
