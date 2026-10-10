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

- Worker: (box-worker) · Reviewer: fresh pass agent (Devin host, same model family)
- Commit: `85545d5`
- Verify: `verify 85545d5 PASS check=0 build=0 test:box-bounty=0 db=embedded 485s` — worker's recorded run
- Verdict: pending the pass · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
