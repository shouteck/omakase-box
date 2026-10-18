# K33 review: the kitchen measured on its own record

Cook: fresh agent on the Devin host (Subagent Default profile; the exposed model identity is "Subagent Default" — no model name is exposed, so the model is **unavailable**, per the brief's identity rule). Written 19 October 2026, on `wave/K33` from kickoff `2b3eace`.

All numbers below come from `kitchen/review-k33/measure.mjs` (committed; rerunnable from a clean checkout) over: `git log` **and the wave files themselves** pinned to base `2b3eace` (the script enumerates and reads `waves/*.md` via `git ls-tree`/`git show` on BASE — later edits to any wave file, including this one's own Result, do not move the numbers), with run/dir cutoff `2026-10-18T19:29:02Z`; `.kitchen/runs/` (local-only, gitignored — 595 run directories, 575 with `summary.json`, 20 incomplete); and `kitchen/review-k33/gh-runs-snapshot.json` (`gh run list -R shouteck/omakase-box --limit 200 --json`, taken 19 October 2026). **Deliberately current (unpinned) inputs:** the §4 rulebook reading sizes and contradiction quotes are measured on the live rulebook as a cook reads it today, and say so where used. Time terms: **elapsed** = documentary first-commit→merge calendar time and *includes owner waits and idle gaps without separating them*; **verify-seconds** = the sum of `summary.json.seconds` — recorded wall-clock durations of verify invocations, not CPU time and not agent session time. No record exists of how long an agent actually worked.

## 1. One page for the owner

**How the kitchen has actually run (the record in five numbers):**

- **115 wave files, 93 merged waves** since 5 October 2026 (14 days) — about 6.6 merges/day.
- **575 completed verify runs totalling 159,236 s ≈ 44.2 h of recorded verify wall-clock duration.** Median ~3 runs and ~1,000 s per merged wave.
- **Median brief-first-commit → merge calendar span: 210 min** (merged waves). The long spans contain documented waits (owner approvals, dependencies, parks) — e.g. BT12 8,075 min and K15 7,374 min — but the records do not measure how much of any span was waiting vs. working; treat elapsed as an upper bound on effort, not a measurement of it.
- **~27 of 93 merged waves record at least one review FAIL verdict or correction round** (mechanical detector in `measure.mjs`, list in §3 — the regex is a counting rule, not proof each was a true defect; each listed wave's FAIL was confirmed against its Result text). Plus 11 separate `-ci` correction waves.
- **6 red hosted runs** followed a merge push since October (A4, BT16, BT17, BT7b-ci, BT8, K7-ci), each fixed by a follow-up wave; the 8 `cancelled` rows are pushes superseded by the next push — normal cadence, not failures.

**What the kitchen does well, with evidence:**

- The independent pass caught defects that had passed the suites: a forged-reward path to a public GitHub issue (BT11a), wrong-merge attribution no test exercised (BT7b), a stand-in leaking comments across issues (K22), JSON facts missing from `status` (BT19), a stale expected-wording test (BT36). These catches are documented in the wave Results; they show what the second agent found, not a measured counterfactual of what self-review would have missed.
- Lessons do get encoded: K22's 10,380 s of mostly timeout-only reruns became verify-reuse (K23); the wave-file-dirties-verify trap became K24; the 20 KB rulebook limit is a test, not prose.
- Incomplete runs are visible, not silently dropped: 20 run directories have no `summary.json` (a killed run leaves a dir, not a record claiming a run). That is exactly the gap P1 addresses — today nothing distinguishes "died" from "missing".

**The three changes that would help most:**

1. **Record the run record at start, not only at end** (incomplete-run problem; §5-P1). 20 dead run directories are pure missing evidence; a `started.json` written before the first step plus a finalizer would make every stall legible.
2. **Enforce the one-page rule on station cards** (§5-P2). The packaging card is 34.6 KB against a written "keep each card to one page" rule. Every cook and every pass pays that read on every packaging wave.
3. **Check brief facts before dispatch or owner review** (§5-P3, supported by P4). BT32 needed three brief rewrites and two parks; BT36's brief named a suite that does not exist (`test:box-package`), and the cook burned a full verify discovering it. A cheap brief-lint — suite names exist, decisions referenced exist — costs a head-chef minute, not an owner round-trip.

**What needs the owner's decision:** nothing in this wave changes anything — all ten items are proposals. Of the ten, only P8 (retire the two dead station cards and the never-exercised station-chef role) and P4 (a ledger recording the owner's own decisions, which the head chef would check briefs against) plausibly touch your "who decides what" list; the rest are head-chef calls. See §5.

## 2. Step 1 — the record, measured

Script output (per-wave table) is reproduced by `node kitchen/review-k33/measure.mjs`; the full table is ~115 rows. Headline columns are labelled missing where no record exists — e.g. BT33 (parked), K30/K31 (briefed, never cooked) show `missing` merge and zero runs, which are different facts.

**By kind (merged, elapsed minutes, top five):**

| Kind | n merged | Slowest |
|---|---|---|
| product (BT*) | 44 | BT12 8,075 · BT10 3,565 · BT9 3,501 · BT8 2,990 · BT36 1,609 |
| kitchen (K*) | 25 | K15 7,374 · K32 1,473 · K21 1,132 · K29 1,123 · K25 975 |
| correction (*-ci) | 11 | BT31-ci 77 · BT15-ci 45 · BT6b-ci 32 · K7-ci2 30 · BT32-ci 29 |
| other (A/D/R/fix) | 13 | D2.1-proto 247 · R3 164 · A2 106 |

**Where the elapsed time went — documentary inference, not a measured breakdown.** The record does not timestamp waiting vs. working; what it shows is that every wave with elapsed over ~1,500 min has an owner approval, a dependency, or a park in its Git history (e.g. BT12 was briefed 11 Oct and merged 17 Oct through milestone gating; K15's 7,374 min spans a park and a `-ci` follow-up five days later). That is consistent with waiting dominating the long tail, but it does not quantify the share — the records don't separate wait from work. Measured wall-clock duration exists only for verify (44.2 h summed). Corrections are cheap by elapsed time (median ~30 min) because they skip the approval loop.

**Verify wall-clock load.** 575 completed runs / 159,236 s summed duration. Waves with the heaviest verify footprints: K22 10,380 s over 15 runs (the stall that produced verify-reuse), BT23 5,571 s/8, BT7a 5,477 s/7, BT35 4,402 s/7, K29 3,163 s/24 (16 failing runs — a removal wave re-verifying at every checkpoint), BT17 2,769 s/4.

**Verify failures.** 124 of 575 completed runs are non-PASS. Of the wave-attributed failures, timeout-only failures cluster on this host: K22 had 7 of its 9 fails timeout-only, BT15 2 of 2, BT8b 2 of 2 — consistent with the evidence card's note that MsMpEng/agent load can double a suite's wall time. Attribution caveat: correction waves inherit their parent wave's run set where run SHAs sit on the shared merged side (e.g. BT31-ci shows the same 5 runs as BT31), so per-wave run counts for `-ci` rows overlap by construction.

**Red hosted runs after merge:** 6 failures (A4 budget overrun, BT16, BT17, BT7b-ci, BT8, K7-ci — causes per their wave Results) plus 8 `cancelled`, which are pushes superseded by the next push minutes later, i.e. normal close cadence, not defects. 43 merged waves have `no-run-found` in the 200-run snapshot window — earlier history is beyond the snapshot's reach, so this is labelled missing-coverage, not green.

**Brief rewrites after the owner saw a brief** (commit subjects matching rewrite/revise on the wave file): BT11 ×3, BT32 ×2 plus a parked→resumed→parked arc, BT8 ×2, BT19 ×2, A2 ×2, and single rewrites on 13 others. BT36 shows a different class: the brief's `Done when` named `test:box-package`, which does not exist — a factual defect in an unreviewed document.

**Host.** Stated in Results: devin 42 waves (31 PASS verdicts, 6 recorded FAIL verdicts), claude 37 (33 PASS, 3 FAIL), unstated 27, missing 9. FAIL-verdict rate is not meaningfully different by host (devin 14 %, claude 8 %, unstated 4 %) and confounded by era: early-October waves were both more Claude-cooked and more exploratory. **Do not read this as a host ranking** — brief style and task difficulty are not controlled.

**Brief style.** The detailed, attack-naming briefs (roughly BT18 onward, from 15 October) show fewer multi-round FAILs per wave than the early exploratory briefs (A2, BT5–BT7 era, K2a, K6/K7) — but era is also when the tool and suites matured, so this is an association, not a measured effect.

## 3. Step 2 — what the reviews caught

**Method and limits.** `measure.mjs` flags waves whose pinned Result records a review FAIL (regex on `Verdict:`/`Round N`/`first review|pass|round`/`reviewer FAIL` lines, excluding `verify <sha> FAIL` run-result lines and attack "Master: FAIL" probes). The detector is approximate: it flagged 32 waves and both over-counts (e.g. BT1, BT9, K1 flag on findings text, not verdicts) and misses (BT26 "Round 1 FAILed", BT36's "84cde07 FAILED" sit outside the patterns). **Hand-checking every flagged wave plus the misses against its Result gives 27 waves with at least one real review FAIL or correction round**, listed below. Class is assigned by the cook from the quoted finding; multi-finding waves take the dominant one — this is judgement, not a mechanical property.

| Wave | FAILs | Dominant class | Finding (from its Result) |
|---|---|---|---|
| A2 | 2 | correctness | stream-partition forgery; output-hash tail truncation |
| A4 | 1 | scope/budget | acceptance 364 s > 330 s gate |
| BT3 | 2 | security | `.boxignore` bypass; never-ship set in verify; then EISDIR crash |
| BT3b | 4 | correctness | submodule/symlink/junction apply defects, found live |
| BT4 | 1 | untrue claim | scenario premise presumed a fact never shown |
| BT6a | ~3 | correctness | review findings per Result (rounds; count approximate in text) |
| BT6b | 1+ | correctness | FAIL verdict recorded |
| BT7 | 1+ | correctness | FAIL verdict recorded |
| BT7b | 1 | correctness | wrong-merge attribution (`--ancestry-path` empty on second-parent entry) |
| BT8c | 1 | correctness | two record/status defects suites missed |
| BT11a | 1 | security | forged `record.reward` reached the public issue block |
| BT12 | 1 | correctness | F1/F2 round-1 findings |
| BT19 | 1 | correctness | five `--json` facts missing vs. text view |
| BT26 | 1 | security | 8.3-alias bypass of `.git`/`.box` tool-owned check |
| BT31-ci | 1 | correctness | "same results for same query" did not hold on Node 22.13 fix |
| BT32 | 1+ | correctness/scope | scale gate failed despite green tests (prove-it-works FAIL) |
| BT35 | 3 | correctness | timestamp contract unmet; two FAILs then park |
| BT36 | 1 | correctness | stale bt11b wording assertions FAILed a candidate |
| D2.1 | 1 | security | excluded `src/private/*` bytes shipped via case alias + in-root junction |
| K6 | ~6 | correctness | multiple FAIL rounds (count approximate in text) |
| K7 | 7-run allowance | scope/budget | parked: 12 runs vs allowed 10; two impl bugs found by measurement |
| K12 | ~2 | correctness | FAIL rounds recorded |
| K14 | 1 | correctness | `NODE_OPTIONS` clobbered gh stand-in preload; outcome target missed |
| K16 | 1 | untrue artifact | recording ran a stale pre-BT11b `dist` |
| K22 | 1 | correctness | stand-in leaked comments across issues |
| K29 | ~4 | correctness | multiple FAIL verdicts during removal wave |
| R3 | ~7 | correctness | multiple FAIL rounds (count approximate in text) |

Counts by assigned class (overlapping waves counted once): **correctness 18, security 4 (BT3, BT11a, BT26, D2.1), untrue claim/artifact 3 (BT4, K16, plus BT35's unmet contract if classed there), scope/budget 3 (A4, K7, K14-partial).** These are counting-rule outputs with judgement in classification — re-verifiable against the named wave files, not exact.

**By host** (Result's stated host only): of the 27, devin-stated 13 (A4, BT3b, BT6a, BT6b, BT7b, BT8c, BT11a, BT19, BT36, D2.1, K7, K16, K29), claude-stated 6 (BT7, BT12, K12, K14, K22, R3), unstated/missing 8 (A2, BT3, BT4, BT26, BT31-ci, BT32, BT35, K6). **This is not a defect rate** — denominators differ (devin cooked 42 waves, claude 37) and era/difficulty are uncontrolled, so no host or brief-style conclusion is drawn. The brief asked for a host/style breakdown; the record supports the count but not a comparison, and that gap is stated rather than filled.

What this supports and what it does not: the listed FAILs are documented catches by the second agent — evidence the review *finds real defects* (adversarial ones like BT11a/D2.1/BT26 no suite covered). It does **not** measure what self-review would have caught, so "independent review pays" is a judgement supported by the catch list, not a measured counterfactual.

Cost side: a FAIL round costs one cook correction plus one re-review — `-ci` waves' median elapsed ~30 min — plus verify wall-time (worst attributed: BT7a 5,477 s). K22's stall (15 runs, 10,380 s, 7 timeout-only) was the pre-verify-reuse case of re-running a full suite on wave-file-only diffs.

## 4. Step 3 — the rulebook, read as a newcomer

**Required reading a fresh cook pays per dispatch** (measured `wc -c` at base):

| File | Bytes |
|---|---|
| AGENTS.md | 7,868 |
| docs/box-v4/KITCHEN.md ("the whole required reading") | 12,065 |
| kitchen/roles/worker.md | 3,083 |
| station card (evidence 9,586; **packaging 34,664**) | 3–35 KB |
| wave file (typical, e.g. BT36 12,268) | ~10 KB |
| STATUS.md + playbook + named principles | ~8–15 KB |
| **Total** | **≈ 45–75 KB per agent, per dispatch** |

At ~230 role-dispatches (cook + pass per wave, plus corrections) that is on the order of 10–15 MB of rule-reading, most of it repeated. The pass pays the same again via reviewer.md + KITCHEN.md + station card.

**Contradictions found (both sides quoted):**

1. `kitchen/README.md`: *"Keep each card to one page"* — `kitchen/stations/packaging.md` is 34,664 bytes and `evidence.md` 9,586. The rule says one page; the cards grew past it with no enforcement. (Contrast: the 20 KB rulebook limit is enforced by `kitchen-stats.test.ts`; card size is not.)
2. `kitchen/README.md` lists four stations including **service-data** ("Retired platform reference") and **console** ("Retired web apps") — a newcomer reads two cards for stations whose product is gone (K29 retired the older platform). `templates/wave.md` still offers `service-data | console` in its station list.
3. `kitchen/roles/cto.md`: *"Commit kitchen documents on master between waves, never while a wave branch is checked out"* — but the cook works in the main checkout *on* the wave branch, so during a wave the rule is impossible to satisfy without a worktree; the next sentence admits this ("use a separate worktree"). The rule and the practice contradict; only the workaround keeps them compatible.
4. KITCHEN.md step 6 says close = *"merge, push, remove resources, replace STATUS.md, delete branch"* — the actual record adds an undocumented **park** state (`Park BT32…`, `Park BT35…` commits) and undocumented pre-cook states (brief committed with "awaiting the owner's approval" in the file, visible on ~10 wave files). A newcomer reading KITCHEN.md cannot explain a third of the lifecycle states Git shows.

**Stale or never-exercised rules:** the station-chef role file and promotion rule (zero uses in 115 waves — capacity never met the bar); `docs/box-v4/OVERNIGHT.md` (the night queue ran 5–6 Oct and never again); `kitchen/roles/recipient.md`'s live use ended with the R-waves in early October; the "one writer per branch … parallel work uses separate worktrees" rule has never been exercised in anger — all parallel-looking work was sequential in the one checkout.

**Enforced but not stated, or stated but not enforced:**

- Stated-not-enforced: card one-page limit (above); INBOX "ten lines at most" (currently compliant, unchecked); "adopt in the strongest form that fits" (process, inherently unenforcable).
- Enforced-not-stated-to-cooks: verify's exact-SHA reuse rules are in KITCHEN.md but the *behavioural* detail cooks actually hit — a stale bt11b assertion FAILed BT36's first candidate though the wave file was the only human-visible change — lives only in verify's internals and past wave Results. Suite-name validation exists (exit 2 "Unknown package script") but nothing validates a *brief* against it.

**Same rule written in several places:** the verify discipline ("run verify on your committed candidate, in the foreground, quote the summary line") appears in AGENTS.md §Method-adjacent rules, KITCHEN.md §Verification, worker.md bullet 11, reviewer.md question 2, and `templates/wave.md` Done-when — five texts that must be kept consistent by hand. The safe.directory rule appears in AGENTS.md and both host rule files; "a fresh agent never inherits" appears in AGENTS.md, README.md, worker.md, reviewer.md.

**The wave lifecycle as actually performed** (from commit subjects and wave files): brief committed on master → owner gate (when required) → branch → cook commits → cook verify → pass verify+attacks → FAIL loop or PASS → merge `--no-ff` → push → close commit (STATUS + reflect) → hosted run read *next kickoff*. Matches KITCHEN.md except parking and the brief-approval loop, which are unwritten.

## 5. Step 4 — established practice

Sources read 19 October 2026 (all vendor material, labelled as such):

- **Anthropic, "How we built our multi-agent research system"** — https://www.anthropic.com/engineering/multi-agent-research-system (engineering post, vendor; read 19 Oct 2026): orchestrator–worker pattern; subagents get *specific* task prompts and return compressed findings; warns multi-agent systems burn ~15× the tokens of chat and that **"most coding tasks involve fewer truly parallelizable tasks than research"** — external support for the kitchen's one-stove sequential shape and its complete-standalone-prompt dispatch.
- **Anthropic, Claude Code best practices** — https://www.anthropic.com/engineering/claude-code-best-practices (vendor docs; read 19 Oct 2026): *"Give Claude a check it can run"* — a runnable pass/fail closes the loop, exactly what `verify.mjs` is; worktrees recommended for *parallel* sessions ("edits don't collide"), not sequential ones; "adversarial review step" listed as a standard pattern — our pass matches; "manage context aggressively" — supports card-size limits.
- **GitHub spec-kit** — https://github.com/github/spec-kit (README, read 19 Oct 2026): per-project *constitution* + per-feature specify→plan→tasks→implement; the constitution maps to AGENTS.md, the spec to our wave file. Notably their flow keeps the *spec separate from the repo's rules* — one artifact per unit of work, same as our one wave file.

Comparison: the kitchen's shape is conventional and mostly aligned — brief-as-spec, one writer per branch, independent adversarial review, runnable acceptance, lessons-to-structure. Where we *differ from the cited practice*: our reviewer is a second agent rather than CI alone (spec-kit relies on human gates; Anthropic's "adversarial review step" supports us); and our rules live in more places than the one-constitution model suggests — five copies of the verify rule vs. one.

## 6. Step 5 — the proposals (ranked)

Ranking mixes two dimensions honestly: P1–P3, P5 rest on measured numbers (20 incomplete dirs, 34.6 KB card, verify wall-seconds); P4, P6–P9 rest on documented risk and reading-size — cheaper evidence, marked as such rather than dressed as measurement.

**P1 — Make every verify run leave a record, even a dead one.**
Evidence: 20 of 595 run directories (3.4 %) have no `summary.json`; the K22 stall, BT36's first cook run and several `-ci` gaps are invisible except as empty dirs. Change: `verify.mjs` writes `started.json` (argv, SHA, dirty flag) before step 1 and `summary.json` gains a `finalStatus: "incomplete"` path in a process `exit`/`SIGINT` handler; `kitchen-stats.mjs` reports incomplete runs by name. Cost: small script change; a new failure mode if the handler itself lies. Decides: head chef. Measure: next 20 runs show 0 unexplained-empty dirs in `kitchen-stats`.

**P2 — Enforce the station-card page budget and shrink packaging.md.**
Evidence: `packaging.md` 34.6 KB vs. the written one-page rule; a cook pays ~45–75 KB of required reading per dispatch. Change: add the four cards to the existing `kitchen-stats.test.ts` byte-limit check (e.g. 12 KB), then trim `packaging.md` to fit — most of its bulk is per-trap narrative that belongs in the wave files that generated it. Cost: one editing pass; risk of losing a real trap (mitigate: keep a one-line pointer per trap to its wave file). Decides: head chef. Measure: card bytes in `kitchen-stats` after one wave; cook reading total drops ~20 KB.

**P3 — Lint briefs against facts a script can check.**
Evidence: BT36's brief named `test:box-package`, which does not exist — discovered by the cook's verify exiting 2, a wasted candidate; BT32 needed 2 documented rewrites + 2 parks before the owner accepted it. Change: a `scripts/brief-check.mjs` (or a kitchen-stats check) run at dispatch time: every suite name in `Done when` exists in `scripts/toolchain.json`/`verify`'s table; every `waves/<id>.md` named exists; every owner-decision referenced names a recorded decision. Decides: head chef. Measure: zero "suite does not exist" discoveries in future Results.

**P4 — A standing owner-decisions ledger the head chef checks before showing a brief.**
Evidence: brief-rewrite counts (§2) concentrate where a draft contradicted an owner's earlier word (BT32 provenance, BT36's "no automatic payment" revival commit `3dcbe10`). Change: one `docs/box-v4/DECISIONS.md` (or a STATUS section) listing dated owner decisions in force; the pre-cook card cites the decisions each brief rests on, so a contradiction is caught in the head chef's checklist, not the owner's review. Cost: one more small document to keep true — the reason it ranks below the script checks. Decides: owner (it records their words); head chef maintains it. Measure: brief-rewrite-after-owner count over the next milestone.

**P5 — Record load next to every duration, and flag load-suspect FAILs.**
Evidence: 7 of K22's 9 verify fails were timeout-only; the evidence card already says MsMpEng can double suite time and K23 measured 399–655 s on an identical tree. Change: `summary.json` records a cheap load fact (e.g. `os.loadavg()`/CPU model) and `kitchen-stats` labels any run >2× the median for its suite set "load-suspect — rerun before treating as FAIL". Cost: one field, one label; risk of agents rationalising real fails as load — the label must not change the verdict, only the *next action*. Decides: head chef. Measure: count of timeout-only fails reclassified vs. confirmed on rerun.

**P6 — One canonical text for the verify discipline; other files link to it.**
Evidence: the same run-verify-commit-quote rule is written in five files (AGENTS.md, KITCHEN.md, worker.md, reviewer.md, wave template); it has already drifted once (worker.md's `--fresh` guidance vs. reviewer.md's). Change: KITCHEN.md §Verification becomes the single full statement; role files keep one line plus a link; the template keeps the `Done when` slot only. Net subtraction of ~30 lines of duplicated prose. Decides: head chef. Measure: grep count of the rule's full statement = 1.

**P7 — Document parking and the brief-approval state in KITCHEN.md.**
Evidence: `Park BT32`, `Park BT35`, "awaiting the owner's approval" commits are a third of the lifecycle a newcomer sees in Git but finds nowhere in the rules. Change: ~6 lines in KITCHEN.md step 5–6 naming the parked state, who resumes it, and that a brief on master awaiting approval is not a wave in flight. Cost: a few lines; prevents a newcomer misreading history. Decides: head chef. Measure: the next parked wave's file matches the written rule.

**P8 — Subtract the dead structure: retire the two retired station cards and the unexercised station-chef role.**
Evidence: `service-data.md` and `console.md` document a platform K29 removed; the template still offers them as stations; the station-chef rule has zero uses in 115 waves. Change: fold each card's one or two still-true lines into `packaging.md`/`evidence.md`, delete both files and the station-chef role file, drop the options from the template. (Subtract-before-you-add: removes ~6 KB of reading and two wrong choices.) Cost: a grep for any inbound reference first. Decides: head chef for the files; owner informed since it shrinks the stated brigade. Measure: `kitchen/README.md` lists only living stations; no wave in the next milestone names a dead one.

**P9 — Keep sequential cooks in the main checkout; reserve worktrees for the head chef's mid-wave writes only.**
Evidence: no parallel cook waves exist in the record; the only proven worktree need is cto.md's own doc-commits mid-wave. The cost of a worktree per cook (extra checkout + install per wave) is **not measured** — this is a rationale, not a measured saving; if worktree cost is ever in doubt it needs a measurement wave first. Change: none to practice — write down in worker.md that the main checkout is the rule and worktrees are for parallel work only, so the debate does not recur. Decides: head chef. Measure: count of waves in the next milestone that needed parallel writers; revisit if >0.

**P10 — Report per-wave verify cost in STATUS.md close lines.**
Evidence: verify is the kitchen's largest measured wall-clock cost (44.2 h summed) yet STATUS lines quote only the last run. Change: the close line carries `verify: N runs, total Ns` from `kitchen-stats` — already computable from `summary.json`. Cost: one field on an existing report. Decides: head chef. Measure: future K-style waves can rank proposals on per-wave totals without a bespoke script like this one.

## 7. Not examined, and why

- **Agent session time / token cost** — not recorded anywhere; only verify run durations are measurable. Any cost claim beyond verify-seconds would be invented.
- **Model-level comparison** — host is stated in Results but the cook/pass model is usually not (mine is "Subagent Default"); no per-model rates are computed, deliberately.
- **Hosted-run causes for `no-run-found` merges** — outside the 200-run snapshot window; labelled missing-coverage.
- **The paused research lab, `.execution/`, `docs/legacy/`** — forbidden by the brief.
- **Overnight queue economics** — ran twice, too little data to measure.
- **Whether the owner's review time is the true bottleneck** — elapsed-time data supports the *suspicion* (longest waves all contain owner waits) but wait time is not separately recorded; this is the evidence gap P10 and P1 partially close.

*Generated 19 October 2026 on `wave/K33`. Reproduce: `node kitchen/review-k33/measure.mjs` at base `2b3eace`; inputs and limits in the script header.*
