// BT77: "never publish" is about the repository's content, so an entry follows the repository (its GitHub address) into every
// checkout of it on this machine, not only the folder where it was added. "Safe to publish" loosens a guard and stays per folder.
// Entries written before BT77, keyed by folder, still hold in that folder. Two clones of one repository, made the bt52 way.
import { postToGitHub, collectPullRequest } from './github-solver.js';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, changePublishList, finalizeBounty, planBounty, postBounty, publishLists, renderConfig, shipRules } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { canonicalFolder } from '../../../packages/box-bounty/folder.js';
import { settingsFile } from '../../../packages/box-bounty/settings.js';
import { fixture, refused } from './github-fixture.js';
import { git, makeRepo, ownerSays, readRecord, runRoot, write } from './support.js';

const REMOTE = 'git@github.com:owner/project.git';

function options(repo: string): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md') };
}

// A second checkout of the same repository in another folder, with the same GitHub address.
function cloneOf(repo: string, label: string, url = REMOTE): string {
  const clone = join(runRoot(label), 'repo');
  execFileSync('git', ['-c', `safe.directory=${repo}`, 'clone', '-q', '--no-local', repo, clone], { encoding: 'utf8', stdio: 'pipe' });
  git(clone, ['remote', 'set-url', 'origin', url]);
  return clone;
}

function withOrigin(files: Record<string, string>): string {
  const repo = makeRepo(files);
  git(repo, ['remote', 'add', 'origin', REMOTE]);
  return repo;
}

// What an older tool wrote: a never list keyed by the folder, straight into the owner's file.
function writeFolderEntry(folder: string, never: readonly string[]): void {
  const path = settingsFile();
  const settings = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> : { kind: 'box-owner-settings' };
  const publishing = { ...(settings['publishing'] as Record<string, unknown> | undefined), [canonicalFolder(folder)]: { never: [...never], safe: [] } };
  writeFileSync(path, JSON.stringify({ ...settings, publishing }, null, 2) + '\n');
}

const named = (repo: string, path: string): string | null => shipRules(repo).find(rule => rule.match(path))?.name ?? null;

describe('BT77: never publish reaches every copy of the repository', () => {
  // @guards P2
  it('an entry added in clone A refuses a post from clone B carrying that file', () => fixture(({ repo }) => {
    const b = cloneOf(repo, 'bt77-post-b');
    changePublishList(repo, 'never-publish', 'add', 'secret-notes.md');
    const { id } = finalizeBounty(planBounty(options(b)));
    write(b, 'secret-notes.md', 'the owner keeps this\n');
    git(b, ['add', 'secret-notes.md']);
    git(b, ['commit', '-qm', 'notes']);
    let thrown: unknown;
    try { postBounty(b, id, 'github'); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(BountyRefused);
    expect((thrown as BountyRefused).reason).toBe('github-never-ship');
    expect((thrown as BountyRefused).message).toContain('owner-never-publish');
  }));

  // @guards C1
  it('the same file is removed at create in clone B', () => {
    const a = withOrigin({ 'src/app.py': 'x\n' });
    const b = cloneOf(a, 'bt77-create-b');
    changePublishList(a, 'never-publish', 'add', 'secret-notes.md');
    write(b, 'secret-notes.md', 'the owner keeps this\n');
    git(b, ['add', 'secret-notes.md']);
    git(b, ['commit', '-qm', 'notes']);
    const plan = planBounty(options(b));
    expect(plan.files.map(file => file.path)).not.toContain('secret-notes.md');
    expect(plan.ruleRemovals.find(entry => entry.rule === 'owner-never-publish')?.paths).toEqual(['secret-notes.md']);
  });

  // @guards R3
  it('a solution adding it to clone B\'s bounty is refused on the way back', () => {
    const a = withOrigin({ 'src/app.py': 'x\n' });
    const b = cloneOf(a, 'bt77-return-b');
    changePublishList(a, 'never-publish', 'add', 'secret-notes.md');
    const { id } = finalizeBounty(planBounty(options(b)));
    ownerSays(b, 'allowed');
    const { destination } = postToGitHub(b, id);
    const returned = join(runRoot('bt77-returned'), 'returned');
    cpSync(destination, returned, { recursive: true });
    write(returned, 'repo/secret-notes.md', 'a solver put this here\n');
    refused(() => collectPullRequest(b, id, returned), 'answer-never-ship');
    expect(readRecord(b, id).stage).toBe('posted');
    expect(existsSync(join(b, 'secret-notes.md'))).toBe(false);
  });

  it('safe to publish stays with the folder: listed in A, the scan still holds the path in B', () => {
    const shape = ['AK', 'IA', 'IOSFODNN7EXAMPLE'].join('');
    const a = withOrigin({ 'src/app.py': 'x\n', 'keys.txt': `key = "${shape}"\n` });
    const b = cloneOf(a, 'bt77-safe-b');
    changePublishList(a, 'safe-to-publish', 'add', 'keys.txt');
    expect(publishLists(a).safe).toEqual(['keys.txt']);
    expect(publishLists(b).safe).toEqual([]);
    expect(planBounty(options(b)).scan.hits.some(hit => hit.path === 'keys.txt')).toBe(true);
    expect(planBounty(options(a)).scan.hits.some(hit => hit.path === 'keys.txt')).toBe(false);
  });

  // @guards C1
  it('an entry written before BT77, keyed by its folder, still holds there and nowhere else', () => {
    const a = withOrigin({ 'src/app.py': 'x\n' });
    const b = cloneOf(a, 'bt77-old-b');
    writeFolderEntry(a, ['old-notes.md']);
    expect(named(a, 'old-notes.md')).toBe('owner-never-publish');
    expect(named(b, 'old-notes.md')).toBe(null);
    expect(renderConfig(a)).toContain('never publish: "old-notes.md" (this folder only)');
  });

  // @guards C1
  it('a checkout with no GitHub address keeps the entry for its folder and says so', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'private.md': 'mine\n' });
    expect(changePublishList(repo, 'never-publish', 'add', 'private.md')).toContain('this folder only');
    expect(renderConfig(repo)).toContain('never publish: "private.md" (this folder only)');
    expect(planBounty(options(repo)).files.map(file => file.path)).not.toContain('private.md');
  });

  it('config says an entry covers every copy of the repository', () => {
    const a = withOrigin({ 'src/app.py': 'x\n' });
    expect(changePublishList(a, 'never-publish', 'add', 'notes/private.md')).toContain('every copy of owner/project');
    expect(renderConfig(cloneOf(a, 'bt77-config-b'))).toContain('never publish: "notes/private.md" (every copy of owner/project)');
  });

  // @guards C1
  it('remove in B removes the repository\'s entry everywhere; an old folder entry is removed only from its folder', () => {
    const a = withOrigin({ 'src/app.py': 'x\n' });
    const b = cloneOf(a, 'bt77-remove-b');
    changePublishList(a, 'never-publish', 'add', 'shared.md');
    changePublishList(b, 'never-publish', 'remove', 'shared.md');
    expect(named(a, 'shared.md')).toBe(null);
    expect(named(b, 'shared.md')).toBe(null);
    writeFolderEntry(a, ['old.md']);
    writeFolderEntry(b, ['old.md']);
    changePublishList(a, 'never-publish', 'remove', 'old.md');
    expect(named(a, 'old.md')).toBe(null);
    expect(named(b, 'old.md')).toBe('owner-never-publish');
  });
});
