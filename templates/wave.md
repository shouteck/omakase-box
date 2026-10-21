# <id>: <one-line outcome>

Milestone: <D2> · Station: <packaging | evidence> · Base: `<master SHA>` · Branch: `wave/<id>` · Timebox: <minutes; waves here have taken 15 to 50; at expiry, report partial findings and stop>
Owner decisions: <IDs from docs/box-v4/DECISIONS.md this brief relies on, or none>

## Outcome

What will be true when this is done, as something a person can observe or a command can show.

## Scope

- Write: `<paths>`
- Read for context: `<paths or "as needed">`
- Do not touch: `<paths>`

## Done when

- `node scripts/verify.mjs <suites>` exits 0 on the final commit.
- <if the wave closes a milestone or precedes an overnight stop: `node scripts/verify.mjs --full` green on the final commit>
- <behavioural check 1, including at least one case that must fail>
- <behavioural check 2>
- <if a check is a search for leftover names, list the renames you expect, so a legitimate one is not a surprise>
- <if the wave claims an invariant over code paths — "no read calls the writer", "nothing reaches X" — name the mechanical check that enumerates every caller (a grep, a spy); a list written from memory missed one in BT22 and the pass caught it>
- <if a check covers every user-facing hit of something, name the mechanical pattern and the expected count, not a sample list; a sample invites a reasoned skip (BT41)>
- <if this wave removes, skips or speeds up a check: first write the test that proves a real break is still caught, then make the change>
- <if a brief sets a timing target for a command (seconds, runs), derive it from a measured run or a declared map (e.g. the `// reads:` headers), never from the head chef's estimate of which files read what (K45)>

## Review lenses

The CTO ticks the ones that apply. The reviewer answers every ticked one in the Result.

- [ ] **Security:** does this add or change a check that keeps something out (hosts, paths, roles, identities, inputs)? The reviewer attacks it with hostile inputs and says which it tried.
- [ ] **User experience:** does a person see or operate this? The reviewer uses it as that person would and says what was unclear, without reading the code first.
- [ ] **Measurement fairness:** does this produce a number or comparison someone will rely on? The reviewer checks both sides had equal obligations, every attempt is counted, missing data is shown as missing, and each number comes with its run count, its spread and what limits it.

## Notes for the worker

Decisions already made, interfaces to reuse, traps. Keep it short; link instead of pasting. A wave with a real-GitHub step names the sandbox (`kitchen/sandbox.md`); a step that needs the owner as a test subject is not written. A change to a command, an option or what a command prints names the established tool it follows (`gh`, `git`, `npm`, `direnv` or another), or says why it departs from it (owner, 14 October 2026); the pass checks the claim.

---

## Result

<One or two lines per item. Detail goes in a notes file next to the evidence, linked from here.>

- Worker: <host / model> · Reviewer: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line from the reviewer's run>`
- Verdict: PASS | FAIL · Level: ui-verified | test-verified | typecheck-only
- Lenses: <one line per ticked lens: what was tried and what was found>
- Method: <playbook followed; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Verify cost: `<the "line" from node scripts/kitchen-stats.mjs --wave=<id>, e.g. verify: N runs, total Ns>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong, was repeated or could be better> -> <wave | station | kitchen>: <what it became, or "nothing">
