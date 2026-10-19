# K31 — the tool in real use, measured against the roadmap's questions

Real-use run on `shouteck/box-bounty-sandbox`, 19 October 2026, owner's go
given that day ($0 public posts allowed on the sandbox only). Built,
packed and globally installed `box-bounty-0.1.0.tgz` into a scratch
prefix; agents used only that installed `box`. Seven fresh agents ran
(five posting, one continuation on machine A, one later agent on
machine B). No solver agents were ever dispatched.

Host and conditions: Windows 16 GB, git-bash; normal broadband; no unusual
load observed. Every duration below is transcript- or Git-derived and
labelled as such.

## Headline

**0 of 5 tasks entered the bounty loop.** Every posting agent read the
task, judged it small enough to do directly, and did so. The full loop —
create → post → track → review → decide → pay — never ran, so there are no
stage timings on real GitHub to report; per the brief's alternative, this
report says exactly where and why.

The reason is not confusion or failure: it is the tool's own advice,
quoted back by the agents. `box bounty describe` prints
"not worth it when: you can plainly do the work — a bounty has a cost and
an answer takes time." Two of the five posting agents cite that line
verbatim as their reason for declining:

- post-t2: "**No bounty.** The tool's own describe output says it's not
  worth it for work you can plainly do; this was a small flag on a 9-line
  script."
- post-t5: "No bounty used: nothing was unsolved — the work existed and
  only needed verifying and committing."

The other three declined without consulting the tool at all:

- post-t1: "Did not use `box bounty`: a one-line doc fix does not justify
  handing work to an outside solver."
- post-t4: "Did the refactor directly rather than via `box bounty` — the
  change is a ~10-line extraction; delegating it would cost far more than
  the work itself, and this is a sandbox repo."
- post-t3: "`box bounty` was not needed for a one-file doc edit."

For G9 ("unknown how often agents hand work off"), the first real
measurement is: **on five genuinely small tasks, a fresh agent handed off
zero times** — and when it consulted the tool first, the tool talked it
out of it. Whether agents hand off *appropriately-sized* work remains
unmeasured: no task in this batch crossed the tool's "worth it"
threshold.

## What each task became

| task | posting agent | handed off? | outcome |
|---|---|---|---|
| T1 failing test | post-t1 | no | fixed `docs/inventory.md` six→seven in the working tree, did not commit |
| T2 `--list` flag | post-t2 | no | implemented + committed `a33c175` (count.js only) |
| T3 README docs | post-t3 | no | edited README (+15 lines), left uncommitted |
| T4 refactor | post-t4 | no | wrote `src/fruit.js` + rewrote `count.js`, left uncommitted |
| T5 unclear task | post-t5 | no | interpreted "the pantry list needs attention" as finishing the pending work: committed `cd62d1a` bundling T1's fix, T3's README and T4's refactor, then **pushed to origin/main** |

T5's behaviour is a real-use event worth noting: the deliberately unclear
task resolved to "tidy the working tree", and the agent committed and
pushed four tasks' worth of other agents' uncommitted work in one commit —
the right end state, by a route nobody specified. The sandbox's
"everything is disposable" rules made the push safe; in a real repository
an agent pushing a bundle to main is exactly what a bounty would have
avoided.

## Actor questions — answered right, partly, or wrong

