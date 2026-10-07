# click-3740

Repository: pallets/click · Issue #3740 · Group: fixed · Created: 2026-07-31T16:16:15Z · Closed: 2026-08-14T18:51:53Z
Labels: windows; typing · Reporter's role: NONE

## Title

[Bug] On Windows, get_pager_file returns a typing.BinaryIO object NOT typing.TextIO

## Body

Inside `src/click/_termui_impl.py`, the function `get_pager_file` delegates the creation of a tempfile to `_tempfilepager`, which returns a `BinaryIO` object of the opened file:

```python
f = tempfile.NamedTemporaryFile(mode="wb", delete=False)
try:
    yield t.cast(t.BinaryIO, f), encoding, color
...
```
Which is called by _pager_contextmanager in
```python
...
if pager_cmd_parts:
        if WIN:
            return _tempfilepager(pager_cmd_parts, color)
        return _pipepager(pager_cmd_parts, color)
...
    if WIN or sys.platform.startswith("os2"):
        return _tempfilepager(["more"], color)
    return _pipepager(["less"], color)
```
In the end `get_pager_file`
```python
def get_pager_file(color: bool | None = None) -> t.Generator[t.TextIO, None, None]:
    ...
    with _pager_contextmanager(color=color) as (stream, encoding, color):
    # Split streams by capabilities rather than the abstract TextIO /
    # BinaryIO annotations: buffered text streams can be unwrapped to bytes,
    # while other streams are yielded as-is.
    wrapper: MaybeStripAnsi | None = None
        if _has_binary_buffer(stream):
            # Text stream backed by a binary buffer.
            wrapper = MaybeStripAnsi(stream.buffer, color=color, encoding=encoding)
            stream = wrapper
        try:
            # Narrow the BinaryIO | TextIO union that _pager_contextmanager
            # yields; the caller writes text to the pager.
            yield t.cast(t.TextIO, stream)
        ...
```
In the above `yield t.cast(t.TextIO, stream)` stream object will be `BinaryIO`, contradicting the `TextIO` annotation of the return value, all because it was created with the mode `"wb"` earlier.

Then if a caller tries: `stream.write("some text")` it will raise an exception:
`TypeError: a bytes-like object is required, not 'str'`

FIX:
In `_tempfilepager`, create the temp file with `mode='w'`
```python
f = tempfile.NamedTemporaryFile(mode="w", delete=False)
```
I went ahead and created a pull request:
https://github.com/pallets/click/pull/3739

## Comments (1)

### Comment 1 · NONE · 2026-08-03T10:57:34Z · AFTER the fix was opened

Hello @davidism
In case you ever read this issue. I must point out I didn't know this was a duplicate of #3731.
if you think it's not useful, close it.

## The fix

Pull request #3739, opened 2026-07-31T16:15:10Z, merged 2026-08-14T18:51:52Z. Title: Changed `tempfile.NamedTemporaryFile` mode to `w`

Files changed (3):
- modified: CHANGES.md
- modified: src/click/_termui_impl.py
- modified: tests/test_termui.py  [test]

## Test changes in the fix (1 file)

### modified: tests/test_termui.py

```diff
@@ -936,6 +936,77 @@ def pager_contextmanager(color=None):
     assert stream.flush_calls == 1
 
 
+def _force_tempfile_pager(monkeypatch, pager_cmd="cat"):
+    """Route ``get_pager_file`` through the ``_tempfilepager`` backend.
+
+    That backend is only reachable on Windows, so the platform flag and the tty
+    probes are faked to exercise it from any runner.
+    """
+    cmd_path = shutil.which(pager_cmd)
+    assert cmd_path is not None, f"{pager_cmd} not available"
+    monkeypatch.setattr(click._termui_impl, "isatty", lambda _: True)
+    monkeypatch.setattr(click._termui_impl, "WIN", True)
+    monkeypatch.setitem(click._termui_impl.os.environ, "PAGER", cmd_path)
+
+
+def _page_with_get_pager_file():
+    with click.get_pager_file() as pager:
+        pager.write("hello\n")
+
+
+def _page_with_echo_via_pager():
+    click.echo_via_pager("hello")
+
+
+@pytest.mark.skipif(shutil.which("cat") is None, reason="cat not available")
+@pytest.mark.parametrize(
+    "page",
+    [
+        pytest.param(_page_with_get_pager_file, id="get_pager_file"),
+        pytest.param(_page_with_echo_via_pager, id="echo_via_pager"),
+    ],
+)
+def test_tempfile_pager_accepts_text(monkeypatch, capfd, page):
+    """The temp file backend must yield a text stream (issues #3731, #3740).
+
+    ``_tempfilepager`` opens its temp file in binary mode and yields the
+    ``_TemporaryFileWrapper`` straight to ``get_pager_file``. That wrapper
+    exposes no ``.buffer``, so the ``_has_binary_buffer`` probe is False and no
+    ``MaybeStripAnsi`` wrapper is installed. The caller then writes ``str`` to a
+    binary handle and gets ``TypeError: a bytes-like object is required``.
+    """
+    _force_tempfile_pager(monkeypatch)
+
+    page()
+
+    out, err = capfd.readouterr()
+    assert err == ""
+    assert out.replace("\r\n", "\n") == "hello\n"
+
+
+@pytest.mark.skipif(shutil.which("cat") is None, reason="cat not available")
+@pytest.mark.parametrize(
+    ("color", "expected"),
+    [
+        pytest.param(False, "hello\n", id="strip ansi"),
+        pytest.param(True, click.style("hello", fg="red") + "\n", id="preserve ansi"),
+    ],
+)
+def test_tempfile_pager_handles_ansi(monkeypatch, capfd, color, expected):
+    """The temp file backend honors ``color`` like the pipe backend does.
+
+    ANSI stripping lives in ``MaybeStripAnsi``, which the binary temp file
+    never gets wrapped in, so ``color`` is silently ignored on this path.
+    """
+    _force_tempfile_pager(monkeypatch)
+
+    click.echo_via_pager(click.style("hello", fg="red"), color=color)
+
+    out, err = capfd.readouterr()
+    assert err == ""
+    assert out.replace("\r\n", "\n") == expected
+
+
 def test_editor_unclosed_quote():
     """An unclosed quote in the editor command raises ValueError."""
     with pytest.raises(ValueError, match="No closing quotation"):
```
