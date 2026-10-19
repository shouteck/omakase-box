# K31 — setup record (phase one, 19 October 2026)

Host: Windows, git-bash shells; network: normal broadband, unmeasured.
Every measurement below should be read against this host (see the evidence
station card: load is part of the measurement).

## What was built

- `node scripts/workspace.mjs build` → `packages/box-cli/dist/cli.js`
  (vite, 447.67 kB).
- `node packages/box-cli/pack.mjs` →
  `packages/box-cli/dist-package/box-bounty-0.1.0.tgz` — the exact bytes
  `npm publish` would send, never published.
- `npm i -g --prefix $SCRATCH/prefix box-bounty-0.1.0.tgz` — installed as a
  newcomer would. Agents use only this `box`; the checkout's `dist` is not
  on any agent's PATH.

## Scratch layout — `C:\Users\shout\AppData\Local\Temp\box-k31\`

- `prefix/` — the global install (`box`, `box.cmd`, `box.ps1`,
  `node_modules/box-bounty/dist/box.js`).
- `settings-a/`, `settings-b/` — scratch `BOX_BOUNTY_SETTINGS_DIR`, one per
  machine. Each holds only:

      {"kind":"box-owner-settings","repositories":{"shouteck/box-bounty-sandbox":{"bounty":"allowed","at":"2026-10-19T00:00:00.000Z","changes":[]}}}

  The owner's real settings are never read or written: `box` reaches the
  outside world only through the wrappers, which bake this variable, and
  no `box` exists on the agents' PATH outside the shim dirs.
- `machine-a/` — clean clone of `shouteck/box-bounty-sandbox` at `15cdfd1`.
  Carries repo-root `box`/`box.cmd` wrappers (untracked, also listed in
  `.git/info/exclude` so an agent cannot commit them into a PR).
- `machine-b/` — second clean clone at `15cdfd1`, same wrappers wired to
  `settings-b`. Its `.box` local store is whatever main carries — nothing
  else.
- `solver-t1a … solver-t5/` — six EMPTY folders, one per solver agent
  (station trap: a solver starts in an empty folder outside every
  checkout).
- `shim-gh/` — `gh`/`gh.cmd` logging wrappers (solvers get this only).
- `shim-a/`, `shim-b/` — the same gh wrappers plus `box`/`box.cmd` bound
  to that machine's settings dir (machine agents get these on PATH).
- `env/activate-<agent>.sh` — one file per agent; each prompt tells the
  agent to source its own file once.
- `gh-logs/` — one `<agent>.jsonl` per agent; one appended line = one gh
  process start (timestamp, cwd, args).

## Sandbox state before any agent ran

- Open issues: **0** (nine closed bounty issues #1–#25 from earlier waves).
- Closed PRs: 18.
- Branches on origin: `main`, plus two leftovers from earlier waves —
  `fix/bt-212eb1764bf7-stale-fruit-count` and `fix/inventory-fruit-count`.
  They predate K31 and are not this wave's to remove; they are listed so
  the after-state can be told apart.
- Setup commit pushed to `main`: `15cdfd1` — adds `grape` to
  `data/fruit.txt` (count now 7) and `test/inventory.test.js`, which fails
  because `docs/inventory.md` still says six. Verified failing in
  machine-a: `✖ docs/inventory.md states the count src/count.js prints`.

## Worlds handed to agents

- Posting agents: the machine-a checkout; `box` on PATH via shim-a and as
  `./box` in the root; settings-a.
- Solvers: an empty folder; shim-gh only (no `box` — an outside solver
  does not have the tool); real `gh`+`git` behind the logging shim.
- work-b: the machine-b checkout; shim-b; settings-b.

## Known limits of the capture

- The gh count relies on the agent keeping the sourced environment. If a
  shell is opened without it, calls land on the real gh uncounted; the
  transcript recount is the labelled fallback.
- `gh.cmd` covers cmd.exe callers; PowerShell `gh` resolves through the
  same shim dir via `gh.cmd`/extensionless handling — if a PS agent
  bypasses it the log loses those starts (transcript fallback again).
- Wall times use transcript times plus GitHub `createdAt`/`closedAt`
  fields, not the local clock alone.

## Cleanup owed at wave close (exact names, never patterns)

- `$SCRATCH` (`box-k31`) whole folder: prefix, settings-a/b, machine-a/b,
  solver dirs, shim dirs, env, gh-logs (logs are first copied into
  `kitchen/memory/real-use/gh-logs/`).
- Sandbox: every `box-bounty/*` branch this wave makes, every issue and PR
  it opens, and any solver branches (`solve/*`, `fix/*` this wave adds) —
  closed/removed by the tool or `gh`; target: open issues back to **0**.
- The standing clone `../kitchen-sandbox` stays; its main now carries
  `15cdfd1` which is wave state to note, not remove.
