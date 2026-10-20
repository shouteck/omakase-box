# K40 — the tool from each user's seat

Status: **complete — all five seats ran (six fresh agents), findings
recorded, public state cleaned.** Cook cannot dispatch agents on this
host; the CTO dispatched fresh seat agents sequentially with the frozen
prompts in Appendix A and preserved their own reports (agent ids below are
real). Context isolation was by instruction, not an OS boundary — one seat
(S4) used an unlogged code-search helper once; the runner logs are the
verbatim record, self-reports are labelled as such. No seat was shown this
brief, the repository docs, another seat's notes, or P1–P7.

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

### Sequence for the CTO — current state

S1 ✅ (`564b76f0`) · S2-off ✅ (`f6969c07`) · S2-on ✅ (`87ac78b8` — posted
issue **#39**, bounty `bt-e879e5958d8a`, branch `platform-banner-refresh`,
no main push) · S3 ✅ (`580106b7` — PR **#40** `aafef89`, base
`box-bounty/bt-e879e5958d8a`, only `shared/banner.txt`, exact ASCII 2
lines, no project code executed) · **S4 next** (prompt `prompts\S4-later.md`,
world ready) → then **S5** (prompt `prompts\S5-owner.md`, dossier +
stand-in transcript ready). Do not close issue #39/PR #40 until S4 has
run.

## P1–P7

Each verdict is against verbatim evidence; "read" means code/README read
by the cook, "runtime" means observed CLI output this wave.

