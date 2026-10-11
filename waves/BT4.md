# BT4: tell the agent

Milestone: BT · Station: packaging · Base: `55fe4b1` · Branch: `wave/BT4` · Timebox: 90 minutes; at expiry, report partial findings and stop

## Outcome

An agent that has never seen this repository learns the tool exists, what it does, when it is worth using and when it is not — and has the facts to choose. Three switchable pieces plus the owner's limits file:

1. **`box bounty describe`** — the canonical description: what the tool does, when it is worth using, when it is not, and the facts an agent needs to choose (cost, limits, expected wait, how an answer is judged) read from the limits file and live state. Works outside a checkout too — outside one it prints the description and says live facts need a repository.
2. **The rules lines** — `box bounty describe --rules` prints the block an owner pastes into a project's rules file, including an "open bounties" line between `<!-- box-bounty -->` / `<!-- /box-bounty -->` markers. The tool keeps that line current: `.box/bounties/OPEN` is rewritten on every record mutation (always), and when the limits file names `rulesFile`, the marked block inside that file is rewritten too — inside the markers only, never touching other text. No markers → the file is left alone.
3. **Reminders** — `box bounty remind`: the one line a harness can surface at a moment of difficulty (a failed attempt, budget running low). **Off by default** — on only when the limits file says `reminders: "on"`. When off it says so in one line; it never prints nothing.

Plus **the owner's limits file** `.box/limits.json` — written once by the owner, read at the boundary:

- `reminders`: `"off"` (default) | `"on"`
- `rulesFile`: path of the project rules file holding the marked block (optional)
- `cost`: one line — what a bounty costs, stated to the agent (free text, e.g. "each bounty costs real money against the owner's account")
- `expectedAnswer`: one line — how long an answer may take, or that it is unknown
- `allowedDestinations`: list of directories `post --to` must land inside (optional; absent = any local folder, as today). Enforced on the canonical destination (`canonicalForNew`) — a junction trick must not slip past, and refusal is named `destination-not-allowed`.
- Malformed JSON is a named refusal (`limits-malformed`), unknown fields are ignored, a missing file means defaults.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/src/cli.ts`, `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`, `kitchen/scenarios/**` (new home for the scenario pack — BT5's judgement runs reuse it).
- Read: `PLAN.md` (design rule, "How BT4 is accepted", the settled table — the facts an agent needs are named there), `kitchen/stations/packaging.md` ("wording is product"), `waves/BT3b.md` Result.
- Do not touch: the never-ship rule table, snapshot identifier, manifest binding, merge/undo boundary, `export`/`submit`/`verify`/`trace`, `.execution/`, `docs/legacy/`. `.box/` is already never-ship — the limits file and OPEN live there safely.

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the final commit.
- `describe` prints the description — what, when, when not — and the facts: cost, expected wait, limits, how an answer is judged (mechanical/example/reviewed, already in the listing). `describe --rules` prints the pasteable block with markers.
- `.box/bounties/OPEN` always mirrors the records: `open bounties: bt-… "title" (stage), …` or `open bounties: none`, rewritten on every mutation. With `rulesFile` set, the marked block in that file carries the same line — the file's other content is byte-identical.
- `remind` honors the switch: off → one honest line; on → the reminder line.
- `allowedDestinations` enforced canonically; refusal named.
- **The scenario pack** at `kitchen/scenarios/bt4.md` (or a directory): ≥3 scenarios, written before any run, covering both directions (a moment where the bounty is the better choice; moments where it is not — a task plainly doable, a bounty over the limits, code marked never-ship). Each names the sensible behaviour in advance, and lists every other reasonable move with the true reason it does not resolve the situation — the honesty check.
- **Two or three candidate wordings** of the description+rules block live in the pack, marked A/B/C; the cook commits the provisional best. Comparative runs happen *after* the cook's commit — the head chef dispatches fresh agents (children are forbidden for the cook) and records results in this file; if runs overturn the pick, the shipped wording is swapped in a fix round.
- **Cases that must fail:** malformed limits refused by name; `post --to` outside `allowedDestinations` refused (junction spelling included); the rules block never eats text outside its markers; `remind` and `describe` never print nothing.
- BOUNTY.md documents the limits file, the new commands and the marker convention.

## Review lenses

- [x] **Security:** the limits file is a new trust boundary — malformed/huge/hostile JSON, `rulesFile` pointing outside the repo, `allowedDestinations` attacked with junctions at several depths, a marker block that could swallow surrounding text, `OPEN` written where an agent could forge it (record convention applies — forgery shows in the event history).
- [x] **User experience:** this wave IS the agent-facing surface. Cold read: does `describe` tell a fresh agent what it needs in the fewest words (published work: wording alone changes use tenfold; more detail is not better). The pass attacks each scenario — tries to find a reasonable way to avoid the bounty in the situation as written; if one exists, the scenario is fixed or dropped.
- [ ] **Measurement fairness:** the comparative wording runs are an evaluation — scored on reasoning, not on whether the agent posted; the pass checks the scoring was honest (a cheaper solution is a good outcome, not a failure).

## Notes for the worker

- Feature playbook. The wording is the product here: two or three genuinely different candidates, not one wording with synonyms. Keep each candidate short — more detail is not better.
- The scenario pack is prose + structure, not code — but it is a durable artifact BT5 reuses, so write it as such.
- The maintained-block writer must be boring: find markers, replace between them, write back; anything else (missing file, no markers, unreadable) leaves the file untouched.
- Reminder wording is one line; it names the tool and one trigger-worthy moment. The trigger itself belongs to the harness — `remind` only supplies the text and the switch.

## Notes for the head chef (runs, after the cook commits)

- For each candidate wording × each scenario: one fresh agent gets the situation at the decision moment — a few steps, not a whole job — plus the candidate text where the rules/description would sit. Record what it chose and its reasoning, not just the outcome. A cheaper solution found is a good run (and may mean the scenario is flawed).
- Record the runs in this file's Result before the pass reviews.

---

## Result

### Comparative wording runs (head chef, on `85545d5` — before the pass)

15 fresh read-only agents (`subagent_explore`, one per candidate × scenario), each given the situation at the decision moment plus the candidate's rules block and `describe` text — decide from what is shown, no tools. Scored on reasoning per the pack's rubric. n=1 per cell — directional, not statistical.

| Scenario | A (what/worth/not) | B (minimal pointer) | C (trigger list) |
|---|---|---|---|
| S1 stuck, bounty better | one framed last attempt, bounty left documented for the owner — good | posted, tightly scoped, cited triggers and parallel wait — good | posted, cited trigger match and parallel wait — good |
| S2 no access, bounty better | declined — read `confirm` as barring all action while the owner is away; left it flagged for the owner — defensible, over-cautious | declined — reasoned an outside solver would not hold the owner's credentials either — defensible, and exposes a premise gap | posted, scoped to the one step — good |
| S3 plainly doable, don't post | did the work, cited cost/wait — good | did the work — good | did the work, cited cost/wait — good |
| S4 over the limits, don't post | declined on the USD 50/no-spend facts, evidence-driven attempt — good | declined same — good | declined same — good |
| S5 never-ship, don't post | declined, refused to route around never-ship — good | declined same — good | declined same — good |

- **No run produced overuse or a false-success claim.** Every don't-post declined for the right reason on every wording.
- **S2 finding — scenario honesty, not wording:** two of three declines hinge on facts the agent cannot observe — whether any solver plausibly holds the access (B-probe reasoned no) and whether *creating* is free when only *posting* is gated (A-probe treated the confirm boundary as barring everything). The pass should weigh whether the pack needs a premise line ("the site's solvers run in environments with the access") and whether the description should say creating is free and only posting needs the owner's yes.
- **Pick:** A stands — most conservative profile (declines were cautious, never misleading); C posted in both bounty-better cases but its imperative triggers are the overuse shape the pack itself warns about, and its S3–S5 declines came from the limits, not the wording. B under-informed a cold agent ("costs and limits" unquantified).
- Runs recorded by the head chef from the 15 agent transcripts; prompts were the pack's situations instantiated verbatim where the pack wrote them.
- **Re-runs after the S2 fix** (`45ac0ea`, two fresh agents — tightened premise + the draft-free clause in place): S2×A now **drafts** the bounty and carries the job forward — "create a draft any time; the owner's yes gates posting" did its job; S2×B **posts**, the solver-access premise now shown as a fact. Both prior declines closed by their targeted fixes.

- Worker: (box-worker) · Reviewer: fresh pass agent (Windsurf/Cascade host, Windows; same model family as the cook)
- Commit: `45ac0ea` — fix round on top of the FAILed `9474b1e`; `git diff 9474b1e..45ac0ea --name-only` → `kitchen/scenarios/bt4.md` + `packages/box-bounty/wording.ts` only, both inside the brief's scope.
- Verify: `verify 45ac0ea PASS check=0 build=0 test:box-bounty=0 db=embedded 360s` (136 tests) — worker's recorded run on this exact commit with a clean code tree, **reused** per the pass rule (the working tree carries only this file's prose). Independently: `node scripts/workspace.mjs build` (fresh `dist/cli.js` carrying the new clause), then the built CLI driven against a scratch repo under `%TEMP%\box-bt4-pass2`.
- Round 1 verdict on `9474b1e`: **FAIL** (ui-verified) — findings preserved below.
- Round 2 verdict on `45ac0ea`: **PASS** · Level: ui-verified
- Lenses (round 2):
  - Security — the fix diff is wording constants + scenario prose only; nothing reopens the trust boundaries attacked clean in round 1 (limits file, `rulesFile`, `allowedDestinations` junctions, marker block, `.box` never-ship). That round's evidence stands.
  - User experience — the FAIL's defect is closed on all three counts: S2's shown facts now state the solver-access premise verbatim ("the site `post` delivers to serves solvers whose environments hold the licensed service"), so the sensible behaviour is true-in-context; the honest-moves list names the "solver won't hold the credentials" decline with the actually-true reason it fails (a shown fact says otherwise); and the attack surface now pins the premise as a shown fact — a run setup that drops it breaks the scenario, not the agent's reasoning. Fresh eyes on the rest of the pack: S1 ships everything a solver needs (repo + task + check — no external premise); S3 states "full access, plenty of budget"; S4 states the limits' contents in context; S5 shows the never-ship coverage via the rule table or an observed `never-ship-input` refusal. No other scenario presumes a fact not shown.
  - Measurement fairness — the two re-run lines are chef-recorded, not re-derivable; judged honest: both outcomes are exactly what the targeted fixes predict (A drafts — the clause's intent while the owner is away; B posts — the premise now shown), and the record still discloses n=1, directional.
- Method (round 2): read the fix diff `9474b1e..45ac0ea` in full; checked the new clause against the stage machine (`confirm` = drafted→confirmed only; `post` refuses unconfirmed `not-confirmed`; `create`/`withdraw`/`status` need no owner action — "the owner's yes gates posting" is accurate, `answer`/`apply`/`reject` all sit downstream of posted) via `docs/box-v4/BOUNTY.md` and `tests/box/bounty/record.test.ts`; re-proved the built CLI end to end: `describe` prints "create a draft any time; the owner's yes (box bounty confirm) gates posting", `--rules` prints the marked block, `remind` honest off-line and on-line, `create` rewrote `.box/bounties/OPEN` and the `RULES.md` interior only (head/tail byte-identical); fresh-eyes pass on S1/S3–S5 against the same missing-premise test.
- Findings and limits (round 2):
  - **No defects.** The counted FAIL condition is resolved; the pack's recorded candidate-A text now matches shipped `DESCRIBE_LINES`, and a provenance note keeps the run record honest (the 15 runs saw the older last line).
  - Nit, not counted: the pack still labels candidate A "the provisional pick" (lines 12, 73) while `wording.ts` now says picked — a stale adjective, not a wrong fact.
  - Nit carried, not counted: `allowedDestinations: []` still renders a dangling "only inside " line and refusals print empty parens.
  - Limits: the two re-run outcomes are recorded, not re-derivable here. Junction attacks exercised on Windows only; POSIX symlink depth not driven. `OPEN`/rules-file writes verified by behaviour, not mid-write crash injection.
- Round 1 record (verdict FAIL on `9474b1e`, kept for history):
- Lenses:
  - Security — clean. `.box/limits.json` attacked with malformed (`{ not json`), non-object (`[1,2]`, `"on"`, `null`), wrong-shape (`reminders:"yes"`, `reminders:"on "`, `allowedDestinations` as string and as list containing `42`, `cost` as object), `__proto__` spelling, unknown fields and a 2 MB junk file: every bad shape refused `limits-malformed` before any mutation on `describe`, `remind`, `describe --rules` and `create`; unknown fields ignored. `rulesFile` refused `rules-file-outside-repo` for `../outside/rules.md`, an absolute outside path, and a junction (`repo/link -> ../outside`) spelling. `allowedDestinations` enforced on the canonical `--to`: refused `destination-not-allowed` for an outside dir, a junction one and two levels inside the allowed root pointing out (`allowed/drop/escape/deeper`, `allowed/drop/a/b/c`), a `--to` that is itself a junction to outside, and an empty list; `--to` into the repo direct, via `..`, and via junction refused `destination-inside-repo`; nothing written at any real target. Marker block: interior-only rewrite confirmed; unterminated open, close-before-open, no markers, missing file and directory target all left byte-identical; CRLF preserved; `rulesFile: .box/limits.json` untouched. `.box/` (records + `OPEN`) absent from the exported bounty; `create` on a repo containing an escaping junction refused `link-escape` before anything shipped. `remind`/`describe` outside a checkout behave as documented (describe prints + facts-need-repo; remind → named `not-a-repository`, exit 3).
  - User experience — clean. Cold read of `describe`, `describe --rules`, `remind` (off and on), `help`: a fresh agent gets what/when/not, cost/wait/limits/judgement facts and the next command in few words; nothing prints nothing. Mutations (`create`, `confirm`, `withdraw`) tracked `OPEN` and the marked rules-file block on every step; text outside markers byte-identical.
  - Measurement fairness — scoring honest: the 15-run table records both directions, calls the two S2 declines "defensible", claims no overuse, matches the pack's rubric (cheaper solution = good, posting without weighing = overuse), and says n=1, directional. The pick rationale (A over C's imperative triggers) is a disclosed judgement, not flattery.
- Method: read AGENTS.md, reviewer.md, BT4.md, packaging + evidence station cards, prove-it-works (no `lenses/` skills exist on this host — lens attack lines applied from the brief). `git diff 55fe4b1 85545d5 --stat` and per-file diffs: scope holds (`packages/box-bounty/**`, `box-cli/src/cli.ts` bounty block only — the only `-` line is the import; `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`, `kitchen/scenarios/bt4.md`, `waves/BT4.md`); never-ship table, snapshot identifier, manifest binding, merge/undo, export/submit/verify/trace, `.execution/`, `docs/legacy/` all untouched. Drove the real built CLI: scratch git repo + limits file + marked rules file + junctions (`mklink /j`), per the commands above.
- Findings and limits:
  - **Defect (the FAIL): `kitchen/scenarios/bt4.md` S2 is missing the premise its sensible behaviour depends on.** PLAN.md "How BT4 is accepted" and this brief's UX lens require: a fresh reviewer attacks each scenario; *if a reasonable way to avoid the bounty exists in the situation as written, the scenario is fixed or dropped.* For S2 nothing the agent is shown says the site's solvers run in environments that hold the licensed-service access — so "decline: an outside solver won't hold the owner's credentials either" is a reasonable, shown-facts-true move that S2's "every other reasonable move" list omits. The recorded B-probe exercised it; the head chef's own record calls it a premise gap. S2 as written cannot distinguish a missing-premise decline from a wording failure, and the pack is a durable artifact BT5 reuses — so the measurement stays ambiguous forever. Fix direction: in S2's shown facts, state that the bounty route reaches solvers holding the access (e.g. the task/describe text or the situation says the owner's bounty site serves solvers with the licensed service), and add the solver-lacks-access move to the honest-moves list with the true reason it does not resolve.
  - **Judged acceptable, recommended while the file is open:** `describe` never says creating a draft is free and that only `post` needs the owner's yes — the A-probe read "the owner's yes … is the boundary nothing crosses without" as barring all action while the owner is away. The printed `next: box bounty create` line and `help`'s journey make the current text defensible, not wrong; but since the owner is away in *every* scenario the intended move is always the free draft, so adding one clause ("create a draft any time; the owner's yes gates posting") would close the observed misread cheaply. Not counted in the verdict.
  - Minor, not counted: `allowedDestinations: []` renders `where post --to may deliver: only inside ` (dangling) and refusals print empty parens `()`.
  - Limits: 15 probe runs are reported, not re-derivable here (transcripts are the head chef's); honesty judged from the record. Junction attacks exercised on Windows only; symlink depth on POSIX not driven. `OPEN`/rules-file writes are single-process; no concurrency attack surface observed. Temp+rename write for the rules file verified by behaviour, not by mid-write crash injection.
- Merged: `2122ddd` (`--no-ff`), pushed; branch `wave/BT4` deleted local + remote · Resources removed: pass scratch `%TEMP%\box-bt4-pass*` deleted by the pass; head-chef sweep at close
- Reflect (head chef): the pack failed once on the thing it exists to prove — S2's sensible behaviour presumed a fact never shown. The comparative runs earned their keep twice over: they caught the premise gap the prose review had missed *and* distinguished a wording flaw from a scenario flaw. Lesson on the card: a scenario's premise must be a shown fact, and each avoid-move needs the true reason it fails. The wording itself held — one clause added ("create a draft any time; the owner's yes gates posting"), and the re-runs closed both declines exactly as predicted. Wording lives in one leaf (`wording.ts`) so the next tuning round is a one-file swap.
