// BT37 regression case (the pass): one open pull request must count once in
// `N solution(s) waiting` — the brief says "count waiting pull requests".
// A solver re-pushing their branch moves the same PR to a new head commit;
// the record then holds the old commit in seenPullRequests and the new in
// availablePullRequests, and the n#commit union counts the dead revision.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { postedFixture } from './github-fixture.js';
import { CLI_DIST } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

describe('one open pull request counts once in "solution(s) waiting"', () => {
  it('a re-pushed pull request — same number, new head — is still one waiting pull request', () => postedFixture(({ repo, update, state }) => {
    // The first status lists the pull request and records it as seen.
    const first = box(repo, ['status']);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('1 solution(s) waiting');
    // The solver force-pushes: the API now names a new head for the same PR.
    const open = state().prs[0];
    if (open === undefined) throw new Error('fixture lost its pull request');
    const pr = { ...open, head: { sha: 'f'.repeat(40) } };
    update({ prs: [pr] });
    const second = box(repo, ['status']);
    expect(second.status).toBe(0);
    // One open pull request waits — never two.
    expect(second.stdout).toContain('1 solution(s) waiting');
    expect(second.stdout).not.toContain('2 solution(s) waiting');
  }));
});
