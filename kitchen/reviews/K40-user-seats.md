# K40 — the tool from each user's seat

Status: **phase 1 — setup complete; no seats dispatched yet.** Cook cannot
dispatch agents on this host; the CTO dispatches fresh seat agents
sequentially with the frozen prompts in Appendix A and preserves their own
reports. Context isolation is by instruction, not an OS boundary.

## Phase 1 — what was built

Host: Windows 16 GB, git-bash + PowerShell + cmd. Clock: setup ran
2026-10-20 ~20:03–20:10 local (+08:00).

### Artifact and provenance

- Build: `node scripts/workspace.mjs build` on `wave/K40` at `7436823`
  (vite → `packages/box-cli/dist/cli.js`, 464.21 kB).
- Pack: `node packages/box-cli/pack.mjs --out <scratch>\pkg` →
  `box-bounty-0.1.0.tgz` (124,131 bytes; contents: `dist/box.js`,
  `LICENSE`, `NOTICE`, `README.md` = FIRST-FIVE-MINUTES.md, `package.json`).
  SHA-256 of the tarball: `5f36649833a81a690a9044b86d3b1e20f1451dc0db86ff075679d0023a91b66a`.
- Install: `npm install -g <tgz> --prefix <scratch>\prefix --ignore-scripts
  --offline` → `box`, `box.cmd`, `box.ps1`,
  `node_modules\box-bounty\dist\box.js` (SHA-256
  `a885c2a1a3d8a64c7c2063ce49a2e8912a14ad0227279f4ce4ebf2e0f36f3e95`).
  Install was fully local (local tarball, no dependencies, scripts
  suppressed); no network or new remote dependencies were needed.
- Smoke: `box --version` on scratch settings → `box 0.1.0`.
- Toolchain: `node --version` = v24.11.0 (`.node-version` pins 24.11.0);
  `gh` 2.101.0 signed in as `shouteck` (scopes gist, read:org, repo,
  workflow).

### Sandbox baseline (verified by cook, 2026-10-20)

`gh issue list`/`gh pr list` on `shouteck/box-bounty-sandbox`: **0 open
issues, 0 open PRs.** Branches on origin: `main`,
`fix/bt-212eb1764bf7-stale-fruit-count`, `fix/inventory-fruit-count` (the
two fix branches are pre-K31 leftovers — foreign, not touched). No
`refs/box-bounty/*` on the remote.

Setup commit pushed to sandbox `main`: `cf45694` "Plant K40 seat task:
stale banner in shared/" — `shared/banner.txt` now reads
`Pantry service — maintained by the platfrom team.` / `Reviewed 2021.`
(the frozen S2 task; the earlier K31b banner typo was fixed since).

### P6 baseline — first output in a fresh clone, reachable remote, no bounties

`box bounty` in `probe-sandbox` (fresh clone of `cf45694`, reachable public
remote, zero open bounties, scratch settings) opened with:

```
box bounty can hand work to an outside solver; box bounty describe says when it is worth using.
reward: each new bounty states $0; open bounties here promise $0 of a $0 limit — $0 left
```

— i.e. **no `shared bounty memory not refreshed` line at all** in this
configuration. (P6 preliminary: does not hold here; the CTO's observation
was with an unreachable remote.)

### Scratch root: `C:\Users\shout\AppData\Local\Temp\kitchen-K40\`

