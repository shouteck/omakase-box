# BT100 notes: the document store, hardened (A), against an event log with an outbox and one reconcile step (B)

Run 24 November 2026 by the CTO (Claude Code desktop app, Claude Opus 5.5) on two local throwaway branches, `proto/BT100-a` (`13078552`) and `proto/BT100-b` (`de61428a`), each cut from master `9f55e740`, never pushed, deleted after these notes. Same two actions on both: `post`'s issue creation and `close`'s decision comments. Same harness on both: `tests/box/bounty/bt100-proto.test.ts`, which drives the GitHub stand-in (`github-fixture.ts`) and runs reads as separate CLI processes (`node packages/box-cli/dist/cli.js bounty look …`), because the hand-merge scan runs once per process, as on the command line.

**One simplification, stated:** the door itself (plan first, a branded grant) was prototyped and measured by [BT82](BT82.md). Both attempts would use it, so it was not rebuilt here. A and B differ only in what was in question: the store model, what reads may do, and retries. B's `reconcile` calls today's senders (`recoverIssue` with the issue POST, `syncGitHubDecision`, `shareMerged`, `shareClosed`) behind one gate.

## What each attempt is

- **A** (`packages/box-bounty/store.ts`, +26 −8, one file): schema 5 adds `rev` to `records`. A clone handed out by `readStored` remembers its revision in a `WeakMap`. `writeStored` updates `WHERE id=? AND rev=?`, and a mismatch refuses `record-changed`. A copy with no known revision (new, or built by spreading) writes unconditionally: 2 such writes in post, status and close, and 1 in look, apply and status (counted with an instrumented run).
- **B** (+190 −22, nine files, `reconcile.ts` new):
  - **Store:** `store.ts` adds `events(bounty_id, seq, at, kind, json)` and `outbox(key, bounty_id, event_seq, kind, state, result, done_at)`. Every record write appends a `patched` event holding only the top-level fields the copy changed since it was read (the stage history appended, never replaced), folded onto the row as it is now, in one transaction. The `records` row becomes the fold's cache.
  - **Owing:** `owe(root, id, kind, key)` writes an `owed` event and its outbox row in one transaction.
  - **Sending:** `reconcile(root)` sends each pending row through today's senders, with the payload rebuilt from the folded record, and writes `sent` or `refused`. It does nothing inside a read.
  - **Callers:** `post` owes `issue:<id>` and drains it. `close` owes `decision:<id>:<stage>` and `share-closed:<id>`, then drains. The hand-merge scan (`merged.ts closeOne`) only owes. `look`, `status` and `status --json` run inside `asRead`, and `retryPending` does not push inside a read.

## The checks

| # | Check | A | B |
|---|---|---|---|
| 1 | No lost update | **holds by refusal**: `CHECK1 stage=applied refusal=record-changed kept=false` | **holds, nothing lost**: `CHECK1 stage=applied refusal=null kept=true` |
| 2 | A fault midway, then a rerun | holds: `CHECK2 issues=1`, `CHECK2 comments=1` | holds: `CHECK2 issues=1`, `CHECK2 comments=1` |
| 3 | Reads send nothing | **fails**: `CHECK3 writes=3 refsMoved=true [["api","github.com","graphql"],["api","github.com","repos/owner/project/issues/1/comments"],["api","github.com","repos/owner/project/issues/1"]]` | **holds**: `CHECK3 writes=0 refsMoved=false []`; the next reconcile: `said=["sent decision:…:applied: decision comments and issue state","sent share-merged:…: merged event pushed"] writes=3 issue=closed` |
| 4 | Places a reader must look for what can leave during `close` | 4: `syncGitHubDecision` (close.ts), `shareClosed` (chain.ts), the merge scan's `closeOne` (merged.ts, reached through `loadRecord`), `retryPending` (chain.ts, reached through `syncBeforeAction`) | 3: the `owe` calls (`commands.ts`), `reconcile`'s `send` (one switch over four kinds), and `retryPending`, because `chain_pending` was not moved into the outbox in the prototype. 2 once it is. |
| 5 | "What changed in my name" from the store alone | no: `record.events` holds stage changes only; field edits (reward, publication, allowedBy) leave no trace | yes: `["created","patched(allowedBy,reward,github)","patched(github)","owed(issue:…)","patched(github)","sent(issue:…)","patched(stage,github)","patched(stage)","owed(decision:…:rejected)","owed(share-closed:…)","patched(github)","sent(decision:…:rejected)","sent(share-closed:…)"]` |
| 6 | Shared memory without special settle code | unchanged: `settleFromChain` still needed | **not shown.** The prototype left chain import alone; folding shared events into the local log with one reducer is BT101's to prove |
| 7 | Cost | +26 −8, one file; every K14 budget held (no "over" line) | +190 −22, nine files; K14: `close-ended` 5 Git starts against a budget of 4, everything else as master (`post-github` 28/7, `apply` 32/6, `hook-start` 2/0); every existing `persistRecord` call site kept working through the generic patch event |
| 8 | Existing tests (`github`, `bt10`, `bt69`, `answer`, `never-ship-layers`, `bt13`, `bt32`, `bt52`) | 235 passed of 235 | 232 of 235; the three, each explained below |