**P1 — holds in part; the causal half is untestable this wave.**
Default-off is confirmed (runtime, `config --json` in S1's session):
`"instructions":{"enabled":false,"file":null,"found":[{"path":"AGENTS.md","refused":null}]}`,
and `config --full` printed `instructions: off; change: box bounty config
set instructions <true|false>`. The README gap is confirmed (read):
`FIRST-FIVE-MINUTES.md` contains no occurrence of the word
"instructions" — it describes only `hook on --host <name>` (lines 71–76).
The stronger claim "an agent in a new project never hears of the tool" is
**not answered**: the off-seat's ordinary `AGENTS.md`/`README.md` name
box-bounty and its wrappers sat beside the runner, so its discovery is a
fixture confound, not evidence (see phase-1.5 correction). A clean-neutral
off/on pair remains open work.

**P2 — holds.** README (read): "On your machine it writes each bounty's
record under `.box/bounties/`" (FIRST-FIVE-MINUTES.md:9) and "each
project's own bounty records are in `.box/bounties/`" (:95). Runtime
help in S1's session: "the record lives in .box/local/box.db inside the
repository — it outlives the session that made it." S1 independently
flagged the mismatch (seat1.log; S1-report.md "Documentation mismatch").

**P3 — holds.** README "What becomes public" lists "the task, the one
line of why, the bounty branch's commits, and a machine-readable block on
the issue" — no mention of the shared memory pushed to
`refs/box-bounty/*`. Runtime proof it is really public:
`refs/box-bounty/bt-e879e5958d8a` remains on the public remote after
cleanup (retained by design — durable shared memory, not wave scratch).

**P4 — holds.** `allow --help` (runtime): "--reward-limit <whole
dollars> — the most one bounty may state, in whole dollars". Runtime
probe on the stand-in (reward $5, limit raised to $8, two open bounties):
`bounty post refused (promise-limit-exceeded): posting would bring
promised rewards to $10 across this repository's open bounties — the
owner's limit is $8`. The limit is a cap on the **total promised across
open bounties**, not per-bounty as the help line says. (Code read:
`money.ts` `assertPromiseRoom`.)

**P5 — holds.** Runtime probe on the stand-in world with $5 owed:
`box bounty hook start` exited 0 and printed **nothing**. The only place
the owed amount appears is agent-facing output: `1 payment(s) owed — box
bounty status shows whom` inside `box bounty`/`status`. Nothing addresses
the owner; an agent that does not pass it on leaves the owner uninformed.

**P6 — does not hold.** Runtime probe: `box bounty` in a fresh clone of
the reachable public sandbox with zero open bounties opened with
"box bounty can hand work to an outside solver; …" and the reward line —
no `shared bounty memory not refreshed` anywhere in the output (verbatim
in §P6-baseline). The CTO's observation was with an unreachable remote.

**P7 — holds verbatim, severity: slows.** Issue #39's body contained
"## What was already tried\n\nThe note the tool wrote from the local
changes is not published." — telling the solver nothing. Mitigation
observed: the on-seat agent had written its own "What I tried" paragraph
inside the task text, so the solver still had context and completed PR
#40. Where an agent writes a bare task, the section is dead weight.

## Seats

| Seat | Agent | Material | Outcome |
|---|---|---|---|
| S1 Stranger | `564b76f0` | tarball + README + clone | Installed locally (`--prefix`), exercised help/describe/config/hook, found the `.box/bounties/` vs `box.db` mismatch, hand-wrote AGENTS.md instructions + wrappers rather than finding `config set instructions true`; correctly refused to grant `allow` itself. Goal reached with friction. |
| S2-off | `f6969c07` | clone, block removed | Confounded (tool named in repo text + empty settings bug). Created `bt-7771561ca9fa`, previewed, post held for owner — nothing public. |
| S2-on | `87ac78b8` | clone, block + allow | Full journey: `create` → `post --preview` → `post` (issue #39) → status polling. Posted cleanly. |
| S3 Solver | `580106b7` | issue URL only | Followed the issue's "How to answer" exactly: branched from `box-bounty/bt-e879e5958d8a`, PR #40 `aafef89`, banner-only exact change. |
| S4 Later | `78b0192b` | fresh clone + settings | Found issue+PR on its own; `look` refused `shared-only`; correctly ran tests and recommended applying from the origin checkout. |
| S5 Owner | `373a4271` | dossier only | Answered all four questions; grades below. |

Isolation limits: per-seat clones/settings/logs; one S4 code-search helper
call bypassed the runner (agent disclosed it); S1 chose a `--prefix`
install and its own settings dir — a legitimate reading of the boundary,
not a bypass. `run.ps1` was blocked by Windows script policy for two
seats; they used the bash `run` (method friction, not a product defect).

## Findings

| # | Seat | Severity | Finding | Proposed fix |
|---|---|---|---|---|
| F1 | S1/all | slows | PowerShell `run.ps1` blocked by execution policy (method friction, not product) | none — method note |
| F2 | S1 | misleads | README says records live in `.box/bounties/`; the tool uses `.box/local/box.db` (P2) | FIRST-FIVE-MINUTES.md: name `.box/local/box.db` in both places |
| F3 | S1 | slows | README never names `config set instructions true`; stranger hand-edited AGENTS.md instead (P1's README half) | README: one line naming the config path beside the hook paragraph |
| F4 | S1 | slows | README's "becomes public" omits the public `refs/box-bounty/*` memory (P3) | README: add shared-memory refs to the public list |
| F5 | S2-off | — | Held-for-owner block worked as designed on empty settings; not a defect | none |
| F6 | S2-off | — | Fixture confound: repo AGENTS/README name the tool; discovery says nothing about P1 (method) | clean-neutral rerun (method row, not product) |
| F7 | S2-on | slows | No arrival notification; agent polled `status` in `sleep` loops ~8 min | none required — note for BT41 if a wait verb is ever wanted |
| F8 | S3 | slows | "What was already tried" read "The note the tool wrote from the local changes is not published." — useless to the solver (P7) | post.ts: when the note is not published, write the agent's tried-note or drop the section |
| F9 | S4 | misleads | `status` printed `posted "…" — open today; no solution yet` and suggested `look <id> <n>` while PR #40 existed and `look` always refuses `shared-only` on this machine | status: for shared-memory bounties say "posted from another machine; N pull request(s) waiting on GitHub — act on it from that machine" (wording only; cross-machine apply is an owner decision, not BT41 scope) |
| F10 | S4 | — | One unlogged code-search call (trace limit, disclosed by the agent) | none — recorded as isolation limit |
| F11 | S5 | misleads | No tool output addressed to the owner names how to revoke/stop (deny/hook off/uninstall exist only in the README, which the owner never sees via the tool) | owner-facing lines (held/allow/owed blocks): add a `stop:` line naming `box bounty deny <repo>` / uninstall |
| F12 | S5 | — | Dossier juxtaposed earlier empty-settings lines with later allowed lines; owner read inconsistency (fixture assembly confound, not a product contradiction) | none — method note; tool persisted consistent facts |

S5 grades against the fact key: Q1 **partially right** (allowed,
sandbox-only, $0, no asking — but flagged the dossier's own
inconsistency); Q2 **right within the lines** ("does not say exactly which
files or other information a post exposes" — correct; shared memory is
the hidden fact P3 names); Q3 **right** ($0 real, $5 explicitly
fictional); Q4 **right** ("the document does not tell me" — the correct
answer, and the absence is finding F11).

## Cleanup performed (all $0, sandbox only)

- `box bounty close bt-e879e5958d8a --reason "K40 seat drill complete — the
  banner change is no longer wanted"` in the on-seat clone →
  `bt-e879e5958d8a — rejected`; the tool closed issue **#39** and PR **#40**
  itself (both verified `CLOSED` via `gh`).
- `box bounty close bt-7771561ca9fa --reason "K40 wave cleanup — draft
  never posted"` in the off-seat clone → `— rejected` (local only; nothing
  had been public).
- Wave-owned remote branch `solution/bt-e879e5958d8a-seat3` deleted via
  `gh api -X DELETE`. Foreign pre-K31 branches
  (`fix/bt-212eb1764bf7-…`, `fix/inventory-fruit-count`) and tracked
  historic `.box/bounties/` records untouched.
- Retained by design: `refs/box-bounty/bt-e879e5958d8a` on the public
  remote (durable shared memory — the P3 proof, not scratch), sandbox main
  `cf45694` (the planted task — see deviation below), local seat clones
  and the whole `kitchen-K40` scratch (kept until the pass reruns
  findings; listed for exact-name removal).
- Final public state: **0 open issues, 0 open PRs.**

**Scope deviation (disclosed to the owner by the CTO).** Phase-1 setup
pushed commit `cf45694` directly to sandbox `main` to plant the S2 task —
outside the card's "real $0 issues/PRs through the tool" scope, even
though `kitchen/sandbox.md` broadly allows sandbox edits. Recorded as a
method/scope deviation with no retroactive approval; not reverted (public
history) and no further direct pushes were made.

**Method inventory for the reviewer:** scratch roots — `kitchen-K40`
only (`seat1`…`seat5`, `settings-*`, `logs`, `pkg`, `prefix`, `prompts`,
`probe-sandbox`, `s5-standin`, `s5-standin-run.mjs`, `s5-probe-p4-p5.mjs`,
`s5-standin-transcript.txt`, `s5-probe-transcript.txt`, `gen-seats.cjs`);
no other roots created, no processes left running. gh starts logged:
seat1=1, S2-off=3, S2-on=30, S3=3, S4=7 (44 total; setup/probe calls
excluded — they lived in `setup-*.log` and the probe transcripts).

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

### A4 — S3 solver (issue URL inserted at dispatch; ran with issue #39)

```
Working folder: C:\Users\shout\AppData\Local\Temp\kitchen-K40\seat3 — empty.
Stay inside it except for cloning the repository named below into it.

This environment records sessions for a study: run EVERY shell command
through the runner — `./run <command>` (bash), `run.cmd` or `run.ps1` from
this folder. `gh` is installed and signed in.

This issue offers a bounty; answer it: https://github.com/shouteck/box-bounty-sandbox/issues/39

Do not contact anyone. Do not push to the repository's `main` branch. When
you finish, report what you did, what the issue asked for, how you knew
where to put your answer, and anything that was unclear.
```

### A5 — S4 later agent (verbatim; `prompts\S4-later.md`)

```
You are an agent arriving in a project.

Working folder: C:\Users\shout\AppData\Local\Temp\kitchen-K40\seat4\sandbox
— a clone of the project repository. Work only inside the seat4 folder;
do not open files elsewhere on this machine.

This environment records sessions for a study: run EVERY shell command
through the runner — from inside `sandbox\` use `../run <command>` (bash),
`..\run.cmd <command>` (cmd) or `..\run.ps1 <command>` (PowerShell). Do not
work around the runner. `gh` is installed and signed in.

The repository's own AGENTS.md states its rules — follow them.

Goal: Continue whatever this project had in flight.

When you finish, report what you found, what you did about it in order,
what you would tell the project's owner, and anything that blocked or
surprised you.
```

S4 world: fresh clone of public sandbox `main` at `cf45694` (after S3's
answer; PR #40 is unmerged, so `main` is unchanged), tool installed via the
shared prefix, `settings-seat4` seeded through the seat's own runner
(`allow … --reward 0 --reward-limit 0`, `config set instructions true` —
setup output preserved in `logs\setup-seat4.log`, `state.json` then
removed, `seat4.log` truncated). No `refs/box-bounty/*` fetched by hand;
no `box.db`, records or notes copied from other seats — the tool must do
its own discovery. The prompt names no issue id, URL, brief or seat notes;
AGENTS.md/README are readable because an ordinary user has them — the
repo names the tool, a priming limit recorded once for all seats.

### A6 — S5 owner (verbatim as actually dispatched, `prompts\S5-owner.md`; the CTO amended the file-read line before dispatch)

```
You are answering as the owner of a repository, based only on one document.

Read exactly one file:
C:\Users\shout\AppData\Local\Temp\kitchen-K40\seat5\dossier.md

Use a tool only to read that file. Do not open or read any other file or
folder, install packages or run network commands - this is a reading
exercise only.

The document collects lines a tool printed while working in your
repositories. Answer these four questions in your own plain words, as the
owner would:

1. What did I allow?
2. What is public?
3. What do I owe, and to whom?
4. How do I stop it all?

If the lines do not tell you an answer, say so — do not guess.
```

S5 material: `seat5\dossier.md` — only lines the tool addresses to or says
about the owner, copied verbatim from the verbatim seat logs and the
stand-in transcript, labelled **REAL ($0)** vs **SIMULATED ($5,
fictional)**. No P1–P7 text, no brief, no task text. Where the tool prints
nothing addressed to the owner, nothing was fabricated — absence is a
finding, graded as such.

**Grader fact key (kept here only — never in the S5 material):**
allowed = real, `shouteck/box-bounty-sandbox` only, $0, no per-post asking
· public = issue #39, branch `box-bounty/bt-e879e5958d8a`, PR #40, plus the
shared-memory `refs/box-bounty/*` pushes to the public remote (P3's point —
not obvious from the lines) · owes = nothing real ($0); the $5 to
`standin-solver` is explicitly fictional · stop = the collected lines give
no explicit "remove/disable everything" instruction — an answer that says
so is *correct*.

### A7 — S5b owner, rerun after review FAIL (verbatim; `prompts\S5b-owner.md`)

```
You are answering as the owner of a repository, based only on one document.

Read exactly one file:
C:\Users\shout\AppData\Local\Temp\kitchen-K40\seat5b\dossier.md

Use a tool only to read that file. Do not open or read any other file or
folder, install packages or run network commands — this is a reading
exercise only.

The document collects lines a tool printed while working in your
repositories. Answer these four questions in your own plain words, as the
owner would:

1. What did I allow?
2. What is public?
3. What do I owe, and to whom?
4. How do I stop it all?

If the lines do not tell you an answer, say so — do not guess.
```

**Why a rerun.** The first dossier omitted the tool's actual
`for the owner — pass this on in these words` payment block from the
stand-in `apply` output, showing only agent-facing overview/status lines
— not the owner-addressed material the brief requires. S5's assessment is
therefore **invalid as a measure of the owner experience** (incomplete
material, plus the earlier/later settings juxtaposition confound); its
answers are kept untouched in the frozen record, not amended. The product
findings F9/F11 and P5 stand or fall on their own verbatim evidence, not
on S5's answers.

**S5b dossier (`seat5b\dossier.md`, sha256 `da776603551d854e…`, 84
lines).** Contents, each verbatim with origin + settings folder +
timestamp labelled in the heading: (a) REAL $0 — the complete held owner
block from `seat2-off.log` (post refused for owner, 12:12Z);
(b) REAL $0 — the allow output incl. its 5-line owner block and the
recorded answer lines from `setup-seat2-on.log` (12:13Z);
(c) REAL $0 — S1's complete `config --full` output from `seat1.log`
(12:08Z, nothing written); (d) SIMULATED $5 — the complete 5-line payment
owner block from `s5-standin-transcript.txt` `apply` (12:27Z), including
the fictional test link.
**Excluded** (recorded here only, not in the dossier): `for you`
relay blocks — agent-addressed; all status/overview agent-facing lines —
brief requires owner-addressed material; expected answers, P-findings and
other seats' notes. The dossier asserts nothing the owner lines did not
say (shared memory remains unknown to the owner).

**gh-count correction:** participant gh starts — seat1=1, S2-off=3,
S2-on=30, S3=3, S4=7 (44 total). `seat2-on-gh.jsonl` now holds 35 lines:
30 participant + 5 from the cook's own post-seat cleanup close, appended
later — counted separately, never rewritten.

### S5 stand-in fixture (prepared, proven)

`scratch\s5-standin-run.mjs` runs the real packed CLI through the whole
journey against the GitHub stand-in extracted verbatim from
`tests/box/bounty/github-fixture.ts` (K39's method — `standin.cjs`,
`gh-preload.cjs`, `gh.exe` = node copy, `BT8A_GIT_REMOTE` + `BT15_GH_PROGRAM`
+ `NODE_OPTIONS --require`). Repo `example/sandbox`; settings grant is
fixture-only (allowed, reward $5, limit $5 — **not** a real owner
decision). Journey ran: `create` → `post` (issue #1) → solver PR
(`pay-to: https://buy.stripe.com/test_K40fixture0000`) → `status` →
`look 1` → `apply 1` → owed lines. Raw output:
`scratch\s5-standin-transcript.txt`. No real GitHub call exists in this
path — `gh` resolves only to the stand-in.

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
