# click-3822

Repository: pallets/click · Issue #3822 · Group: fixed · Created: 2026-09-01T00:05:35Z · Closed: 2026-09-08T19:48:57Z
Labels: typing · Reporter's role: NONE

## Title

`click.Path` should be generic on `path_type`

## Body

Click 8.5.0 made `click.prompt` and `click.ParamType` generic, so the return type of `click.prompt` is now normally clever enough to reveal the actual type of the value as converted from raw input.

However, `click.Path` has a `path_type` parameter to which the input is converted, but  that information is not reflected in the return type of `click.Path.convert`, so it's always typed as `str | bytes | os.PathLike[str]`, regardless of the value of `path_type`.

```python
# mre.py
import pathlib

from typing_extensions import assert_type

import click

my_type = click.Path(file_okay=False, path_type=pathlib.Path)
path = click.prompt("Enter a name", type=my_type)

# expected: pathlib.Path, actual: str | bytes | os.PathLike[str]
assert_type(path, pathlib.Path)
```

I checked the above MRE with mypy and pyright, as well as ty for completeness, on a local clone of the repo @ `main`:

```console
$ uv run mypy mre.py
mre.py:12: error: Expression is of type "str | bytes | PathLike[str]", not "Path"  [assert-type]
    assert_type(path, pathlib.Path)
    ^
Found 1 error in 1 file (checked 1 source file)
```

```console
$ uv run pyright mre.py
WARNING: there is a new pyright version available (v1.1.408 -> v1.1.411).
Please install the new version or set PYRIGHT_PYTHON_FORCE_VERSION to `latest`

/Users/edgarramirez/Contrib/pallets/click/mre.py
  /Users/edgarramirez/Contrib/pallets/click/mre.py:12:13 - error: "assert_type" mismatch: expected "Path" but received "str | bytes | PathLike[str]" (reportAssertTypeFailure)
1 error, 0 warnings, 0 informations
```

```console
$ uv run ty check mre.py
error[type-assertion-failure]: Argument does not have asserted type `Path`
  --> mre.py:12:1
   |
12 | assert_type(path, pathlib.Path)
   | ^^^^^^^^^^^^----^^^^^^^^^^^^^^^
   |             |
   |             Inferred type is `str | bytes | PathLike[str]`
info: `Path` and `str | bytes | PathLike[str]` are not equivalent types

Found 1 diagnostic
```

I expect the return type of `click.prompt` to match the `path_type` value passed to `click.Path`.

Environment:

- Python version: 3.14
- Click version: 8.5.0


## Comments (4)

### Comment 1 · NONE · 2026-09-01T01:01:54Z · BEFORE the fix was opened

Hmm @MarkGus0, please don't spam the maintainers with slop PRs before they even get a chance to look at the issue.

### Comment 2 · COLLABORATOR · 2026-09-01T06:00:39Z · BEFORE the fix was opened

Thanks @edgarrmondragon for the report! For context, this was introduced in https://github.com/pallets/click/pull/3407 . I might have made a mistake while trying to push that PR to clear the backlog. @AndreasBackx any feedback on this issue?

### Comment 3 · COLLABORATOR · 2026-09-05T16:14:49Z · BEFORE the fix was opened

@kdeldycke it makes entire sense. We both probably missed it because we just don't have the strictest type checking enabled. I think some of the stricter type checker settings would complain about no generics on `type` and this would've been spotted.

### Comment 4 · COLLABORATOR · 2026-09-08T10:36:54Z · AFTER the fix was opened

@AndreasBackx @edgarrmondragon I just made an attempt at fixing this at https://github.com/pallets/click/pull/3858 . Can you check if this is good enough for you?

## The fix

Pull request #3858, opened 2026-09-08T10:36:02Z, merged 2026-09-08T19:48:10Z. Title: Make `click.Path` generic on `path_type`

Files changed (4):
- modified: CHANGES.md
- modified: src/click/types.py
- modified: tests/test_types/test_Path.py  [test]
- added: tests/typing/typing_path.py  [test]

## Test changes in the fix (2 files)

### modified: tests/test_types/test_Path.py

```diff
@@ -4,6 +4,7 @@
 import subprocess
 import sys
 import tempfile
+import typing as t
 
 import pytest
 
@@ -183,3 +184,7 @@ def test_path_type(runner, cls, expect):
     result = runner.invoke(cli, ["a/b/c.txt"], standalone_mode=False)
     assert result.exception is None
     assert result.return_value == expect
+
+
+def test_path_converted_type_parameter_at_runtime():
+    assert t.get_args(click.Path[pathlib.Path]) == (pathlib.Path,)
```

### added: tests/typing/typing_path.py

```diff
@@ -0,0 +1,34 @@
+import os
+import pathlib
+
+from typing_extensions import assert_type
+
+import click
+
+# Without ``path_type``, ``convert`` returns the value it was given.
+assert_type(click.Path().convert("a/b.txt", None, None), str | bytes | os.PathLike[str])
+assert_type(click.prompt("File", type=click.Path()), str | bytes | os.PathLike[str])
+
+# ``path_type`` narrows the converted value's type for ``convert`` and ``prompt``.
+assert_type(click.Path(path_type=str).convert("a/b.txt", None, None), str)
+assert_type(click.Path(path_type=bytes).convert("a/b.txt", None, None), bytes)
+assert_type(
+    click.Path(path_type=pathlib.Path).convert("a/b.txt", None, None), pathlib.Path
+)
+assert_type(click.prompt("File", type=click.Path(path_type=str)), str)
+assert_type(click.prompt("File", type=click.Path(path_type=pathlib.Path)), pathlib.Path)
+
+assert_type(click.Path(path_type=pathlib.Path)("a/b.txt"), pathlib.Path)
+assert_type(click.Path(path_type=pathlib.Path)(None), None)
+
+# The class can be parameterized explicitly.
+param_type: click.Path[pathlib.Path] = click.Path(exists=True, path_type=pathlib.Path)
+assert_type(param_type.convert("a/b.txt", None, None), pathlib.Path)
+assert_type(param_type.coerce_path_result("a/b.txt"), pathlib.Path)
+
+general: click.ParamType[str | bytes | os.PathLike[str]] = click.Path()
+specific: click.ParamType[pathlib.Path] = click.Path(path_type=pathlib.Path)
+
+assert_type(
+    click.Path(path_type=pathlib.Path)(pathlib.PurePosixPath("a/b.txt")), pathlib.Path
+)
```
