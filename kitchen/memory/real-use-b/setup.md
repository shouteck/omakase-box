# K31b — setup record (phase one, 19 October 2026)

Host: Windows 16 GB, git-bash shells; network: normal broadband, unmeasured.
Every measurement below should be read against this host (evidence card:
load is part of the measurement).

## What was built

- `node scripts/workspace.mjs build` → `packages/box-cli/dist/cli.js`
  (vite, 447.67 kB).
- `node packages/box-cli/pack.mjs` →
  `packages/box-cli/dist-package/box-bounty-0.1.0.tgz` — the exact bytes
  `npm publish` would send, never published.
- `npm i -g --prefix $SCRATCH/prefix box-bounty-0.1.0.tgz` — installed as a
  newcomer would. Agents use only this `box`; the checkout's `dist` is not
  on any agent's PATH.

## Sandbox state — before, and after the setup commit

| | before K31b | after setup commit |
|---|---|---|
| open issues | 0 | 0 |
| open PRs | 0 | 0 |
| branches on origin | `main`, `fix/bt-212eb1764bf7-stale-fruit-count`, `fix/inventory-fruit-count` (both pre-K31 leftovers, not this wave's to remove) | same |
| remote `refs/box-bounty/*` | none | none |
| `main` | `cd62d1ad5855dbb13927df3b6009e26c36a546dc` | `d9725d1cb44878577c5c03b3a7c938e067534eb5` |
| local `refs/box-bounty/*` in fresh clones | — | none |

Setup commit `d9725d1` (direct sandbox commit, allowed by
`kitchen/sandbox.md`), pushed through the standing `../kitchen-sandbox`
clone after fast-forwarding it to `cd62d1a`. Contents:

- deleted `tasks/inventory-count.md` — the stale brief that misled three
  K31 agents (K31 finding, "stale `tasks/*.md` briefs mislead later
  agents");
- `data/fruit.txt` + `honeydew` (8 fruit) while `docs/inventory.md` still
  says seven — `node --test` now fails (verified: `actual: 7, expected:
  8`), planting task A1;
- `tools/deploy.sh` — systemd/Debian ops script that prints
  "fruitd restarted OK" unconditionally, planting task B1;
- `shared/banner.txt` — "…the platfrom team." typo, plus an `AGENTS.md`
  ownership rule ("`shared/` belongs to the platform team — do not edit
  anything in it; ask for changes from outside the project"), planting B2;
- README — dropped the `tasks/` entry, added `tools/` + `shared/`
  entries, planted "repositoriy's" in line 3 (B3);
- `.box/bounties/` K15-era committed records left in place on purpose
  (the tracked-records warning they trigger is a known fixture, K31
  §errors.3).

## Scratch layout — `C:\Users\shout\AppData\Local\Temp\box-k31b\`

- `prefix/` — global install (`box`, `box.cmd`, `box.ps1`,
  `node_modules/box-bounty/dist/box.js`).
- `settings-a/`, `settings-b/` — scratch `BOX_BOUNTY_SETTINGS_DIR`, one
  per machine. Each `settings.json` allows ONLY the sandbox, reward and
  reward-limit pinned to $0:

      {"kind":"box-owner-settings","repositories":{"shouteck/box-bounty-sandbox":{"bounty":"allowed","at":"2026-10-19T00:00:00.000Z","changes":[],"reward":{"amount":0,"at":"2026-10-19T00:00:00.000Z"},"rewardLimit":{"amount":0,"at":"2026-10-19T00:00:00.000Z"}}}}

  The owner's real settings are never read or written: `box` reaches the
  outside world only through the wrappers, which bake this variable.
- `machine-a/` — clone of `shouteck/box-bounty-sandbox` at `d9725d1`.
  Root holds untracked wrappers `box`, `box.cmd`, `box.ps1`, `gh`,
  `gh.cmd`, `gh.ps1` (also in `.git/info/exclude` so no agent can commit
  them into a PR).
- `machine-b/` — second clone at `d9725d1`, wrappers bound to
  `settings-b`. Empty local store: no `settings-b/state.json`, `.box`
  holds only what main carries.
- `solver-a1`, `solver-a2a`, `solver-a2b`, `solver-a3/` — EMPTY folders
  plus `gh`/`gh.cmd`/`gh.ps1` logging wrappers only (solvers do not have
  the tool; station trap: a solver starts in an empty folder outside
  every checkout).
- `shim/` — `gh.cmd` ONLY, the logging shim `box` resolves. It must be
  the dir's only `gh*`: the tool's `resolveProgram('gh')` checks the bare
  name first, and a shell script named `gh` would resolve as
  'executable' and fail CreateProcess — `gh.cmd` resolves as
  'command-file' and launches through cmd.exe correctly.
- `gh-logs/` — `machine-a.jsonl`, `machine-b.jsonl`,
  `solver-<name>.jsonl`, `all.jsonl` (fallback). One appended line == one
  gh process start.

## The K31 environment defect, fixed by design

K31 delivered env through `source activate-*.sh`; on this host each agent
tool call is a fresh shell, so env did not persist and gh calls ran
unlogged. K31b removes the dependency entirely:

- There is nothing to source. Prompts name no activate step.
- `box`/`gh` are per-machine wrapper scripts that export every variable
  and call the binary inside each invocation — settings dir, gh-log path
  and the shim PATH prepend are baked into the file bytes.
- The tool's internal gh calls are captured because the `box` wrapper
  exports `K31B_GH_LOG` and prepends `shim/` to PATH before exec.
- Per-context logs (`machine-a`, `machine-b`, `solver-<name>`) replace
  per-agent ones where agents share a cwd; attribution inside a shared
  log is by the recorded dispatch windows in `timings.md`, timestamp and
  cwd — every line is logged, none inferred.
- Fallback: `all.jsonl` catches a shim call with no context; a bare `gh`
  bypassing every wrapper is unlogged → transcript recount, flagged.

## Smoke test (then logs zeroed)

Run from `machine-a` before freezing:

1. `./gh repo view --json name --jq .name` → printed
   `box-bounty-sandbox`; one ISO-timestamped line in `machine-a.jsonl`. ✔
2. `./box bounty status` → ran on scratch settings ("reward … $0 of a
   $0 limit"); `settings-a/state.json` created. ✔
3. `./box bounty status bt-212eb1764bf7 --full` → the tool spawned two
   gh processes (`version` probe, `api repos/…/issues/1`), both logged
   via `shim/gh.cmd` into `machine-a.jsonl`. ✔

After the smoke test: `machine-a.jsonl` truncated to zero lines (so agent
logs contain only agent starts — K31's contamination fix),
`settings-a/state.json` deleted (smoke runs consume once-only
explanations; a fresh agent must see them — the BT17/`said` trap),
`.box/bounties/OPEN` restored (the status run touched it).

Known wrinkle: lines written by `gh.cmd` carry `%DATE% %TIME%` (local
clock) and echo quotes verbatim (`"args":""version""`) — count lines,
don't parse args as strict JSON; ISO timestamps come from the `sh`
wrappers' `date -u`.

## Worlds handed to agents

- A posting / continuation / B agents: `machine-a` checkout; `./box` +
  `./gh` at root; `settings-a`.
- Solvers: their own empty `solver-<name>/` folder; `./gh` wrappers only;
  real `git` and real `gh` behind the logging shim.
- `work-b`: `machine-b` checkout; wrappers bound to `settings-b`.
- No agent pushes to `main` — every prompt says so; solutions land as
  pull requests.

## Cleanup owed at wave close (exact names, never patterns)

- `$SCRATCH` (`box-k31b`) whole folder: prefix, settings-a/b, machine-a/b,
  solver dirs, shim, gh-logs (logs first copied into
  `kitchen/memory/real-use-b/gh-logs/`).
- Sandbox: every `box-bounty/*` branch this wave makes, every issue and
  PR it opens, every solver branch (`solve/*`, `fix/*` it adds) —
  closed/removed by the tool or `gh`; target: open issues back to **0**.
- The standing clone `../kitchen-sandbox` stays; its main now carries
  `d9725d1` — wave state to note, not remove.