| Path | Contents |
|---|---|
| `pkg\box-bounty-0.1.0.tgz` | the artifact; `pkg\package\README.md` extracted copy |
| `prefix\` | global-style install used by the seat worlds that ship the tool installed |
| `settings-<seat>\` (e.g. `settings-seat2-on`) | per-seat `BOX_BOUNTY_SETTINGS_DIR` actually used by each runner; owner's settings never read or written. `settings-s2on`/`s2off` were an unused seed path — see the phase-1.5 correction |
| `seat1\` | S1 world: tarball + README copy + `sandbox\` clone at `cf45694` + runner + gh shims; **no** `box` wrapper — S1 installs it itself; settings-s1 empty (stranger discovers `allow`) |
| `seat2-off\` | `sandbox\` clone at `cf45694`, `box`/`gh` wrappers + runner, settings-s2off seeded: sandbox `allowed`, reward 0, rewardLimit 0, `instructions.enabled=false`; local uncommitted edits remove `<!-- box-bounty -->` block from `AGENTS.md` and delete `.devin\hooks.v1.json` (would disclose the tool at session start) |
| `seat2-on\` | identical clone unmodified — committed `AGENTS.md` block verified byte-equal to the tool's own `renderRulesBlock('idle')` (`wording.ts`); settings-s2on seeded identically except `instructions.enabled=true` |
| `seat3\` | empty + runner + `gh` logging shims only (solver has no tool, starts outside every checkout — station rule) |
| `seat4\` | empty placeholder; filled after S3 (fresh clone + fresh settings mirroring a project where the owner already allowed $0) |
| `probe-sandbox\` | cook's own clone for baseline checks (P6); not handed to any seat |
| `logs\<seat>.log` | runner transcript: one `=== ts cwd cmd` header per command, then its full output |
| `logs\<seat>-gh.jsonl` | one line per `gh` process start (agent's own `gh` **and** the tool's internal `gh`, via `ghbin\gh.cmd` first on PATH — the K31b fix for `resolveProgram`) |
| `prompts\` | frozen prompts S1, S2-off, S2-on, S3 (verbatim copies of Appendix A) |
| `gen-seats.cjs` | the generator that wrote every wrapper (kept for the pass) |

### How a seat is run

Dispatch a fresh agent with the seat's prompt file as its whole prompt
(plus any host role boilerplate). The prompt tells it to run every shell
command through the runner at the seat root (`run` bash, `run.cmd`,
`run.ps1`). The runner bakes `BOX_BOUNTY_SETTINGS_DIR` and the shim PATH
per invocation — nothing to source, no env persistence needed (K31
defect). `run` logs the command line and tees all output to
`logs\<seat>.log`; `gh` calls append to `logs\<seat>-gh.jsonl`. Known
wrinkle from K31b, unchanged: `gh.cmd`-written lines carry local
`%DATE%`-style timestamps and are line-counted, not JSON-parsed.

After each seat: save the seat's own report, then copy `logs\<seat>.*`
aside before the next seat runs (logs are per-seat files already; no
shared mutable state between seats — each has its own clone, settings dir
and log pair).

### Frozen S2 task (verbatim)

> The platform team wants the shared banner refreshed. The file
> `shared/banner.txt` must end up reading exactly these two lines:
> `Pantry service — maintained by the platform team.` / `Reviewed 2026.`
> Get the repository to that state, following its rules (do not push to
> `main`).

Forbidden-folder rule is meaningful: `AGENTS.md` forbids editing
`shared/` ("ask for changes from outside the project"), so the seat agent
cannot do the task itself, but an outside solver can via PR. Chosen from
the *current* sandbox files after inspection — the K31b banner typo and
fruit-count drift are already resolved; this flaw was planted by setup
commit `cf45694`. Small and nontrivial: exact target text supplied, the
agent must supply the "what it tried" itself — the task text carries no
hint about the tool.

### Enabling the on-world without priming the off seat

The on/off toggle is the instruction block only. The sandbox's committed
`AGENTS.md` carries the tool-written block (verified against
`renderRulesBlock('idle')`), so the on-clone is "on" as cloned — the
settings seed `instructions.enabled=true` matches. The off-clone differs
by exactly two local uncommitted edits (block removed, hooks.v1.json
deleted). No seat's state touches another; S2-off and S2-on are separate
fresh agents on separate clones and settings dirs.

### Setup audit correction (phase 1.5, before S2-on dispatch)

**Bug found and fixed.** The seat generator baked
`BOX_BOUNTY_SETTINGS_DIR=<scratch>\settings-seat2-off` /
`settings-seat2-on` into the runners, while the seed settings were written
to `settings-s2off` / `settings-s2on`. Consequence: **S2-off ran with an
empty settings dir** — no `allow`, no instructions config; the tool
auto-created `settings-seat2-off\state.json` only. Its run therefore ended
held at the owner-allow gate (`create → preview → post` stopped where the
tool asks the owner). That outcome reflects *empty* settings plus the
priming confound below — **it is not evidence that a normally-configured
project blocks, and is not claimed as a product bug.** No retroactive
change to the off world; its settings state is left as the seat left it.

**Off-world priming confound (fixture bug, recorded not fixed).** The off
clone's `AGENTS.md` line 1 reads "This is a test area for the box-bounty
tool", the `README.md` names the tool and its records, and `box`/`gh`
wrappers sit at the seat root beside the runner — so the off agent
discovered the tool through ordinary project text, with no instruction
block. Its discovery is **not** evidence about P1 (an agent in a new
project never hears of the tool). A clean-neutral paired rerun — a project
whose text does not name the tool — is needed if the clock allows, after
the on/S3 chain.

**On-world correction (the only change made).** Run through the on-seat's
own runner, inside `seat2-on\sandbox`, so the tool wrote the real formats:

```
$ ../run box bounty allow shouteck/box-bounty-sandbox --reward 0 --reward-limit 0
allowed: shouteck/box-bounty-sandbox — written to the owner's settings.
bounties on shouteck/box-bounty-sandbox state $0 — no payment is promised; …
$ ../run box bounty config set instructions true
instructions: on; owner's settings outside the repository. Existing blocks remain when off.
AGENTS.md: block updated — the edit is in the worktree, not committed; commit it with the project
```

`settings-seat2-on\settings.json` now carries `bounty: allowed`,
`reward 0`, `rewardLimit 0` and
`instructions["…\\seat2-on\\sandbox"].enabled = true` (verbatim file kept
in scratch; the `git diff` on `AGENTS.md` is empty apart from line-ending
normalisation — the tool rewrote the identical block). `state.json` was
deleted afterwards so the seat agent still sees once-only notices
(`said`, `rewardNoticeAt`) — the BT17 trap. Both setup commands' full
output is preserved in `logs\setup-seat2-on.log`; `seat2-on.log` was
truncated afterwards and now contains only what the S2-on agent produces.
The frozen S2-on prompt (Appendix A3) is unchanged.

**Same bug, other seats, assessed:** `seat1` runs against `settings-seat1`
(intended empty anyway — the stranger discovers `allow`); `seat3` has no
tool; `settings-s2on`/`settings-s2off` seeds are now unused duplicates and
will be removed at cleanup. `settings-s4` is prepared later per the plan.

**S1 / S2-off status (from the CTO):** S1 (fresh agent `564b76f0`)
finished — report saved at `prompts\S1-report.md` (a
punctuation-normalized transcription; `logs\seat1.log`/`seat1-gh.jsonl`
are verbatim). It installed the package locally and hand-edited AGENTS.md
plus wrappers rather than finding the `config set instructions` path, and
noticed the `.box\bounties\` vs `.box\local\box.db` record-location
mismatch (P2 candidate). S2-off (fresh agent `f6969c07`) finished —
created `bt-7771561ca9fa`, previewed, post held at owner allow; nothing
public was posted. Owner-addressed lines from S1 and S2-off are collected
for S5 from the verbatim logs in phase 2.

### Sequence for the CTO

S1 → S2-off → S2-on → S3 → S4 → S5. S3's prompt needs the S2-posted issue
URL inserted at `<ISSUE_URL>`. S4 is prepared only after S3's answer lands
(fresh clone, fresh seeded settings, shared memory via the public remote —
never a copied `box.db`). S5's stand-in run (`github-fixture.ts`, $5
reward, test-mode `pay-to:` link) is prepared after the real seats'
owner-addressed lines are collected; nothing on real GitHub and no real
payment.

## P1–P7

Pending — answered from seat transcripts in phase 2. P6 preliminary above.

## Seats

Pending — S1, S2-off, S2-on, S3, S4, S5 not yet dispatched.

## Findings table

Pending.

---

## Appendix A — frozen seat prompts (verbatim; same bytes as `prompts\*.md`)

### A1 — S1 stranger

```
You are setting up a fresh work area for a coding agent.

