// The owner gate: the decision check every post and every tool-driven
// outside close passes, the waiting mark it leaves on the record, the
// shown-state comparison an owner's one-bounty answer is bound to, and the
// bookkeeping of which written answer allowed a post. Moved out of
// record.ts unchanged (BT25).

import { BountyRefused } from './errors.js';
import { planGitHub,shownOfPlan } from './publish-plan.js';
import { shipRules } from './never-ship.js';
import { ownerWaitLines,waitingSummary } from './owner-text.js';
import { listRecords,persistRecord,transitionTo } from './record.js';
import type { AllowedBy,BountyRecord,WaitingFor } from './record.js';
import { readDecision,requireRepository } from './settings.js';
import type { DecisionRead } from './settings.js';

// `confirm` is removed (BT8): the owner allows the tool once, in the owner's
// own settings — not once per bounty. Records already `confirmed` still
// post: the owner's written yes on the record stands, and `post` verifies
// the approved plan against live state as before (github-preview-stale).

// The decision gate every post and every tool-driven outside close passes.
// `answered` is true only inside `box bounty allow` — the owner's own
// one command, which completes the held action without writing a standing
// decision. Allowed or answered returns the read; anything else marks the
// record waiting and refuses by name with the lines for the owner.
export function ownerGate(repoRoot: string, record: BountyRecord, action: { for: 'post'; to: string; choice?: WaitingFor['choice'] }): { read: DecisionRead; reused?: true } {
  const read = readDecision(repoRoot);
  if (read.decision === 'allowed') return { read };
  const reason = read.decision === 'ask' ? 'owner-ask' : read.decision === 'off' ? 'owner-off' : 'owner-allow';
  let shown: WaitingFor['shown'];
  if (action.to === 'github') {
    // The wait records what would be published, when it can be read — the
    // owner's answer is bound to what they were shown (BT8c). This runs only
    // when a wait is actually being recorded, and a remote that cannot be
    // read yet leaves the wait unbound: the post's own refusal names the
    // cause when the owner answers. It is a git read, never a gh call — the
    // permission state still gates every GitHub call below.
    try {
      const plan = planGitHub(repoRoot, requireRepository(repoRoot), record, shipRules(repoRoot), action.choice ?? { withChanges: false, include: [] });
      shown = shownOfPlan(plan);
    } catch {
      shown = undefined;
    }
  }
  // A one-bounty answer recorded on this wait still stands while what would
  // be published is what the owner was shown — a scan hold the answered
  // rerun uncovered carries it, and once the owner settles that in config
  // the same `post` goes out under the recorded answer. Any drift drops it
  // and the wait below is recorded fresh.
  const answered = record.waiting?.answered;
  if (action.for === 'post' && record.waiting?.for === 'post' && record.waiting.to === action.to && answered !== undefined && sameShown(answered.shown, shown)) {
    return { read: { decision: 'allowed', level: null, at: null }, reused: true };
  }
  waitForOwner(repoRoot, record, { for: action.for, reason, at: new Date().toISOString(), to: action.to, ...(action.choice !== undefined ? { choice: action.choice } : {}), ...(shown !== undefined ? { shown } : {}) });
  throw new BountyRefused(
    read.decision === null ? 'owner-allow-needed' : 'owner-answer-needed',
    [`waiting for the owner: ${record.id} — ${waitingSummary(record)}`, ...ownerWaitLines(repoRoot, record, read), ...(listRecords(repoRoot).some(entry => entry.record?.allowedBy?.decision === 'once') ? ['The owner previously chose this one bounty only.'] : [])].join('\n')
  );
}

// An action held for the owner: mark the record so status and the
// open-bounties line show the named waiting state. A bounty already waiting
// keeps its first wait time — the state does not move just because the same
// held command ran again. A recorded owner answer carries forward only
// while the wait is still the same action to the same destination — a hold
// the answered rerun uncovered keeps it; a different held action never
// inherits it.
export function waitForOwner(repoRoot: string, record: BountyRecord, waiting: WaitingFor): void {
  // Merge waits never carry an owner answer on the record: the answer
  // lives in the owner's settings outside the repository (BT13) — a
  // record field is forgeable by whoever edits the checkout's files.
  const carried = waiting.for !== 'merge' && record.waiting !== undefined && record.waiting.for === waiting.for && record.waiting.to === waiting.to
    ? record.waiting.answered : undefined;
  record.waiting = { ...waiting, at: record.waiting?.at ?? waiting.at, ...(carried !== undefined ? { answered: carried } : {}) };
  if (record.stage === 'waiting') persistRecord(repoRoot, record);
  else transitionTo(repoRoot, record, 'waiting');
}

// What the owner was shown would be published, compared field by field —
// the shape WaitingFor.shown and WaitingFor.answered.shown both carry.
export function sameShown(a: WaitingFor['shown'], b: WaitingFor['shown']): boolean {
  return a !== undefined && b !== undefined
    && a.base === b.base && a.head === b.head && a.tip === b.tip
    && a.pushed.join('\n') === b.pushed.join('\n')
    && a.include.join('\n') === b.include.join('\n')
    && a.leftHome === b.leftHome && a.untracked === b.untracked;
}

// Which written answer of the owner's allowed this post: the standing
// decision (with its level and when it was written), the owner's one-bounty
// answer, or — for a pre-BT8 confirmed record — the owner's yes recorded on
// the bounty itself.
export function allowedByFor(repoRoot: string, record: BountyRecord, answered: boolean, legacyConfirmed: boolean): AllowedBy {
  const usedAt = new Date().toISOString();
  if (answered) return { decision: 'once', level: 'this-bounty', decisionAt: null, usedAt };
  if (legacyConfirmed) {
    const at = record.events.find(event => event.stage === 'confirmed')?.at ?? null;
    return { decision: 'once', level: 'this-bounty', decisionAt: at, usedAt };
  }
  const read = readDecision(repoRoot);
  return { decision: 'allowed', level: (read.level ?? 'project') as 'project' | 'default', decisionAt: read.at, usedAt };
}
