# Status

Replaced at R3b close, 7 October 2026 local time.

## Now

- **R3b is done: both waves accepted and merged.** A replay of one closed issue from `tj/commander.js` went through the product end to end. Detail in `waves/R3b-1.md`, `waves/R3b-2.md` and `research/box-delegation/r3b/RESULT.md`.
- **What worked:** the hand-over and the acceptance. A Box of 39 files went out, a solver working only from that folder changed one line, and the owner-side check accepted it and rejected a no-op and four other bad submissions. The pass rebuilt the whole case independently and got the same results.
- **What did not:** preparing the Box. Export refused five times before it worked. Three were first-time-on-Linux snags. Two were the product's own "does the Box behave like the repository" check, which cannot cope with a test runner that prints run times. It exported only with that check's output silenced, which defeats its purpose.
- **Against the useful milestone:** one condition met (accepted owner-side, by a test the solver was shown), three partly met. It was a replay, the solver was not properly blind, and the Box was not prepared cleanly. The milestone is still unmet.
- Nothing was sent to the outside project. No product code changed. `K7` is still parked on local `wave/K7`.

## Lab

Lab sync run at this close; see `git show origin/lab:lab/BRIEF.md`.

## Next

Nothing is running. Recommended next product wave, when the owner names it: fix the paired check so it works with real test runners and explains its refusals (first item in BACKLOG.md). After that, a second replay with a properly isolated solver. Awaiting the owner's instruction.
