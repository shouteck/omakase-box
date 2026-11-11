// BT51 — a chosen solution shows as merged on GitHub. The stand-in models
// GitHub's rule: a pull request is marked merged when its head reaches its
// base branch. What is asserted is the bare remote's refs and the pull
// request's mark, never the tool's word alone.
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerGitHub, applyBounty, checkMergedSolutions, closeBounty, loadRecord, postBounty, setMergeNoticeListener } from '../../../packages/box-bounty/index.js';
import { landedSinceCollected } from '../../../packages/box-bounty/close.js';
import { fixture, type GithubFixture } from './github-fixture.js';
import { CLI_DIST, git, rewriteRecordRaw, write } from './support.js';

const tipOf = (bare: string, id: string): string | null => {
  const line = git(bare, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads']).split('\n').find(entry => entry.startsWith(`refs/heads/box-bounty/${id} `));
  return line === undefined ? null : line.split(' ')[1]!;
};
const mainOf = (bare: string) => git(bare, ['rev-parse', 'refs/heads/main']);
const merged = (world: GithubFixture, n: number) => world.state().prs.find(pr => pr.number === n)?.merged === true;
const pending = (world: GithubFixture) => loadRecord(world.repo, world.id).github!.pending;
// The remote refuses every new tip and still takes a deletion: a retry that
// completes under this hook proves it pushed nothing.
// Executable, or Git on Linux ignores the hook and the push lands (BT51-ci).
const updateHook = (bare: string, script: string) => {
  write(bare, 'hooks/update', script);
  chmodSync(join(bare, 'hooks', 'update'), 0o755);
};
const refuseUpdates = (bare: string) => updateHook(bare, '#!/bin/sh\ncase "$3" in 0000000000000000000000000000000000000000) exit 0;; esac\necho refused >&2\nexit 1\n');
const allowUpdates = (bare: string) => updateHook(bare, '#!/bin/sh\nexit 0\n');
const posted = (run: (world: GithubFixture) => void) => fixture(world => { postBounty(world.repo, world.id, 'github'); run(world); });
const recordSeen = (world: GithubFixture, n: number, commit: string) => rewriteRecordRaw(world.repo, world.id, record => {
  (record['github'] as Record<string, unknown>)['seenPullRequests'] = [{ n, commit, at: '2026-10-01T00:00:00.000Z', author: world.state().prs.find(pr => pr.number === n)!.user.login }];
});
const handMerge = (world: GithubFixture, head: string) => {
  git(world.repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', head]);
  checkMergedSolutions(world.repo);
};

describe('a chosen solution shows as merged on GitHub', { timeout: 180000 }, () => {
  it('a landing in the same second as the collection counts as after it: a commit date has whole seconds', () => {
    const second = Date.parse('2026-11-01T00:00:10.000Z');
    expect(landedSinceCollected(second, second + 999)).toBe(true);
    expect(landedSinceCollected(second + 1000, second + 999)).toBe(true);
    expect(landedSinceCollected(second - 1000, second + 999)).toBe(false);
    expect(landedSinceCollected(Number.NaN, second)).toBe(false);
  });

  it('apply: GitHub marks the pull request merged, then the bounty branch goes; never the default branch', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    const main = mainOf(bare);
    expect(applyBounty(repo, id, 1).outcome).toBe('applied');
    expect(merged(world, 1)).toBe(true);
    expect(world.state().prs[0]!.merged_at).toBeTruthy();
    expect(tipOf(bare, id)).toBeNull();
    expect(pending(world)).toBeNull();
    expect(mainOf(bare)).toBe(main);
  }));

  it('a recognised hand merge, the same', () => posted(world => {
    const head = world.pr('solver1');
    answerGitHub(world.repo, world.id, 1);
    handMerge(world, head);
    expect(merged(world, 1)).toBe(true);
    expect(tipOf(world.bare, world.id)).toBeNull();
  }));

  it('a refused push leaves the branch and a named pending state; close retries and finishes', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    const before = tipOf(bare, id);
    refuseUpdates(bare);
    expect(applyBounty(repo, id, 1).outcome).toBe('applied');
    expect(tipOf(bare, id)).toBe(before);
    expect(pending(world)).toContain('bounty-branch-not-advanced: push-refused');
    expect(pending(world)).toContain(`next: omakase-box close ${id}`);
    expect(merged(world, 1)).toBe(false);
    // The issue closes all the same: closing never waits.
    expect(world.state().issues[0]!.state).toBe('closed');
    allowUpdates(bare);
    closeBounty(repo, id);
    expect(merged(world, 1)).toBe(true);
    expect(tipOf(bare, id)).toBeNull();
    expect(pending(world)).toBeNull();
  }));

  it('a mark a moment after the push, as on real GitHub, finishes in the same command', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    answerGitHub(repo, id, 1);
    world.update({ markDelay: 1 });
    applyBounty(repo, id, 1);
    expect(pending(world)).toBeNull();
    expect(merged(world, 1)).toBe(true);
    expect(tipOf(bare, id)).toBeNull();
  }));

  it('a late mark keeps the branch at the head; the retry completes without a second push', () => posted(world => {
    const { repo, bare, id, pr } = world;
    const head = pr('solver1');
    answerGitHub(repo, id, 1);
    world.update({ markDelay: 5 }); // past the run's own wait: the first read and four more
    applyBounty(repo, id, 1);
    expect(pending(world)).toContain('bounty-branch-not-advanced: not-marked-merged');
    expect(tipOf(bare, id)).toBe(head);
    refuseUpdates(bare);
    closeBounty(repo, id);
    expect(pending(world)).toBeNull();
    expect(merged(world, 1)).toBe(true);
    expect(tipOf(bare, id)).toBeNull();
  }));

  it('a missing branch is never recreated: pending unless GitHub already reports the merge', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    answerGitHub(repo, id, 1);
    git(bare, ['update-ref', '-d', `refs/heads/box-bounty/${id}`]);
    applyBounty(repo, id, 1);
    expect(pending(world)).toContain('bounty-branch-not-advanced: bounty-branch-missing');
    expect(tipOf(bare, id)).toBeNull();
    world.update({ prs: world.state().prs.map(entry => ({ ...entry, merged: true, merged_at: '2026-10-01T00:00:00Z' })) });
    closeBounty(repo, id);
    expect(pending(world)).toBeNull();
    expect(tipOf(bare, id)).toBeNull();
  }));

  it('another tip is refused as changed and nothing is pushed', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    answerGitHub(repo, id, 1);
    const other = pr('solver2');
    git(bare, ['update-ref', `refs/heads/box-bounty/${id}`, other]);
    applyBounty(repo, id, 1);
    expect(pending(world)).toContain('github-branch-changed');
    expect(tipOf(bare, id)).toBe(other);
    expect(merged(world, 1)).toBe(false);
  }));

  it('a head that does not descend from the posted commit is not pushed', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    const posted = tipOf(bare, id);
    refuseUpdates(bare);
    applyBounty(repo, id, 1);
    allowUpdates(bare);
    git(repo, ['fetch', bare, 'refs/heads/main']);
    const unrelated = git(repo, ['commit-tree', '-m', 'no parent', `${git(repo, ['rev-parse', 'HEAD'])}^{tree}`]);
    rewriteRecordRaw(repo, id, record => { for (const attempt of record['attempts'] as Record<string, unknown>[]) attempt['commit'] = unrelated; });
    closeBounty(repo, id);
    expect(pending(world)).toContain('bounty-branch-not-advanced: head-not-descended');
    expect(tipOf(bare, id)).toBe(posted);
  }));

  it('a hand-merged head never collected, carrying a never-ship path in its history, is not pushed', () => posted(world => {
    const { repo, bare, id, pr } = world;
    const head = pr('solver1', { '.env': 'PLANTED\n' });
    const posted = tipOf(bare, id);
    git(repo, ['fetch', bare, 'refs/pull/1/head']);
    recordSeen(world, 1, head);
    handMerge(world, head);
    expect(pending(world)).toContain('bounty-branch-not-advanced: head-refused');
    expect(tipOf(bare, id)).toBe(posted);
    expect(merged(world, 1)).toBe(false);
  }));

  // PF27 changed this expectation: apply used to merge the head collected before the push. PF27's proof showed that
  // merges a version the poster had already rejected in review, so apply now merges nothing, collects the current
  // head as a new solution, and names look. Nothing unreviewed reaches the bounty branch either way.
  it('a pull request force-pushed after collection: apply merges nothing, collects the new head, and the branch stays where it was', () => posted(world => {
    const { repo, bare, id, pr } = world;
    const posted = tipOf(bare, id);
    pr('solver1');
    answerGitHub(repo, id, 1);
    const later = pr('solver1');
    // On GitHub a push moves the pull request's own ref.
    git(bare, ['update-ref', 'refs/pull/1/head', later]);
    world.update({ prs: world.state().prs.filter(entry => entry.number === 1).map(entry => ({ ...entry, head: { sha: later } })) });
    expect(() => applyBounty(repo, id, 1)).toThrow(expect.objectContaining({ reason: 'pull-request-moved' }));
    expect(tipOf(bare, id)).toBe(posted);
    expect(merged(world, 1)).toBe(false);
  }));

  it("a stranger's pull request on the owner's own commit is not pushed and not marked", () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    const posted = tipOf(bare, id);
    write(repo, 'own.txt', 'the owner\'s own later work\n');
    git(repo, ['add', 'own.txt']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@test.invalid', 'commit', '-qm', 'own work']);
    const own = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    prCommit(own, 'stranger');
    world.update({ prs: world.state().prs.map(entry => ({ ...entry, created_at: '2099-01-01T00:00:00Z' })) });
    recordSeen(world, 1, own);
    checkMergedSolutions(repo);
    expect(pending(world)).toContain('bounty-branch-not-advanced: head-predates-pull-request');
    expect(pending(world)).toContain('next: ask the owner');
    expect(pending(world)).not.toContain('retries');
    expect(tipOf(bare, id)).toBe(posted);
    expect(merged(world, 1)).toBe(false);
  }));

  it('a fast-forward hand merge not yet pushed still advances: nothing on the default branch predates the pull request', () => posted(world => {
    const { repo, bare, id, pr } = world;
    const head = pr('solver1');
    answerGitHub(repo, id, 1);
    world.update({ prs: world.state().prs.map(entry => ({ ...entry, created_at: '2099-01-01T00:00:00Z' })) });
    git(repo, ['reset', '-q', '--hard', loadRecord(repo, id).github!.commit]);
    git(repo, ['merge', '--ff-only', head]);
    checkMergedSolutions(repo);
    expect(merged(world, 1)).toBe(true);
    expect(tipOf(bare, id)).toBeNull();
  }));

  it('a record finished before this change is not reopened', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    applyBounty(repo, id, 1);
    // The old tool's ending: closed on GitHub, never marked, branch gone.
    world.update({ prs: world.state().prs.map(({ merged: _m, merged_at: _a, ...entry }) => entry) });
    closeBounty(repo, id);
    expect(pending(world)).toBeNull();
    expect(tipOf(bare, id)).toBeNull();
  }));

  it('a close without a merge removes the branch and marks nothing', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    closeBounty(repo, id, 'not wanted');
    expect(tipOf(bare, id)).toBeNull();
    expect(merged(world, 1)).toBe(false);
    expect(pending(world)).toBeNull();
  }));

  it("apply's output says what the owner still has to do for the board to count it", () => posted(world => {
    const { repo, id, pr } = world;
    pr('solver1');
    const run = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'apply', id, '1'], { cwd: repo, encoding: 'utf8', env: process.env, timeout: 60000 });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('not on GitHub yet');
    expect(run.stdout).toContain('this merge counts for the solver once it is on the default branch on GitHub; the tool never pushes it');
  }));

  it('a hand merge says the same through the notice', () => posted(world => {
    const head = world.pr('solver1');
    answerGitHub(world.repo, world.id, 1);
    const noticed: string[] = [];
    setMergeNoticeListener(line => noticed.push(line));
    handMerge(world, head);
    expect(noticed.join('\n')).toContain('this merge counts for the solver once main is pushed to the default branch on GitHub');
  }));

  it('a rewarded bounty left pending still records whom to pay', () => fixture(world => {
    const { repo, bare, id, pr, scratch } = world;
    const path = join(scratch, 'settings', 'settings.json');
    const settings = JSON.parse(readFileSync(path, 'utf8'));
    settings.repositories = { 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-01T00:00:00.000Z' }, rewardLimit: { amount: 50, at: '2026-10-01T00:00:00.000Z' } } };
    writeFileSync(path, JSON.stringify(settings));
    postBounty(repo, id, 'github');
    pr('solver1');
    refuseUpdates(bare);
    const result = applyBounty(repo, id, 1);
    expect(pending(world)).toContain('push-refused');
    expect(result.payMessage?.join('\n')).toContain('solver1');
  }));
});
