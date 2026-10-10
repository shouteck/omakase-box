# box trace

`box trace --out <dir> -- <the test command, as it would normally be typed>`
runs the command and writes `<dir>/trace.json`: every function in the
repository the run called, in the order first called, plus every repository
file whose module-level code ran. Python is the first language; the core
(command, output folder, merge) is language-neutral and a second language is
a later decision.

    box trace --out .box-trace -- python -m unittest tests.test_cart

The command's stdin, stdout and stderr pass straight through live — output
reaches the terminal as it is produced — and `box trace` exits with the
command's own exit code. Its own refusals exit **2** and print a named
`box trace:` reason on stderr: program not found, the program resolves to a
Windows command file (`.cmd`/`.bat`; invoke the underlying program instead),
`--out` cannot be written, or the command started no Python process that
reported a trace. Everything after `--` is the command's argv verbatim — no
shell runs it, so pipes or redirection belong inside a shell you invoke
(`box trace --out d -- cmd /c "..."`).

## How it sees

`box trace` materializes a `sitecustomize.py` (in `packages/box-trace/python/`)
onto `PYTHONPATH` for the run. `site` imports it in every Python process the
command starts — children inherit the environment, which is how a
`subprocess` or spawned `multiprocessing` child is traced with no change to
the project. The hook records call events only (`sys.monitoring` PY_START on
3.12+, `sys.settrace` call events elsewhere) for code objects whose file is
under the repository root — the directory you ran `box trace` in. Each
process writes one record at exit; `box trace` merges them.

Crediting rules:

- **A function is identified by its file and the line its definition starts
  on, never by name** — a property's getter and setter share a name; only
  the one that ran is listed.
- Methods carry their qualified label (`Cart.add`, `Cart.add.line` for a
  nested function, `priced.wrapper` for a decorator's inner wrapper).
- A decorated function is credited by its own `def` line; its decorator's
  wrapper, if there is one, is a nested function credited separately.
- Lambdas and comprehensions are credited to the enclosing function — they
  get no entry of their own.
- A class body's execution is listed with `kind: "class"`; functions and
  methods with `kind: "function"`.
- Module-level code is not a call: a file whose module code ran appears in
  `files` even if no function in it was called.
- A file is marked `"kind": "test"` when any path segment is `test`/`tests`
  or its basename matches `test_*.py`/`*_test.py`; otherwise `"source"`.

## trace.json (schemaVersion 1)

| Field | Meaning |
|---|---|
| `command` | the resolved `argv`, the typed `display` string, `cwd`, `exitCode` |
| `seconds` | wall-clock seconds of the traced run |
| `repository` | `root` (the run directory, canonicalized) and `commit` when it sits in a Git checkout |
| `interpreters` | the Python executable(s)/version(s) seen |
| `processes` / `pids` | how many Python processes reported, and which |
| `files` | every repository file whose code ran, `{path, kind}` relative to root |
| `functions` | `{path, start, end, label, kind, order, pid}` — order is first-called, processes sorted by start time |
| `unseen` | what the tracer cannot see, e.g. compiled extension modules under the root |
| `warnings` | records that could not be merged, named plainly |

## Limits

- `python -S`, `-I` or `-E` disable the startup hook — such a run reports no
  process and is refused as `no-python-process`.
- A process that never exits normally (killed, `os._exit`) leaves no record.
- Only code under the run directory is listed — the standard library and
  installed packages never are.
