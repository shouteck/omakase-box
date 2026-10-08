# Gate 1b instrument

The [plan](../gate-1b-plan.md) is the authority; it was committed and pushed (`ba544f5`) before any run. Sample, images and base snapshots are Gate 1's (`../gate-1/sample.json`, `image-digests.json`, `records/<task>/sources.json.gz`).

From the lab checkout, Python 3.11 or later:

```
python lab/lines/box-trial/gate-1b/check.py      # known-answer checks, no project code
python lab/lines/box-trial/gate-1b/run.py        # containers, one at a time; skips tasks already recorded
python lab/lines/box-trial/gate-1b/measure.py    # host only; writes summary.json
python lab/lines/box-trial/gate-1b/report.py     # prints the table
```

`run.py` checks the kitchen is idle before each pull and each container, pulls the pinned image, and runs `container.py` inside it with the network off, no capabilities, 4 GB and two CPUs. The runtime receives the test patch and the test commands only: never the historical fix, never the issue. It keeps one image at a time so a project's images share layers, and removes only images it pulled. Named tasks can be passed as arguments. To rerun a task, use a separate copy of this folder so the original attempt is not overwritten.

`container.py` applies the test patch and runs three phases, each a fresh process with a 300-second cap: the named failing tests untraced; the same under a tracer that records function calls in repository files (call events only, no line events); the passing neighbours under the tracer. Threads are traced; subprocesses and compiled code are not. SymPy's runner is called in-process.

`measure.py` runs no project code. It parses the base snapshot with `ast`, builds the narrow and subtracted Boxes from the traces, takes search words from the issue and the failure message by the plan's fixed rule, and only then reads the historical fix to find the target functions. `measure.py <task ids>` writes `sample-rerun.json` and leaves `summary.json` alone.

Raw logs and traces stay on this host under `records/` and are ignored by Git; `attempt.json` (with SHA-256 of every artifact), `execution.json` and `measurement.json` per task are tracked, as are `summary.json` and the summary from before the parser correction.

Adding a technique later: a new Box is a set of `(path, first line)` function keys; `measure.py` scores any such set through `spans_of` and `position`. Adding tasks: they come from `../gate-1/tasks.json`.