Working folder: C:\Users\shout\AppData\Local\Temp\kitchen-K40\seat1

It contains:
- `box-bounty-0.1.0.tgz` — a tool package
- `README.md` — the package's readme
- `sandbox\` — a clone of the project your agent works in
- `run`, `run.cmd`, `run.ps1` — a command runner. This environment records
  sessions for a study, so run EVERY shell command through it: from inside
  `sandbox\` use `../run <command>` (bash), `..\run.cmd <command>` (cmd) or
  `..\run.ps1 <command>` (PowerShell). Do not work around the runner.
- `gh` is installed and signed in for GitHub operations.

Goal: Set this up so your coding agent can hand off work it cannot do.

Constraints:
- Stay inside the seat1 folder; do not open files outside it. Do not look
  for other documentation about the package — the README is what a stranger
  would have.
- Do not push to the project's main branch. Do not create real GitHub
  issues or pull requests unless you judge the setup genuinely needs one;
  this repository's bounties are tests that pay nothing.
- When you finish, report: every step you took in order, every point where
  you were unsure or guessed, and anything you could not figure out.
```

### A2 — S2-off arriving agent (instructions off)

```
You are an agent arriving in a project.

Working folder: C:\Users\shout\AppData\Local\Temp\kitchen-K40\seat2-off\sandbox
— a clone of the project repository. Work only inside the seat2-off folder;
do not open files elsewhere on this machine.

This environment records sessions for a study: run EVERY shell command
through the runner — from inside `sandbox\` use `../run <command>` (bash),
`..\run.cmd <command>` (cmd) or `..\run.ps1 <command>` (PowerShell). Do not
work around the runner. `gh` is installed and signed in.

The repository's own AGENTS.md states its rules — follow them.

Task: The platform team wants the shared banner refreshed. The file
`shared/banner.txt` must end up reading exactly these two lines:

    Pantry service — maintained by the platform team.
    Reviewed 2026.

Get the repository to that state, following its rules (do not push to
`main`). When you finish, report what you did, in order, and anything that
blocked or surprised you.
```

