# <id>: <one-line outcome>

Milestone: <D2> · Base: `<master SHA>` · Branch: `wave/<id>` · Timebox: <hours; at expiry, report partial findings and stop>

## Outcome

What will be true when this is done, as something a person can observe or a command can show.

## Scope

- Write: `<paths>`
- Read for context: `<paths or "as needed">`
- Do not touch: `<paths>`

## Done when

- `node scripts/verify.mjs <suites>` exits 0 on the final commit.
- <behavioural check 1, including at least one case that must fail>
- <behavioural check 2>

## Review lenses

The CTO ticks the ones that apply. The reviewer answers every ticked one in the Result.

- [ ] **Security:** does this add or change a check that keeps something out (hosts, paths, roles, identities, inputs)? The reviewer attacks it with hostile inputs and says which it tried.
- [ ] **User experience:** does a person see or operate this? The reviewer uses it as that person would and says what was unclear, without reading the code first.
- [ ] **Measurement fairness:** does this produce a number or comparison someone will rely on? The reviewer checks both sides had equal obligations, every attempt is counted, missing data is shown as missing, and each number comes with its run count, its spread and what limits it.
- [ ] **Second model family:** the reviewer should be a different model family from the worker if one is available.

## Notes for the worker

Decisions already made, interfaces to reuse, traps. Keep it short; link instead of pasting.

---

## Result

- Worker: <host / model> · Reviewer: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line from the reviewer's run>`
- Verdict: PASS | FAIL · Level: ui-verified | test-verified | typecheck-only
- Lenses: <one line per ticked lens: what was tried and what was found>
- Method: <playbook followed; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong or was repeated> -> <the script, template line, check or profile it became, or "nothing">
