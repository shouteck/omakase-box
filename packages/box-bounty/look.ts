import { BountyRefused } from './errors.js';
import { gitOutcome } from './git.js';
import { resolveAttempt } from './github.js';
import { attemptsOf, loadRecord, persistRecord, requireCurrentDelivery } from './record.js';
import type { Attempt, BountyRecord } from './record.js';

// `look` is a print path: the change the solver's pull request makes against
// the commit the bounty named, computed on objects the tool already fetched.
// Nothing is checked out, no folder is made, nothing is left to remove and
// nothing a solver wrote runs — the reads below are diffs over objects, and
// --no-ext-diff/--no-textconv keep solver-selected programs out of them.
// A large change lists its files first; --full prints the whole diff.
//
// `<n>` is a pull request's number: when no recorded attempt carries it and
// the bounty is posted on GitHub, `look` collects the pull request first.

const refuse = (reason: string, detail: string, next = 'box bounty status'): never => { throw new BountyRefused(reason, `${detail}; next: ${next}`); };

// A diff longer than this is large: `look` prints the changed-file list and
// names `box bounty look <id> <n> --full` for the whole change instead of
// flooding the agent's context with hundreds of lines it may not need.
export const LOOK_DIFF_LIMIT = 200;

// A solution's number: `look <id> <n>` shows attempt n — collecting pull
// request n first when the bounty is posted on GitHub and no attempt
// carries it yet.
export type LookTarget = number;

export interface LookResult {
  readonly record: BountyRecord;
  readonly attempt: Attempt;
  /** True when this look collected the solution itself (a pull request
      number, or a returned folder) rather than reading an attempt already
      recorded. */
  readonly collected: boolean;
  /** Every path the change touches, in Git's own name order. */
  readonly files: readonly string[];
  /** The full diff — null when the change is large and `full` was not asked for. */
  readonly diff: string | null;
  readonly large: boolean;
}

export function lookBounty(root: string, id: string, target: LookTarget, options: { readonly full?: boolean } = {}): LookResult {
  let record = loadRecord(root, id);
  requireCurrentDelivery(record);
  let attempt: Attempt;
  let collected = false;
  const resolved = resolveAttempt(root, record, target, 'look');
  record = resolved.record;
  attempt = resolved.attempt;
  collected = resolved.collected;
  // Shown means seen: status marks the attempt seen-since from this run.
  record.attempts = attemptsOf(record).map(entry => entry.n === attempt.n && entry.seenAt === undefined ? { ...entry, seenAt: new Date().toISOString() } : entry);
  persistRecord(root, record);
  // The diff runs against the commit the bounty was made on: the published
  // commit for a history post, else the recorded snapshot's base — new
  // records store no snapshot, so the base the resume context recorded stands
  // in (it is the same commit; a record from before contexts has none).
  const base = record.github?.kind === 'history' ? record.github.commit : record.snapshot?.baseCommit ?? (record.resume?.kind === 'recorded' ? record.resume.commit : null);
  const from = base ?? '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const diffArgs = ['--no-ext-diff', '--no-textconv', '--no-renames'];
  const files = gitOutcome(root, ['diff', ...diffArgs, '--name-only', '-z', from, attempt.commit]).stdout.split('\0').filter(Boolean);
  const diff = gitOutcome(root, ['diff', ...diffArgs, from, attempt.commit]).stdout;
  const large = diff.split('\n').length > LOOK_DIFF_LIMIT;
  return { record, attempt, collected, files, large, diff: large && options.full !== true ? null : diff };
}
