// What a bounty promises, in the owner's name: the money side of the record.
// `promisedTotal` sums the reward bound into each open record at posting,
// `rewardForPost`/`assertPromiseRoom` are the limit gate every fresh post
// passes, and `withPromiseLock` makes the check and the record write one
// span so two posts running at once cannot both pass. Moved out of
// record.ts unchanged (BT25).

import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BountyRefused } from './errors.js';
import { boundAmount } from './format.js';
import { isOpenStage, listRecords } from './record.js';
import type { ListedBounty } from './record.js';
import { repoReward } from './settings.js';

// What open bounties here promise: the sum of the reward bound into each
// open record at posting (BT11a). Records from before then carry none and
// count as $0 — closing a bounty, merged or not, ends its count because the
// record is no longer open. This repository is what the tool can see; the
// owner keeps the limit with that horizon in mind.
export function promisedTotal(open: readonly ListedBounty[]): number {
  // The bound amount, not the editable `reward` summary: for a GitHub-posted
  // bounty that is the amount inside the body the tool posted, so an edited
  // record cannot shrink what open bounties promise (BT11a fix round).
  return open.reduce((sum, entry) => sum + (entry.record === null ? 0 : boundAmount(entry.record) ?? 0), 0);
}

// The money gate every fresh post passes (BT11a, scoped per repository in
// BT11c): this repository's own reward in force now, checked against this
// repository's own limit on what its open bounties promise. Runs before
// anything is written — a refused post changes nothing. The needs-limit
// refusal also covers a hand-edited settings file: the shape is checked on
// load, but reward>limit is a rule about the pair on one entry, enforced
// where it is written and again where it is spent.
export function rewardForPost(repoRoot: string): { readonly amount: number } {
  const { amount } = repoReward(repoRoot);
  assertPromiseRoom(repoRoot, amount);
  return { amount };
}

// The limit gate itself, run for a stated amount: once early so a refused
// post touches nothing, and again inside the promise lock at the moment the
// record binds — the lock makes the check and the write one span, so two
// posts running at once cannot both pass (BT11a fix round). The limit is the
// posting repository's own — another repository's cap never applies here.
export function assertPromiseRoom(repoRoot: string, amount: number): void {
  const { limit } = repoReward(repoRoot);
  if (amount <= 0) return;
  if (limit === null || limit < amount) throw new BountyRefused('reward-needs-limit', `each bounty states $${amount}, but ${limit === null ? 'no limit is set' : `the limit is $${limit}, below it`} — the owner sets the most that may be promised with box bounty config set reward-limit <whole dollars>; nothing was posted`);
  const promised = promisedTotal(listRecords(repoRoot).filter(entry => entry.record !== null && isOpenStage(entry.record.stage)));
  if (promised + amount > limit) throw new BountyRefused('promise-limit-exceeded', `posting would bring promised rewards to $${promised + amount} across this repository's open bounties — the owner's limit is $${limit}; nothing was posted`);
}

// One directory, one mkdir — atomic on every filesystem the tool runs on. A
// post holds it only for the span that re-reads the promised total and writes
// the record, so the check and the write cannot interleave with another
// post's. A lock that outlives a minute is the corpse of a killed process:
// swept, not waited on — the critical span is local file work, far shorter.
const PROMISE_LOCK_STALE_MS = 60_000;
const PROMISE_LOCK_WAIT_MS = 3_000;
export function withPromiseLock<T>(repoRoot: string, run: () => T): T {
  const lock = join(repoRoot, '.box', 'promise.lock');
  mkdirSync(dirname(lock), { recursive: true });
  const giveUp = Date.now() + PROMISE_LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      // A held lock is waited out briefly; one that vanished mid-check is
      // retried at once; a stale one is removed and the loop retries.
      try {
        if (Date.now() - statSync(lock).mtimeMs > PROMISE_LOCK_STALE_MS) { rmSync(lock, { recursive: true, force: true }); continue; }
      } catch { continue; }
      if (Date.now() >= giveUp) throw new BountyRefused('promise-limit-busy', 'another command is binding a bounty reward right now — run this post again in a moment; nothing was posted');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return run();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
