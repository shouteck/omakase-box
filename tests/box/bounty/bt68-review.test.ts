import { describe, expect, it } from 'vitest';
import './support.js';
import { checkMergedSolutions, listGitHubAnswers, loadRecord, postBounty, renderStatus } from '../../../packages/box-bounty/index.js';
import { fixture, type GithubFixture, type GhState } from './github-fixture.js';
import { git, write } from './support.js';

const moveTip = (world: GithubFixture) => {
  write(world.repo, 'owner.txt', `owner work ${git(world.repo, ['rev-parse', 'HEAD'])}\n`);
  git(world.repo, ['add', 'owner.txt']);
  git(world.repo, ['commit', '-qm', 'owner work']);
};
const updatePull = (world: GithubFixture, facts: Partial<GhState['prs'][number]>) => world.update({ prs: world.state().prs.map(pr => ({ ...pr, ...facts })) });
const reads = (world: GithubFixture) => world.state().calls.filter(call => call.some(arg => /\/pulls\/1$/.test(arg))).length;
const status = (world: GithubFixture) => {
  checkMergedSolutions(world.repo);
  return renderStatus(world.repo, { id: world.id });
};
const waiting = (run: (world: GithubFixture) => void) => fixture(world => {
  postBounty(world.repo, world.id, 'github');
  world.pr('solver');
  updatePull(world, { merged: false, state: 'open' });
  listGitHubAnswers(world.repo, world.id);
  moveTip(world);
  run(world);
});

describe('BT68 review: settled checks are per PR, head and creating-branch tip', () => {
  it.each(['open', 'closed', 'not-landed'])('%s is memoized until the tip moves', kind => waiting(world => {
    if (kind === 'closed') updatePull(world, { state: 'closed' });
    if (kind === 'not-landed') updatePull(world, { merged: true, merge_commit_sha: 'f'.repeat(40) });
    const before = reads(world);
    status(world);
    expect(reads(world)).toBe(before + 1);
    status(world);
    expect(reads(world)).toBe(before + 1);
    moveTip(world);
    status(world);
    expect(reads(world)).toBe(before + 2);
  }));
  it('an open PR waits quietly even when main moved', () => waiting(world => {
    const out = status(world);
    expect(out).not.toContain('landing not recognised');
    expect(out).not.toContain('does not mark #1 merged');
    expect(loadRecord(world.repo, world.id).stage).toBe('posted');
  }));
  it('only a closed, unmerged PR states the hand-squash fact', () => waiting(world => {
    updatePull(world, { state: 'closed' });
    const out = status(world);
    expect(out).toContain('GitHub does not mark #1 merged');
    expect(out).toContain(`omakase-box close ${world.id}`);
  }));
  it.each(['base', 'repository', 'head', 'sha', 'off branch'])('merged with wrong %s is settled, not unknown', kind => waiting(world => {
    const pr = world.state().prs[0]!;
    updatePull(world, { merged: true, merge_commit_sha: 'f'.repeat(40),
      ...(kind === 'base' ? { base: { ...pr.base, ref: 'other' } } : {}),
      ...(kind === 'repository' ? { base: { ...pr.base, repo: { full_name: 'other/repo' } } } : {}),
      ...(kind === 'head' ? { head: { sha: 'e'.repeat(40) } } : {}),
      ...(kind === 'sha' ? { merge_commit_sha: 'invalid' } : {}) });
    const out = status(world);
    expect(loadRecord(world.repo, world.id).landingChecks?.[0]?.state).toBe('not-landed');
    expect(out).toContain('merge facts do not match this bounty or the landing is not on main yet');
    expect(out).toContain('pull the default branch');
    expect(out).toContain(`omakase-box status ${world.id}`);
    expect(out).not.toContain('could not be read');
  }));
  it('unknown reads remain visible and retry at the same tip', () => waiting(world => {
    world.update({ fail: '/pulls/1' });
    expect(status(world)).toContain('merge facts for #1 could not be read');
    const before = reads(world);
    expect(status(world)).toContain('merge facts for #1 could not be read');
    expect(reads(world)).toBeGreaterThan(before);
    world.update({ fail: undefined });
    status(world);
    expect(loadRecord(world.repo, world.id).landingChecks?.[0]?.state).not.toBe('unknown');
  }));
});
