# A4: npm-JS, Python and multi-package neutral-loop fixtures

Stage-1 evidence notes for wave A4. These are capability fixtures, not an
outside real issue or customer evidence.

## Fixtures (new, under examples/)

- `examples/a4-npm-cli` — npm-style JavaScript package (`type: module`, no
  dependencies). Editable `src/paint.js`; declared `node` guard + outcome
  checks in `checks/`. Outcome is red on the untouched base.
- `examples/a4-py-tools` — pure-Python project (`pyproject.toml`, no
  JavaScript project files). Editable `tools/slug.py`; declared `python`
  guard + outcome checks. Outcome red at base.
- `examples/a4-multi-pkg` — npm workspaces fixture, selected slice
  `packages/cli` + `packages/core`, excluded member `packages/internal`.
  `package.json` and `package-lock.json` ship byte-for-byte; declared setup
  `npm ci --ignore-scripts --no-audit --no-fund` installs the locked
  `picocolors@1.1.1` (`sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==`).

## Check authorship and clocks

- All fixture files, agreements and `tests/box/package/a4-neutral.test.ts`
  were written by the A4 cook (Devin subagent, Subagent Default) on
  2026-10-06 before any recipient ran. Fixture/check development is separate
  from declaration/export time; the export wall-clock is recorded per run in
  the Box `baseChecks`/`paired` seconds fields and in this file's stage log.
- Dispatch (120-minute budget): ~2026-10-06T12:45Z (20:45 local, +0800).
  Deadline ≈ 2026-10-06T14:45Z.
- Fixture/check construction: ~12:50Z–13:05Z. Declaration/export clocks:
  recorded below when exports ran.

## Outside dependency review

- `picocolors@1.1.1`: published 2024-10-16 (>7 days), no dependencies, no
  install scripts (metadata checked via `npm view picocolors@1.1.1
  time.modified scripts dependencies dist.integrity`). Single approved
  package; locked to the exact version; installed only via
  `npm ci --ignore-scripts`. npm cache reuses downloaded bytes on repeats.

## Negative naming (lab convention)

- no-op: sealed with no edit — must fail `implementation-failure` /
  `command-check`.
- wrong: editable replaced with wrong behavior — must fail the same way.
- deleted: editable file removed — `box/submit.mjs` refuses before sealing.
- tamper: read-only file modified — `box/submit.mjs` refuses ("read-only
  file ... was modified"); no submission exists to verify.
- alt right: a cook-written alternative implementation — must pass verify.
