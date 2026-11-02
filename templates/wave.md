# <id>: <one-line outcome>

Milestone: <D2> · Station: <packaging | evidence> · Base: `<master SHA>` · Branch: `wave/<id>` · Timebox: <minutes; waves here have taken 15 to 50; at expiry, report partial findings and stop>
Owner decisions: <IDs from docs/box-v4/DECISIONS.md this brief relies on, or none>
Horizon: <short | long: several dependent steps, a design unknown or more than one sitting; a long wave starts with /plan and keeps the plan in this file, naming the playbook and principles read>

## Outcome

What will be true when this is done, as something a person can observe or a command can show. A security outcome names its mechanism and its limit, never "no path can" (BT43: five passes each found one more site).

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
- <if the wave claims an invariant over code paths — "no read calls the writer", "nothing reaches X" — name the mechanical check that enumerates every caller (a grep, a spy); a list written from memory missed one in BT22>
- <if a check covers every user-facing hit of something, name the mechanical pattern and the expected count, not a sample list; a sample invites a reasoned skip (BT41)>
- <if this wave removes, skips or speeds up a check: first write the test that proves a real break is still caught, then make the change>
- <if the design relies on a provider's event: make the event happen for real first; PayPal's refund on the solver's account sent none (PF13)>
- <if a provider call is new: prove it on the account that goes live (its sandbox), not an older test account; an older Stripe sandbox accepted what the owner's account refuses (PF18)>
- <if a test checks that something is filtered out: first assert the row it filters is really there; PF20's test passed with its filter removed, because the row never reached the database>
- <if the owner approves a page's looks: screenshots are full pages with the sticky menu static; section shots read as a cut-off site (PF17)>
- <if the wave changes a page: read the running page as its user before the first candidate; PF3 and PF4 found wording faults only there, after verify passed>
- <if a brief sets a timing target for a command (seconds, runs), derive it from a measured run or a declared map (e.g. the `// reads:` headers), never from the head chef's estimate of which files read what (K45)>

## Lenses

Tick the ones that apply. The CTO answers every ticked one in the Result.

- [ ] **Security:** does this add or change a check that keeps something out (hosts, paths, roles, identities, inputs)? Attack it with hostile inputs and say which you tried.
- [ ] **User experience:** does a person see or operate this? Use it as that person would and say what was unclear; a fresh-agent check is stronger where the brief can name one.
- [ ] **Measurement fairness:** does this produce a number or comparison someone will rely on? Check both sides had equal obligations, every attempt is counted, missing data is shown as missing, and each number comes with its run count, its spread and what limits it.

## Notes

Decisions already made, interfaces to reuse, traps. Keep it short; link instead of pasting. A wave with a real-GitHub step names the sandbox (`kitchen/sandbox.md`); a step that needs the owner as a test subject is not written. A change to a command, an option or what a command prints names the established tool it follows (`gh`, `git`, `npm`, `direnv` or another), or says why it departs from it (owner, 14 October 2026); check the claim before merging. A product question about how something should work: read what established tools do before proposing, not after the owner asks (PF15, PF16, PF17).

---

## Result

<One or two lines per item. Detail goes in a notes file next to the evidence, linked from here.>

- CTO: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line>`
- Checks: the three questions answered · Level: ui-verified | test-verified | typecheck-only
- Lenses: <one line per ticked lens: what was tried and what was found>
- Method: <playbook followed; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Verify cost: `<the "line" from node scripts/kitchen-stats.mjs --wave=<id>, e.g. verify: N runs, total Ns>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong, was repeated or could be better> -> <wave | station | kitchen>: <what it became, or "nothing">
