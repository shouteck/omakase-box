# click-3802

Repository: pallets/click · Issue #3802 · Group: fixed · Created: 2026-08-28T16:16:08Z · Closed: 2026-08-31T23:42:42Z
Labels: prompt · Reporter's role: NONE

## Title

`KeyboardInterrupt` during `click.prompt()` can race

## Body

## Bug

When a user uses Ctrl-C during `click.prompt()`, this may cause an unhandled exception. Seen during CI on an Ubuntu 22.04 arm github runner. The same test on Ubuntu 22.04 x64, macOS arm, Windows x64/arm succeeded. This is likely to be a race that doesn't pop up every time

```
    | --- tty: Ctrl+C aborts at a prompt ---
    | spawn /home/runner/work/ethstaker-deposit-cli/ethstaker-deposit-cli/ethstaker_deposit-cli-c082a10-linux-arm64/deposit --language english --ignore_connectivity generate-mnemonic
    | Please choose the language of the mnemonic word list [1. 简体中文, 2. 繁體中文, 3. čeština, 4. English, 5. Français, 6. Italiano, 7. 日本語, 8. 한국어, 9. Português, 10. Español]:  [english]: ^CTraceback (most recent call last):
    |   File "click/core.py", line 1490, in main
    |   File "click/core.py", line 1968, in invoke
    |   File "click/core.py", line 1300, in make_context
    |   File "click/core.py", line 1311, in parse_args
    |   File "click/core.py", line 2686, in handle_parse_result
    |   File "click/core.py", line 3508, in consume_value
    |   File "ethstaker_deposit/utils/click.py", line 62, in prompt_for_value
    |   File "click/core.py", line 3372, in prompt_for_value
    |   File "click/termui.py", line 218, in prompt
    |   File "click/termui.py", line 201, in prompt_func
    | click.exceptions.Abort
    | 
    | During handling of the above exception, another exception occurred:
    | 
    | Traceback (most recent call last):
    |   File "deposit.py", line 128, in <module>
    |   File "deposit.py", line 121, in run
    |   File "click/core.py", line 1569, in __call__
    |   File "click/core.py", line 1532, in main
    |   File "click/utils.py", line 337, in echo
    |   File "click/_compat.py", line 509, in should_strip_ansi
    |   File "click/_compat.py", line 578, in isatty
    | KeyboardInterrupt
    | [PYI-3853:ERROR] Failed to execute script 'deposit' due to unhandled exception!
    | 
    | [TEST FAIL] Unexpected EOF while waiting for: Aborted
```

## Replication

Probably a `click.prompt()` with Ctrl-C on a slower machine, run often enough to eventually trigger this race condition. In our case it was the free github `ubuntu-22.04-arm` runner.

## Expected

click handles the KeyboardInterrupt exception gracefully, regardless of timing or architecture.

Environment:

- Python version: 3.14
- Click version: 8.4.2


## Comments (2)

### Comment 1 · COLLABORATOR · 2026-09-01T06:42:04Z · AFTER the fix was opened

This has been fixed upstream in the `stable` branch and will be part of Click 8.5.1. Can you confirm it fix your issue?

### Comment 2 · NONE · 2026-09-01T07:34:29Z · AFTER the fix was opened

@kdeldycke Thank you! I can confirm that fixes it. A second interrupt no longer crashes click. In my testing, a single interrupt gives me "Aborted!", but two interrupts don't. I get a clean exit, but no message.

## The fix

Pull request #3818, opened 2026-08-31T15:12:47Z, merged 2026-08-31T23:42:24Z. Title: Fix race condition on `KeyboardInterrupt` in `Command.main()`

Files changed (4):
- modified: CHANGES.md
- modified: docs/exceptions.md
- modified: src/click/core.py
- added: tests/test_abort_interrupt.py  [test]

## Test changes in the fix (1 file)

### added: tests/test_abort_interrupt.py

