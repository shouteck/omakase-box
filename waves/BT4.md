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

<One or two lines per item. Detail goes in a notes file next to the evidence, linked from here.>

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
