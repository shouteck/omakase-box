# click-3766

Repository: pallets/click · Issue #3766 · Group: fixed · Created: 2026-08-14T20:30:37Z · Closed: 2026-08-15T22:55:06Z
Labels: docs; tests; rejected AI · Reporter's role: NONE

## Title

docs/contributing.md describes .github/workflows/test-flask.yaml, which was removed in 97b300c

## Body

`docs/contributing.md` (line 28) tells contributors:

> -   A CI workflow (`.github/workflows/test-flask.yaml`) runs Flask's test suite to catch downstream regressions.

That workflow no longer exists. It was removed in 97b300c ("add zizmor to scan workflows", 2026-04-03); the same commit modified `lock.yaml`, `pre-commit.yaml`, `publish.yaml` and `tests.yaml` and added `zizmor.yaml`, but `test-flask.yaml` was deleted rather than updated, and the commit message doesn't mention it. The current workflow set is `lock`, `nightly`, `pre-commit`, `publish`, `tests`, `zizmor`, and none of them run Flask's suite as far as I can see.

So the docs describe a downstream safety net that isn't running. Two different fixes depending on intent, which is why I'm asking rather than sending a patch:

- **If dropping it was deliberate**: happy to open a PR removing that bullet from `docs/contributing.md`.
- **If it was collateral** in the zizmor pass, then the Flask downstream regression check has been off since April and the docs are the only thing that noticed.

Found this with a tool I'm building that verifies documentation claims against the repository and its git history; the "documented file was deleted and never restored" check is what flagged it. Happy to send either patch, or neither if you'd rather handle it.



## Comments (5)

### Comment 1 · MEMBER · 2026-08-14T20:39:50Z · BEFORE the fix was opened

https://palletsprojects.com/contributing/llm-ai

### Comment 2 · COLLABORATOR · 2026-08-15T04:33:52Z · BEFORE the fix was opened

Ok that's clearly AI generated but still, what happened to our flask test workflow in https://github.com/pallets/click/pull/3304 ? @davidism was it deliberately removed?

I know the cases are clearly covered in unit tests for a while:
- https://github.com/pallets/click/blob/8b44edfff7d9a6c895fa804148c16b3a0bc9efb5/tests/test_defaults.py#L347-L352
- https://github.com/pallets/click/blob/8b44edfff7d9a6c895fa804148c16b3a0bc9efb5/tests/test_options.py#L2569-L2573

So if we want to reintroduce the Flask smoke test, we can add that to the list of nightly runs.

### Comment 3 · MEMBER · 2026-08-15T04:57:17Z · BEFORE the fix was opened

Yeah, that's why I left it open and just commented. I didn't remove it on purpose, probably got overwritten when I was copying configs around to the projects.

### Comment 4 · COLLABORATOR · 2026-08-15T06:56:28Z · AFTER the fix was opened

> Yeah, that's why I left it open and just commented. I didn't remove it on purpose, probably got overwritten when I was copying configs around to the projects.

It's OK, no worries, just added it back in https://github.com/pallets/click/pull/3768 .

### Comment 5 · COLLABORATOR · 2026-08-17T06:03:57Z · AFTER the fix was opened

> Yeah, that's why I left it open and just commented. I didn't remove it on purpose, probably got overwritten when I was copying configs around to the projects.

Merged upstream, and it's green: https://github.com/pallets/click/actions/runs/32000003432 ! :)

## The fix

Pull request #3768, opened 2026-08-15T06:56:03Z, merged 2026-08-16T23:43:41Z. Title: Run Flask's test suite in the nightly workflow

Files changed (2):
- modified: .github/workflows/nightly.yaml
- modified: docs/contributing.md

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