**B's three breaks:**
- `bt69.test.ts:186` reads `post.ts`'s source for one issue POST: the POST moved into `reconcile.ts`. Structural; the test follows the move.
- `bt13.test.ts:237`: a read no longer prints the pay message for a hand merge, because the read now only owes the decision. This is B's point, and a behaviour change. The message moves to the command that sends.
- `bt10.test.ts:135`: a second `close` on an ended bounty makes no new GraphQL reads (2, where 4 were expected): its decision row is done, so nothing is resent. Cheaper. But an issue someone reopened by hand is no longer re-closed by a rerun; BT101 must decide whether a rerun re-checks GitHub.

## Security lens (the winner, B)

- **A forged outbox row is not sent.** A row inserted by hand into `.box/local/box.db` (`INSERT INTO outbox … event_seq 9999, kind 'decision'`), then `reconcile`: `said=["refused decision:…:forged: no owed event stands behind it"] writes=0`.
- **The payload is rebuilt, never trusted.** It comes from the folded record at send time, never from the row. The owner's word is read from settings at send time for the issue (`readDecision`).
- **Not done, and BT101's to carry:**
  - Someone with write access to the store can forge the `owed` event too. Then the door's own checks are the defence: the owner's word, never-ship (BT69's sink, already in the push path) and the scan. The prototype checked only the owner's word in `reconcile`; BT83's door brings the rest.
  - The `decision` effect was not re-gated on the owner's word in the prototype.

## Hook budget

`hook start`: 2 Git starts and 0 `gh` on both. B adds no reconcile inside the hook. Wall time was not measured separately; the start count is the K14 measure the hook budget (BT93) is held to.

## What B taught that neither design removes

- **The outbox does not make GitHub idempotent.** A crash after the issue POST and before `settleOutbox` leaves the row pending; only `recoverIssue`'s marker search stops a second issue. GitHub's REST API takes no idempotency key. The markers stay; the outbox decides *when* to send, the markers decide *whether it already went*.
- **Patching top-level fields is not enough.** `github` is one object: two writers changing different parts of it still lose one change. BT101 needs either a path-level patch or, better, intent events (`issue-recorded`, `comment-sent`) folded by one reducer.
- **`chain_pending` already is an outbox**, for chain pushes. BT101 should fold it into the one table.

## Winner: B

B is the only attempt that holds checks 1, 2, 3 and 5. Check 3 is the walkthrough's widest finding: reads that close issues, post comments and push. A cannot reach it without becoming B.

**What A did better:**
- far less code, and no existing test changed;
- a refusal is the simplest correct answer to a lost update, with nothing to reason about;
- it held every start budget.

The real brief keeps A's compare-and-swap as the store's last defence under the event log (an append checks the bounty's last sequence), and moves the remaining work in the order BT101 gives.

**Stop rule:** B passed checks 1 and 2, so BT101 follows. No stop was needed.