```diff
@@ -0,0 +1,179 @@
+"""A second Ctrl-C while ``Command.main()`` reported an abort or an error used
+to escape as an unhandled traceback: the message and the exit both ran in
+``except`` clauses, outside every ``try`` that caught ``KeyboardInterrupt``.
+https://github.com/pallets/click/issues/3802
+
+The fix holds one policy, the one the pager has followed since
+https://github.com/pallets/click/pull/351: a late interrupt must not replace
+the intended outcome. In standalone mode the collected exit code wins, for
+aborts, errors and success alike, and the message is best effort. Without
+standalone mode the interrupt propagates to the caller. Two settled contracts
+stay in place: the first interrupt reaches a non-standalone caller as
+``Abort`` (https://github.com/pallets/click/pull/2380), and the ``Aborted!``
+message stays as it is (declined in
+https://github.com/pallets/click/issues/1447 and
+https://github.com/pallets/click/issues/2584).
+"""
+
+import sys
+
+import pytest
+
+import click
+
+
+class RecordingStderr:
+    """A stderr stand-in that records what is written to it.
+
+    With ``interrupt_at=N``, the ``N``-th ``isatty()`` call raises
+    ``KeyboardInterrupt``. ``echo()`` calls ``isatty()`` before writing, which
+    is where the traceback in issue #3802 ended.
+    """
+
+    def __init__(self, interrupt_at=None):
+        self.text = ""
+        self.interrupt_at = interrupt_at
+        self.isatty_calls = 0
+
+    def isatty(self):
+        self.isatty_calls += 1
+
+        if self.isatty_calls == self.interrupt_at:
+            raise KeyboardInterrupt
+
+        return False
+
+    def write(self, value):
+        self.text += value
+        return len(value)
+
+    def flush(self):
+        pass
+
+
+def _interrupt_prompt(text):
+    """Stand in for ``input()`` when the user presses Ctrl-C at a prompt."""
+    raise KeyboardInterrupt
+
+
+def _prompting_command():
+    @click.command()
+    @click.option("--name", prompt="Name")
+    def cli(name):
+        click.echo(name)
+
+    return cli
+
+
+def _interrupting_command():
+    @click.command()
+    def cli():
+        raise KeyboardInterrupt
+
+    return cli
+
+
+def _exit_code(cli, stderr, monkeypatch):
+    """Run *cli* in standalone mode and return its exit code."""
+    monkeypatch.setattr(sys, "stderr", stderr)
+
+    try:
+        cli.main([], "cli")
+    except SystemExit as e:
+        return e.code
+    except KeyboardInterrupt:
+        pytest.fail("KeyboardInterrupt escaped Command.main()")
+
+    pytest.fail("Command.main() returned without exiting")
+
+
+@pytest.mark.parametrize(
+    ("source", "interrupt_at"),
+    [("prompt", None), ("prompt", 1), ("body", None), ("body", 1), ("body", 2)],
+)
+def test_interrupt_while_reporting_abort(monkeypatch, source, interrupt_at):
+    """Exit code 1 survives a second Ctrl-C; the message may not.
+
+    The counted ``isatty`` picks the window. A prompt converts the interrupt
+    to ``Abort`` itself, so the only window left in ``Command.main()`` is the
+    ``Aborted!`` message (``1``). An interrupt from the command body goes
+    through the conversion in ``Command.main()``, which writes a blank line
+    first (``1``), before the message (``2``).
+    """
+    if source == "prompt":
+        monkeypatch.setattr("click.termui.visible_prompt_func", _interrupt_prompt)
+        cli = _prompting_command()
+    else:
+        cli = _interrupting_command()
+
+    stderr = RecordingStderr(interrupt_at=interrupt_at)
+
+    assert _exit_code(cli, stderr, monkeypatch) == 1
+
+    if interrupt_at is None:
+        assert "Aborted!" in stderr.text
+
+
+def test_interrupt_while_reporting_error(monkeypatch):
+    """A Ctrl-C while Click writes an error keeps the error's exit code."""
+
+    class InterruptedReport(click.ClickException):
+        exit_code = 3
+
+        def show(self, file=None):
+            raise KeyboardInterrupt
+
+    @click.command()
+    def cli():
+        raise InterruptedReport("boom")
+
+    assert _exit_code(cli, RecordingStderr(), monkeypatch) == 3
+
+
+def test_late_interrupt_with_disabled_standalone_mode(monkeypatch):
+    """Without standalone mode, a late interrupt reaches the caller, not exit 1.
+
+    The patched ``Abort`` raises a second ``KeyboardInterrupt`` from its
+    constructor: it lands on the ``raise Abort() from e`` statement that
+    ``Command.main()`` only runs for non-standalone callers.
+    """
+
+    class InterruptedAbort(click.Abort):
+        def __init__(self):
+            raise KeyboardInterrupt
+
+    monkeypatch.setattr(click.core, "Abort", InterruptedAbort)
+    cli = _interrupting_command()
+    monkeypatch.setattr(sys, "stderr", RecordingStderr())
+
+    with pytest.raises(KeyboardInterrupt):
+        cli.main([], "cli", standalone_mode=False)
+
+
+def test_interrupt_while_exiting_after_success(monkeypatch):
+    """A Ctrl-C while a successful exit propagates keeps exit code 0.
+
+    The uniform policy: the run completed before
[cut here: 553 more characters]
```
