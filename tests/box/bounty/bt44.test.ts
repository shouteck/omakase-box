// BT44 — a merged bounty is one where the solution actually landed. The
// merge scan once asked only "is one of the recorded commits on the branch":
// a pull request whose head was already in the branch's history — the posted
// commit's own parent, the posted commit itself, or a commit that landed
// through a side branch without ever descending from the posted work — was
// counted as a merged solution: the bounty closed and a pay message could
// fire for work that added nothing (K42's reading, reproduced here). The
// scan now resolves the posted base and requires every candidate to descend
// from it AND to be new to it before branch membership is even consulted.
//
// Mutation map, for "remove either ancestor check and the suite goes red":
// dropping the descent check (`base` ancestor of candidate) turns the
// side-branch case red; dropping the novelty check (candidate must not be
// an ancestor of `base`) turns the zero-change case red. The parent case is
// caught by both. Positive controls live in bt7b/bt7b-review: the
// fast-forward land and the ordinary merge commit still close the bounty
// and name the landing commit — they run in this same suite.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './support.js';
import { checkMergedSolutions, listGitHubAnswers, loadRecord, postBounty, setMergeNoticeListener } from '../../../packages/box-bounty/index.js';
import { git, write } from './support.js';
import { fixture } from './github-fixture.js';
import type { GhState, GithubFixture } from './github-fixture.js';

const STRIPE_LIVE = 'https://buy.stripe.com/9AQ00deadbeef0000';

const noticed: string[] = [];
setMergeNoticeListener(line => noticed.push(line));

// The repository carries a reward (bound at post time, so a wrongful close
// would truly pay): the same bytes bt11b's reward5 writes.
const reward5 = (scratch: string): void => {
  const path = join(scratch, 'settings', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.repositories = { ...(settings.repositories ?? {}), 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-01T00:00:00.000Z' }, rewardLimit: { amount: 50, at: '2026-10-01T00:00:00.000Z' } } };
  writeFileSync(path, JSON.stringify(settings));
};

/** Point a fixture pull request's description at the text — bt11b's helper. */
const body = (state: () => GhState, update: (change: Partial<GhState>) => void, n: number, text: string): void => {
  update({ prs: state().prs.map(pr => pr.number === n ? { ...pr, body: text } : pr) });
};

// The fixture's main is a single root commit; these cases need a posted
// commit that itself has a parent. One more commit lands on main, the reward
// is written, and the bounty posts on that tip. Returns the posted commit.
const postOnChildOfRoot = (repo: string, id: string, scratch: string): string => {
  write(repo, 'second.txt', 'main moved past the root\n');
  git(repo, ['add', 'second.txt']);
  git(repo, ['commit', '-qm', 'second']);
  reward5(scratch);
  postBounty(repo, id, 'github');
  return loadRecord(repo, id).github!.commit;
};

// The whole point of every case below: the pull request was seen (its head
// is a recorded candidate — without this the cases would pass vacuously),
// yet nothing closes, nothing is emitted, and no payment is named.
const expectStaysOpen = (context: GithubFixture, id: string, head: string): void => {
  const seen = loadRecord(context.repo, id).github!.seenPullRequests ?? [];
  expect(seen.some(pr => pr.n === 1 && pr.commit === head)).toBe(true);
  noticed.length = 0;
  checkMergedSolutions(context.repo);
  const record = loadRecord(context.repo, id);
  expect(record.stage).toBe('posted');
  expect(record.events.some(event => event.command === 'merged')).toBe(false);
  expect(record.github!.pay).toBeUndefined();
  expect(noticed).toEqual([]);
  expect(context.state().issues[0]!.state).toBe('open');
  expect(context.state().comments.some(comment => comment.body.includes(`<!-- box-bounty:${id}:merged -->`))).toBe(false);
};

describe('a pull request pointing at history the branch already has closes nothing', () => {
  it('head is the parent of the posted commit, the branch advanced past it', () => fixture(context => {
    const { repo, id, scratch, state, update, prCommit } = context;
    const posted = postOnChildOfRoot(repo, id, scratch);
    const parent = git(repo, ['rev-parse', `${posted}^`]);
    // The branch moves on after the post — the request's head sits deep in
    // history the branch already contains.
    write(repo, 'third.txt', 'and further\n');
    git(repo, ['add', 'third.txt']);
    git(repo, ['commit', '-qm', 'third']);
    prCommit(parent, 'solver');
    body(state, update, 1, `the fix\npay-to: ${STRIPE_LIVE}`);
    listGitHubAnswers(repo, id); // records the seen head
    expectStaysOpen(context, id, parent);
  }, 'Repair app'));

  it('head IS the posted commit — a zero-change request', () => fixture(context => {
    const { repo, id, scratch, state, update, prCommit } = context;
    const posted = postOnChildOfRoot(repo, id, scratch);
    prCommit(posted, 'solver');
    body(state, update, 1, `the fix\npay-to: ${STRIPE_LIVE}`);
    listGitHubAnswers(repo, id);
    expectStaysOpen(context, id, posted);
  }, 'Repair app'));

  it('head landed through a side branch that never descended from the posted commit', () => fixture(context => {
    const { repo, id, scratch, state, update, prCommit } = context;
    const posted = postOnChildOfRoot(repo, id, scratch);
    const root = git(repo, ['rev-parse', `${posted}^`]);
    // The owner's own side work forks from the root — before the bounty was
    // posted — and is merged into main afterwards. Its tip is on the branch
    // but never descended from the posted commit.
    git(repo, ['checkout', '-qb', 'side', root]);
    write(repo, 'side.txt', 'unrelated side work\n');
    git(repo, ['add', 'side.txt']);
    git(repo, ['commit', '-qm', 'side work']);
    const sideTip = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['checkout', '-q', 'main']);
    git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'owner merged side work', 'side']);
    prCommit(sideTip, 'solver');
    body(state, update, 1, `the fix\npay-to: ${STRIPE_LIVE}`);
    listGitHubAnswers(repo, id);
    expectStaysOpen(context, id, sideTip);
  }, 'Repair app'));
});
