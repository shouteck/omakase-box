# <id>: <one-line outcome>

Milestone: <D2> · Base: `<master SHA>` · Branch: `wave/<id>` · Size guess: <hours>

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

## Notes for the worker

Decisions already made, interfaces to reuse, traps. Keep it short; link instead of pasting.

---

## Result

- Worker: <host / model> · Reviewer: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line from the reviewer's run>`
- Verdict: PASS | FAIL
- Findings and limits:
- Merged: `<merge SHA>` · Resources removed: yes | <what remains and why>
