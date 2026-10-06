import importlib.util
import pathlib
import sys

sys.dont_write_bytecode = True

MODULE = pathlib.Path(__file__).resolve().parent.parent / "tools" / "slug.py"
spec = importlib.util.spec_from_file_location("a4_slug", MODULE)
slug = importlib.util.module_from_spec(spec)
spec.loader.exec_module(slug)

# Guard: preexisting behavior that must stay green. slugify is callable,
# returns a str and maps empty or non-string input to "".
problems = []
if not callable(getattr(slug, "slugify", None)):
    problems.append("slugify is not defined")
else:
    if slug.slugify("") != "":
        problems.append("empty text must stay empty")
    if slug.slugify(None) != "":
        problems.append("non-string input must map to empty")
    if not isinstance(slug.slugify("abc"), str):
        problems.append("slugify must return a str")
if problems:
    print("GUARD FAIL " + "; ".join(problems))
    sys.exit(1)
print("a4-py-tools guard: base behavior intact")
