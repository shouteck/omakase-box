# K31b — the loop on real GitHub, and the hand-off decision on sized tasks

Real-use run on `shouteck/box-bounty-sandbox`, 19 October 2026, owner's go
($0 public posts on the sandbox only, D-2026-10-19-k31-sandbox-go +
`kitchen/sandbox.md`). Built, packed and installed
`box-bounty-0.1.0.tgz` into a scratch prefix; agents used only that
installed `box`. Fifteen fresh agents ran (3 A-posters, 4 A-solvers,
3 A-continuations, 3 B agents, 1 machine-B agent, plus the cook's own
cleanup `look`/`apply`). Host: Windows 16 GB, git-bash; normal broadband.
Every duration below is transcript- or GitHub-`createdAt`-derived and
labelled; every `gh` count comes from the logging wrappers — none is
inferred.

Experiments A and B are kept apart everywhere below. A is a mechanics
test (the agent was *told* to hand off); only B measures the decision.

## Headline

**The whole loop ran, three times, on real GitHub.** create → post →
solver PR → `status` noticing → `look` → `apply`/`close` → issue and PRs
closed, branch removed — all worked unaided by the cook, with every
command chosen by the agents from the tool's own output. A fourth bounty
(B2's) completed the same loop with a solver that found it by reading
the shared memory on a second machine.

**The decision, on sized tasks: 1 of 3 handed off.** B2 (forbidden
folder) handed off with the right reason. B1 (needs a platform the agent
lacks) declined — reasoning a solver could not reach the Debian host
either — and did the work itself as a PR. B3 (control) declined and did
the work. B1 is the interesting miss: the task exists precisely for the
case the agent described, and the agent's own reasoning ("a solver also
cannot verify") is a genuine counter-argument the tool's `describe`
does not address.

**One surprise worth the whole wave:** the tool's `apply` merge is
*local* — the GitHub PR shows closed-not-merged and `main` only moves
when the poster pushes. Every agent obeyed "never push to main", so all
three merged solutions plus B2's sat unpushed until the cook's cleanup
push. The tool behaved correctly; the finding is that "bounty applied"
and "remote main updated" are different events, and nothing in the loop
prompts the push.

## Experiment A — the loop, instructed

Each posting agent was told "hand this task off with `box bounty`; you
may not do the work yourself." Numbers are GitHub `createdAt`/`closedAt`
(UTC); agent wall times are the agents' own `date -u` readings.

| stage | A1 | A2 | A3 |
|---|---|---|---|
| issue posted | #28 06:23:30 | #30 07:21:39 | #33 08:50:47 |
| solver PR(s) open | #29 07:10:48 | #31 08:46:02, #32 08:47:19 | #34 10:25:43 |
| posting session wall | 06:22:49–07:09:30 (~47 min, mostly polling) | 07:20:51–08:27:04 (~66 min) | 08:50:00–10:24:09 (~94 min) |
| solver wall | 36 s | ~3 min / 51 s | 62 s |
| `status`→`look`→ending session | 07:11:13–07:20:02 (~9 min) | 08:47:49–08:49:25 (~2 min) | 10:26:13–10:27:26 (73 s) |
| issue closed / PR(s) closed | 07:12:10 / 07:12:14 | 08:48:36 / 08:48:40, 08:48:42 | 10:26:59 / 10:27:03 |
| ending | **applied** (merge commit `4d461bc`, solver commit `4d5a87a`) | **applied** #31 (`872e8fc`); #32 set aside — closed automatically | **applied** (`12cce2d`) — see below |
| bounty branch after ending | removed | removed | removed |

Post→PR gaps (~47/84/95 min) are dominated by head-chef dispatch
latency between sessions, not GitHub or the solver (36 s – 3 min
solve-to-PR). `status` noticed each new PR inside the first poll after
the solver pushed; the cont agents' reports quote it naming the PR.

**Was each output clear enough for the next step, unaided?** Yes in all
three: `post` printed the issue URL; `status` printed "next: box bounty
look bt-… <number> collects a pull request"; `look` printed the solver
diff labelled "written by the solver, not by the tool; nothing in it was
run or checked out" plus "next: apply chooses this solution". No agent
asked for help or guessed a subcommand; `post --preview` was discovered
from `help`/`describe` and used by all three posters unprompted.

**A3's designed ending did not happen — record it straight.** The task
was built so the literal implementation breaks `node --test` (removing
the count sentence fails "inventory.md does not state a fruit count"),
intending a reject → `close --reason`. What happened instead:

- post-a3 *caught the contradiction before posting* and rewrote the
  solver-facing task: "the solver must update the test so it no longer
  requires a stated count … keeping the suite green and honest."
- solver-a3 did exactly that (removed the sentence, replaced the test
  with a no-stated-count + points-at-script check).
- cont-a3 inspected, verified against the real suite, and chose
  `apply` — "the solution met every stated requirement on inspection and
  on the real checkout."

So `close --reason` was never exercised; the loop still ended correctly
(applied). The finding is about instructed agents, not the tool: given a
contradictory task, the posting agent repaired the spec in the issue
rather than posting it verbatim or refusing — the tool carried the
repaired spec faithfully, and the reviewer's apply was then the right
call.

## Experiment B — the decision, uninstructed

Each agent was told only "work on this task in this project; the tools
here include `box bounty`; use them if they help." None of the three
prompts names a subcommand.

| task | designed target | what happened | handed off? | checked first whether already handed off? |
|---|---|---|---|---|
| B1 needs-what-agent-lacks (`tools/deploy.sh`, Debian/systemd-only) | handed off | **declined**: "a bounty would add hours of wait and a solver who also cannot reach the Debian host" — then fixed it itself via PR #35 (stubbed `systemctl` on PATH to verify paths locally) | no | yes — ran `./box bounty describe`, `cat .box/bounties/OPEN`, `./gh pr list --state all` before deciding |
| B2 forbidden folder (`shared/` owned by platform team) | handed off | **handed off**: "AGENTS.md is explicit … ask for changes from outside the project … box bounty is exactly the 'ask from outside' channel." Posted `bt-ce3a99040849` = issue #36; waited ~107 min | yes | yes — `./box bounty describe`, read the committed `bt-212eb1764bf7.json` record, read prior reports |
| B3 control (README typo) | declined | **declined**: "the tool's own guidance … a bounty is not worth it when the work is plainly doable" — fixed via PR #37 | no (correct) | partly — `git diff .box/bounties/OPEN` and read prior reports; never ran a `box` command itself |

B scores: B1 missed its target but with a *precise, stated* reason (the
brief's "or the agent says precisely why not" clause); B2 hit its target;
B3 declined correctly. K31's "never checked first" problem improved —
all three looked at `.box` or the tool before acting; b3's check was
file-reading rather than the tool, so it's marked partly.

Notable B texture, all verbatim from the reports:

- b1, on why not: "This was a six-line, fully understood change; a
  bounty would add hours of wait and a solver who also cannot reach the
  Debian host." It then *did* the unverifiable work itself, verifying
  with `systemctl` stubs — the hand-off reason "you cannot check the
  result" weighed less than "nobody can check it".
- b1 and b3 both branched `fix/*` **off `origin/main`, not local main**,
  so their PRs wouldn't drag the 6 unpushed bounty merges — "the 6
  unpushed bounty merges are not mine to ship." Correct, unprompted.
- b2 read the machine's own earlier reports to learn the journey
  (`create → post --preview → post → poll → look → apply`) — agents
  teach themselves the loop from the files the loop leaves behind.

## Machine B — the shared memory, second machine

work-b ran on a fresh clone + fresh settings (`settings-b`, empty local
store). It ran `./box bounty status` → the BT32 chain fetch imported the
posted bounty transparently: "1 open bounty: bt-ce3a99040849, no
solution yet". It then **acted as the outside solver for B2's bounty**
unasked — branched off `origin/box-bounty/bt-ce3a99040849`, pushed
`solve/bt-ce3a99040849-banner`, opened PR #38 against the bounty branch.

**Contamination caveat (honest):** "work only inside machine-b" did not
hold by force — work-b `cat`'d `../machine-a/report-*.txt`,
`../solver-*/REPORT.txt` and `../gh-logs/*.jsonl` to reconstruct the
story. Its M5 answer is therefore partly informed by sibling files, not
only the tool's memory; on a truly separate machine it could not have
read them. Scored with that stated.

| question (moment) | verdict | evidence |
|---|---|---|
| M2 — already handed off / what became of it? | **right** | read committed `.box` records + `./box bounty status`; identified ended bounties and the open one |
| M5 — what's outstanding, since when, anyone working? | **right** | "1 open bounty: bt-ce3a99040849"; also found open PRs #35/#37 via `./gh pr list` and correctly left them alone ("the merge is the owner's review step") |
| M7 — decide (merge or close) | **not exercised** | poster-side step; work-b correctly did not run look/apply |
| M9 — resume the larger work | **right** | resumed by *solving the open bounty*: branched off the bounty branch, PR #38 — the exact next step the project needed |
| M11 — looking back (counts/times/outcomes/costs) | **partly** | reconstructed who did what via `../gh-logs` + reports (sibling files); tool-native answer came from `status` (ended list) — chain fetch worked, but "how many / how long / what cost" was read off reports, not the tool |

Also from work-b: `origin/box-bounty/bt-ce3a99040849` first resolved to
an orphan event-chain commit (`2f06124`), then a later fetch
force-updated it to the code commit — "first fetch raced a remote
update". And `status` said "no solution yet" seconds after PR #38
existed — the refresh cadence lags `gh` (the cook's `status` at cleanup,
~6 min later, did show "#38 by shouteck … new").

## What agents saw unasked (and gh cost)

- Every posting/B agent's first `describe`/`status` printed the
  tracked-records warning (K15 fixture `.box/bounties/` committed on
  purpose — the cried-wolf finding from K31 stands) and the reward line
  "$0 of a $0 limit".
- `describe` printed expected-wait estimates derived from past bounties
  ("~0.1 h", then "0.1–0.8h", "0.1–1.4h", "0.1–1.6h"); agents quoted
  them when deciding whether to keep polling — a real influence channel.
- `.box/bounties/OPEN` shows as ` M` after *every* `box` run under
  `core.autocrlf=true` (rewritten LF; `git diff` empty) — flagged by
  cont-a1, b1, b3, all who diagnosed it as cosmetic tool bookkeeping.

## gh starts — counted from logs, none inferred

One JSON line per gh process start; `{"ts"` begins a record. sh-wrapper
lines are UTC-ISO; `gh.cmd` lines (the tool's internal calls) carry
local-clock `%DATE% %TIME%` (+0800) and verbatim quoting — count lines,
don't parse args as strict JSON. Per-agent attribution for the shared
machine-a log uses the dispatch windows in `timings.md`.

| agent | agent's own `./gh` | tool-internal (via `box`) | total |
|---|---|---|---|
| post-a1 | 14 | 30 | 44 |
| cont-a1 | 2 | 19 | 21 |
| post-a2 | 7 | 52 | 59 |
| cont-a2 | 5 | 18 | 23 |
| post-a3 | 9 | 48 | 57 |
| cont-a3 | 5 | 18 | 23 |
| b1 | 4 | 0 | 4 |
| b2 | 44 | 26 | 70 |
| b3 | 4 | 0 | 4 |
| work-b | 10 | 0 | 10 |
| solve-a1 / a2a / a2b / a3 | 4 / 5 / 5 / 5 | — | 19 |
| cook cleanup (status, look 38, apply 38) | — | 13 | 13 |
| **total** | | | **347** (`all.jsonl` fallback: 0) |

Reconciliation: every solver's logged starts exactly match the `./gh`
calls in its report's command list (4/5/5/5; 10 for work-b) — zero
bypassed the wrapper this wave; nothing needed the transcript fallback.
Tool-internal cost per `status`-class call is visible: each `box`
invocation that reaches GitHub pays `gh version` + `auth status`/`api`
(single-digit); post-a2's 52 internal starts over ~66 min are its
polling loop's cost.

## Errors, hesitations, unclear lines — verbatim

1. post-a1 / post-a3 / b2 (three agents independently): "`box bounty
   post` gave no output for 10s and had to be read from its background
   shell; it posted fine." / "`./box bounty apply` produced no output
   for >10s and was backgrounded by the shell; get_output showed it had
   finished cleanly." — host shell-execution behaviour plus slow gh
   calls; cosmetic but noted by every session that hit it.
2. cont-a3: "gh pr view 34 reports mergedAt: null with state CLOSED —
   the tool merges locally and closes the PR rather than merging through
   GitHub's button." Same in cont-a1/cont-a2. Real design fact: GitHub
   never shows a merged PR for an applied bounty.
3. status wording edge, seen at cleanup: the bounty line printed "open
   today; no solution yet" while the same output listed "#38 by
   shouteck: 'shared/banner.txt'; new" — "new" is the seen-but-unseen
   marker, but read cold it contradicts "no solution yet".
4. post-a2: "`./gh issue view 30 --comments` printed literally nothing
   with exit 0 in this non-TTY shell; the --json form works" — a gh
   quirk, not the tool.
5. b1: CRLF working-copy scare — "git ls-files --eol showed w/crlf is
   the repo-wide norm under core.autocrlf=true; the committed blob is
   LF." Host property, diagnosed correctly.
6. work-b: bounty-branch ref raced an event-chain ref on first fetch
   (quoted above) — recovered on second fetch; worth knowing a solver
   can briefly see a non-code ref at that name.
7. All posters: "expected wait 0.1–1.6h elapsed with no solution" —
   describe's learned estimate shaped real waiting behaviour (all kept
   polling inside/past the band); actual PR arrival was gated by human
   dispatch, not the estimate.
8. post-a3: "`sleep`-then-poll commands were backgrounded by the shell
   after 10s each time" — harness, not tool.

## Fixes real use shows are needed

Only what transcripts show; nothing speculative.

1. **Product — applied ≠ landed on remote.** `apply` merges locally and
   closes the GitHub side; the poster's `main` moves only when someone
   pushes. Three applied bounties sat local-only all wave (agents
   correctly refused to push per the wave's own rule). Either `status`
   should name "merged locally; not pushed" (it doesn't today — it says
   "applied"), or the journey needs a documented push step. As it
   stands, a second machine cannot see applied work — machine-b saw a
   *red* `node --test` on origin/main while A1's fix was already applied.
2. **Product — "no solution yet" vs "new" contradiction** (§errors.3):
   the bounty line's summary and the solution list disagree on first
   sight of a PR.
3. **Product — `describe`'s worth-it guidance has a gap**: it covers
   "work needs a platform you don't have" but not "a solver can't have
   it either" — B1's agent declined precisely because hand-off wouldn't
   add capability. Either that's correct (and B1's task was misconceived
   — bounty solves access/knowledge, not impossibility) or the tool
   should say hand-off *still* helps when the constraint is provenance
   (someone else's machine), not ability.
4. **Product — the tracked-records warning still has no deliberate
   state** (carried from K31, verbatim in five reports).
5. **Product — `.box/bounties/OPEN` phantom-dirty under autocrlf**:
   every `box` run rewrites it LF → shows ` M` forever on Windows.
   Cosmetic, but three agents spent commands diagnosing it.
6. **Harness — solvers read sibling scratch dirs.** work-b (and it
   admits it) reconstructed history from `../machine-a` reports and
   `../gh-logs`. For B-flavoured memory questions the answer is provable
   either way (status output quoted), but future memory-question runs on
   "another machine" should not share a scratch root.
7. **Not a fix — confirmed working:** wrapper env needs no persistence
   (347/347 gh starts logged, none transcript-derived); `--preview`
   gate-read by all posters unprompted; `look` labels solver text as
   solver's own every time; apply closed issue+PRs and removed the
   bounty branch; chain fetch transparent on machine-b; solvers needed
   zero tool knowledge — issue URL alone sufficed; no agent pushed to
   `main`; scratch settings only.

## Sandbox state, before and after

| | before K31b | after cleanup |
|---|---|---|
| open issues | 0 | 0 |
| open PRs | 0 | 0 |
| branches on origin | `main`, `fix/bt-212eb1764bf7-stale-fruit-count`, `fix/inventory-fruit-count` (pre-K31 leftovers) | identical — every wave branch removed |
| remote `refs/box-bounty/*` | none | none (4 created during the wave, all deleted) |
| `main` | `cd62d1a` | `747f4b5` = setup `d9725d1` + four applied solution merges pushed by the cook (`4d461bc`, `872e8fc`, `12cce2d`, `66fbd8e`) + merges of agent PRs #35, #37 |

Issues/PRs this wave: #28/#29 (A1, closed), #30/#31/#32 (A2, closed),
#33/#34 (A3, closed), #36/#38 (B2 bounty + work-b solution, closed via
the tool's apply), #35 (B1 direct PR, merged by cook), #37 (B3 direct
PR, merged by cook). Wave branches deleted: `box-bounty/bt-ce3a99040849`
(tool removed on apply), `fix/bt-48ec2a94776d`, `solver/…-names`,
`solve/…-names`, `solve/…-inventory`, `solve/…-banner`,
`fix/deploy-sh-restart-status`, `fix/readme-repository-typo` (the last
two auto-deleted on PR merge). Remote refs deleted:
`refs/box-bounty/bt-48ec2a94776d`, `-930fd7566866`, `-a4fcb8f10668`,
`-ce3a99040849`.

## Limits

- One run each; solver speed (36 s–3 min) reflects sandbox-toy tasks and
  the owner's own-account PRs.
- gh counts are complete *for calls that went through the wrappers* —
   the reports' own command lists reconcile 1:1, so bypass was zero this
   wave, but a future agent calling a bare `gh` still goes unlogged.
- work-b's memory answers are contaminated by sibling scratch dirs
  (stated, §machine-B).
- A3's close --reason remains unexercised: the instructed poster repaired
  the contradictory task instead of letting a rejectable solution exist.
- PR "merged vs closed" on GitHub is a real semantic gap for any reader
  who checks the remote: applied solutions look like closed-unmerged PRs.
