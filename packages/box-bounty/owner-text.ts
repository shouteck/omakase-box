// The owner-facing wording: the short blocks an agent is told to pass on to
// the owner in these words, the lines a held post or merge prints, and the
// one-line owner-decision summary status and describe show. Everything here
// is text about the owner's answer — the decision itself lives in
// settings.ts, the gate in gate.ts. Moved out of record.ts unchanged (BT25).

import { retiredRoute } from './record.js';
import type { Attempt, BountyRecord } from './record.js';
import { repositoryChoiceLines } from './repository.js';
import { readDecision, repoReward, unlistedRemotes } from './settings.js';
import type { DecisionRead } from './settings.js';
import { solverAccount } from './untrusted.js';

// The words the owner's three answers wear everywhere they are printed.
export const DECISION_WORDS = {
  allow: 'allow this repository',
  ask: 'be asked each time before each post and each merge',
  once: 'this one bounty only'
} as const;

// The owner-facing part of every message the agent must relay (BT13): a
// short block the agent is told to pass on in these words — plain language,
// no hashes, no command names, no Git words; the owner is offered a question
// to answer, never a command to run. Everything after the block is for the
// agent ("for you —"), and the two are never interleaved.
export const ownerBlock = (lines: readonly string[]): string[] =>
  ['for the owner — pass this on in these words:', ...lines.map(line => `  ${line}`)];

// The first-use block (BT13, F1): what a bounty is, that it is public under
// the owner's GitHub account, that it covers this repository only, what each
// bounty pays, and whether the owner is asked before posts and merges. The
// merge sentence is inside the question's own terms: a relay that drops it
// leaves the owner answering words they were never told.
export function firstUseBlock(repoRoot: string): string[] {
  const { amount } = repoReward(repoRoot);
  return ownerBlock([
    'A bounty asks people outside the project to fix something, and it is posted publicly on GitHub.',
    'It is posted under your GitHub account. Your answer covers this repository only.',
    'A solution your agent chooses is merged into your code.',
    `Each bounty states what it pays — ${amount === 0 ? '$0 unless you set an amount, so nothing is promised now' : `$${amount}, a promise in your name that you pay by hand`}.`,
    'You can allow this, or you can ask to be asked each time.',
    'If you allow it, you will not be asked before a post or a merge.',
    'If you ask each time, you will be asked before each post and before each merge.',
    'Do you allow this?'
  ]);
}

// The lines a held post prints: the owner block first, then the agent's
// mapping to the one command they run. Owner commands live under
// `box bounty allow`/`deny`, plainly named.
export function ownerWaitLines(repoRoot: string, record: BountyRecord, read: DecisionRead): string[] {
  const id = record.id;
  if (retiredRoute(record) !== null) return [`This delivery route was retired; end it with box bounty close ${id}`];
  if (read.decision === 'ask' || read.decision === 'off') {
    const target = record.waiting?.to;
    const { amount } = repoReward(repoRoot);
    return [
      ...ownerBlock([
        `A bounty named "${record.title}" is ready to post publicly on GitHub under your account.`,
        `Each bounty on this repository states $${amount}, a promise in your name that you pay by hand.`,
        `The owner ${read.decision === 'ask' ? 'asked to be asked each time' : 'turned the permission off'} — may this one ${target === 'github' || target === undefined ? 'be posted' : 'be delivered'}? A yes or no is enough.`
      ]),
      `for you — the owner answers this one with: box bounty allow ${id}`
    ];
  }
  // Several GitHub remotes and none on the owner's list (BT16 rule 6): the
  // wait names each candidate with its remote and the one command that
  // settles it. The one-bounty answer is not offered — a yes on this bounty
  // alone cannot say which repository it covers.
  const unlisted = unlistedRemotes(repoRoot);
  if (unlisted !== null) {
    return [
      ...firstUseBlock(repoRoot),
      'for you — this checkout\'s remotes name several GitHub repositories; the owner picks which one it is, and you run the matching command:',
      ...repositoryChoiceLines(unlisted)
    ];
  }
  return [
    ...firstUseBlock(repoRoot),
    'for you — the owner picks one; you run the matching command:',
    `  ${DECISION_WORDS.allow}: box bounty allow`,
    `  ${DECISION_WORDS.ask}: box bounty allow --ask`,
    `  ${DECISION_WORDS.once}: box bounty allow ${id}`
  ];
}

// The lines a held merge prints (BT13): one plain owner sentence says which
// solution, from whom, is ready to merge — and asks the question. The owner
// block comes first; the agent's part after it carries the one command and
// the binding: the answer covers exactly this solution at this commit on
// this branch tip.
export function mergeWaitLines(record: BountyRecord, attempt: Attempt): string[] {
  const id = record.id;
  const from = attempt.author !== undefined ? ` from GitHub account ${solverAccount(attempt.author)}` : ' from a returned folder';
  return [
    ...ownerBlock([
      `A solution to "${record.title}"${from} is ready to merge into your code.`,
      'Nothing has been merged yet.',
      'May it be merged? A yes or no is enough.'
    ]),
    `for you — the owner answers this one with: box bounty allow ${id}`,
    'the answer is bound to this solution at this commit on this branch\'s state — a change underneath it asks again'
  ];
}

// The owner-decision line: a flat `allowed` is the state that needs nothing
// every call — it prints only in the full view (BT17), where the change
// time lives too. Everything that holds work — nothing written, ask, off,
// a deny — needs attention each time and stays on every compact status.
export function ownerStatusLine(repoRoot: string, full = false): string | null {
  const read = readDecision(repoRoot);
  if (read.denied) return `owner: this repository is no longer allowed; denied at ${read.at}; all-projects does not apply after deny`;
  const where = read.level === 'project' ? 'this project' : 'all projects';
  const changed = full ? `, changed ${read.at}` : '';
  switch (read.decision) {
    case 'allowed': return full ? `owner: allowed for ${where}${changed}` : null;
    case 'ask': return `owner: ask me each time (${where}${changed})`;
    case 'off': return `owner: off — the tool asks each time (${where}${changed})`;
    case null: return 'owner: nothing written — the first post will wait for the owner';
  }
}

// What a waiting bounty waits on, in one clause — used by status and by the
// lines a held command prints.
export function waitingSummary(record: BountyRecord): string {
  const waiting = record.waiting;
  if (waiting === undefined) return 'the owner decides';
  const target = waiting.to === 'github' ? ' to GitHub' : waiting.to !== undefined ? ` to ${waiting.to}` : '';
  const held = waiting.for === 'merge' ? 'this merge' : `this post${target}`;
  switch (waiting.reason) {
    case 'owner-allow': return `the owner has not allowed the tool — ${held} waits for them (since ${waiting.at})`;
    case 'owner-ask': return `the owner asked to be asked each time — ${held} waits for them (since ${waiting.at})`;
    case 'owner-off': return `the owner turned the permission off — ${held} waits for them (since ${waiting.at})`;
    case 'secrets': return `the pre-publish scan found ${waiting.hits?.length ?? 0} secret-shaped hit(s) — ${held} waits for the owner (since ${waiting.at})`;
    case 'untracked-file': return `an untracked file was named for publishing — ${held} waits for the owner (since ${waiting.at})`;
  }
}
