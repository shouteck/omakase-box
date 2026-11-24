// BT80: `apply` asks the never-ship question again just before the merge, under the rules in force then. Collection checked
// the solution's history once, under the rules of that moment; the owner's list, a release's built-ins or BT77's reach can
// grow before the merge. As BT69 does for `post`: check at the point of effect.
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { applyBounty, BountyRefused, changePublishList, loadRecord, lookBounty } from '../../../packages/box-bounty/index.js';
import { git as objectGit, gitWriteBlob } from '../../../packages/box-bounty/git.js';
import { postedFixture } from './github-fixture.js';
import { git, readRecordRaw, runRoot } from './support.js';

// The one seam: a built-in rule can be left out of the rule set while a solution is collected, standing in for a copy of the
// tool from before a release added it. BUILTIN_RULES itself is never edited.
const seam = vi.hoisted(() => ({ withoutRule: null as string | null }));
vi.mock('../../../packages/box-bounty/never-ship.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../packages/box-bounty/never-ship.js')>();
  return { ...actual, shipRules: (root: string) => actual.shipRules(root).filter(rule => rule.name !== seam.withoutRule) };
});

function refusalOf(run: () => unknown): BountyRefused {
  try { run(); } catch (error) { if (error instanceof BountyRefused) return error; throw error; }
  return expect.unreachable('expected a refusal');
}

// What a refused apply must leave exactly as it was.
const stateOf = (repo: string, id: string) => ({
  head: git(repo, ['rev-parse', 'HEAD']),
  status: git(repo, ['status', '--porcelain']),
  record: readRecordRaw(repo, id)
});

const merged = (repo: string, id: string): boolean => loadRecord(repo, id).events.some(event => event.command === 'apply' || event.command === 'merged');

describe('BT80: apply checks never-ship again, under the rules in force at the merge', () => {
  // @guards R3
  it('a path listed never-publish after collection is refused at apply, and nothing moves', () => postedFixture(({ repo, id, pr }) => {
    pr('solver', { 'notes/private.md': 'the owner keeps this\n' });
    expect(lookBounty(repo, id, 2).attempt.outcome).toBe('answered');
    changePublishList(repo, 'never-publish', 'add', 'notes/private.md');
    const before = stateOf(repo, id);
    const refusal = refusalOf(() => applyBounty(repo, id, 2));
    expect(refusal.reason).toBe('answer-never-ship');
    expect(refusal.message).toContain(`"notes/private.md" (rule 'owner-never-publish')`);
    expect(refusal.message).toContain('nothing was merged');
    expect(refusal.message).not.toContain('nothing was collected');
    expect(stateOf(repo, id)).toEqual(before);
    expect(merged(repo, id)).toBe(false);
  }));

  it('the same solution with no rule change merges as before', () => postedFixture(({ repo, id, pr }) => {
    pr('solver', { 'notes/private.md': 'the owner keeps this\n' });
    expect(lookBounty(repo, id, 2).attempt.outcome).toBe('answered');
    expect(applyBounty(repo, id, 2).outcome).toBe('applied');
  }));

  // @guards R3
  it('a path planted in an earlier commit and deleted in the last is refused the same way', () => postedFixture(({ repo, id, prCommit }) => {
    const pub = loadRecord(repo, id).github!;
    const env = { GIT_INDEX_FILE: join(runRoot('bt80-plant'), 'index') };
    const solver = ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid'];
    objectGit(repo, ['read-tree', pub.commit], env);
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${gitWriteBlob(repo, Buffer.from('planted\n'))},notes/private.md`], env);
    const planted = objectGit(repo, [...solver, 'commit-tree', objectGit(repo, ['write-tree'], env), '-p', pub.commit, '-m', 'plant'], env);
    objectGit(repo, ['update-index', '--force-remove', '--', 'notes/private.md'], env);
    objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${gitWriteBlob(repo, Buffer.from('fixed\n'))},app.txt`], env);
    const head = objectGit(repo, [...solver, 'commit-tree', objectGit(repo, ['write-tree'], env), '-p', planted, '-m', 'fix'], env);
    prCommit(head, 'solver', ['app.txt']);
    expect(lookBounty(repo, id, 2).attempt.outcome).toBe('answered');
    changePublishList(repo, 'never-publish', 'add', 'notes/private.md');
    const refusal = refusalOf(() => applyBounty(repo, id, 2));
    expect(refusal.reason).toBe('answer-never-ship');
    expect(refusal.message).toContain('"notes/private.md"');
    expect(merged(repo, id)).toBe(false);
  }));

  // @guards R3
  it('a built-in rule the collecting tool lacked is applied at the merge', () => postedFixture(({ repo, id, pr }) => {
    pr('solver', { 'deploy/.kube/config': 'client-key-data: ZmFrZQ==\n' });
    seam.withoutRule = 'credentials-file';
    try { expect(lookBounty(repo, id, 2).attempt.outcome).toBe('answered'); } finally { seam.withoutRule = null; }
    const before = stateOf(repo, id);
    const refusal = refusalOf(() => applyBounty(repo, id, 2));
    expect(refusal.reason).toBe('answer-never-ship');
    expect(refusal.message).toContain(`"deploy/.kube/config" (rule 'credentials-file')`);
    expect(stateOf(repo, id)).toEqual(before);
  }));

  it('collection still says nothing was collected', () => postedFixture(({ repo, id, pr }) => {
    changePublishList(repo, 'never-publish', 'add', 'notes/private.md');
    pr('solver', { 'notes/private.md': 'x\n' });
    const refusal = refusalOf(() => lookBounty(repo, id, 2));
    expect(refusal.reason).toBe('answer-never-ship');
    expect(refusal.message).toContain('nothing was collected');
  }));
});
