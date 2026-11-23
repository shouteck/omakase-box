// BT82: every place the tool can send something off this machine, found by the parser walk in exit-sites.ts and held
// here as an exact list. A new exit fails this test until it is listed (and, from BT83, put behind the one door); a
// walker that stops finding things fails the minimum. Entries are `kind file function`, not lines: lines move.
import { describe, expect, it } from 'vitest';
import { collectExits, missingPlumbing } from './exit-sites.js';

const EXPECTED = [
  // Git pushes
  'git-push packages/box-bounty/chain.ts pushOnce',
  'git-push packages/box-bounty/close.ts advanceBountyBranch',
  'git-push packages/box-bounty/close.ts advanceBountyBranch',
  'git-push packages/box-bounty/close.ts advanceBountyBranch',
  'git-push packages/box-bounty/close.ts syncGitHubDecision',
  'git-push packages/box-bounty/post.ts postGitHub',
  'git-push packages/box-bounty/take.ts takeBounty',
  // GitHub writes (a payload or a method, or a GraphQL mutation)
  'github-write packages/box-bounty/attempt.ts submitTakenResult',
  'github-write packages/box-bounty/close.ts syncGitHubDecision',
  'github-write packages/box-bounty/close.ts syncGitHubDecision',
  'github-write packages/box-bounty/close.ts syncGitHubDecision',
  'github-write packages/box-bounty/close.ts syncGitHubDecision',
  'github-write packages/box-bounty/close.ts syncGitHubDecision',
  'github-write packages/box-bounty/gh.ts ensureLabel',
  'github-write packages/box-bounty/post.ts postGitHub',
  'github-write packages/box-bounty/take.ts closeTaken',
  'github-write packages/box-bounty/take.ts forkOf',
  'github-write packages/box-bounty/take.ts takeBounty',
  // GraphQL queries: they pass a payload but only read; listed so the set-aside is visible
  'graphql-read packages/box-bounty/attempt.ts readAttempt',
  'graphql-read packages/box-bounty/close.ts closingIssue',
  'graphql-read packages/box-bounty/close.ts closingPullRequest',
  // The board's one send
  'board-send packages/box-bounty/board.ts flushBoardHints'
].sort();

describe('BT82: the exits', () => {
  const sites = collectExits();
  const found = sites.map(s => `${s.kind} ${s.file} ${s.fn}`).sort();

  it('lists every outward call exactly', () => {
    expect(found, sites.map(s => `${s.kind} ${s.file}:${s.line} ${s.fn} — ${s.detail}`).join('\n')).toEqual(EXPECTED);
  });

  it('finds at least the 19 outward sends known on 23 November 2026, so a broken walker cannot pass empty', () => {
    expect(sites.filter(s => s.kind !== 'graphql-read').length).toBeGreaterThanOrEqual(19);
  });

  it('finds no way out it cannot name', () => {
    expect(sites.filter(s => s.kind === 'unknown')).toEqual([]);
  });

  it('still finds the plumbing every exit runs through', () => {
    expect(missingPlumbing()).toEqual([]);
  });
});
