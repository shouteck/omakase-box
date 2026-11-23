# BT82 notes: two doors compared

Written by the CTO on 23 November 2026, from the two throwaway attempts in [BT82](BT82.md). Both attempts were cut from `937ddcba` (the inventory commit), and each moved the same two exits: `post`'s issue creation and `close`'s decision comments. Both lived on local branches only (`proto/BT82-a`, `proto/BT82-b`), were never pushed, and are deleted. Every row below was run, not reasoned. The command output is quoted.

## The attempts

- **A, a door with a permission value.** A new `outbound.ts` (50 lines):
  - a `Granted` type branded with a module-private `unique symbol`;
  - made only by `grantPost` (which wraps `ownerGate`, then reads `publicRepository`) and `grantCloseUp` (the signed-in account is the one that opened the bounty);
  - writers `createIssue(root, granted, …)` and `comment(root, granted, …)`, each scanning the exact text it sends.
- **B, one plan and one executor.** A new `effects.ts` (31 lines):
  - an `Effect` union (`issue`, `comment`);
  - `checkEffects(root, record, effects)`: authority from the record, then the scan of every text;
  - `executeEffects`, which checks and then sends in order.

  `syncGitHubDecision` plans every comment first, then hands the whole list over. `closeBounty` runs `checkEffects` on the comment it will post **before** `settleScanFindings` and `transitionTo`. The text comes from one builder, `decisionCommentBody`, shared by the early check and the real send.

## The checks

| # | Check | A | B |
|---|---|---|---|
| 1 | A secret in a close reason never reaches GitHub | **Pass, but late.** The comment is refused (`outbound-held`) and the stand-in holds no comment with the value. But `close` had already ended the record: `{"stage":"rejected","pending":"github-decision-pending (outbound-held: …): local close stands; retry omakase-box close …"}`, and the shared-memory event was held (`publish-held`). A rerun refuses forever, because the reason is now recorded. | **Pass, clean.** Refused `effect-held` before anything changed: `{"reason":"effect-held","stage":"posted","pending":null,"state":"posted"}`. |
| 2 | Authority cannot be skipped | **Pass at compile time.** A forged value: `error TS2345: … Property '[brand]' is missing in type '{ kind: "opened-here"; … }' but required in type 'Granted'`. **Limit:** `as unknown as Granted` compiles (`tsc` exit 0). | **Partly.** No allowance: `refused effect-not-allowed`. A forged `allowedBy: { forged: true }` on the record: `PASSED THE CHECK`. Authority is data the executor reads, so any code that can write a record can grant itself. |
| 3 | Nothing bypasses the door | The inventory test fails on both branches, as it should: the moved sites now sit in `outbound.ts` / `effects.ts`. Neither attempt stops a direct `api(...)` elsewhere; that needs the import guard (BT83). | Same. |
| 4 | Retry stays safe | Pass: a branch moved under `close` fails it after the comment and the issue edit; restored and rerun, exactly one `box-bounty:<id>:close` comment. A lost issue response, then a rerun: one issue. | Pass, the same two runs. |
| 5 | Existing behaviour unchanged | `github`, `bt69`, `bt8c`, `bt51`, `bt43`, `bt11` and `github-history`: 156 passed, 1 skipped. 3 failed, all source-reading tests: `bt82` (the list moved, expected) and `bt69:186`, which looks for the literal `` `repos/${repository}/issues` `` in `post.ts`. | 159 passed, 1 skipped (the same files plus the check file). The same 3 source-reading failures. |
| 6 | Cost | 50 new lines; post and close 9 added, 10 removed (`git diff --ignore-cr-at-eol --stat`). No extra GitHub reads. For each remaining exit: wrap the call and pass the grant down; the order of local writes is unchanged. | 31 new lines; close, commands and post 33 added, 22 removed. One extra `gh api user` read per close that carries a reason (`signedAccount` is not cached). For each remaining exit: plan before the command's first local write, which means restructuring `closeBounty`, `postGitHub` and `advanceBountyBranch`, not just wrapping a call. |
| 7 | Reading: "what can leave during `close`?" | Unchanged in the prototype: the sends are still scattered through `syncGitHubDecision`'s control flow, `advanceBountyBranch` and `shareClosed` (4 places). With every exit moved, still 4: the door names how things leave, not what one command sends. | 4 in the prototype (only the comments moved). With every exit moved: the planned list in one function, plus the executor (2). |

## The winner

**B's shape, carrying A's permission value.** Commands plan their effects before their first local write. One executor runs them. It takes a `Granted` that only the gate functions can make (A's brand), not authority read from the record.

- **Why B's shape.** Check 1 is the deciding row. A closes the leak but leaves a record ended locally and a retry that can never succeed: "a refused command changes nothing" is false. B makes it true by construction, which is also what BT79 asks for and what BT81 had to add by hand. The cost is a real restructuring of each command, paid once.
- **What the loser did better.**
  - A's authority is a value the compiler checks; B's is data any writer can forge (check 2).
  - A costs no extra reads.
  - A moves an exit by wrapping one call.

  So the executor in BT83 takes A's `Granted`. `grantCloseUp` reads the account once, and the plan and the run share that read (B's extra read goes away).
- **What neither does.** Neither stops code from calling the raw `api` or `remoteGit` directly. That is the import guard, and the inventory must harden first (the lens below).

## Security lens: four routes around the door

Tried against the inventory on `wave/BT82` with a scratch file in `packages/box-bounty`, then removed:

| Route | Caught? |
|---|---|
| `spawnSync('gh', ['api', …, '--method', 'POST'])` | yes, `unknown` |
| `gitOutcome(root, ['push', 'origin', …])` | yes, `git-push` |
| `const m = await import('./gh.js'); m.api(root, …, {…})` | **no** (the callee is `m.api`, not `api`) |
| `gitOutcome(root, ['pu' + 'sh', …])` | **no** (the verb is not a literal) |

BT83's first step closes the two misses:
- any member call named `api` and any `import()` or `require` of the raw writers outside the door are `unknown`;
- a Git call whose first argument is not a string literal is `unknown`.

## Principles that changed a decision

- **boundary-discipline:** the deciding row was where the check sits relative to the command's own writes, not whether it exists. That moved the winner from A to B.
- **type-system-discipline:** kept A's brand instead of B's record field, because a value the compiler checks beats a fact any writer can set.
- **prove-it-works:** check 1 on A "passed" the leak test; only reading the record it left showed the late refusal. The check file records the end state for that reason.