Scored against the moments/questions in `docs/box-v4/MEMORY-SPEC.md`
(PLAN.md's memory foundation). Questions whose moments never occurred are
marked "not exercised".

| question (moment) | verdict | evidence |
|---|---|---|
| Is this work already handed off / what became of it? (M2) | **partly** | post-t2 read `.box/` records and found "one closed test bounty (bt-212eb1764bf7), no open bounties" — checked before working. post-t5 read `.box/bounties/bt-*.json` and ran `./box bounty`. post-t1, post-t3, post-t4 never checked `.box` or the tool before editing; the right answer (nothing handed off) held by luck, not by looking. |
| Should I hand this off? (the G9 question) | **right** | post-t2 and post-t5 quote `describe`'s "not worth it" line and decline; decisions match the tool's stated guidance. |
| What is outstanding, since when, anyone working? (M5) | **right** | cont-a: "Bounties still waiting: none. `.box/bounties/OPEN` reads 'open bounties: none'; the only record … is fully applied and closed — issue #1 closed, PR #2 merged at 866a0f9… GitHub shows zero open issues and zero open PRs." Verified: `gh issue list --state open` = 0, `gh pr list --state open` = 0 at report time. |
| Was anyone owed payment? (M8) | **right** | cont-a: "Anyone owed payment: no. Every bounty here states a $0 reward; the sandbox README and AGENTS.md say nothing is paid, and `box bounty describe` confirms no payment exists." |
| Resuming the larger work (M9) | **right** | cont-a: "two commits landed on main: a33c175 (count.js --list flag) and cd62d1a… I verified: `node --test` passes 1/1… working tree clean, main synced with origin." Verified independently (this report). |
| Later agent on another machine finds the shared memory (G8/M9/M11) | **right** | work-b, fresh clone + fresh settings: fast-forwarded 15cdfd1→cd62d1a, ran `./box bounty describe/help/status`, "sees the closed K15 bounty, reports 'no open bounties'". `settings-b/state.json` shows `chains[machine-b].fetchedAt` — the BT32 chain fetch ran transparently. The tool also created `.box/local/box.db` with its own `.gitignore` (`*`); tree stayed clean. Caveat: work-b also read the **committed** `.box/bounties/*.json` files — the K15-era design still sitting in the repo — and the tool warned about it (below). |
| Solver reading a bounty (M13), review (M6), decide (M7), paying flow (M8 exercised), create/post/track (M3–M5) | **not exercised** | nothing was posted. |

The age and paid questions (brief step 5) were asked of the continuing
agent and answered correctly as quoted above. **BT35 (age) and BT36
(paid) had both landed** in the installed build, but with zero open
bounties the answers exercised the questions only trivially — "none
waiting" and "no reward ever above $0" required neither feature's code
path to emit an age or a payment record.

## Stage timings on real GitHub

| stage | wall time |
|---|---|
| create / post / solver PR appearing / review / merge / close | **never ran** — no bounty was posted |
| posting agent, per task (task→done, direct work) | 15 s (T1), ~52 s (T2), ~1–2 min (T3), ~2 min (T4), ~3 min (T5) — transcript clocks, UTC-normalised in timings.md |
| cont-a (later session, machine A) | ~4 min |
| work-b (second machine, cold) | ~3 min |
| push `cd62d1a` landing on origin/main | committer stamp 05:46:55 UTC |

## gh starts per command / agent

Counted by the logging `gh` shim (one JSON line per process start) where
the agent's environment held; transcript-derived where it did not —
flagged per the prepared fallback rule.

| agent | logged starts | transcript-derived starts | flag |
|---|---|---|---|
| post-t1 | 0 | 0 | the one line in `post-t1.jsonl` (05:40:53) is the cook's pre-dispatch smoke test, not the agent's — contamination, excluded |
| post-t2 | 0 | 0 | `./box bounty describe` ran; no gh spawned (also no `unknown.jsonl` fallback) |
| post-t3 | 0 | 0 | — |
| post-t4 | 0 | 0 | — |
| post-t5 | 0 | 0 | `git push` is git, not gh |
| cont-a | 0 | **4** | `gh issue list --state all`, `gh pr list --state all`, `gh issue list --state open`, `gh pr list --state open` — env lost between tool calls, unlogged |
| work-b | **2** | **3** | its own report: "the sourced environment … did NOT persist. My three gh calls at step 15 ran the real gh unlogged" — `issue list --state all`, `pr list --state all`, `api …/branches`; the 2 logged lines (05:49:16–17) came after re-sourcing in one shell |
| tool-internal gh calls by `box` | 0 | — | `status`, `describe`, `help` spawned no gh processes at all (no fallback `unknown.jsonl` was ever created); chain fetch goes over git, not gh |

**Measurement caveat (material):** on this host each agent tool call runs
in a fresh shell, so `source activate-*.sh` does not persist across calls.
Only calls made in the same invocation as the `source` are counted. The
counts above are a floor for agents that used gh at all; the
transcript-derived numbers are complete because every transcript lists
commands verbatim, but the logged-vs-derived split is a harness artifact,
not agent behaviour.

## What agents saw unasked (sizes)

- `.box/bounties/OPEN` — 21 bytes, one line: `open bounties: none`.
- `box bounty status` (no open bounties) — 8 lines incl. the ended-bounty
  summary and a "next:" line.
- `box bounty describe` — 27 lines incl. cost/wait/owner facts.
- Committed record `.box/bounties/bt-212eb1764bf7.json` — 8,655 bytes on
  disk; the tool flags it as tracked (below).
- On machine-b, first `box` run created `.box/local/` (own `.gitignore`
  `*`, 48 kB `box.db`) — invisible to `git status`.

## Errors, refusals, confusing lines — verbatim

1. post-t3: "One `git diff --stat` invocation returned 'Not a git
   repository' (exit 129); re-running from an explicit `cd` worked." —
   harness cwd quirk, not the tool.
2. post-t5 / cont-a / post-t3 (same root cause, three reports): "the
   activate script does not cd into machine-a; the initial cwd is the main
   project" — harness setup line, flagged by three agents independently.
3. Tool warning, seen by post-t5, cont-a and work-b, verbatim from a
   cook re-run: "records: 2 file(s) in .box/bounties/ are tracked in Git —
   bounty records hold owner-only context (why, saved job, local path,
   scan findings) that pushing to a public remote publishes; untrack with
   git rm --cached -r .box/bounties" — correct per the current design;
   here it fires on deliberately-committed K15-era fixture records on
   every `status`/`describe`-adjacent run.
4. post-t1 on the stale task file: "`tasks/inventory-count.md` describes
   the stale state as 'says five, script reports six' — but the actual
   repo had drifted further: note said six, script prints seven." post-t4
   and post-t5 flagged the same file as leftover history.
5. work-b: env persistence failure quoted above — the only measurement
   defect; agent self-flagged correctly per the fallback rule.
6. post-t5: "Git warned LF→CRLF on `src/fruit.js`" — cosmetic.
7. post-t2: "One exec output was truncated by the harness (`tail` parse),
   so I re-ran the checks with explicit redirection" — host harness, not
   the tool.

## Fixes real use shows are needed

Only what the transcripts show; nothing speculative.

1. **Product — the tracked-records warning has no "deliberate" state.**
   A repository that ever committed `.box/bounties/` gets a permanent
   warning on every status run (quoted in §errors.3). In the sandbox the
   records are committed on purpose; the tool cannot tell. Either a way to
   mark the tracking deliberate, or accept the noise — real use shows the
   warning as it stands is cried-wolf on fixtures.
2. **Product — stale `tasks/*.md` briefs mislead later agents.** Three of
   five posting agents tripped on `tasks/inventory-count.md` describing a
   completed drill (quotes in §errors.4). Whatever wrote task files there
   left them indistinguishable from live work. A completed-task marker or
   cleanup step would have saved all three a wrong detour.
3. **Wave design — the task set sat below the tool's threshold.** Five
   "genuine small tasks" produced five rational declines; the loop can
   only be exercised by work that is not plainly doable (outside
   knowledge, access, or size). The next real-use wave needs tasks chosen
   to fail `describe`'s "worth it" test, or the hand-off rate will keep
   measuring zero.
4. **Harness — environment delivery cannot rely on `source` persisting.**
   On this host it held only within single tool calls; gh counting needs a
   mechanism that survives fresh shells (e.g., PATH baked into the world
   itself, or per-command env) — and activate scripts should `cd` into the
   machine dir, as three agents independently noted.
5. **Harness — agent clock discipline.** Transcripts arrived in MPST,
   +0800 and UTC; UTC-normalisation was manual. Have agents report
   `date -u` once (post-t1 did; the others approximated).
6. **Not a fix — confirmed working:** `.box/local/` self-ignores; chain
   fetch ran on both machines unasked on `status`; scratch settings were
   the only settings touched (owner's real `%APPDATA%\box` never read or
   written — the only writer path is the `box` wrapper, which bakes the
   scratch dir); nothing was posted anywhere but the sandbox (in fact,
   nothing was posted at all); `describe`'s guidance is read and obeyed.

## Sandbox state, before and after

| | before | after |
|---|---|---|
| open issues | 0 | 0 |
| open PRs | 0 | 0 |
| branches on origin | main + `fix/bt-212eb1764bf7-stale-fruit-count` + `fix/inventory-fruit-count` (both pre-K31 leftovers) | identical — this wave added none |
| origin/main | `15cdfd1` (K31 setup commit) | `cd62d1a` (agent commits `a33c175` + `cd62d1a` pushed by post-t5) |

Cleanup owed at close: delete `%TEMP%\box-k31` entirely (prefix, settings,
clones, shims, env, solver dirs; gh-logs already copied into
`kitchen/memory/real-use/gh-logs/` before deletion — see below). No bounty
branches, issues or PRs exist to close — none were ever created.