### A3 — S2-on arriving agent (instructions on)

Identical to A2 except the working folder is `seat2-on\sandbox` and the
seat folder is `seat2-on`. Verbatim copy: `prompts\S2-on.md`.

### A4 — S3 solver (issue URL inserted at dispatch)

```
Working folder: C:\Users\shout\AppData\Local\Temp\kitchen-K40\seat3 — empty.
Stay inside it except for cloning the repository named below into it.

This environment records sessions for a study: run EVERY shell command
through the runner — `./run <command>` (bash), `run.cmd` or `run.ps1` from
this folder. `gh` is installed and signed in.

This issue offers a bounty; answer it: <ISSUE_URL>

Do not contact anyone. Do not push to the repository's `main` branch. When
you finish, report what you did, what the issue asked for, how you knew
where to put your answer, and anything that was unclear.
```

## Appendix B — setup transcript excerpts

- `npm install -g box-bounty-0.1.0.tgz --prefix prefix --ignore-scripts
  --offline` → `added 1 package in 3s`.
- `box --version` → `box 0.1.0`.
- `gh issue list -R shouteck/box-bounty-sandbox --state open` → (empty);
  `gh pr list` → (empty).
- Runner smoke test (`seat3`): `./run gh version` and `./run gh repo view`
  produced the real output plus matching log lines in `seat3.log` and
  `seat3-gh.jsonl`; `ghbin\gh.cmd version` under cmd logged and ran real
  gh. Logs truncated and `settings-*/state.json` removed after the smoke
  test so seats see only their own traffic and all once-only notices.
