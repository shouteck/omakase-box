# Box trial

The one trial in [PROGRAMME](../../PROGRAMME.md): replace an agent-written pstack scope with context computed from a failing test; same helper, whole repository available, at least as many fixes and no more than half the total tokens.

**Gate 1 failed on 8 October 2026:** zero confirmed successes, 23 confirmed failures and seven unknown among 30 fixed tasks. Even seven unknown successes cannot reach the required fifteen. Lean packaging was 27.8%–55.6% of production Python source on admitted tasks, against a 10% limit. [Result and limits](gate-1-result.md), [fixed plan](gate-1-plan.md), [instrument](gate-1/README.md). [Independent review](gate-1-sceptic.md) confirmed the narrow failure: three prescribed packaging reruns and one fresh native test matched exactly except elapsed time.

**Gate 2, 8 October 2026 (reports, no pass mark):** two published agents on the same thirty tasks first open the function that needs fixing after a median of 2 and 4 steps of about 35, so there is little locating for a Box to save; they then read hundreds of other functions before editing, two thirds to three quarters outside the Box, and the records cannot say whether that is waste or need. [Result](gate-2-result.md), [plan](gate-2-plan.md), [sceptic](gate-2-sceptic.md), [instrument](gate-2/README.md).

**Gate 1b, 8 October 2026: worth going on by the letter of its pre-fixed rule; the evidence suggests it, no more.** Tracing only the named failing test gives a Box of 0.6% to 21% of the source (median 4.7%) in seconds, holding a changed function on 26 of 29 tasks. Searching it first reached the fix in at most half the places on 14 of 20 tasks; with each task's best word only 8 or 9 of 20, which the rule would call a stop. [Result](gate-1b-result.md), [plan](gate-1b-plan.md), [sceptic](gate-1b-sceptic.md), [instrument](gate-1b/README.md).

[Gate 0](gate-0.md) passed the reading gate. Gate 1 measured one conservative runtime-plus-import-closure method using whole modified test files. It does not establish repair success or token savings, and does not rule out a different reduction method.

Stopped before Gate 2 under PROGRAMME's first-failure rule. Owner and CTO decide the next step. Lines B, C and E stay paused; the earlier Line A runtime replay remains stopped at development. No product transfer.
